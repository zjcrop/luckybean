import { readFile, writeFile } from 'node:fs/promises';

async function patchApp() {
  const path = 'src/app.js';
  let source = await readFile(path, 'utf8');
  source = source.replace(
    "import { loadCodebook, checkCodebookUpdate, makeIndex, displayName, optionsHtml, relatedRows, parseNaturalLanguage, REMOTE_CODEBOOK_URL } from './codebook.js';",
    "import { loadCodebook, makeIndex, displayName, optionsHtml, relatedRows, parseNaturalLanguage, REMOTE_CODEBOOK_URL } from './codebook.js';"
  );
  const marker = "import './services/provider-bootstrap-controller.js';\n";
  const statusImport = "import { renderProviderStatusPanel } from './ui/provider-status-panel.js';\n";
  if (!source.includes(statusImport)) {
    if (!source.includes(marker)) throw new Error('provider bootstrap import marker missing');
    source = source.replace(marker, marker + statusImport);
  }
  source = source.replace(
    '<div class="setting-row"><div><h3>数据源</h3><p>仅在需要时检查更新。</p></div><button id="updateCodebookBtn" class="button" type="button">检查更新</button></div>',
    '<div class="setting-row"><div><h3>数据源</h3><p>后台校验并原子更新，失败时保留最后有效版本。</p></div><button id="updateCodebookBtn" class="button" type="button">更新全部数据源</button></div><div id="providerStatusPanel"></div>'
  );
  const afterSettingsHtml = "  $$('.settings-category').forEach(section=>section.addEventListener('toggle',()=>{if(!section.open)return;$$('.settings-category').forEach(other=>{if(other!==section)other.open=false;});}));";
  if (!source.includes("renderProviderStatusPanel($('#providerStatusPanel'))")) {
    if (!source.includes(afterSettingsHtml)) throw new Error('settings binding marker missing');
    source = source.replace(afterSettingsHtml, `  renderProviderStatusPanel($('#providerStatusPanel')).catch(error => console.warn('数据源状态读取失败', error));\n${afterSettingsHtml}`);
  }
  const functionStart = source.indexOf('async function updateCodebook() {');
  const functionEnd = source.indexOf('\nasync function exportData()', functionStart);
  if (functionStart < 0 || functionEnd < 0) throw new Error('legacy updateCodebook function not found');
  const replacement = `async function updateCodebook() {
  const button=$('#updateCodebookBtn'); button.disabled=true; button.textContent='校验更新中…';
  try {
    const result = await globalThis.LuckyBeanProviders.refresh({ force: true });
    await renderProviderStatusPanel($('#providerStatusPanel'));
    const changed = Object.values(result.results || {}).filter(item => item?.updated).length;
    button.disabled=false; button.textContent='更新全部数据源';
    toast(changed ? ('已更新' + changed + '个数据源') : '全部数据源已是最新', 'status-good');
  } catch(error) {
    button.disabled=false; button.textContent='更新全部数据源';
    toast('更新失败，继续使用最后有效版本：' + error.message, 'status-bad');
  }
}`;
  source = source.slice(0, functionStart) + replacement + source.slice(functionEnd);
  if (source.includes('checkCodebookUpdate')) throw new Error('legacy direct codebook update remains');
  await writeFile(path, source);
}

async function patchStyles() {
  const path = 'styles.css';
  let source = await readFile(path, 'utf8');
  const css = `\n.provider-status-list{display:grid;gap:9px;margin:12px 0 18px}.provider-status-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.07)}.provider-status-row>div{display:grid;gap:2px}.provider-status-row strong{font-weight:540}.provider-status-row small{color:var(--muted)}.provider-status-state{color:var(--ok);font-size:12px;text-align:right}.provider-status-state.pending{color:var(--warn)}\n`;
  if (!source.includes('.provider-status-list{')) source += css;
  await writeFile(path, source);
}

async function patchServiceWorker() {
  const path = 'sw.js';
  let source = await readFile(path, 'utf8');
  const marker = "  './src/services/provider-bootstrap-controller.js?v=1.1.0-test',\n";
  const line = "  './src/ui/provider-status-panel.js?v=1.1.0-test',\n";
  if (!source.includes(line)) {
    if (!source.includes(marker)) throw new Error('provider SW marker missing');
    source = source.replace(marker, marker + line);
  }
  await writeFile(path, source);
}

await patchApp(); await patchStyles(); await patchServiceWorker();
console.log('Provider status and unified manual update integrated into settings.');
