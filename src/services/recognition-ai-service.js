import { BREW_API_PUBLIC_KEY, getInstallationId } from './brew-api-client.js';

export const RECOGNITION_AI_ENDPOINT = 'https://vaxwncdcuvbpvdbbketb.supabase.co/functions/v1/recognition-ai-v1';
export const RECOGNITION_AI_CLIENT_VERSION = 'luckybean-recognition-ai/1.0.0';

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

export async function enrichRecognitionWithAi(document, analysis, { timeoutMs = 14000 } = {}) {
  const review = (analysis?.fields || []).filter(item => item.status === 'review' || Number(item.confidence || 0) < 0.68);
  if (!review.length) return { ok:false, skipped:true, reason:'local-high-confidence' };
  const samples = samplesFromDocument(document);
  if (samples.length < 2) return { ok:false, skipped:true, reason:'minimum-two-samples' };
  const unresolvedFields = [...new Set(review.map(item => RESULT_TO_AI_FIELD[item.field]).filter(Boolean))];
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  const request = fetch(RECOGNITION_AI_ENDPOINT, {
    method:'POST',
    headers:{
      accept:'application/json', 'content-type':'application/json', apikey:BREW_API_PUBLIC_KEY,
      'x-client-info':RECOGNITION_AI_CLIENT_VERSION, 'x-installation-id':getInstallationId()
    },
    body:JSON.stringify({ contract:'luckybean-recognition-ai/1.0', samples, unresolvedFields, locale:'zh-CN' }),
    cache:'no-store', ...(controller ? { signal:controller.signal } : {})
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
    if (!response.ok || payload?.ok !== true || !validateAdvisoryResult(payload?.result)) {
      return { ok:false, skipped:false, reason:String(payload?.error || `http-${response.status}`) };
    }
    return { ok:true, result:payload.result, model:payload.model || '', usage:payload.usage || null };
  } catch (error) {
    return { ok:false, skipped:false, reason:error?.name === 'AbortError' || error?.message === 'AI_TIMEOUT' ? 'timeout' : 'network-error' };
  } finally { if (timer) clearTimeout(timer); }
}
