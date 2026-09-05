import { SCHEMA_VERSION, assertPlainObject } from './utils.js';
import { SENSORY_STORAGE_FORMAT, sealSensoryRecord, openSensoryRecord } from './sensory-codec-v096.js';

const DB_NAME = 'luckybean';
const LEGACY_DB_NAME = 'coffee_cellar_local_mvp_v1';
const STORES = ['beans', 'beanSummaries', 'brewSessions', 'sensoryRecords', 'inventoryEvents', 'settings', 'customCodes', 'codebookCache', 'syncMetadata', 'shareDrafts', 'historyRevisions', 'recycleBin', 'syncOutbox'];
const INDEX_DEFS = Object.freeze({
  beanSummaries: [['updatedAt', 'updatedAt', { unique: false }]],
  brewSessions: [['beanId', 'beanId', { unique: false }], ['beanCreatedAt', ['beanId', 'createdAt'], { unique: false }]],
  sensoryRecords: [['beanId', 'beanId', { unique: false }], ['beanCreatedAt', ['beanId', 'createdAt'], { unique: false }]],
  inventoryEvents: [['beanId', 'beanId', { unique: false }], ['beanCreatedAt', ['beanId', 'createdAt'], { unique: false }]]
});
const SENSORY_KEY_ID = 'local.sensory.key.v1';
let dbPromise;
let sensorySecretPromise;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 请求失败'));
  });
}

function keyPathForStore(name) {
  if (['settings', 'codebookCache', 'syncMetadata'].includes(name)) return 'id';
  if (name === 'customCodes') return 'code';
  return 'id';
}

export function beanSummaryFromBean(bean = {}) {
  const name = String(bean.name || '').trim();
  const parts = name.split('·').map(value => value.trim()).filter(Boolean);
  return {
    id: bean.id || '', displayName: name, name,
    countryCode: bean.countryCode || '', regionCode: bean.regionCode || '', entityCode: bean.entityCode || '',
    varietyCode: bean.varietyCode || '', processCode: bean.processCode || '', roastCode: bean.roastCode || '', roastColor: bean.roastColor || '',
    roastDate: bean.roastDate || '', initialWeight: Number(bean.initialWeight || 0), remainingWeight: Number(bean.remainingWeight || 0),
    refrigerated: Boolean(bean.refrigerated), freezeDate: bean.freezeDate || '', price: Number(bean.price || 0),
    roasterName: bean.roasterName || bean.roaster || '', altitude: Number(bean.altitude || 0), archived: Boolean(bean.archived),
    flavorCodes: Array.isArray(bean.flavorCodes) ? [...bean.flavorCodes] : [],
    countryLabel: parts[0] || '', varietyLabel: parts[1] || '',
    createdAt: bean.createdAt || '', updatedAt: bean.updatedAt || bean.createdAt || ''
  };
}

function createMissingStores(db, transaction) {
  for (const name of STORES) {
    const objectStore = db.objectStoreNames.contains(name)
      ? transaction?.objectStore(name)
      : db.createObjectStore(name, { keyPath: keyPathForStore(name) });
    if (!objectStore) continue;
    for (const [indexName, keyPath, options] of INDEX_DEFS[name] || []) {
      if (!objectStore.indexNames.contains(indexName)) objectStore.createIndex(indexName, keyPath, options);
    }
  }
  // v9 -> v10 backfill happens inside the versionchange transaction. Canonical beans are read
  // by cursor and never rewritten; beanSummaries is a disposable derived projection.
  if (transaction && db.objectStoreNames.contains('beans') && db.objectStoreNames.contains('beanSummaries')) {
    const beans = transaction.objectStore('beans');
    const summaries = transaction.objectStore('beanSummaries');
    const request = beans.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      summaries.put(beanSummaryFromBean(cursor.value));
      cursor.continue();
    };
  }
}

function missingStores(db) {
  return STORES.filter(name => !db.objectStoreNames.contains(name));
}

function attachVersionChangeHandler(db) {
  db.onversionchange = () => db.close();
  return db;
}

function openDatabase(version) {
  return new Promise((resolve, reject) => {
    const request = version == null ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => createMissingStores(request.result, request.transaction);
    request.onsuccess = () => resolve(attachVersionChangeHandler(request.result));
    request.onerror = () => reject(request.error || new Error('数据库打开失败'));
    request.onblocked = () => reject(new Error('数据库升级被其他页面占用，请关闭其他富贵盒子页面后重试'));
  });
}

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    if (!globalThis.indexedDB) throw new Error('当前浏览器不支持 IndexedDB');
    const current = await openDatabase();
    const missing = missingStores(current);
    if (current.version >= SCHEMA_VERSION && missing.length === 0) return current;
    const targetVersion = Math.max(SCHEMA_VERSION, current.version + (missing.length ? 1 : 0));
    current.close();
    return openDatabase(targetVersion);
  })().catch(error => {
    dbPromise = undefined;
    throw error;
  });
  return dbPromise;
}

async function store(name, mode = 'readonly') {
  if (!STORES.includes(name)) throw new Error(`未知数据表：${name}`);
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(String(value || '')), char => char.charCodeAt(0));
}

async function ensureSensorySecret() {
  if (sensorySecretPromise) return sensorySecretPromise;
  sensorySecretPromise = (async () => {
    if (!crypto?.getRandomValues) return null;
    const objectStore = await store('syncMetadata', 'readwrite');
    const existing = await requestToPromise(objectStore.get(SENSORY_KEY_ID));
    if (existing?.secret) return base64ToBytes(existing.secret);
    const secret = crypto.getRandomValues(new Uint8Array(32));
    await requestToPromise(objectStore.put({
      id: SENSORY_KEY_ID,
      secret: bytesToBase64(secret),
      algorithm: 'AES-GCM-256',
      scope: 'local-device',
      createdAt: new Date().toISOString()
    }));
    return secret;
  })().catch(error => {
    sensorySecretPromise = undefined;
    console.warn('品鉴记录本地密钥初始化失败，回退为仅压缩存储', error);
    return null;
  });
  return sensorySecretPromise;
}

async function transformForWrite(name, value) {
  if (name !== 'sensoryRecords' || value?.storageFormat === SENSORY_STORAGE_FORMAT) return structuredClone(value);
  const secret = await ensureSensorySecret();
  return sealSensoryRecord(value, secret);
}

async function transformForRead(name, value) {
  if (name !== 'sensoryRecords' || !value || value.storageFormat !== SENSORY_STORAGE_FORMAT) return value;
  try {
    return await openSensoryRecord(value, await ensureSensorySecret());
  } catch (error) {
    console.error('品鉴记录解密失败', error);
    return {
      id: value.id,
      beanId: value.beanId,
      brewSessionId: value.brewSessionId || '',
      createdAt: value.createdAt || '',
      updatedAt: value.updatedAt || value.createdAt || '',
      answers: {},
      summary: ['记录解密失败'],
      naturalNote: '',
      autoScore: 0,
      subjectiveScore: 0,
      score: 0,
      scoreDelta: 0,
      storageError: error.message
    };
  }
}

export async function all(name) {
  const values = await requestToPromise((await store(name)).getAll());
  if (name !== 'sensoryRecords') return values;
  return Promise.all(values.map(value => transformForRead(name, value)));
}

export async function get(name, key) {
  return transformForRead(name, await requestToPromise((await store(name)).get(key)));
}

export async function allByIndex(name, indexName, key, { raw = false } = {}) {
  if (!STORES.includes(name)) throw new Error(`未知数据表：${name}`);
  const objectStore = await store(name);
  if (!objectStore.indexNames.contains(indexName)) throw new Error(`${name} 缺少索引 ${indexName}`);
  const values = await requestToPromise(objectStore.index(indexName).getAll(key));
  if (raw || name !== 'sensoryRecords') return values;
  return Promise.all(values.map(value => transformForRead(name, value)));
}

export async function sensoryHeadersByBean(beanId) {
  const rows = await allByIndex('sensoryRecords', 'beanId', beanId, { raw: true });
  return rows.map(value => ({
    id: value.id, beanId: value.beanId, brewSessionId: value.brewSessionId || '',
    createdAt: value.createdAt || '', updatedAt: value.updatedAt || value.createdAt || '',
    storageFormat: value.storageFormat || ''
  }));
}

export async function put(name, value) {
  assertPlainObject(value, name);
  const prepared = await transformForWrite(name, value);
  const db = await openDb();
  const names = name === 'beans' ? ['beans', 'beanSummaries'] : [name];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    let resultKey;
    const request = tx.objectStore(name).put(prepared);
    request.onsuccess = () => { resultKey = request.result; };
    if (name === 'beans') tx.objectStore('beanSummaries').put(beanSummaryFromBean(value));
    tx.oncomplete = () => resolve(resultKey);
    tx.onerror = () => reject(tx.error || new Error('写入失败'));
    tx.onabort = () => reject(tx.error || new Error('写入中止'));
  });
}

export async function remove(name, key) {
  const db = await openDb();
  const names = name === 'beans' ? ['beans', 'beanSummaries'] : [name];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    tx.objectStore(name).delete(key);
    if (name === 'beans') tx.objectStore('beanSummaries').delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('删除失败'));
    tx.onabort = () => reject(tx.error || new Error('删除中止'));
  });
}

export async function clear(name) {
  const db = await openDb();
  const names = name === 'beans' ? ['beans', 'beanSummaries'] : [name];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    tx.objectStore(name).clear();
    if (name === 'beans') tx.objectStore('beanSummaries').clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('清空失败'));
    tx.onabort = () => reject(tx.error || new Error('清空中止'));
  });
}

export async function bulkPut(name, values) {
  if (!Array.isArray(values)) throw new Error('批量写入数据必须是数组');
  const prepared = await Promise.all(values.map(value => transformForWrite(name, value)));
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const names = name === 'beans' ? ['beans', 'beanSummaries'] : [name];
    const tx = db.transaction(names, 'readwrite');
    const objectStore = tx.objectStore(name);
    prepared.forEach(value => objectStore.put(structuredClone(value)));
    if (name === 'beans') {
      const summaries = tx.objectStore('beanSummaries');
      values.forEach(value => summaries.put(beanSummaryFromBean(value)));
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('批量写入失败'));
    tx.onabort = () => reject(tx.error || new Error('批量写入中止'));
  });
}

export async function replaceStores(storeRows) {
  assertPlainObject(storeRows, '恢复数据');
  const names = Object.keys(storeRows);
  if (!names.length) return;
  for (const name of names) {
    if (!STORES.includes(name)) throw new Error(`未知数据表：${name}`);
    if (!Array.isArray(storeRows[name])) throw new Error(`${name}恢复数据必须是数组`);
  }
  const prepared = Object.fromEntries(await Promise.all(names.map(async name => [
    name,
    await Promise.all(storeRows[name].map(value => transformForWrite(name, value)))
  ])));
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const txNames = names.includes('beans') ? [...new Set([...names, 'beanSummaries'])] : names;
    const tx = db.transaction(txNames, 'readwrite');
    for (const name of names) {
      const objectStore = tx.objectStore(name);
      objectStore.clear();
      prepared[name].forEach(value => objectStore.put(structuredClone(value)));
    }
    if (names.includes('beans')) {
      const summaries = tx.objectStore('beanSummaries');
      summaries.clear();
      storeRows.beans.forEach(value => summaries.put(beanSummaryFromBean(value)));
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('完整恢复失败'));
    tx.onabort = () => reject(tx.error || new Error('完整恢复已中止'));
  });
}

export async function activateCodebook(candidate) {
  assertPlainObject(candidate, '编码表候选');
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('codebookCache', 'readwrite');
    const objectStore = tx.objectStore('codebookCache');
    objectStore.put(structuredClone({ ...candidate, id: 'candidate' }));
    objectStore.put(structuredClone({ ...candidate, id: 'active' }));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('编码表原子替换失败'));
    tx.onabort = () => reject(tx.error || new Error('编码表原子替换中止'));
  });
}

export async function getSetting(id, fallback = null) {
  const value = await get('settings', id);
  return value?.value ?? fallback;
}

export async function setSetting(id, value) { return put('settings', { id, value, updatedAt: new Date().toISOString() }); }

export async function clearAll() {
  const db = await openDb();
  await Promise.all(STORES.map(name => new Promise((resolve, reject) => {
    const request = db.transaction(name, 'readwrite').objectStore(name).clear();
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  })));
  sensorySecretPromise = undefined;
}

export async function migrateLegacy() {
  const done = await getSetting('migration.legacy.v1', false);
  if (done) return { migrated: false, reason: 'already-done' };

  const legacyExists = await new Promise(resolve => {
    const request = indexedDB.open(LEGACY_DB_NAME);
    let created = false;
    request.onupgradeneeded = () => { created = true; request.transaction.abort(); };
    request.onsuccess = () => { request.result.close(); resolve(!created); };
    request.onerror = () => resolve(false);
  });
  if (!legacyExists) {
    await setSetting('migration.legacy.v1', true);
    return { migrated: false, reason: 'not-found' };
  }

  const legacy = await new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const read = name => new Promise(resolve => {
    if (!legacy.objectStoreNames.contains(name)) return resolve([]);
    const request = legacy.transaction(name).objectStore(name).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
  const [beans, records, customCodes, settings] = await Promise.all(['beans', 'records', 'customCodes', 'settings'].map(read));
  legacy.close();

  await put('syncMetadata', {
    id: 'migration.legacy.backup.v1',
    capturedAt: new Date().toISOString(),
    sourceDatabase: LEGACY_DB_NAME,
    data: { beans, records, customCodes, settings }
  });

  const migratedBeans = beans.map(bean => ({
    ...bean,
    id: bean.id,
    name: bean.name || bean.beanName || '未命名豆卡',
    initialWeight: Number(bean.initialWeight ?? bean.startWeight ?? bean.remainingWeight ?? 0),
    remainingWeight: Number(bean.remainingWeight ?? bean.initialWeight ?? bean.startWeight ?? 0),
    flavorCodes: Array.isArray(bean.flavorCodes) ? bean.flavorCodes : [],
    legacyCode: bean.legacyCode || null,
    updatedAt: bean.updatedAt || new Date().toISOString()
  }));
  if (migratedBeans.length) await bulkPut('beans', migratedBeans);
  if (records.length) await bulkPut('sensoryRecords', records.map(record => ({ ...record, id: record.id, migratedFrom: 'records' })));
  if (customCodes.length) await bulkPut('customCodes', customCodes);
  for (const item of settings) if (item?.id) await put('settings', item);
  await setSetting('migration.legacy.v1', true);
  return { migrated: true, beans: migratedBeans.length, records: records.length, customCodes: customCodes.length };
}
