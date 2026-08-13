import { all, put } from '../db.js';
import { loadCodebook, makeIndex, displayName } from '../codebook.js';

let codebookIndex = null;
let running = false;
let queued = false;

async function ensureIndex() {
  if (codebookIndex) return codebookIndex;
  const loaded = await loadCodebook();
  codebookIndex = makeIndex(loaded?.data || loaded);
  return codebookIndex;
}
function named(index, table, code, fallback = '') {
  const value = String(displayName(index, table, code, fallback) || '').trim();
  return value === '—' ? '' : value;
}

export async function enrichBeansForMatching() {
  if (running) return;
  running = true;
  try {
    const index = await ensureIndex();
    const beans = await all('beans').catch(() => []);
    for (const bean of beans) {
      if (!bean?.id) continue;
      const flavorNames = [...new Set((bean.flavorCodes || []).map(code => named(index, 'flavors', code, '')).filter(Boolean))];
      const next = {
        ...bean,
        countryName: bean.countryName || named(index, 'countries', bean.countryCode, ''),
        regionName: bean.regionName || named(index, 'regions', bean.regionCode, ''),
        entityName: bean.entityName || named(index, 'entities', bean.entityCode, ''),
        varietyName: bean.varietyName || named(index, 'varieties', bean.varietyCode, ''),
        processName: bean.processName || named(index, 'processes', bean.processCode, ''),
        flavorText: flavorNames.join(' ')
      };
      const changed = ['countryName','regionName','entityName','varietyName','processName','flavorText'].some(key => String(next[key] || '') !== String(bean[key] || ''));
      if (changed) await put('beans', next);
    }
  } catch (error) {
    console.warn('豆卡匹配语义补全失败', error);
  } finally {
    running = false;
  }
}

export function queueBeanEnrichment() {
  if (queued) return;
  queued = true;
  setTimeout(() => { queued = false; enrichBeansForMatching(); }, 80);
}

document.addEventListener('luckybean:data-changed', queueBeanEnrichment);
document.addEventListener('luckybean:codebook-provider-activated', () => { codebookIndex = null; queueBeanEnrichment(); });
document.addEventListener('luckybean:local-app-ready', queueBeanEnrichment, { once:true });
