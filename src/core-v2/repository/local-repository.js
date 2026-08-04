import * as storage from '../../db.js';
import { createSyncEvent, SYNC_OPERATIONS } from '../sync/outbox.js';

const SYNCABLE_STORES = Object.freeze({
  beans: 'bean',
  brewSessions: 'brewSession',
  sensoryRecords: 'sensoryRecord',
  inventoryEvents: 'inventoryEvent',
  settings: 'setting',
  customCodes: 'customCode',
  attachments: 'attachment'
});

function fallbackUuid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function localDeviceId() {
  const key = 'luckybean.core-v2.device-id';
  let value = globalThis.localStorage?.getItem(key) || '';
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() || fallbackUuid();
    try { globalThis.localStorage?.setItem(key, value); } catch { /* Room/IndexedDB remains authoritative. */ }
  }
  return value;
}

async function enqueue(store, entity, operation) {
  const entityType = SYNCABLE_STORES[store];
  if (!entityType || store === 'syncOutbox') return null;
  const event = await createSyncEvent({
    entityType,
    entity,
    operation,
    deviceId: localDeviceId(),
    clientTime: new Date().toISOString()
  });
  await storage.put('syncOutbox', event);
  return event;
}

export async function saveLocal(store, entity, { sync = true } = {}) {
  const id = await storage.put(store, entity);
  if (sync) await enqueue(store, entity, SYNC_OPERATIONS.UPSERT);
  return id;
}

export async function saveManyLocal(store, entities, { sync = true } = {}) {
  const ids = await storage.bulkPut(store, entities);
  if (sync && SYNCABLE_STORES[store]) {
    for (const entity of entities) await enqueue(store, entity, SYNC_OPERATIONS.UPSERT);
  }
  return ids;
}

export async function deleteLocal(store, entity, { sync = true } = {}) {
  if (!entity?.id) throw new Error('删除实体缺少 id');
  const deletedAt = new Date().toISOString();
  const tombstone = {
    ...entity,
    deletedAt,
    updatedAt: deletedAt,
    revision: Math.max(1, Number(entity.revision) || 1) + 1
  };
  await storage.put(store, tombstone);
  await storage.put('syncTombstones', {
    id: `${store}:${entity.id}`,
    store,
    entityId: entity.id,
    revision: tombstone.revision,
    deletedAt,
    deviceId: localDeviceId()
  });
  if (sync) await enqueue(store, tombstone, SYNC_OPERATIONS.DELETE);
  return tombstone;
}

export const localStorageApi = Object.freeze({
  openDb: storage.openDb,
  all: storage.all,
  get: storage.get,
  save: saveLocal,
  saveMany: saveManyLocal,
  delete: deleteLocal,
  rawPut: storage.put,
  rawBulkPut: storage.bulkPut,
  remove: storage.remove
});
