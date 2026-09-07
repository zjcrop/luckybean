import { BREW_API_PUBLIC_KEY, getInstallationId } from './brew-api-client.js';

export const RECOGNITION_AI_ENDPOINT = 'https://vaxwncdcuvbpvdbbketb.supabase.co/functions/v1/recognition-ai-v1';
export const RECOGNITION_AI_CLIENT_VERSION = 'luckybean-recognition-ai/1.1.0';

const RESULT_TO_AI_FIELD = Object.freeze({
  countryCode:'country', regionCode:'region', entityCode:'entity', varietyCode:'variety', processCode:'process',
  roastCode:'roast', roastDate:'roastDate', harvestYear:'harvest', altitude:'altitude', roasterName:'roaster',
  initialWeight:'weight', flavorCodes:'flavorNotes', lot:'lot', grade:'grade'
});

function samplesFromDocument(document) {
  const rows = (document?.blocks || []).map((block, index) => ({
    evidenceRef:`block:${String(block?.id || index + 1)}`,
    text:String(block?.text || '').trim()
  })).filter(item => item.text);
  if (rows.length >= 2) return rows.slice(0, 30);
  return String(document?.fullText || '').split(/\n+/).map((text, index) => ({ evidenceRef:`line:${index + 1}`, text:text.trim() })).filter(item => item.text).slice(0, 30);
}

function validateAdvisoryResult(result) {
  if (!result || result.schemaVersion !== 'ai-enrichment-result/1.0') return false;
  if (result?.policy?.authority !== 'advisory' || result?.policy?.mayOverwriteFact !== false) return false;
  if (!Array.isArray(result.candidates)) return false;
  return result.candidates.every(candidate => candidate && typeof candidate.field === 'string'
    && Number.isFinite(Number(candidate.confidence)) && Number(candidate.confidence) >= 0 && Number(candidate.confidence) <= 1
    && Array.isArray(candidate.evidenceRefs));
}

function validateStructureResult(result) {
  if (!result || result.schemaVersion !== 'ai-structure-result/1.0' || result.task !== 'structure') return false;
  if (result?.policy?.authority !== 'advisory'
    || result?.policy?.mayOverwriteFact !== false
    || result?.policy?.mayCreateFacts !== false) return false;
  const count = Number(result.recordCount), confidence = Number(result.confidence);
  if (!Number.isInteger(count) || count < 1 || count > 12 || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return false;
  if (!Array.isArray(result.groups) || !Array.isArray(result.unassignedEvidenceRefs)) return false;
  if (count > 1 && result.groups.length !== count) return false;
  if (count === 1 && result.groups.length !== 0) return false;
  return result.groups.every(group => group && Array.isArray(group.evidenceRefs));
}

async function postRecognitionAi(body, { timeoutMs = 14000 } = {}) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  const request = fetch(RECOGNITION_AI_ENDPOINT, {
    method:'POST',
    headers:{
      accept:'application/json', 'content-type':'application/json', apikey:BREW_API_PUBLIC_KEY,
      'x-client-info':RECOGNITION_AI_CLIENT_VERSION, 'x-installation-id':getInstallationId()
    },
    body:JSON.stringify(body), cache:'no-store', ...(controller ? { signal:controller.signal } : {})
  });
  try {
    let response;
    if (controller) {
      timer = setTimeout(() => controller.abort(), timeoutMs);
      response = await request;
    } else {
      response = await Promise.race([request, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('AI_TIMEOUT')), timeoutMs);
      })]);
    }
    const text = await response.text();
    let payload = null; try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    if (!response.ok || payload?.ok !== true) return { ok:false, skipped:false, reason:String(payload?.error || `http-${response.status}`) };
    return { ok:true, payload };
  } catch (error) {
    return { ok:false, skipped:false, reason:error?.name === 'AbortError' || error?.message === 'AI_TIMEOUT' ? 'timeout' : 'network-error' };
  } finally { if (timer) clearTimeout(timer); }
}

export async function enrichRecognitionWithAi(document, analysis, { timeoutMs = 14000 } = {}) {
  const review = (analysis?.fields || []).filter(item => item.status === 'review' || Number(item.confidence || 0) < 0.68);
  if (!review.length) return { ok:false, skipped:true, reason:'local-high-confidence' };
  const samples = samplesFromDocument(document);
  if (samples.length < 2) return { ok:false, skipped:true, reason:'minimum-two-samples' };
  const unresolvedFields = [...new Set(review.map(item => RESULT_TO_AI_FIELD[item.field]).filter(Boolean))];
  const response = await postRecognitionAi({
    contract:'luckybean-recognition-ai/1.0', task:'review', samples, unresolvedFields, locale:'zh-CN'
  }, { timeoutMs });
  if (!response.ok) return response;
  if (!validateAdvisoryResult(response.payload?.result)) return { ok:false, skipped:false, reason:'invalid-advisory-contract' };
  return { ok:true, result:response.payload.result, model:response.payload.model || '', usage:response.payload.usage || null };
}

function compactStructureHypothesis(hypothesis) {
  return {
    schemaVersion:String(hypothesis?.schemaVersion || ''),
    recommendedRecordCount:Number(hypothesis?.recommendedRecordCount || 1),
    confidence:Number(hypothesis?.confidence || 0),
    ambiguous:Boolean(hypothesis?.ambiguous),
    hypotheses:(hypothesis?.hypotheses || []).slice(0, 6).map(item => ({
      recordCount:Number(item?.recordCount || 1), probability:Number(item?.probability || 0)
    })),
    evidence:(hypothesis?.evidence || []).slice(0, 12).map(item => ({
      source:String(item?.source || ''), recordCount:Number(item?.recordCount || 1),
      confidence:Number(item?.confidence || 0), method:String(item?.method || ''), authority:String(item?.authority || '')
    })),
    geometry:{
      method:String(hypothesis?.geometry?.method || 'none'),
      candidates:(hypothesis?.geometry?.candidates || []).slice(0, 12).map(item => ({
        id:String(item?.id || ''), confidence:Number(item?.confidence || 0),
        evidenceRefs:(item?.blockIds || []).map(id => `block:${String(id)}`)
      }))
    }
  };
}

/**
 * Optional transport adapter for Foundation Structure Recovery. It only asks the
 * server to partition existing OCR evidence references into assigned record groups
 * plus explicit unassigned evidence. The Foundation module remains responsible for
 * strict partition validation and materialization.
 */
export async function recoverRecognitionStructureWithAi(document, hypothesis, { timeoutMs = 7000 } = {}) {
  if (!hypothesis?.shouldInvokeAi) return { ok:false, skipped:true, reason:'local-structure-sufficient' };
  const samples = samplesFromDocument(document);
  if (samples.length < 2 || !samples.some(item => item.evidenceRef.startsWith('block:'))) {
    return { ok:false, skipped:true, reason:'minimum-structured-evidence' };
  }
  const response = await postRecognitionAi({
    contract:'luckybean-recognition-ai/1.1', task:'structure', samples,
    hypothesis:compactStructureHypothesis(hypothesis), locale:'zh-CN'
  }, { timeoutMs });
  if (!response.ok) return response;
  if (!validateStructureResult(response.payload?.result)) return { ok:false, skipped:false, reason:'invalid-structure-contract' };
  return { ok:true, result:response.payload.result, model:response.payload.model || '', usage:response.payload.usage || null };
}
