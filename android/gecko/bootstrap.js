import './bridge.js';

async function start() {
  await import('./web-cache/native-bridge.js');
  const active = await globalThis.LuckyBeanRoomStore.get('syncMetadata', 'native.storage.backend.v1');
  if (!active?.active || active.schemaVersion !== 10) throw new Error('Room 未就绪，请切回 WebView 完成迁移');
  const pending = await globalThis.LuckyBeanRoomStore.get('platformPreferences', 'restoreGeckoPreferences');
  if (pending?.pending) {
    const preferences = await globalThis.LuckyBeanRoomStore.get('platformPreferences', 'localStorage');
    if (!preferences?.values) throw new Error('本地偏好快照不可用，原始偏好保留');
    localStorage.clear();
    for (const [key, value] of Object.entries(preferences.values)) localStorage.setItem(key, value);
    await globalThis.LuckyBeanRoomStore.remove('platformPreferences', 'restoreGeckoPreferences');
  }
  const scripts = await (await fetch(new URL('./entrypoints.json', import.meta.url))).json();
  for (const src of scripts) await import(new URL(src, new URL('./web-cache/index.html', import.meta.url)));
}

start().catch(error => {
  const status = document.querySelector('#splashStatus');
  if (status) status.textContent = `GeckoView 本地初始化失败：${error.message}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  button.textContent = '切回 WebView';
  Object.assign(button.style, { position: 'absolute', bottom: '90px', zIndex: '2' });
  button.addEventListener('click', () => globalThis.LuckyBeanNative.switchEngine('webview'));
  (document.querySelector('#splashScreen') || document.body).appendChild(button);
});
