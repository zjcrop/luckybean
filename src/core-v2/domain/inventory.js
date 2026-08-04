import { CoreContractError, normalizeRevisionedRecord } from '../contracts.js';

export const INVENTORY_EVENT_TYPES = Object.freeze({
  INITIAL: 'initial',
  BREW: 'brew',
  ADJUSTMENT: 'adjustment',
  PURCHASE: 'purchase',
  DISCARD: 'discard'
});

const VALID_TYPES = new Set(Object.values(INVENTORY_EVENT_TYPES));

export function normalizeInventoryEvent(event, options = {}) {
  const normalized = normalizeRevisionedRecord(event, options);
  const type = String(normalized.type || '').trim();
  if (!VALID_TYPES.has(type)) {
    throw new CoreContractError('INVALID_INVENTORY_TYPE', `未知库存事件类型：${type}`);
  }
  const deltaG = Number(normalized.deltaG);
  if (!Number.isFinite(deltaG)) {
    throw new CoreContractError('INVALID_INVENTORY_DELTA', '库存事件 deltaG 必须是有限数值');
  }
  const beanId = String(normalized.beanId || '').trim();
  if (!beanId) throw new CoreContractError('MISSING_BEAN_ID', '库存事件缺少 beanId');
  return {
    ...normalized,
    type,
    beanId,
    deltaG: Math.round(deltaG * 100) / 100,
    reason: String(normalized.reason || ''),
    sourceId: String(normalized.sourceId || '')
  };
}

export function computeInventory(events, { beanId = '', floorAtZero = true } = {}) {
  const normalized = events
    .map(event => normalizeInventoryEvent(event))
    .filter(event => !beanId || event.beanId === beanId)
    .filter(event => !event.deletedAt)
    .sort((left, right) => {
      const time = String(left.createdAt).localeCompare(String(right.createdAt));
      return time || left.id.localeCompare(right.id);
    });

  let total = 0;
  let minimum = 0;
  let initialG = 0;
  let purchasedG = 0;
  let consumedG = 0;
  let discardedG = 0;
  let adjustmentG = 0;

  for (const event of normalized) {
    total = Math.round((total + event.deltaG) * 100) / 100;
    minimum = Math.min(minimum, total);

    if (event.type === INVENTORY_EVENT_TYPES.INITIAL) {
      initialG = Math.round((initialG + event.deltaG) * 100) / 100;
    } else if (event.type === INVENTORY_EVENT_TYPES.PURCHASE) {
      purchasedG = Math.round((purchasedG + event.deltaG) * 100) / 100;
    } else if (event.type === INVENTORY_EVENT_TYPES.BREW) {
      consumedG = Math.round((consumedG + Math.abs(Math.min(0, event.deltaG))) * 100) / 100;
    } else if (event.type === INVENTORY_EVENT_TYPES.DISCARD) {
      discardedG = Math.round((discardedG + Math.abs(Math.min(0, event.deltaG))) * 100) / 100;
    } else if (event.type === INVENTORY_EVENT_TYPES.ADJUSTMENT) {
      adjustmentG = Math.round((adjustmentG + event.deltaG) * 100) / 100;
    }
  }

  return Object.freeze({
    beanId,
    remainingG: floorAtZero ? Math.max(0, total) : total,
    rawRemainingG: total,
    initialG,
    purchasedG,
    consumedG,
    discardedG,
    adjustmentG,
    eventCount: normalized.length,
    wentNegative: minimum < 0,
    minimumG: minimum,
    lastEventAt: normalized.at(-1)?.createdAt || null
  });
}

export function makeInventoryEvent({ id, beanId, type, deltaG, reason = '', sourceId = '', createdAt, deviceId = '' }) {
  return normalizeInventoryEvent({
    id,
    beanId,
    type,
    deltaG,
    reason,
    sourceId,
    createdAt,
    updatedAt: createdAt,
    revision: 1,
    deviceId
  });
}
