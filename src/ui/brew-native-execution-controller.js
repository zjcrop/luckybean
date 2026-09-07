export const BREW_NATIVE_EXECUTION_REVISION = 'p2-native-brew-execution/1.0';

let latestPlan = null;
let latestPreparationSpeech = '';
let latestPayload = '';
let timerWasActive = false;
let syncFrame = 0;

function nativeBridge() {
  return globalThis.__LUCKYBEAN_ANDROID__ ? globalThis.LuckyBeanNative : null;
}

function stageSpeech(stage = {}) {
  const parts = [String(stage.name || '').trim()];
  if (Number.isFinite(Number(stage.stageWaterG))) parts.push(`注水${Math.round(Number(stage.stageWaterG))}克`);
  if (Number.isFinite(Number(stage.temperatureC))) parts.push(`水温${Math.round(Number(stage.temperatureC))}度`);
  const method = String(stage.method || '').trim();
  if (method) parts.push(method);
  return parts.filter(Boolean).join('，');
}

function prefixDurationSec(stages = [], stageIndex = 0) {
  return stages.slice(0, Math.max(0, stageIndex)).reduce((sum, stage) => sum + Math.max(0, Number(stage.durationSec || 0)), 0);
}

export function buildNativeBrewExecutionPayload(plan = {}, { stageIndex = 0 } = {}) {
  const stages = Array.isArray(plan?.stages) ? plan.stages : [];
  const startIndex = Math.min(Math.max(0, Number(stageIndex) || 0), Math.max(0, stages.length - 1));
  const baseSec = prefixDurationSec(stages, startIndex);
  let elapsedMs = 0;
  const stageRows = stages.slice(startIndex).map((stage, offset) => {
    const durationMs = Math.max(1000, Math.round(Math.max(0, Number(stage.durationSec || 0)) * 1000));
    const row = {
      index: startIndex + offset,
      startMs: elapsedMs,
      endMs: elapsedMs + durationMs,
      name: String(stage.name || ''),
      waterG: Number(stage.stageWaterG || 0),
      temperatureC: Number(stage.temperatureC || 0)
    };
    elapsedMs += durationMs;
    return row;
  });

  const events = stageRows.map((row, offset) => ({
    id: `stage-${row.index}`,
    atMs: row.startMs,
    validWindowMs: 5000,
    text: stageSpeech(stages[startIndex + offset])
  }));

  for (const action of Array.isArray(plan?.executionActions) ? plan.executionActions : []) {
    if (action?.phase !== 'timed' || action?.type === 'hot-pour' || !Number.isFinite(Number(action?.atSec))) continue;
    const rebasedSec = Number(action.atSec) - baseSec;
    if (rebasedSec < 0) continue;
    const text = String(action.speech || '').trim();
    if (!text) continue;
    events.push({
      id: `action-${String(action.id || action.type || events.length)}`,
      atMs: Math.round(rebasedSec * 1000),
      validWindowMs: 5000,
      text
    });
  }

  events.sort((a, b) => a.atMs - b.atMs || a.id.localeCompare(b.id));
  return JSON.stringify({
    contract: 'luckybean-native-brew-execution/1.0',
    planFingerprint: String(plan?.contracts?.brewResult?.metadata?.analysisFingerprint || plan?.analysisFingerprint || plan?.generatedAt || ''),
    stages: stageRows,
    speech: { totalMs: elapsedMs, events }
  });
}

function callNative(method, ...args) {
  const bridge = nativeBridge();
  if (typeof bridge?.[method] !== 'function') return false;
  try {
    bridge[method](...args);
    return true;
  } catch (error) {
    console.warn(`Android 冲煮原生接口 ${method} 调用失败`, error);
    return false;
  }
}

function currentTimerStageIndex() {
  const text = document.querySelector('#timerStageCounter')?.textContent || '';
  const match = String(text).match(/^(\d+)\s*\//);
  return match ? Math.max(0, Number(match[1]) - 1) : 0;
}

function prepareNative(plan, speech) {
  if (!nativeBridge() || !plan) return;
  latestPlan = plan;
  latestPreparationSpeech = String(speech || '');
  latestPayload = buildNativeBrewExecutionPayload(plan);
  callNative('prepareBrewExecution', latestPayload);
  if (latestPreparationSpeech) callNative('announceBrewPreparation', latestPreparationSpeech);
}

function startNativeFromStage(stageIndex = 0) {
  if (!nativeBridge() || !latestPlan) return;
  latestPayload = buildNativeBrewExecutionPayload(latestPlan, { stageIndex });
  callNative('prepareBrewExecution', latestPayload);
  callNative('startBrewExecution', latestPayload);
}

function timerActive() {
  return Boolean(document.querySelector('#overlayRoot [data-overlay="timer"]'));
}

function preparationActive() {
  return Boolean(document.querySelector('#overlayRoot [data-overlay="brew-prepare"]'));
}

function syncOverlayState() {
  const active = timerActive();
  if (active && !timerWasActive) startNativeFromStage(currentTimerStageIndex());
  if (!active && timerWasActive) callNative('cancelBrewExecution');
  if (!active && !preparationActive() && timerWasActive === false && latestPlan && !latestPayload) callNative('cancelBrewExecution');
  timerWasActive = active;
}

function scheduleOverlaySync() {
  if (syncFrame) return;
  syncFrame = requestAnimationFrame(() => {
    syncFrame = 0;
    syncOverlayState();
  });
}

document.addEventListener('luckybean:brew-preparation', event => {
  prepareNative(event.detail?.plan, event.detail?.speech);
});

document.addEventListener('click', event => {
  if (!nativeBridge()) return;
  if (event.target.closest?.('#timerPauseBtn')) {
    requestAnimationFrame(() => {
      const paused = document.querySelector('#timerPauseBtn')?.textContent?.trim() === '续';
      callNative(paused ? 'pauseBrewExecution' : 'resumeBrewExecution');
    });
    return;
  }
  if (event.target.closest?.('#timerPrevBtn,#timerNextBtn')) {
    requestAnimationFrame(() => startNativeFromStage(currentTimerStageIndex()));
    return;
  }
  if (event.target.closest?.('#timerEndBtn,#cancelPreparationBtn')) {
    callNative('cancelBrewExecution');
  }
}, false);

const overlayRoot = document.querySelector('#overlayRoot');
const observer = new MutationObserver(scheduleOverlaySync);
if (overlayRoot) observer.observe(overlayRoot, { childList: true, subtree: true });

scheduleOverlaySync();

globalThis.LuckyBeanNativeBrewExecution = Object.freeze({
  revision: BREW_NATIVE_EXECUTION_REVISION,
  buildPayload: buildNativeBrewExecutionPayload,
  startFromStage: startNativeFromStage,
  active: timerActive
});
