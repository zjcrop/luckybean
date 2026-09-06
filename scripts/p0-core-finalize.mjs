import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`${label}: marker missing`);
  return source.replace(before, after);
}

const appPath = 'src/app.js';
let app = fs.readFileSync(appPath, 'utf8');

app = replaceOnce(app,
`async function ensurePageData(page, { force = false } = {}) {
  if ((page === 'brew' || page === 'sensory') && state.selectedBeanId) return ensureBeanDetailData(state.selectedBeanId, { force });
  return null;
}`,
`async function ensureBeanConsumptionData({ force = false } = {}) {
  if (state.data.inventoryReady && !force) return state.inventoryEvents;
  state.inventoryEvents = await all('inventoryEvents');
  state.data.inventoryReady = true;
  return state.inventoryEvents;
}

async function ensurePageData(page, { force = false } = {}) {
  if ((page === 'brew' || page === 'sensory') && state.selectedBeanId) return ensureBeanDetailData(state.selectedBeanId, { force });
  return null;
}`,
'ensureBeanConsumptionData');

app = replaceOnce(app,
`document.addEventListener('luckybean:request-app-refresh', async event => {
  await loadSettings();
  await refreshData();
  if (state.page !== 'beans') await ensurePageData(state.page, { force: true });
  if (state.page === 'beans') renderBeans();
  else if (state.page === 'brew') renderBrew();
  else if (state.page === 'sensory') renderSensory();
  else if (state.page === 'settings') renderSettings();
  document.dispatchEvent(new CustomEvent('luckybean:app-refreshed', { detail: event.detail || {} }));
});`,
`document.addEventListener('luckybean:request-app-refresh', async event => {
  await loadSettings();
  await refreshData();
  if (state.page === 'beans') await ensureBeanConsumptionData({ force: true });
  else await ensurePageData(state.page, { force: true });
  if (state.page === 'beans') renderBeans();
  else if (state.page === 'brew') renderBrew();
  else if (state.page === 'sensory') renderSensory();
  else if (state.page === 'settings') renderSettings();
  document.dispatchEvent(new CustomEvent('luckybean:app-refreshed', { detail: event.detail || {} }));
});`,
'request-app-refresh');

app = replaceOnce(app,
`  scheduleIdleWork(async () => {
    await migrateLegacyFlavorCodes().catch(error => console.warn('旧风味编码后台迁移失败', error));
    await migrateLegacyBrewHistory().catch(error => console.warn('冲煮历史后台迁移失败', error));
    await cleanupExpiredBeanRecycle().catch(error => console.warn('回收站后台清理失败', error));
  });`,
`  scheduleIdleWork(async () => {
    await migrateLegacyFlavorCodes().catch(error => console.warn('旧风味编码后台迁移失败', error));
    await migrateLegacyBrewHistory().catch(error => console.warn('冲煮历史后台迁移失败', error));
    await cleanupExpiredBeanRecycle().catch(error => console.warn('回收站后台清理失败', error));
    await ensureBeanConsumptionData().catch(error => console.warn('今日咖啡摄入摘要后台加载失败', error));
    if (state.page === 'beans' && state.data.inventoryReady) renderBeans();
  });`,
'idle bean digest');

fs.writeFileSync(appPath, app);

const testPath = 'tests/v124p-recognition-preflight-regression.spec.mjs';
let test = fs.readFileSync(testPath, 'utf8');
test = replaceOnce(test,
`  await openApp(page, 'v124p-preflight-pending=1');
  await page.evaluate(() => globalThis.LuckyBeanPackageCapture.open());`,
`  await openApp(page, 'v124p-preflight-pending=1');
  await page.waitForFunction(() => typeof globalThis.LuckyBeanPackageCapture?.open === 'function', null, { timeout:15000 });
  await page.evaluate(() => globalThis.LuckyBeanPackageCapture.open());`,
'package capture readiness');
fs.writeFileSync(testPath, test);
