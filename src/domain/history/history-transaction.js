import { createBrewHistoryRecord } from '../../contracts/brew-contracts.js';

const REQUIRED_STORES = ['beans', 'brewSessions', 'inventoryEvents', 'sensoryRecords', 'syncMetadata'];

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB请求失败'));
  });
}

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('历史事务失败'));
    transaction.onabort = () => reject(transaction.error || new Error('历史事务已回滚'));
  });
}

function assertDb(db) {
  for (const name of REQUIRED_STORES) {
    if (!db.objectStoreNames.contains(name)) throw new Error(`数据库缺少历史事务所需表：${name}`);
  }
}

export async function commitConfirmedBrew({
  db,
  recordId,
  inventoryEventId,
  beanId,
  actualDoseG,
  analysis,
  execution,
  note = '',
  createdAt = new Date().toISOString()
}) {
  assertDb(db);
  const dose = Number(actualDoseG);
  if (!Number.isFinite(dose) || dose <= 0) throw new Error('实际使用豆量必须大于0');

  const tx = db.transaction(['beans', 'brewSessions', 'inventoryEvents', 'syncMetadata'], 'readwrite');
  const beans = tx.objectStore('beans');
  const sessions = tx.objectStore('brewSessions');
  const events = tx.objectStore('inventoryEvents');
  const metadata = tx.objectStore('syncMetadata');

  try {
    const [bean, duplicateRecord, duplicateEvent] = await Promise.all([
      requestPromise(beans.get(beanId)),
      requestPromise(sessions.get(recordId)),
      requestPromise(events.get(inventoryEventId))
    ]);
    if (!bean) throw new Error('豆卡不存在，无法保存冲煮记录');
    if (duplicateRecord || duplicateEvent) throw new Error('本次冲煮已经保存，禁止重复扣豆');
    const remaining = Number(bean.remainingWeight || 0);
    if (!Number.isFinite(remaining) || remaining < dose) throw new Error('豆卡剩余重量不足');

    const nextWeight = Number((remaining - dose).toFixed(2));
    const inventoryEvent = {
      id: inventoryEventId,
      beanId,
      sessionId: recordId,
      type: 'brew-consume',
      amountG: -dose,
      resultingWeightG: nextWeight,
      createdAt,
      note: `确认完成冲煮并扣除 ${dose.toFixed(2)}g`
    };
    const historyRecord = createBrewHistoryRecord({
      id: recordId,
      beanId,
      createdAt,
      actualDoseG: dose,
      inventoryEventId,
      analysis,
      execution,
      note
    });

    beans.put({ ...bean, remainingWeight: nextWeight, updatedAt: createdAt });
    events.put(inventoryEvent);
    sessions.put(historyRecord);
    metadata.put({
      id: `history.commit.${recordId}`,
      recordId,
      inventoryEventId,
      beanId,
      actualDoseG: dose,
      committedAt: createdAt,
      syncState: 'dirty'
    });

    await transactionPromise(tx);
    return { historyRecord, inventoryEvent, remainingWeightG: nextWeight };
  } catch (error) {
    try { tx.abort(); } catch { /* transaction may already be closed */ }
    throw error;
  }
}

export async function deleteConfirmedBrew({ db, recordId, restoreWeight, deletedAt = new Date().toISOString() }) {
  assertDb(db);
  const tx = db.transaction(['beans', 'brewSessions', 'inventoryEvents', 'sensoryRecords', 'syncMetadata'], 'readwrite');
  const sessions = tx.objectStore('brewSessions');
  const events = tx.objectStore('inventoryEvents');
  const beans = tx.objectStore('beans');
  const sensory = tx.objectStore('sensoryRecords');
  const metadata = tx.objectStore('syncMetadata');

  try {
    const record = await requestPromise(sessions.get(recordId));
    if (!record) throw new Error('冲煮记录不存在');
    const inventoryEvent = await requestPromise(events.get(record.inventoryEventId));
    if (!inventoryEvent || inventoryEvent.sessionId !== recordId) {
      throw new Error('冲煮记录与库存事件不完整，必须先修复数据，禁止猜测豆量');
    }
    const bean = await requestPromise(beans.get(record.beanId));
    if (!bean) throw new Error('关联豆卡不存在，禁止继续删除');

    if (restoreWeight) {
      const restored = Number((Number(bean.remainingWeight || 0) + Math.abs(Number(inventoryEvent.amountG || 0))).toFixed(2));
      beans.put({ ...bean, remainingWeight: restored, updatedAt: deletedAt });
      events.put({
        id: `${inventoryEvent.id}.restore.${deletedAt}`,
        beanId: record.beanId,
        sessionId: recordId,
        sourceEventId: inventoryEvent.id,
        type: 'restore-brew-deletion',
        amountG: Math.abs(Number(inventoryEvent.amountG || 0)),
        resultingWeightG: restored,
        createdAt: deletedAt
      });
    }

    const allSensory = await requestPromise(sensory.getAll());
    for (const item of allSensory.filter(value => value.brewSessionId === recordId)) {
      sensory.put({ ...item, brewSessionId: '', detachedFromBrewSessionId: recordId, updatedAt: deletedAt });
    }
    sessions.delete(recordId);
    metadata.put({ id: `history.delete.${recordId}`, recordId, restoreWeight: Boolean(restoreWeight), deletedAt, syncState: 'dirty' });
    await transactionPromise(tx);
    return { deleted: true, restoredWeight: Boolean(restoreWeight) };
  } catch (error) {
    try { tx.abort(); } catch { /* transaction may already be closed */ }
    throw error;
  }
}
