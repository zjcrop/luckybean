import { openSensoryRecord, SENSORY_STORAGE_FORMAT } from '../../sensory-codec-v096.js';
import { openPrivateJson, PRIVATE_ENVELOPE_FORMAT } from '../../privacy-codec-v096.js';
import { RECOVERY_FORMAT, RECOVERY_STORES, RECOVERY_PREFERENCES, canonical, snapshotManifest, validateSnapshot, sealRecoverySnapshot, openRecoverySnapshot } from './recovery-snapshot-codec.js';

const DIAGNOSTICS_KEY = 'luckybean.recovery.diagnostics.v1';
let unsavedDiagnostics = [];
const TEMP_PREFIX = 'luckybean-recovery-rehearsal-';

function openExisting(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    let missing = false;
    request.onupgradeneeded = () => { missing = true; request.transaction.abort(); };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => missing ? resolve(null) : reject(new Error('无法读取本机数据库'));
    request.onblocked = () => reject(new Error('数据库被其他页面占用'));
  });
}
function readStores(db, names) {
  return new Promise((resolve, reject) => {
    const result = {};
    const tx = db.transaction(names, 'readonly');
    for (const name of names) {
      result[name] = [];
      const request = tx.objectStore(name).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        result[name].push({ key: cursor.key, value: cursor.value });
        cursor.continue();
      };
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(new Error('读取备份数据失败；未将失败表当作空表'));
  });
}
async function capture() {
  const db = await openExisting('luckybean');
  if (!db) throw new Error('尚无本机数据库，请先正常启动应用');
  let stores;
  try {
    if (db.version !== 10 || canonical([...db.objectStoreNames].sort()) !== canonical([...RECOVERY_STORES].sort())) throw new Error('数据库结构与 schema 10 不一致，停止备份');
    stores = await readStores(db, RECOVERY_STORES);
  } finally { db.close(); }
  const assets = await openExisting('luckybean-local-assets');
  let photos = [];
  if (assets) {
    try {
      if (assets.version !== 1 || canonical([...assets.objectStoreNames]) !== canonical(['beanThumbnails'])) throw new Error('本机照片库结构不兼容');
      photos = (await readStores(assets, ['beanThumbnails'])).beanThumbnails;
    } finally { assets.close(); }
  }
  const preferences = Object.fromEntries(RECOVERY_PREFERENCES.map(key => [key, localStorage.getItem(key)]));
  return validateSnapshot({ format: RECOVERY_FORMAT, schemaVersion: 10, createdAt: new Date().toISOString(), stores, photos, preferences });
}

// Two independent databases cannot share one IDB transaction. Detect observed writes
// across captures and fail closed; users must pause editing/sync and close other tabs.
export async function captureRecoverySnapshot() {
  const first = await capture();
  const second = await capture();
  if (canonical(await snapshotManifest(first)) !== canonical(await snapshotManifest(second))) throw new Error('备份期间数据发生变化，请暂停编辑与同步、关闭其他页面后重试');
  return second;
}

async function verifyPrivateRecords(snapshot) {
  const metadata = snapshot.stores.syncMetadata.map(row => row.value);
  const secret = id => {
    const value = metadata.find(row => row.id === id)?.secret;
    return value ? Uint8Array.from(atob(value), char => char.charCodeAt(0)) : null;
  };
  let sensory = 0, identity = 0;
  for (const row of snapshot.stores.sensoryRecords) {
    if (row.value.storageFormat !== SENSORY_STORAGE_FORMAT) continue;
    await openSensoryRecord(row.value, secret('local.sensory.key.v1'));
    sensory++;
  }
  for (const row of snapshot.stores.settings) {
    if (row.value.privateIdentity?.format !== PRIVATE_ENVELOPE_FORMAT) continue;
    await openPrivateJson(row.value.privateIdentity, secret('local.privacy.key.v1'), 'identity');
    identity++;
  }
  return { sensory, identity };
}
function deleteTemporary(name) {
  if (!name.startsWith(TEMP_PREFIX)) throw new Error('仅允许清理本次演练库');
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = resolve;
    request.onerror = request.onblocked = () => reject(new Error('临时演练库清理失败'));
  });
}

// Never accepts a caller-supplied destination and never opens production databases.
export async function rehearseRecoverySnapshot(snapshot, onStep = () => {}) {
  onStep('validate-snapshot');
  validateSnapshot(snapshot);
  const name = TEMP_PREFIX + crypto.randomUUID();
  let db;
  try {
    onStep('open-isolated-database');
    db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        for (const store of RECOVERY_STORES) request.result.createObjectStore(store, { keyPath: store === 'customCodes' ? 'code' : 'id' });
        request.result.createObjectStore('photos');
        request.result.createObjectStore('preferences');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => reject(new Error('无法建立独立恢复演练库'));
    });
    onStep('write-isolated-database');
    await new Promise((resolve, reject) => {
      const tx = db.transaction([...RECOVERY_STORES, 'photos', 'preferences'], 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(new Error('演练写入失败；原数据未修改'));
      try {
        for (const store of RECOVERY_STORES) for (const row of snapshot.stores[store]) tx.objectStore(store).add(row.value);
        for (const row of snapshot.photos) tx.objectStore('photos').add(row.value, row.key);
        for (const [key, value] of Object.entries(snapshot.preferences)) tx.objectStore('preferences').add(value, key);
      } catch { tx.abort(); }
    });
    onStep('readback-and-checksum');
    const rows = await readStores(db, [...RECOVERY_STORES, 'photos', 'preferences']);
    const restored = { ...snapshot, stores: Object.fromEntries(RECOVERY_STORES.map(store => [store, rows[store]])), photos: rows.photos, preferences: Object.fromEntries(rows.preferences.map(row => [row.key, row.value])) };
    const before = await snapshotManifest(snapshot), after = await snapshotManifest(restored);
    if (canonical(before) !== canonical(after)) throw new Error('隔离恢复前后数量或 SHA-256 不一致');
    onStep('decrypt-private-records');
    const privateRecords = await verifyPrivateRecords(restored);
    return { manifest: after, privateRecords, isolatedRestore: 'passed', liveRestore: 'not-performed', deviceAcceptance: 'pending' };
  } finally {
    db?.close();
    try { await deleteTemporary(name); }
    catch (error) { onStep('cleanup-isolated-database'); throw error; }
  }
}

export function recoveryDiagnostics() {
  try { const stored = JSON.parse(localStorage.getItem(DIAGNOSTICS_KEY) || '[]'); return [...(Array.isArray(stored) ? stored : []), ...unsavedDiagnostics]; } catch { return [...unsavedDiagnostics]; }
}
function recordDiagnostic(report) {
  // Deliberately exclude exceptions, row values, filenames, keys and passwords.
  const previous = recoveryDiagnostics();
  try { localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify([...previous, report])); unsavedDiagnostics = []; } catch { unsavedDiagnostics.push(report); }
  return report;
}
async function operation(stage, run) {
  const base = { format: 'luckybean-recovery-diagnostic/1', stage, at: new Date().toISOString(), schemaVersion: 10, appRevision: globalThis.document?.querySelector('meta[name="release-revision"]')?.content || 'unknown' };
  let step = 'start';
  try { return await run(base, value => { step = value; }); }
  catch (error) {
    recordDiagnostic({ ...base, step, status: 'failed', code: stage === 'export' ? 'BACKUP_FAILED' : 'REHEARSAL_FAILED', liveDataWritten: false });
    throw error;
  }
}
export async function createRecoveryBackup(password) {
  return operation('export', async (base, onStep) => {
    onStep('capture-stable-snapshot');
    const snapshot = await captureRecoverySnapshot();
    onStep('encrypt-backup');
    const envelope = await sealRecoverySnapshot(snapshot, password);
    // Rehearse from decrypted bytes, not the in-memory source snapshot.
    onStep('decrypt-backup');
    const result = await rehearseRecoverySnapshot(await openRecoverySnapshot(envelope, password), onStep);
    const report = recordDiagnostic({ ...base, status: 'passed', ...result, liveDataWritten: false, fileSave: 'not-confirmed' });
    return { envelope, report };
  });
}
export async function verifyRecoveryBackup(envelope, password) {
  return operation('verify-file', async (base, onStep) => {
    onStep('parse-file');
    if (typeof envelope === 'string') {
      if (envelope.length > 90 * 1024 * 1024) throw new Error('备份文件过大');
      envelope = JSON.parse(envelope);
    }
    onStep('decrypt-backup');
    const result = await rehearseRecoverySnapshot(await openRecoverySnapshot(envelope, password), onStep);
    return recordDiagnostic({ ...base, status: 'passed', ...result, liveDataWritten: false, fileReadBack: 'passed' });
  });
}
