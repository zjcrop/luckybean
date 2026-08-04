import { assertPlainRecord, assertStoreName, cloneJson, recordId } from '../contracts.js';

function nativeBridge() {
  const bridge = globalThis.LuckyBeanNative;
  return bridge && typeof bridge.invoke === 'function' ? bridge : null;
}

export function nativeStorageAvailable() {
  return Boolean(nativeBridge());
}

async function invoke(command, payload = {}) {
  const bridge = nativeBridge();
  if (!bridge) throw new Error('Android Native Bridge 不可用');
  const response = await bridge.invoke(command, payload);
  if (response?.ok === false) {
    const error = new Error(response.message || `原生调用失败：${command}`);
    error.code = response.code || 'NATIVE_ERROR';
    error.details = response.details || null;
    throw error;
  }
  return response?.value ?? response;
}

export async function nativeCapabilities() {
  return invoke('capabilities');
}

export async function openNativeStorage() {
  return invoke('storage.open', { schemaVersion: 3 });
}

export async function nativeAll(name) {
  assertStoreName(name);
  const value = await invoke('storage.all', { store: name });
  return Array.isArray(value) ? value : [];
}

export async function nativeGet(name, key) {
  assertStoreName(name);
  return invoke('storage.get', { store: name, key: String(key) });
}

export async function nativePut(name, value) {
  assertStoreName(name);
  assertPlainRecord(value, name);
  const id = recordId(value, name);
  await invoke('storage.put', { store: name, key: id, value: cloneJson(value) });
  return id;
}

export async function nativeRemove(name, key) {
  assertStoreName(name);
  return invoke('storage.remove', { store: name, key: String(key) });
}

export async function nativeClear(name) {
  assertStoreName(name);
  return invoke('storage.clear', { store: name });
}

export async function nativeBulkPut(name, values) {
  assertStoreName(name);
  if (!Array.isArray(values)) throw new Error('批量写入数据必须是数组');
  const records = values.map(value => {
    assertPlainRecord(value, name);
    return { key: recordId(value, name), value: cloneJson(value) };
  });
  return invoke('storage.bulkPut', { store: name, records });
}

export async function nativeClearAll(confirmToken) {
  return invoke('storage.clearAll', { confirmToken });
}

export async function nativeActivateCodebook(candidate) {
  assertPlainRecord(candidate, '编码表候选');
  await nativeBulkPut('codebookCache', [
    { ...cloneJson(candidate), id: 'candidate' },
    { ...cloneJson(candidate), id: 'active' }
  ]);
}

export async function nativeExportText({ name, mimeType = 'application/octet-stream', text }) {
  return invoke('files.saveText', { name, mimeType, text: String(text) });
}

export async function nativeImportText({ mimeTypes = ['application/json', 'application/octet-stream'] } = {}) {
  return invoke('files.openText', { mimeTypes });
}

export async function nativeExportBackup({ name = 'luckybean-backup.luckybean' } = {}) {
  return invoke('backup.export', { name });
}

export async function nativeImportBackup() {
  return invoke('backup.import');
}

export async function nativeRecognizeImage() {
  return invoke('ocr.pickImage');
}

export async function nativeCaptureImage() {
  return invoke('camera.capture');
}

export async function nativeShareText({ title = 'LuckyBean', text }) {
  return invoke('share.text', { title, text: String(text) });
}

export async function nativeEnqueueSync() {
  return invoke('sync.enqueue');
}
