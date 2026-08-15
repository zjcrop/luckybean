import { brewApiJson } from './brew-api-client.js';

export const BREW_PROFILE_CATALOG_CONTRACT = 'brew-profile-catalog/1.0';
const CACHE_KEY = 'luckybean.brew.profile.catalog.v1';
const REQUIRED_COMPETITION_IDS = Object.freeze([
  'cbrc-2026-01-zhong-jingjing',
  'cbrc-2026-02-liang-baoyi',
  'cbrc-2026-03-wu-minwei',
  'cbrc-2026-04-yang-xiao',
  'cbrc-2026-05-zhang-xiaobo',
  'cbrc-2026-06-qu-yongxiang'
]);

let current = readCache();
let running = null;

function readCache() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(CACHE_KEY) || 'null');
    return validateCatalog(value, { requireCompetition: false });
  } catch { return null; }
}

function writeCache(catalog) {
  try { globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(catalog)); } catch { /* storage unavailable */ }
}

function dispatch(name, detail) {
  if (typeof globalThis.document === 'undefined' || typeof globalThis.CustomEvent !== 'function') return;
  globalThis.document.dispatchEvent(new CustomEvent(name, { detail }));
}

function publicProfile(value) {
  return {
    id: String(value?.id || '').trim(),
    version: String(value?.version || '1.0.0'),
    label: String(value?.label || value?.id || '').trim(),
    status: String(value?.status || 'experimental'),
    category: String(value?.category || ''),
    tags: Array.isArray(value?.tags) ? value.tags.map(String) : [],
    compatibleDripperGroups: Array.isArray(value?.compatibleDripperGroups) ? value.compatibleDripperGroups.map(String) : [],
    autoRecommend: value?.autoRecommend === true,
    serveMode: value?.serveMode === 'cold' ? 'cold' : 'hot',
    referenceDoseG: Number(value?.referenceDoseG || 15),
    referenceBrewWaterG: Number(value?.referenceBrewWaterG || 0),
    referenceIceG: Number(value?.referenceIceG || 0),
    referenceBypassWaterG: Number(value?.referenceBypassWaterG || 0),
    referenceTotalWaterG: Number(value?.referenceTotalWaterG || 0),
    updatedAt: value?.updatedAt || null,
    source: 'brew-profiles-authoritative'
  };
}

export function validateCatalog(value, { requireCompetition = true } = {}) {
  if (!value || value.contract !== BREW_PROFILE_CATALOG_CONTRACT || !Array.isArray(value.profiles)) return null;
  const ids = new Set();
  const profiles = [];
  for (const item of value.profiles) {
    const profile = publicProfile(item);
    if (!profile.id || !profile.label || ids.has(profile.id)) continue;
    ids.add(profile.id);
    profiles.push(profile);
  }
  if (!profiles.length) return null;
  if (requireCompetition && REQUIRED_COMPETITION_IDS.some(id => !ids.has(id))) return null;
  return {
    contract: BREW_PROFILE_CATALOG_CONTRACT,
    apiVersion: String(value.apiVersion || ''),
    engineVersion: String(value.engineVersion || ''),
    generatedAt: value.generatedAt || '',
    catalogHash: String(value.catalogHash || ''),
    source: 'brew-profiles-authoritative',
    profiles
  };
}

export function listCachedBrewProfiles() {
  return (current?.profiles || []).map(profile => ({ ...profile, tags: [...profile.tags], compatibleDripperGroups: [...profile.compatibleDripperGroups] }));
}

export function brewProfileCatalogStatus() {
  return current ? {
    available: true,
    catalogHash: current.catalogHash,
    generatedAt: current.generatedAt,
    engineVersion: current.engineVersion,
    profileCount: current.profiles.length,
    competitionProfileCount: current.profiles.filter(profile => profile.id.startsWith('cbrc-2026-')).length
  } : { available: false, profileCount: 0, competitionProfileCount: 0 };
}

export async function refreshBrewProfileCatalog({ force = false, timeoutMs = 10000 } = {}) {
  if (running && !force) return running;
  running = (async () => {
    const { payload } = await brewApiJson('?mode=profiles', { method: 'GET', timeoutMs });
    const catalog = validateCatalog(payload, { requireCompetition: true });
    if (!catalog) throw new Error('BrewProfiles返回的方案目录不完整，已保留上一版目录。');
    const changed = !current || current.catalogHash !== catalog.catalogHash;
    current = catalog;
    writeCache(catalog);
    dispatch('luckybean:brew-profile-catalog-updated', { catalog: structuredClone(catalog), changed });
    return { catalog: structuredClone(catalog), changed };
  })().finally(() => { running = null; });
  return running;
}

function scheduleRefresh() {
  const run = () => refreshBrewProfileCatalog().catch(error => {
    console.warn('BrewProfiles方案目录更新失败，继续使用本地缓存', error);
    dispatch('luckybean:brew-profile-catalog-error', { message: error.message });
  });
  if ('requestIdleCallback' in globalThis) requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 400);
}

if (typeof globalThis.window !== 'undefined') {
  globalThis.window.addEventListener('online', scheduleRefresh, { passive: true });
  scheduleRefresh();
}

globalThis.LuckyBeanBrewProfiles = {
  list: listCachedBrewProfiles,
  refresh: refreshBrewProfileCatalog,
  status: brewProfileCatalogStatus
};
