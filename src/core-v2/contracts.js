export const CORE_VERSION = '2.0.0-alpha.1';
export const DATA_SCHEMA_VERSION = 3;
export const SYNC_PROTOCOL_VERSION = 2;
export const BACKUP_FORMAT = 'luckybean-backup-v1';

export const CORE_STORES = Object.freeze([
  'beans',
  'brewSessions',
  'sensoryRecords',
  'inventoryEvents',
  'settings',
  'customCodes',
  'codebookCache',
  'syncMetadata',
  'shareDrafts',
  'attachments',
  'syncOutbox',
  'syncTombstones',
  'schemaMetadata'
]);

export class CoreContractError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'CoreContractError';
    this.code = code;
    this.details = details;
  }
}

export function assertStoreName(name) {
  if (!CORE_STORES.includes(name)) {
    throw new CoreContractError('UNKNOWN_STORE', `未知数据表：${String(name)}`);
  }
  return name;
}

export function assertPlainRecord(value, label = 'record') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CoreContractError('INVALID_RECORD', `${label} 必须是普通对象`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CoreContractError('INVALID_RECORD_PROTO', `${label} 不能携带自定义原型`);
  }
  return value;
}

export function recordId(value, label = 'record') {
  assertPlainRecord(value, label);
  const id = String(value.id ?? value.code ?? '').trim();
  if (!id) throw new CoreContractError('MISSING_ID', `${label} 缺少 id/code`);
  return id;
}

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return null;
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
    result[key] = canonicalize(item);
  }
  return result;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeRevisionedRecord(value, { now = new Date().toISOString(), deviceId = '' } = {}) {
  const input = cloneJson(assertPlainRecord(value));
  const id = recordId(input);
  return {
    ...input,
    id,
    schemaVersion: Number.isInteger(input.schemaVersion) ? input.schemaVersion : DATA_SCHEMA_VERSION,
    revision: Math.max(1, Number(input.revision) || 1),
    deviceId: String(input.deviceId || deviceId || ''),
    createdAt: String(input.createdAt || now),
    updatedAt: String(input.updatedAt || now),
    deletedAt: input.deletedAt ? String(input.deletedAt) : null
  };
}

export function createPlatformServices(services) {
  assertPlainRecord(services, 'platform services');
  const required = ['storage', 'files', 'camera', 'ocr', 'share', 'sync'];
  for (const key of required) {
    if (!services[key] || typeof services[key] !== 'object') {
      throw new CoreContractError('MISSING_PLATFORM_SERVICE', `缺少平台服务：${key}`);
    }
  }
  return Object.freeze(services);
}
