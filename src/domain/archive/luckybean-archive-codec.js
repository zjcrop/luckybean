export const LUCKYBEAN_ARCHIVE_FORMAT = 'luckybean-archive';
export const LUCKYBEAN_ARCHIVE_VERSION = 1;
export const LUCKYBEAN_ARCHIVE_MIME = 'application/vnd.luckybean.archive+json';

export const PORTABLE_STORES = Object.freeze([
  'beans',
  'brewSessions',
  'sensoryRecords',
  'inventoryEvents',
  'settings',
  'customCodes',
  'codebookCache',
  'shareDrafts',
  'historyRevisions',
  'recycleBin',
  'syncOutbox'
]);

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const encoder = new TextEncoder();

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式无效`);
  return value;
}

function safeTree(value, path = 'root', depth = 0) {
  if (depth > 32) throw new Error(`${path}嵌套层级过深`);
  if (value == null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path}包含无效数字`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 200000) throw new Error(`${path}数组过大`);
    value.forEach((item, index) => safeTree(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (typeof value !== 'object') throw new Error(`${path}包含不支持的数据类型`);
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`${path}包含危险字段`);
    safeTree(item, `${path}.${key}`, depth + 1);
  }
}

async function sha256(text) {
  if (!globalThis.crypto?.subtle) throw new Error('当前环境不支持备份完整性校验');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeStores(input = {}) {
  const source = plainObject(input, '备份数据');
  return Object.fromEntries(PORTABLE_STORES.map(name => {
    const rows = source[name] ?? [];
    if (!Array.isArray(rows)) throw new Error(`${name}必须是数组`);
    return [name, structuredClone(rows)];
  }));
}

async function sectionManifest(stores) {
  const output = {};
  for (const name of PORTABLE_STORES) {
    const serialized = JSON.stringify(stores[name]);
    output[name] = {
      count: stores[name].length,
      bytes: encoder.encode(serialized).byteLength,
      sha256: await sha256(serialized)
    };
  }
  return output;
}

function legacyStores(payload) {
  return normalizeStores({
    beans: payload.beans,
    brewSessions: payload.brewSessions,
    sensoryRecords: payload.sensoryRecords,
    inventoryEvents: payload.inventoryEvents,
    settings: payload.settings ? [{ id: 'app.settings', value: payload.settings, updatedAt: payload.exportedAt || '' }] : []
  });
}

export async function buildLuckyBeanArchive({ stores, schemaVersion, appVersion, createdAt = new Date().toISOString() }) {
  const normalized = normalizeStores(stores);
  safeTree(normalized, 'stores');
  const body = {
    format: LUCKYBEAN_ARCHIVE_FORMAT,
    formatVersion: LUCKYBEAN_ARCHIVE_VERSION,
    schemaVersion: Number(schemaVersion),
    appVersion: String(appVersion || ''),
    createdAt,
    manifest: await sectionManifest(normalized),
    stores: normalized
  };
  return { ...body, sha256: await sha256(JSON.stringify(body)) };
}

export async function parseLuckyBeanArchive(value, { currentSchemaVersion } = {}) {
  const payload = plainObject(value, '备份文件');
  safeTree(payload);

  if (payload.format === 'luckybean-backup') {
    const schemaVersion = Number(payload.schemaVersion || 0);
    if (currentSchemaVersion != null && schemaVersion > Number(currentSchemaVersion)) throw new Error('备份 Schema 版本高于当前应用');
    return {
      format: LUCKYBEAN_ARCHIVE_FORMAT,
      formatVersion: LUCKYBEAN_ARCHIVE_VERSION,
      schemaVersion,
      appVersion: String(payload.appVersion || 'legacy'),
      createdAt: payload.exportedAt || '',
      stores: legacyStores(payload),
      migratedFrom: 'luckybean-backup'
    };
  }

  if (payload.format !== LUCKYBEAN_ARCHIVE_FORMAT || Number(payload.formatVersion) !== LUCKYBEAN_ARCHIVE_VERSION) {
    throw new Error('不是兼容的 LuckyBean 备份');
  }
  if (currentSchemaVersion != null && Number(payload.schemaVersion) > Number(currentSchemaVersion)) {
    throw new Error('备份 Schema 版本高于当前应用');
  }
  const expected = String(payload.sha256 || '');
  const body = { ...payload };
  delete body.sha256;
  if (!expected || await sha256(JSON.stringify(body)) !== expected) throw new Error('备份总校验失败，文件可能已损坏');

  const stores = normalizeStores(payload.stores);
  const manifest = plainObject(payload.manifest, '备份清单');
  for (const name of PORTABLE_STORES) {
    const entry = plainObject(manifest[name], `${name}清单`);
    const serialized = JSON.stringify(stores[name]);
    if (Number(entry.count) !== stores[name].length
      || Number(entry.bytes) !== encoder.encode(serialized).byteLength
      || String(entry.sha256 || '') !== await sha256(serialized)) {
      throw new Error(`${name}数据校验失败`);
    }
  }
  return { ...body, stores };
}

export function archiveCounts(stores = {}) {
  return Object.fromEntries(PORTABLE_STORES.map(name => [name, Array.isArray(stores[name]) ? stores[name].length : 0]));
}
