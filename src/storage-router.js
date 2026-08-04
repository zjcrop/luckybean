import * as web from './db-storage-core.js';
import {
  nativeStorageAvailable,
  openNativeStorage,
  nativeAll,
  nativeGet,
  nativePut,
  nativeRemove,
  nativeClear,
  nativeBulkPut,
  nativeClearAll,
  nativeActivateCodebook
} from './core-v2/platform/native-storage.js';

export function usesNativeStorage() {
  return nativeStorageAvailable();
}

export async function openDb() {
  return usesNativeStorage() ? openNativeStorage() : web.openDb();
}

export async function all(name) {
  return usesNativeStorage() ? nativeAll(name) : web.all(name);
}

export async function get(name, key) {
  return usesNativeStorage() ? nativeGet(name, key) : web.get(name, key);
}

export async function put(name, value) {
  return usesNativeStorage() ? nativePut(name, value) : web.put(name, value);
}

export async function remove(name, key) {
  return usesNativeStorage() ? nativeRemove(name, key) : web.remove(name, key);
}

export async function clear(name) {
  return usesNativeStorage() ? nativeClear(name) : web.clear(name);
}

export async function bulkPut(name, values) {
  return usesNativeStorage() ? nativeBulkPut(name, values) : web.bulkPut(name, values);
}

export async function activateCodebook(candidate) {
  return usesNativeStorage() ? nativeActivateCodebook(candidate) : web.activateCodebook(candidate);
}

export async function getSetting(id, fallback = null) {
  const value = await get('settings', id);
  return value?.value ?? fallback;
}

export async function setSetting(id, value) {
  return put('settings', { id, value, updatedAt: new Date().toISOString() });
}

export async function clearAll(options = {}) {
  if (!usesNativeStorage()) return web.clearAll();
  if (options.confirmToken !== 'DELETE_LOCAL_DATA') {
    throw new Error('Android 清除全部数据需要明确确认');
  }
  return nativeClearAll(options.confirmToken);
}

export async function migrateLegacy() {
  if (usesNativeStorage()) {
    return { migrated: false, reason: 'native-room-migration-gated-before-startup' };
  }
  return web.migrateLegacy();
}
