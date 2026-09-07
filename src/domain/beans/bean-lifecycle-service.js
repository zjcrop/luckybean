import { all, bulkPut, put, remove } from '../../db.js';
import { recordBeanDeletions, recordBeanRestores } from './bean-mutation-ledger.js';

const RECYCLE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function archiveBeans(ids, archived = true) {
  const wanted = new Set((ids || []).map(String));
  if (!wanted.size) return 0;
  const rows = await all('beans');
  const now = new Date().toISOString();
  const items = rows.filter(bean => wanted.has(String(bean.id)));
  if (!items.length) return 0;
  await bulkPut('beans', items.map(bean => ({
    ...bean,
    archived: Boolean(archived),
    archivedAt: archived ? (bean.archivedAt || now) : null,
    updatedAt: now
  })));
  return items.length;
}

export async function moveBeansToRecycle(ids) {
  const wanted = new Set((ids || []).map(String));
  if (!wanted.size) return 0;
  const rows = await all('beans');
  const items = rows.filter(bean => wanted.has(String(bean.id)));
  if (!items.length) return 0;
  const recycledAt = new Date();
  const recycledAtIso = recycledAt.toISOString();
  const expiresAt = new Date(recycledAt.getTime() + RECYCLE_RETENTION_MS).toISOString();
  const recycleIds = [];
  for (const bean of items) {
    const recycleId = `bean:${bean.id}`;
    recycleIds.push(recycleId);
    await put('recycleBin', {
      id: recycleId,
      entity: 'beans',
      entityId: bean.id,
      payload: structuredClone(bean),
      recycledAt: recycledAtIso,
      expiresAt
    });
  }
  try {
    await recordBeanDeletions(items.map(bean => bean.id), { mutatedAt: recycledAtIso });
  } catch (error) {
    for (const recycleId of recycleIds) await remove('recycleBin', recycleId).catch(() => {});
    throw error;
  }
  for (const bean of items) await remove('beans', bean.id);
  try {
    await globalThis.LuckyBeanCloudSync?.syncIntentionalDeletion?.({ entity: 'beans', ids: items.map(bean => bean.id) });
  } catch (error) {
    console.warn('豆卡云端删除同步将在后续同步重试', error);
  }
  return items.length;
}

export async function restoreBeansFromRecycle(ids) {
  const wanted = new Set((ids || []).map(value => String(value || '')).filter(Boolean));
  if (!wanted.size) return 0;
  const rows = await all('recycleBin').catch(() => []);
  const items = rows.filter(item => item.entity === 'beans' && (wanted.has(String(item.entityId)) || wanted.has(String(item.id))));
  if (!items.length) return 0;
  const restoredAt = new Date().toISOString();
  const beanIds = items.map(item => String(item.entityId));
  await recordBeanRestores(beanIds, { mutatedAt: restoredAt });
  try {
    await bulkPut('beans', items.map(item => ({
      ...structuredClone(item.payload || {}),
      id: item.entityId,
      updatedAt: restoredAt
    })));
  } catch (error) {
    await recordBeanDeletions(beanIds, { mutatedAt: new Date().toISOString() }).catch(() => {});
    throw error;
  }
  for (const item of items) await remove('recycleBin', item.id);
  return items.length;
}

export async function purgeExpiredBeanRecycle(now = Date.now()) {
  const rows = await all('recycleBin').catch(() => []);
  const expired = rows.filter(item => item.entity === 'beans' && item.expiresAt && Date.parse(item.expiresAt) <= now);
  for (const item of expired) await remove('recycleBin', item.id);
  return expired.length;
}

export const BEAN_RECYCLE_RETENTION_MS = RECYCLE_RETENTION_MS;
