import { all, bulkPut, put, remove } from '../../db.js';

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
  for (const bean of items) {
    await put('recycleBin', {
      id: `bean:${bean.id}`,
      entity: 'beans',
      entityId: bean.id,
      payload: structuredClone(bean),
      recycledAt: recycledAtIso,
      expiresAt
    });
  }
  for (const bean of items) await remove('beans', bean.id);
  try {
    await globalThis.LuckyBeanCloudSync?.syncIntentionalDeletion?.({ entity: 'beans', ids: items.map(bean => bean.id) });
  } catch (error) {
    console.warn('豆卡云端删除同步将在后续同步重试', error);
  }
  return items.length;
}

export async function purgeExpiredBeanRecycle(now = Date.now()) {
  const rows = await all('recycleBin').catch(() => []);
  const expired = rows.filter(item => item.entity === 'beans' && item.expiresAt && Date.parse(item.expiresAt) <= now);
  for (const item of expired) await remove('recycleBin', item.id);
  return expired.length;
}

export const BEAN_RECYCLE_RETENTION_MS = RECYCLE_RETENTION_MS;
