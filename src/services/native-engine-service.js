import { isRoomStorageActive } from '../db.js';
import { migrateBeanThumbnailsToRoom } from '../domain/beans/bean-thumbnail-storage.js';

async function savePreferences() {
  const values = Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]));
  await globalThis.LuckyBeanRoomStore.put('platformPreferences', { id: 'localStorage', values });
  const stored = await globalThis.LuckyBeanRoomStore.get('platformPreferences', 'localStorage');
  const keys = Object.keys(values).sort();
  if (JSON.stringify(keys.map(key => [key, values[key]])) !== JSON.stringify(Object.keys(stored?.values || {}).sort().map(key => [key, stored.values[key]]))) {
    throw new Error('本地偏好迁移校验失败');
  }
}

export async function switchNativeEngine() {
  const native = globalThis.LuckyBeanNative;
  if (typeof native?.switchEngine !== 'function') throw new Error('当前安装包不支持引擎切换');
  if (globalThis.__LUCKYBEAN_ENGINE__ === 'gecko') {
    await savePreferences();
    await globalThis.LuckyBeanRoomStore.put('platformPreferences', { id: 'restoreWebViewPreferences', pending: true });
    native.switchEngine('webview');
    return;
  }
  if (!await isRoomStorageActive()) throw new Error('请先迁移本地记录到 Room');
  // Once enabled, Room contains current thumbnails; never overwrite them with an old IDB copy.
  const current = await globalThis.LuckyBeanRoomStore.get('platformPreferences', 'engineMigration');
  const thumbnails = current?.ready ? current.thumbnails : await migrateBeanThumbnailsToRoom();
  await savePreferences();
  await globalThis.LuckyBeanRoomStore.put('platformPreferences', { id: 'engineMigration', ready: true, thumbnails });
  await globalThis.LuckyBeanRoomStore.put('platformPreferences', { id: 'restoreGeckoPreferences', pending: true });
  native.switchEngine('gecko');
}
