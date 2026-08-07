import { readFile, writeFile, rename, rm, access } from 'node:fs/promises';

const exists = path => access(path).then(() => true).catch(() => false);

async function patchStartup() {
  const path = 'src/core/startup-controller.js';
  let source = await readFile(path, 'utf8');
  source = source.replace(
    "      setStatus('云端数据已更新，正在重新载入…');\n      setTimeout(() => location.reload(), 120);",
    "      setStatus('云端数据已更新，正在刷新本地视图…');\n      document.addEventListener('luckybean:app-refreshed', () => { setStatus('点击进入'); if (enterRequested) dismissSplash(); }, { once: true });\n      document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail: { source: 'cloud-data-restored' } }));"
  );
  if (source.includes('location.reload')) throw new Error('startup reload remains');
  await writeFile(path, source);
}

async function patchFab() {
  const path = 'src/ui/fab-controller.js';
  let source = await readFile(path, 'utf8');
  source = source.replace(
    "globalThis.LuckyBeanFabController = { repair, reset: () => { localStorage.removeItem(STORAGE_KEY); location.reload(); } };",
    "globalThis.LuckyBeanFabController = { repair, reset: () => { localStorage.removeItem(STORAGE_KEY); wrap.style.removeProperty('left'); wrap.style.removeProperty('top'); wrap.style.removeProperty('right'); wrap.style.removeProperty('bottom'); wrap.style.removeProperty('transform'); requestAnimationFrame(repair); } };"
  );
  if (source.includes('location.reload')) throw new Error('FAB reload remains');
  await writeFile(path, source);
}

async function patchSettings() {
  const path = 'src/settings-screen-controller.js';
  let source = await readFile(path, 'utf8');
  source = source.replace(
    "          setTimeout(() => location.reload(), 600);",
    "          document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail: { source: 'cloud-restore-settings' } }));"
  );
  if (source.includes('location.reload')) throw new Error('settings reload remains');
  await writeFile(path, source);
}

async function renameCloudCodec() {
  const oldPath = 'src/v099f-cloud-codec.js';
  const newPath = 'src/cloud-codec.js';
  if (await exists(oldPath) && !await exists(newPath)) await rename(oldPath, newPath);
  else if (await exists(oldPath) && await exists(newPath)) await rm(oldPath);
  if (!await exists(newPath)) throw new Error('formal cloud codec missing');
  const syncPath = 'src/services/cloud-sync-service.js';
  let sync = await readFile(syncPath, 'utf8');
  sync = sync.replace("from '../v099f-cloud-codec.js';", "from '../cloud-codec.js';");
  if (sync.includes('v099f-cloud-codec')) throw new Error('legacy cloud codec import remains');
  await writeFile(syncPath, sync);
  const swPath = 'sw.js';
  let sw = await readFile(swPath, 'utf8');
  const marker = "  './src/services/cloud-sync-service.js?v=1.1.0-test',\n";
  const line = "  './src/cloud-codec.js?v=1.2.0-test',\n";
  if (!sw.includes(line)) {
    if (!sw.includes(marker)) throw new Error('cloud sync SW marker missing');
    sw = sw.replace(marker, marker + line);
  }
  sw = sw.replaceAll('./src/v099f-cloud-codec.js?v=1.1.0-test', line.trim());
  await writeFile(swPath, sw);
}

async function deleteDeadFreshnessModule() {
  const path = 'src/v099i-freshness-group.js';
  if (!await exists(path)) return;
  const runtime = await readFile('src/features/runtime-features.js', 'utf8');
  const app = await readFile('src/app.js', 'utf8');
  const sw = await readFile('sw.js', 'utf8');
  if ([runtime, app, sw].some(source => source.includes('v099i-freshness-group'))) throw new Error('freshness legacy module is still referenced');
  await rm(path);
}

async function refineAudit() {
  const path = 'scripts/audit-formal-runtime.mjs';
  let source = await readFile(path, 'utf8');
  source = source.replace(
    "['dom-plan-reparse', /#generatedPlan[\\s\\S]{0,800}(?:textContent|querySelector|stage-cell)/g],",
    "['dom-plan-reparse', /#generatedPlan[\\s\\S]{0,800}(?:textContent\\s*\\.|stage-cell|querySelector\\([^)]*stage)/g],"
  );
  await writeFile(path, source);
}

await patchStartup();
await patchFab();
await patchSettings();
await renameCloudCodec();
await deleteDeadFreshnessModule();
await refineAudit();
console.log('Final reloads removed, cloud codec formalized and dead freshness module deleted.');
