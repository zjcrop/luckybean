import { readFile, writeFile } from 'node:fs/promises';

function scopeObservers(source, selectors, label) {
  let index = 0;
  const pattern = /new MutationObserver\(([\s\S]*?)\)\.observe\(document\.documentElement,\s*(\{[\s\S]*?\})\);/g;
  return source.replace(pattern, (_, callback, options) => {
    index += 1;
    const variable = `${label}Observer${index}`;
    return `{\n  const ${variable} = new MutationObserver(${callback});\n  ${JSON.stringify(selectors)}.forEach(selector => {\n    const root = document.querySelector(selector);\n    if (root) ${variable}.observe(root, ${options});\n  });\n}`;
  });
}

async function patchApp() {
  const path = 'src/app.js';
  let source = await readFile(path, 'utf8');
  if (!source.includes("luckybean:request-app-refresh")) {
    const marker = 'async function refreshData() {\n';
    const listener = `document.addEventListener('luckybean:request-app-refresh', async event => {
  await refreshData();
  if (state.page === 'beans') renderBeans();
  else if (state.page === 'brew') renderBrew();
  else if (state.page === 'sensory') renderSensory();
  else if (state.page === 'settings') renderSettings();
  document.dispatchEvent(new CustomEvent('luckybean:app-refreshed', { detail: event.detail || {} }));
});

`;
    if (!source.includes(marker)) throw new Error('app refresh marker missing');
    source = source.replace(marker, listener + marker);
  }
  const oldClear = "$('#confirmClearBtn').addEventListener('click',async()=>{if($('#clearConfirmInput').value!=='清空')return toast('请输入“清空”');await clearAll();location.reload();});";
  const newClear = "$('#confirmClearBtn').addEventListener('click',async()=>{if($('#clearConfirmInput').value!=='清空')return toast('请输入“清空”');await clearAll();state.beans=[];state.brewSessions=[];state.sensoryRecords=[];state.inventoryEvents=[];state.currentPlan=null;state.currentBrewInput=null;state.currentExecution=null;state.settings=structuredClone(DEFAULT_SETTINGS);await saveSettings();closeOverlay();await refreshData();switchPage('beans');toast('本地数据已清空','status-good');document.dispatchEvent(new CustomEvent('luckybean:local-data-cleared'));});";
  if (source.includes(oldClear)) source = source.replace(oldClear, newClear);
  if (source.includes('location.reload()')) throw new Error('app reload remains');
  await writeFile(path, source);
}

async function patchSensoryWait() {
  const path = 'src/sensory-professional-controller.js';
  let source = await readFile(path, 'utf8');
  const start = source.indexOf('function waitFor(selector, timeout = 5000) {');
  const end = source.indexOf('\nasync function codebookContext()', start);
  if (start < 0 || end < 0) throw new Error('sensory waitFor block missing');
  const replacement = `function waitFor(selector, timeout = 5000) {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const found = $(selector);
      if (found) return resolve(found);
      if (performance.now() - startedAt >= timeout) return reject(new Error(\`等待界面元素超时：\${selector}\`));
      requestAnimationFrame(check);
    };
    check();
  });
}`;
  source = source.slice(0, start) + replacement + source.slice(end);
  if (source.includes('observe(document.documentElement')) throw new Error('sensory global observer remains');
  await writeFile(path, source);
}

async function patchSettings() {
  const path = 'src/settings-screen-controller.js';
  let source = await readFile(path, 'utf8');
  const start = source.indexOf('function patchSettingsScrollIntoView() {');
  if (start >= 0) {
    const end = source.indexOf('\n  function mount(', start);
    if (end < 0) throw new Error('settings monkey patch end missing');
    source = source.slice(0, start) + source.slice(end);
  }
  source = source.replace(/\s*patchSettingsScrollIntoView\(\);?/g, '');
  source = scopeObservers(source, ['#settingsContent','#overlayRoot'], 'settings');
  if (source.includes('Element.prototype.scrollIntoView =')) throw new Error('settings native monkey patch remains');
  if (source.includes('observe(document.documentElement')) throw new Error('settings global observer remains');
  await writeFile(path, source);
}

async function patchModule(path, selectors, label) {
  let source = await readFile(path, 'utf8');
  source = scopeObservers(source, selectors, label);
  source = source.replace(/location\.reload\s*\(\s*\)\s*;?/g, "document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail: { source: '" + label + "' } }));");
  if (source.includes('observe(document.documentElement')) throw new Error(`${path} global observer remains`);
  if (source.includes('location.reload')) throw new Error(`${path} reload remains`);
  await writeFile(path, source);
}

await patchApp();
await patchSensoryWait();
await patchSettings();
await patchModule('src/integrity-ui-controller.js', ['#overlayRoot','#sensoryContent'], 'integrity');
await patchModule('src/postbrew-sensory-controller.js', ['#sensoryContent','#overlayRoot'], 'postbrew');
await patchModule('src/qr-ui-controller.js', ['#overlayRoot'], 'qrUi');
await patchModule('src/runtime-controller.js', ['#brewContent','#overlayRoot'], 'runtime');
await patchModule('src/selection-controller.js', ['#beanGroups'], 'selection');
await patchModule('src/ui-upgrade-controller.js', ['#beanGroups','#overlayRoot','#settingsContent'], 'uiUpgrade');
await patchModule('src/feature-controller.js', ['#beanGroups','#brewContent','#sensoryContent','#overlayRoot'], 'feature');

console.log('Runtime observers scoped, native monkey patch removed and reload state updates replaced.');
