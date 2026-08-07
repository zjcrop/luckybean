import { readFile, writeFile } from 'node:fs/promises';

async function patchApp() {
  const path = 'src/app.js';
  let source = await readFile(path, 'utf8');
  const marker = "import { createLocalReferenceAnalysis } from './services/local-reference-analysis.js';\n";
  const imports = "import { adaptAuthoritativePlan } from './services/brew-analysis-service.js';\nimport './renderers/brew-spatial-controller.js';\n";
  if (!source.includes("./renderers/brew-spatial-controller.js")) {
    if (!source.includes(marker)) throw new Error('formal service import marker not found');
    source = source.replace(marker, marker + imports);
  }

  const legacyLoad = `function loadBrewSession(sessionId) {
  const session = state.brewSessions.find(item => item.id === sessionId); if (!session) return toast('冲煮记录不存在');
  closeOverlay(); state.selectedBeanId = session.beanId; state.currentPlan = structuredClone(session); state.currentBrewInput = structuredClone(session.input || null);
  switchPage('brew'); requestAnimationFrame(() => $('#generatedPlan')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); toast(session.correction ? '已载入修正方案' : '已载入历史方案');
}`;
  const formalLoad = `function loadBrewSession(sessionId) {
  const session = state.brewSessions.find(item => item.id === sessionId); if (!session) return toast('冲煮记录不存在');
  let plan;
  if (session.analysisSnapshot?.contract === 'brew-analysis/2.0') {
    plan = adaptAuthoritativePlan(session.analysisSnapshot);
    plan.id = session.id;
    plan.beanId = session.beanId;
    plan.historyRecordId = session.id;
  } else {
    plan = structuredClone(session);
  }
  closeOverlay(); state.selectedBeanId = session.beanId; state.currentPlan = plan; state.currentBrewInput = structuredClone(session.normalizedInput || session.input || null);
  switchPage('brew');
  document.dispatchEvent(new CustomEvent('luckybean:history-plan-loaded', { detail: { plan, record: session } }));
  requestAnimationFrame(() => $('#generatedPlan')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  toast(session.correction ? '已载入修正方案' : '已载入历史方案');
}`;
  if (source.includes(legacyLoad)) source = source.replace(legacyLoad, formalLoad);
  else if (!source.includes("luckybean:history-plan-loaded")) throw new Error('history load block not found');
  await writeFile(path, source);
}

async function patchStyles() {
  const path = 'styles.css';
  let source = await readFile(path, 'utf8');
  const statement = "@import url('./src/renderers/brew-spatial-view.css');\n";
  if (!source.startsWith(statement)) source = statement + source;
  await writeFile(path, source);
}

async function patchCompatibility() {
  const path = 'src/features/compatibility-bundle.js';
  let source = await readFile(path, 'utf8');
  source = source.replace("  '../v099-trajectory-signal-bridge.js?v=1.1.0-test',\n", '');
  source = source.replace("  '../v099i-trajectory-space.js?v=1.1.0-test',\n", '');
  if (source.includes('v099-trajectory-signal-bridge') || source.includes('v099i-trajectory-space')) throw new Error('legacy trajectory modules remain in compatibility bundle');
  await writeFile(path, source);
}

async function patchServiceWorker() {
  const path = 'sw.js';
  let source = await readFile(path, 'utf8');
  const marker = "  './src/services/cloud-sync-service.js?v=1.1.0-test',\n";
  const entries = [
    "  './src/services/brew-analysis-service.js?v=1.1.0-test',",
    "  './src/services/local-reference-analysis.js?v=1.1.0-test',",
    "  './src/domain/history/history-service.js?v=1.1.0-test',",
    "  './src/renderers/brew-spatial-view.js?v=1.1.0-test',",
    "  './src/renderers/brew-spatial-controller.js?v=1.1.0-test',",
    "  './src/renderers/brew-spatial-view.css?v=1.1.0-test',"
  ].join('\n') + '\n';
  if (!source.includes("brew-spatial-view.js?v=1.1.0-test")) {
    if (!source.includes(marker)) throw new Error('service worker insertion marker not found');
    source = source.replace(marker, marker + entries);
  }
  source = source.replace("  './src/v099-trajectory-signal-bridge.js?v=1.1.0-test',\n", '');
  source = source.replace("  './src/v099i-trajectory-space.js?v=1.1.0-test',\n", '');
  await writeFile(path, source);
}

await patchApp();
await patchStyles();
await patchCompatibility();
await patchServiceWorker();
console.log('Formal BrewProfiles spatial renderer integrated and legacy trajectory modules retired.');
