import { openDb } from '../../db.js';
import { BREW_HISTORY_SCHEMA } from './history-service.js';

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB请求失败'));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('品鉴关联事务失败'));
    tx.onabort = () => reject(tx.error || new Error('品鉴关联事务已回滚'));
  });
}

function brewResultBaseline(record) {
  const result = record?.analysisSnapshot?.brewResult || record?.analysisSnapshot?.plan?.contracts?.brewResult;
  if (!result || typeof result !== 'object') return null;
  return {
    contract: `BrewResult/${result.version || 'unknown'}`,
    analysisFingerprint: result.metadata?.analysisFingerprint || record?.analysisSnapshot?.analysisFingerprint || '',
    executionSource: result.metadata?.executionSource || record?.analysisSnapshot?.plan?.executionSource || '',
    flavor: structuredClone(result.flavor || {}),
    uncertainty: structuredClone(result.uncertainty || {})
  };
}

export async function attachSensoryToCompletedBrew({ recordId, sensoryRecord, nextPlanDraft = null }) {
  if (!recordId) throw new Error('缺少冲煮历史记录ID');
  if (!sensoryRecord?.id) throw new Error('缺少品鉴记录ID');
  const db = await openDb();
  const tx = db.transaction(['brewSessions', 'sensoryRecords', 'historyRevisions', 'syncOutbox'], 'readwrite');
  const sessions = tx.objectStore('brewSessions');
  const sensory = tx.objectStore('sensoryRecords');
  const revisions = tx.objectStore('historyRevisions');
  const outbox = tx.objectStore('syncOutbox');
  try {
    const record = await requestValue(sessions.get(recordId));
    if (!record || record.schemaVersion !== BREW_HISTORY_SCHEMA) {
      tx.abort();
      throw new Error('关联对象不是正式完成冲煮记录');
    }
    const at = new Date().toISOString();
    const revision = Number(record.revision || 1) + 1;
    const revisionId = `${record.id}:revision:${revision}`;
    const linked = {
      ...structuredClone(sensoryRecord),
      brewSessionId: record.id,
      updatedAt: at
    };
    const next = {
      ...record,
      sensoryRecordIds: [...new Set([...(record.sensoryRecordIds || []), linked.id])],
      sensoryRecordId: linked.id,
      sensoryNote: linked.naturalNote || '',
      autoScore: Number(linked.autoScore || 0),
      subjectiveScore: Number(linked.subjectiveScore ?? linked.score ?? 0),
      scoreDelta: Number(linked.scoreDelta || 0),
      nextPlanDraft: nextPlanDraft ? structuredClone(nextPlanDraft) : (record.nextPlanDraft || null),
      correctedPlanId: nextPlanDraft?.id || record.correctedPlanId || '',
      revision,
      revisionHeadId: revisionId,
      updatedAt: at,
      syncState: 'pending'
    };
    sensory.put(linked);
    sessions.put(next);
    revisions.put({
      id: revisionId,
      brewSessionId: record.id,
      revision,
      kind: nextPlanDraft ? 'sensory-linked-with-next-plan-draft' : 'sensory-linked',
      snapshot: structuredClone(next),
      createdAt: at
    });
    outbox.put({
      id: `${record.id}:outbox:${revision}`,
      entity: 'brewSessions',
      entityId: record.id,
      operation: 'upsert',
      payload: structuredClone(next),
      createdAt: at,
      attempts: 0
    });
    await transactionDone(tx);
    document.dispatchEvent(new CustomEvent('luckybean:data-changed', {
      detail: { store: 'brewSessions', operation: 'sensory-linked', recordId: record.id, at }
    }));
    return { record: next, sensoryRecord: linked };
  } catch (error) {
    try { tx.abort(); } catch { /* transaction already settled */ }
    throw error;
  }
}

export async function attachOptimizationDraft({ recordId, sensoryRecordId, nextPlanDraft, assessment }) {
  if (!recordId || !sensoryRecordId || !nextPlanDraft?.id) throw new Error('冲煮优化记录不完整');
  const db = await openDb();
  const tx = db.transaction(['brewSessions','sensoryRecords','historyRevisions','syncOutbox'],'readwrite');
  const sessions=tx.objectStore('brewSessions'), sensory=tx.objectStore('sensoryRecords');
  const revisions=tx.objectStore('historyRevisions'), outbox=tx.objectStore('syncOutbox');
  try {
    const record=await requestValue(sessions.get(recordId));
    const sensoryRecord=await requestValue(sensory.get(sensoryRecordId));
    if (!record || record.schemaVersion!==BREW_HISTORY_SCHEMA || !sensoryRecord) { tx.abort(); throw new Error('冲煮或品鉴记录不存在'); }
    const at=new Date().toISOString(), revision=Number(record.revision||1)+1, revisionId=`${record.id}:revision:${revision}`;
    const baseline=brewResultBaseline(record);
    const draft={
      ...structuredClone(nextPlanDraft),
      optimizationStatus:'pending-validation',
      sourceHistoryId:record.id,
      sourceSensoryId:sensoryRecord.id,
      optimizationBaseline:baseline,
      createdAt:nextPlanDraft.createdAt||at
    };
    const next={
      ...record,
      nextPlanDraft:draft,
      correctedPlanId:draft.id,
      optimizationAssessment:structuredClone(assessment||sensoryRecord.optimizationAssessment||null),
      optimizationBaseline:baseline,
      revision,
      revisionHeadId:revisionId,
      updatedAt:at,
      syncState:'pending'
    };
    sensory.put({ ...sensoryRecord, correctedPlanId:draft.id, optimizationStatus:'pending-validation', updatedAt:at });
    sessions.put(next);
    revisions.put({ id:revisionId, brewSessionId:record.id, revision, kind:'optimization-draft-created', snapshot:structuredClone(next), createdAt:at });
    outbox.put({ id:`${record.id}:outbox:${revision}`, entity:'brewSessions', entityId:record.id, operation:'upsert', payload:structuredClone(next), createdAt:at, attempts:0 });
    await transactionDone(tx);
    document.dispatchEvent(new CustomEvent('luckybean:data-changed',{detail:{store:'brewSessions',operation:'optimization-draft-created',recordId:record.id,at}}));
    return { record:next, sensoryRecord, draft };
  } catch(error) { try{tx.abort();}catch{} throw error; }
}

export async function completeOptimizationValidation({ validation, newSensoryRecord }) {
  const sourceHistoryId=String(validation?.sourceHistoryId||'');
  const sourceSensoryId=String(validation?.sourceSensoryId||'');
  if (!sourceHistoryId || !newSensoryRecord?.id) return null;
  const db=await openDb();
  const tx=db.transaction(['brewSessions','sensoryRecords','historyRevisions','syncOutbox'],'readwrite');
  const sessions=tx.objectStore('brewSessions'), sensory=tx.objectStore('sensoryRecords');
  const revisions=tx.objectStore('historyRevisions'), outbox=tx.objectStore('syncOutbox');
  try {
    const source=await requestValue(sessions.get(sourceHistoryId));
    if (!source?.nextPlanDraft || (sourceSensoryId && source.nextPlanDraft.sourceSensoryId!==sourceSensoryId)) {
      tx.abort(); return null;
    }
    const validationHistoryId=String(newSensoryRecord.brewSessionId||'');
    const validationHistory=validationHistoryId ? await requestValue(sessions.get(validationHistoryId)) : null;
    const originalKeys=new Set((source.optimizationAssessment?.issues||source.nextPlanDraft.correction?.assessment?.issues||[]).map(issue=>issue.key));
    const repeated=(newSensoryRecord.optimizationAssessment?.issues||[]).map(issue=>issue.key).filter(key=>originalKeys.has(key));
    const executionReliable=newSensoryRecord.optimizationAssessment?.executionReliable!==false;
    const status=!executionReliable?'inconclusive':repeated.length===0?'effective':repeated.length<originalKeys.size?'partially-effective':'ineffective';
    const at=new Date().toISOString(), revision=Number(source.revision||1)+1, revisionId=`${source.id}:revision:${revision}`;
    const validationResult={
      contract:'brew-optimization-validation/1.1', status, validatedAt:at,
      sourceHistoryId:source.id, sourceSensoryId:sourceSensoryId||source.nextPlanDraft.sourceSensoryId,
      validationHistoryId, validationSensoryId:newSensoryRecord.id,
      originalIssueKeys:[...originalKeys], repeatedIssueKeys:repeated,
      baselineBrewResult:source.optimizationBaseline||brewResultBaseline(source),
      validationBrewResult:brewResultBaseline(validationHistory),
      modelFlavorUsedAsSensoryTruth:false,
      reason:!executionReliable?'本次实际执行存在明显偏差，不能可靠判断方案效果。':repeated.length===0?'原低分维度未再次出现。':`仍出现：${repeated.join('、')}`
    };
    const draft={...source.nextPlanDraft,optimizationStatus:status,validationResult};
    const next={...source,nextPlanDraft:draft,optimizationValidation:validationResult,revision,revisionHeadId:revisionId,updatedAt:at,syncState:'pending'};
    sessions.put(next);
    sensory.put({...newSensoryRecord,optimizationValidation:validationResult,updatedAt:at});
    revisions.put({id:revisionId,brewSessionId:source.id,revision,kind:'optimization-validated',snapshot:structuredClone(next),createdAt:at});
    outbox.put({id:`${source.id}:outbox:${revision}`,entity:'brewSessions',entityId:source.id,operation:'upsert',payload:structuredClone(next),createdAt:at,attempts:0});
    await transactionDone(tx);
    document.dispatchEvent(new CustomEvent('luckybean:data-changed',{detail:{store:'brewSessions',operation:'optimization-validated',recordId:source.id,at}}));
    return validationResult;
  } catch(error) { try{tx.abort();}catch{} throw error; }
}
