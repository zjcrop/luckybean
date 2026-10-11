// Instrumentation-only module: packaged in debug assets, absent from release builds.
export async function runAcceptance({ verifyOnly = false } = {}) {
  const db = await import('./web-cache/src/db.js');
  const history = await import('./web-cache/src/domain/history/history-service.js');
  const fixture = await (await fetch(new URL('./web-cache/contracts/fixtures/core-store-golden.v1.json', import.meta.url))).json();
  const originalFetch = globalThis.fetch;
  let cloudRequests = 0;
  globalThis.fetch = (input, ...args) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    if (url.hostname.endsWith('.supabase.co')) { cloudRequests += 1; return Promise.reject(new Error('离线业务不得调用云端')); }
    return originalFetch(input, ...args);
  };
  try {
  const before = await db.get('beans', fixture.offlineBrew.beanId);
  const committed = await history.commitCompletedBrew(fixture.offlineBrew);
  const duplicate = await history.commitCompletedBrew(fixture.offlineBrew);
  const after = await db.get('beans', fixture.offlineBrew.beanId);
  const events = await db.all('inventoryEvents');
  const outbox = await db.all('syncOutbox');
  const records = await history.listCompletedBrews();
  if (before.remainingWeight !== (verifyOnly ? 85 : 100) || after.remainingWeight !== 85) throw new Error('扣豆账本不一致');
  if (!duplicate.duplicate) throw new Error('重复提交未保持幂等性');
  if (!events.some(row => row.id === committed.record.inventoryEventId && row.amountG === -15)) throw new Error('扣豆证据未持久化');
  if (!outbox.some(row => row.entityId === committed.record.id)) throw new Error('离线 outbox 缺失');
  if (!records.some(row => row.id === committed.record.id)) throw new Error('本地历史缺失');
  if (cloudRequests) throw new Error('离线流程发起了云端请求');
  return { cloudRequests, recordId: committed.record.id, remainingWeight: after.remainingWeight, duplicate: duplicate.duplicate };
  } finally { globalThis.fetch = originalFetch; }
}
