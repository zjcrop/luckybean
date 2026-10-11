// Instrumentation-only module: packaged in debug assets, absent from release builds.
export async function runAcceptance() {
  const db = await import('./web-cache/src/db.js');
  const history = await import('./web-cache/src/domain/history/history-service.js');
  const fixture = await (await fetch(new URL('./web-cache/contracts/fixtures/core-store-golden.v1.json', import.meta.url))).json();
  const before = await db.get('beans', fixture.offlineBrew.beanId);
  const committed = await history.commitCompletedBrew(fixture.offlineBrew);
  const duplicate = await history.commitCompletedBrew(fixture.offlineBrew);
  const after = await db.get('beans', fixture.offlineBrew.beanId);
  const events = await db.all('inventoryEvents');
  const outbox = await db.all('syncOutbox');
  const records = await history.listCompletedBrews();
  if (before.remainingWeight !== 100 || after.remainingWeight !== 85) throw new Error('扣豆账本不一致');
  if (!duplicate.duplicate) throw new Error('重复提交未保持幂等性');
  if (!events.some(row => row.id === committed.record.inventoryEventId && row.amountG === -15)) throw new Error('扣豆证据未持久化');
  if (!outbox.some(row => row.entityId === committed.record.id)) throw new Error('离线 outbox 缺失');
  if (!records.some(row => row.id === committed.record.id)) throw new Error('本地历史缺失');
  return { recordId: committed.record.id, remainingWeight: after.remainingWeight, duplicate: duplicate.duplicate };
}
