import { createRecognitionDocument } from './recognition-document.js';
import { MULTI_ENTRY_SCHEMA, splitRecognitionEntries } from './recognition-entry-splitter.js';
import { RECOGNITION_RECORD_CANDIDATE_SCHEMA } from './recognition-record-segmenter.js';
import { RECOGNITION_RECORD_HYPOTHESIS_SCHEMA, buildRecognitionRecordHypothesis } from './recognition-record-hypothesis.js';

export const RECOGNITION_STRUCTURE_RECOVERY_SCHEMA = 'recognition-structure-recovery/1.0';
export const AI_STRUCTURE_RESULT_SCHEMA = 'ai-structure-result/1.0';

const STRONG_LOCAL_METHODS = new Set(['explicit-extension', 'entry-headings', 'repeated-country-anchor']);
const WEAK_LOCAL_METHODS = new Set(['single-image-paragraphs', 'single-image-table-rows']);

function clamp01(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}
function clean(value) { return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim(); }
function freezeArray(values) { return Object.freeze(values.map(item => Object.freeze(item))); }
function evidenceRefs(document) {
  return Object.freeze((document?.blocks || []).map((block, index) => `block:${String(block?.id || index + 1)}`));
}
function hasSpatialEvidence(document) {
  return (document?.blocks || []).some(block => Boolean(block?.box) || (Array.isArray(block?.polygon) && block.polygon.length >= 2));
}
function inputIdentity(document) {
  return Object.freeze({
    schemaVersion:String(document?.schemaVersion || ''),
    engine:String(document?.engine || ''),
    createdAt:String(document?.createdAt || ''),
    imageIds:Object.freeze((document?.images || []).map(image => String(image?.id || '')).filter(Boolean)),
    blockIds:Object.freeze((document?.blocks || []).map(block => String(block?.id || '')).filter(Boolean))
  });
}
function producerIdentity() {
  return Object.freeze({
    name:'luckybean-recognition-core',
    structureRecoverySchemaVersion:RECOGNITION_STRUCTURE_RECOVERY_SCHEMA,
    recordHypothesisSchemaVersion:RECOGNITION_RECORD_HYPOTHESIS_SCHEMA,
    recordCandidateSchemaVersion:RECOGNITION_RECORD_CANDIDATE_SCHEMA,
    multiEntrySchemaVersion:MULTI_ENTRY_SCHEMA,
    exactSourceIdentity:'external-git-pin'
  });
}
function envelope(document, hypothesis, body = {}) {
  return {
    schemaVersion:RECOGNITION_STRUCTURE_RECOVERY_SCHEMA,
    producer:producerIdentity(),
    inputIdentity:inputIdentity(document),
    hypothesis,
    unassignedEvidenceRefs:[],
    ...body
  };
}
function baseResult(document, hypothesis, extra = {}) {
  return envelope(document, hypothesis, {
    split:false,
    count:1,
    method:'none',
    source:'local',
    documents:[document].filter(Boolean),
    requiresUserConfirmation:Boolean(hypothesis?.ambiguous),
    ai:{ engaged:false, accepted:false, reason:'not-requested' },
    ...extra
  });
}
function hypothesisSupportsCount(hypothesis, recordCount) {
  return (hypothesis?.hypotheses || []).some(item => Number(item?.recordCount) === Number(recordCount));
}
function localRecovery(document, hypothesis) {
  const deterministic = splitRecognitionEntries(document, { allowGeometry:false });
  if (!deterministic.split || deterministic.documents.length < 2) {
    return baseResult(document, hypothesis, {
      method:hypothesis?.geometry?.grouped ? String(hypothesis.geometry.method || 'geometry-evidence') : 'none',
      source:hypothesis?.geometry?.grouped ? 'geometry-evidence-only' : 'local',
      requiresUserConfirmation:Boolean(hypothesis?.ambiguous || hypothesis?.geometry?.grouped),
      localProposal:null
    });
  }

  // Text segmentation can be authoritative for manual/text-only input. For OCR with
  // spatial evidence, rebuilding children from flattened text would discard source
  // block/polygon/confidence identity, so it remains a proposal and structure recovery
  // must use identity-preserving evidence groups instead.
  if (hasSpatialEvidence(document)) {
    return baseResult(document, hypothesis, {
      method:deterministic.method,
      source:'identity-preserving-recovery-required',
      requiresUserConfirmation:true,
      localProposal:{
        method:deterministic.method,
        count:deterministic.documents.length,
        accepted:false,
        reason:'flattened-text-split-would-drop-spatial-evidence'
      }
    });
  }

  if (STRONG_LOCAL_METHODS.has(deterministic.method)) {
    return envelope(document, hypothesis, {
      split:true,
      count:deterministic.documents.length,
      method:deterministic.method,
      source:deterministic.method === 'explicit-extension' ? 'producer-structure' : 'deterministic-text-structure',
      documents:deterministic.documents,
      requiresUserConfirmation:true,
      localProposal:{ method:deterministic.method, count:deterministic.documents.length, accepted:true },
      ai:{ engaged:false, accepted:false, reason:'local-strong-structure' }
    });
  }

  const count = deterministic.documents.length;
  const weakAccepted = WEAK_LOCAL_METHODS.has(deterministic.method)
    && hypothesis?.recommendedRecordCount === count
    && Number(hypothesis?.confidence || 0) >= 0.72
    && !hypothesis?.ambiguous;
  if (weakAccepted) {
    return envelope(document, hypothesis, {
      split:true,
      count,
      method:deterministic.method,
      source:'deterministic-text-structure',
      documents:deterministic.documents,
      requiresUserConfirmation:true,
      localProposal:{ method:deterministic.method, count, accepted:true },
      ai:{ engaged:false, accepted:false, reason:'local-high-confidence' }
    });
  }

  return baseResult(document, hypothesis, {
    method:deterministic.method,
    source:'local-ambiguous',
    requiresUserConfirmation:true,
    localProposal:{ method:deterministic.method, count, accepted:false }
  });
}

function normalizeUnassignedRefs(result, knownRefs, assignedRefs) {
  if (!Array.isArray(result?.unassignedEvidenceRefs)) return null;
  const raw = result.unassignedEvidenceRefs.map(String);
  const unique = [...new Set(raw)];
  if (unique.length !== raw.length) return null;
  if (unique.some(ref => !knownRefs.has(ref) || assignedRefs.has(ref))) return null;
  return unique;
}

/**
 * Strictly validates an AI structure proposal. AI may group existing evidence only;
 * it cannot create facts, evidence references, or overwrite Foundation facts.
 * Every retained block must end up in exactly one of two states: assigned to one
 * proposed record or explicitly listed in unassignedEvidenceRefs.
 */
export function normalizeAiStructureProposal(result, document, hypothesis) {
  if (!result || result.schemaVersion !== AI_STRUCTURE_RESULT_SCHEMA || result.task !== 'structure') return null;
  if (result?.policy?.authority !== 'advisory'
    || result?.policy?.mayOverwriteFact !== false
    || result?.policy?.mayCreateFacts !== false) return null;

  const recordCount = Math.trunc(Number(result.recordCount));
  const confidence = Number(result.confidence);
  if (!Number.isInteger(recordCount) || recordCount < 1 || recordCount > 12) return null;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  if (!hypothesisSupportsCount(hypothesis, recordCount)) return null;

  const parentBlocks = Array.isArray(document?.blocks) ? document.blocks : [];
  const knownRefs = new Map(parentBlocks.map((block, index) => [`block:${String(block?.id || index + 1)}`, block]));
  const inputRefs = [...knownRefs.keys()];
  const groups = Array.isArray(result.groups) ? result.groups : [];

  if (recordCount === 1) {
    if (groups.length !== 0) return null;
    const assigned = new Set(inputRefs);
    const unassigned = normalizeUnassignedRefs(result, knownRefs, new Set());
    if (!unassigned) return null;
    unassigned.forEach(ref => assigned.delete(ref));
    return Object.freeze({
      schemaVersion:AI_STRUCTURE_RESULT_SCHEMA,
      task:'structure', recordCount:1, confidence:clamp01(confidence),
      reason:clean(result.reason), groups:Object.freeze([]), coverage:1,
      inputEvidenceRefs:Object.freeze(inputRefs),
      assignedEvidenceRefs:Object.freeze([...assigned]),
      unassignedEvidenceRefs:Object.freeze(unassigned),
      engine:clean(result.engine || 'zhipu'), model:clean(result.model), createdAt:clean(result.createdAt),
      inputFingerprint:clean(result.inputFingerprint),
      policy:Object.freeze({ authority:'advisory', mayOverwriteFact:false, mayCreateFacts:false })
    });
  }

  if (groups.length !== recordCount || knownRefs.size < recordCount * 2) return null;
  const used = new Set();
  const normalizedGroups = [];
  for (let index = 0; index < groups.length; index += 1) {
    const rawRefs = Array.isArray(groups[index]?.evidenceRefs) ? groups[index].evidenceRefs.map(String) : [];
    const refs = [...new Set(rawRefs)];
    if (refs.length !== rawRefs.length || refs.length < 2 || refs.some(ref => !knownRefs.has(ref) || used.has(ref))) return null;
    refs.forEach(ref => used.add(ref));
    normalizedGroups.push({ id:clean(groups[index]?.id || `record:${index + 1}`), evidenceRefs:Object.freeze(refs) });
  }
  const unassigned = normalizeUnassignedRefs(result, knownRefs, used);
  if (!unassigned) return null;
  if (used.size + unassigned.length !== knownRefs.size) return null;
  const partition = new Set([...used, ...unassigned]);
  if (partition.size !== knownRefs.size || inputRefs.some(ref => !partition.has(ref))) return null;
  const coverage = knownRefs.size ? used.size / knownRefs.size : 0;
  if (coverage < 0.6) return null;

  return Object.freeze({
    schemaVersion:AI_STRUCTURE_RESULT_SCHEMA,
    task:'structure', recordCount, confidence:clamp01(confidence),
    reason:clean(result.reason), groups:freezeArray(normalizedGroups), coverage:Number(coverage.toFixed(4)),
    inputEvidenceRefs:Object.freeze(inputRefs),
    assignedEvidenceRefs:Object.freeze([...used]),
    unassignedEvidenceRefs:Object.freeze(unassigned),
    engine:clean(result.engine || 'zhipu'), model:clean(result.model), createdAt:clean(result.createdAt),
    inputFingerprint:clean(result.inputFingerprint),
    policy:Object.freeze({ authority:'advisory', mayOverwriteFact:false, mayCreateFacts:false })
  });
}

function materializeAiGroups(document, proposal, hypothesis) {
  if (proposal.recordCount < 2 || proposal.confidence < 0.62 || proposal.unassignedEvidenceRefs.length > 0) return null;
  const byRef = new Map((document?.blocks || []).map((block, index) => [`block:${String(block?.id || index + 1)}`, block]));
  const parentImages = Array.isArray(document?.images) ? document.images : [];
  const documents = proposal.groups.map((group, index) => {
    const blocks = group.evidenceRefs.map(ref => byRef.get(ref)).filter(Boolean);
    const imageIds = new Set(blocks.map(block => String(block?.imageId || '')).filter(Boolean));
    const images = parentImages.filter(image => imageIds.has(String(image?.id || '')));
    if (!blocks.length || !images.length) return null;
    const child = createRecognitionDocument({
      images,
      blocks,
      engine:String(document?.engine || 'unknown'),
      fullText:blocks.map(block => clean(block?.text)).filter(Boolean).join('\n'),
      createdAt:String(document?.createdAt || new Date().toISOString())
    });
    child.extensions = {
      ...(child.extensions || {}),
      multiEntry:{
        schemaVersion:MULTI_ENTRY_SCHEMA,
        parentSchemaVersion:String(document?.schemaVersion || ''),
        parentCreatedAt:String(document?.createdAt || ''),
        index:index + 1,
        total:proposal.recordCount,
        method:'ai-structure-evidence-groups-v1',
        authority:'segmentation-only',
        requiresUserConfirmation:true,
        evidencePreserved:true,
        structureRecovery:{
          schemaVersion:RECOGNITION_STRUCTURE_RECOVERY_SCHEMA,
          hypothesisSchemaVersion:RECOGNITION_RECORD_HYPOTHESIS_SCHEMA,
          source:'ai-advisory',
          aiSchemaVersion:AI_STRUCTURE_RESULT_SCHEMA,
          confidence:proposal.confidence,
          engine:proposal.engine,
          model:proposal.model,
          inputFingerprint:proposal.inputFingerprint,
          groupId:group.id,
          evidenceRefs:[...group.evidenceRefs],
          unassignedEvidenceRefs:[]
        }
      }
    };
    return child;
  });
  return documents.every(Boolean) && documents.length === proposal.recordCount ? documents : null;
}

export function recoverRecognitionStructureLocal(document, options = {}) {
  if (!document || typeof document !== 'object') throw new TypeError('RecognitionDocument is required');
  const hypothesis = buildRecognitionRecordHypothesis(document, options);
  return localRecovery(document, hypothesis);
}

export async function recoverRecognitionStructure(document, options = {}) {
  const local = recoverRecognitionStructureLocal(document, options);
  if (local.split || !local.hypothesis?.shouldInvokeAi || typeof options.aiRecoverStructure !== 'function') return local;

  let response;
  try {
    response = await options.aiRecoverStructure(document, local.hypothesis);
  } catch (error) {
    return { ...local, ai:{ engaged:true, accepted:false, reason:'adapter-error', message:clean(error?.message) } };
  }
  if (!response?.ok) {
    return { ...local, ai:{ engaged:true, accepted:false, reason:clean(response?.reason || 'unavailable'), skipped:Boolean(response?.skipped) } };
  }

  const proposal = normalizeAiStructureProposal(response.result, document, local.hypothesis);
  if (!proposal) return { ...local, ai:{ engaged:true, accepted:false, reason:'invalid-structure-contract' } };

  if (proposal.recordCount === 1) {
    return {
      ...local,
      method:'ai-structure-single-v1', source:'ai-advisory', split:false, count:1,
      unassignedEvidenceRefs:[...proposal.unassignedEvidenceRefs],
      requiresUserConfirmation:Boolean(local.hypothesis?.ambiguous || proposal.unassignedEvidenceRefs.length),
      ai:{ engaged:true, accepted:true, materialized:true, reason:'single-record', proposal }
    };
  }

  if (proposal.unassignedEvidenceRefs.length > 0) {
    return {
      ...local,
      method:'ai-structure-unassigned-evidence-v1', source:'ai-advisory', split:false, count:1,
      unassignedEvidenceRefs:[...proposal.unassignedEvidenceRefs],
      requiresUserConfirmation:true,
      ai:{ engaged:true, accepted:true, materialized:false, reason:'unassigned-evidence', proposal }
    };
  }

  const documents = materializeAiGroups(document, proposal, local.hypothesis);
  if (!documents) {
    return { ...local, ai:{ engaged:true, accepted:false, materialized:false, reason:proposal.confidence < 0.62 ? 'low-confidence' : 'materialization-failed', proposal } };
  }
  return envelope(document, local.hypothesis, {
    split:true,
    count:documents.length,
    method:'ai-structure-evidence-groups-v1',
    source:'ai-advisory',
    documents,
    unassignedEvidenceRefs:[],
    requiresUserConfirmation:true,
    localProposal:local.localProposal || null,
    ai:{ engaged:true, accepted:true, materialized:true, reason:'evidence-groups', proposal }
  });
}
