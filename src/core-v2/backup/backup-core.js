import {
  BACKUP_FORMAT,
  CORE_VERSION,
  DATA_SCHEMA_VERSION,
  CORE_STORES,
  assertStoreName,
  canonicalJson,
  cloneJson
} from '../contracts.js';

function bytesToHex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) throw new Error('当前运行环境不支持 SHA-256');
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : canonicalJson(value));
  return bytesToHex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)));
}

export function normalizeSnapshot(snapshot) {
  const stores = {};
  for (const name of CORE_STORES) {
    const values = Array.isArray(snapshot?.stores?.[name]) ? snapshot.stores[name] : [];
    stores[name] = values.map(cloneJson);
  }
  return {
    source: cloneJson(snapshot?.source || {}),
    stores
  };
}

export async function createBackupDocument(snapshot, metadata = {}) {
  const normalized = normalizeSnapshot(snapshot);
  const checksums = {};
  const counts = {};
  for (const name of CORE_STORES) {
    const data = canonicalJson(normalized.stores[name]);
    checksums[name] = await sha256Hex(data);
    counts[name] = normalized.stores[name].length;
  }
  const createdAt = String(metadata.createdAt || new Date().toISOString());
  const manifest = {
    format: BACKUP_FORMAT,
    formatVersion: 1,
    coreVersion: String(metadata.coreVersion || CORE_VERSION),
    appVersion: String(metadata.appVersion || ''),
    schemaVersion: Number(metadata.schemaVersion || DATA_SCHEMA_VERSION),
    syncProtocolVersion: Number(metadata.syncProtocolVersion || 2),
    codebookVersion: String(metadata.codebookVersion || ''),
    createdAt,
    deviceId: String(metadata.deviceId || ''),
    encrypted: Boolean(metadata.encrypted),
    counts,
    checksums
  };
  return { manifest, stores: normalized.stores };
}

export async function verifyBackupDocument(document) {
  if (!document || document.manifest?.format !== BACKUP_FORMAT) {
    return { ok: false, errors: ['备份格式不受支持'], stores: {} };
  }
  const errors = [];
  const stores = {};
  for (const name of CORE_STORES) {
    assertStoreName(name);
    const records = Array.isArray(document.stores?.[name]) ? document.stores[name] : [];
    const actualCount = records.length;
    const expectedCount = Number(document.manifest.counts?.[name] || 0);
    const actualHash = await sha256Hex(canonicalJson(records));
    const expectedHash = String(document.manifest.checksums?.[name] || '');
    const countOk = actualCount === expectedCount;
    const hashOk = actualHash === expectedHash;
    stores[name] = { countOk, hashOk, actualCount, expectedCount, actualHash, expectedHash };
    if (!countOk) errors.push(`${name} 记录数量不一致`);
    if (!hashOk) errors.push(`${name} 校验值不一致`);
  }
  return { ok: errors.length === 0, errors, stores };
}
