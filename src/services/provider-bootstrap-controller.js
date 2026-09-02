import { updateAllProviders, getActiveProvider } from './provider-package-service.js';
import { reconcileCustomCodes } from './codebook-reconciliation-service.js';
import { validateCodebook } from '../codebook.js';
import { activateCodebook } from '../db.js';

let running = null;

async function activateBrewIon(result, knowledgeResult = null) {
  const active = result?.active || await getActiveProvider('brewion');
  if (!active?.data) return null;
  const data = validateCodebook(structuredClone(active.data));
  const knowledgeActive = knowledgeResult?.active || await getActiveProvider('brewion-knowledge');
  if (knowledgeActive?.data?.contract === 'coffee-knowledge/1.0' && knowledgeActive.data?._format === 'coffee-knowledge-bundle') {
    data.coffeeKnowledge = structuredClone(knowledgeActive.data);
  }
  const record = {
    id: 'active',
    data,
    source: data.coffeeKnowledge ? 'brewion-provider+knowledge' : 'brewion-provider',
    hash: active.artifactSha256,
    version: active.dataVersion,
    releaseId: active.releaseId,
    knowledgeVersion: knowledgeActive?.dataVersion || null,
    knowledgeSha256: knowledgeActive?.artifactSha256 || null,
    updatedAt: active.generatedAt,
    checkedAt: new Date().toISOString()
  };
  await activateCodebook(record);
  const reconciliation = await reconcileCustomCodes(data);
  document.dispatchEvent(new CustomEvent('luckybean:codebook-provider-activated', {
    detail: { data, meta: record, reconciliation, knowledge: knowledgeActive || null }
  }));
  return { data, meta: record, reconciliation, knowledge: knowledgeActive || null };
}

export async function refreshProviders({ force = false } = {}) {
  if (running) return running;
  running = (async () => {
    const results = await updateAllProviders({ force });
    const brewion = await activateBrewIon(results.brewion, results['brewion-knowledge']);
    document.dispatchEvent(new CustomEvent('luckybean:providers-ready', { detail: { results, brewion } }));
    return { results, brewion };
  })().finally(() => { running = null; });
  return running;
}

function schedule() {
  const run = () => refreshProviders().catch(error => {
    console.warn('Provider后台更新失败，继续使用最后有效本地版本', error);
    document.dispatchEvent(new CustomEvent('luckybean:provider-update-error', { detail: { message: error.message } }));
  });
  if ('requestIdleCallback' in globalThis) requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 1200);
}

document.addEventListener('luckybean:cloud-login-success', schedule);
window.addEventListener('online', schedule, { passive: true });
schedule();

globalThis.LuckyBeanProviders = { refresh: refreshProviders, active: getActiveProvider };
