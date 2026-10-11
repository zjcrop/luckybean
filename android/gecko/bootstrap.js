import './bridge.js';
await import('./web-cache/native-bridge.js');
const active = await globalThis.LuckyBeanRoomStore.get('syncMetadata', 'native.storage.backend.v1');
if (!active?.active) throw new Error('Room 未就绪，请切回 WebView 完成迁移');
const pending = await globalThis.LuckyBeanRoomStore.get('platformPreferences', 'restoreGeckoPreferences');
if (pending?.pending) {
const preferences = await globalThis.LuckyBeanRoomStore.get('platformPreferences', 'localStorage');
localStorage.clear();
for (const [key, value] of Object.entries(preferences?.values || {})) localStorage.setItem(key, value);
await globalThis.LuckyBeanRoomStore.remove('platformPreferences', 'restoreGeckoPreferences');
}
const scripts = await (await fetch(new URL('./entrypoints.json', import.meta.url))).json();
for (const src of scripts) await import(new URL(src, new URL('./web-cache/index.html', import.meta.url)));
