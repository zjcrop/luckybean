// Stage 1: encrypted local recovery evidence; never a cloud-sync payload.
export const RECOVERY_FORMAT = 'luckybean-recovery/1';
export const RECOVERY_STORES = Object.freeze(['beans', 'beanSummaries', 'brewSessions', 'sensoryRecords', 'inventoryEvents', 'settings', 'customCodes', 'codebookCache', 'syncMetadata', 'shareDrafts', 'historyRevisions', 'recycleBin', 'syncOutbox']);
export const RECOVERY_PREFERENCES = Object.freeze(['luckybean.ui.v095', 'luckybean.ui.v094', 'luckybean.voice.v120', 'luckybean.group.method.v098', 'luckybean.selected.bean.v098', 'luckybean.fab.position.v2', 'luckybean.fab.position.v1']);
export const MAX_RECOVERY_BYTES = 64 * 1024 * 1024;
const ITERATIONS = 310000;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

// Reject unsupported values instead of silently dropping fields in JSON export.
export function canonical(value, depth = 0) {
  if (depth > 64) throw new Error('备份数据嵌套过深');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + Array.from(value, item => canonical(item, depth + 1)).join(',') + ']';
  if (value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return '{' + Object.keys(value).sort().map(key => {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('备份字段不受支持');
      return JSON.stringify(key) + ':' + canonical(value[key], depth + 1);
    }).join(',') + '}';
  }
  throw new Error('备份含无法无损保存的字段；原数据未修改');
}

export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(canonical(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function exactKeys(value, keys) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || canonical(Object.keys(value).sort()) !== canonical([...keys].sort())) throw new Error('备份章节不完整或包含未知章节');
}
function validateRows(rows, store) {
  if (!Array.isArray(rows)) throw new Error('备份记录格式无效');
  const keys = new Set();
  for (const row of rows) {
    exactKeys(row, ['key', 'value']);
    if (typeof row.key !== 'string' || !row.key || keys.has(row.key)) throw new Error('备份记录键无效或重复');
    keys.add(row.key);
    if (store === 'photos') {
      if (typeof row.value !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(row.value)) throw new Error('照片备份格式无效');
    } else if (!row.value || row.value[store === 'customCodes' ? 'code' : 'id'] !== row.key) throw new Error('备份记录键与内容不匹配');
  }
}
export function validateSnapshot(snapshot) {
  exactKeys(snapshot, ['format', 'schemaVersion', 'createdAt', 'stores', 'photos', 'preferences']);
  if (snapshot.format !== RECOVERY_FORMAT || snapshot.schemaVersion !== 10 || !Number.isFinite(Date.parse(snapshot.createdAt))) throw new Error('仅支持 schema 10 安全备份');
  exactKeys(snapshot.stores, RECOVERY_STORES);
  exactKeys(snapshot.preferences, RECOVERY_PREFERENCES);
  for (const name of RECOVERY_STORES) validateRows(snapshot.stores[name], name);
  validateRows(snapshot.photos, 'photos');
  for (const value of Object.values(snapshot.preferences)) if (value !== null && typeof value !== 'string') throw new Error('偏好备份格式无效');
  const serialized = canonical(snapshot);
  if (encoder.encode(serialized).byteLength > MAX_RECOVERY_BYTES) throw new Error('安全备份超过 64MB；未生成不完整文件');
  return snapshot;
}
export async function snapshotManifest(snapshot) {
  validateSnapshot(snapshot);
  const sections = { ...snapshot.stores, photos: snapshot.photos, preferences: snapshot.preferences };
  return Object.fromEntries(await Promise.all(Object.entries(sections).map(async ([name, value]) => [name, {
    count: Array.isArray(value) ? value.length : Object.values(value).filter(item => item !== null).length,
    sha256: await digest(value)
  }])));
}
function encode64(bytes) {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) text += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(text);
}
function decode64(text) {
  if (typeof text !== 'string' || text.length > MAX_RECOVERY_BYTES * 1.4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('加密备份编码无效');
  return Uint8Array.from(atob(text), char => char.charCodeAt(0));
}
async function passwordKey(password, salt) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new Error('备份口令须为 12—1024 个字符');
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function sealRecoverySnapshot(snapshot, password) {
  validateSnapshot(snapshot);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = { format: 'luckybean-recovery-encrypted/1', kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, encryption: 'AES-GCM-256', salt: encode64(salt), iv: encode64(iv) };
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(canonical(header)) }, await passwordKey(password, salt), encoder.encode(canonical(snapshot)));
  return { ...header, cipher: encode64(new Uint8Array(cipher)) };
}
export async function openRecoverySnapshot(envelope, password) {
  exactKeys(envelope, ['format', 'kdf', 'iterations', 'encryption', 'salt', 'iv', 'cipher']);
  if (envelope.format !== 'luckybean-recovery-encrypted/1' || envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== ITERATIONS || envelope.encryption !== 'AES-GCM-256') throw new Error('加密备份版本不支持');
  const { cipher, ...header } = envelope;
  const salt = decode64(header.salt), iv = decode64(header.iv), bytes = decode64(cipher);
  if (salt.length !== 16 || iv.length !== 12 || bytes.length < 16 || bytes.length > MAX_RECOVERY_BYTES + 16) throw new Error('加密备份长度无效');
  const key = await passwordKey(password, salt);
  let plain;
  try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(canonical(header)) }, key, bytes); }
  catch { throw new Error('口令错误或备份损坏；原数据未修改'); }
  return validateSnapshot(JSON.parse(decoder.decode(plain)));
}
