const $ = selector => document.querySelector(selector);

let currentPlan = null;
let browserSpeechRun = null;

function stagesOf(plan) {
  let cursor = 0;
  return (Array.isArray(plan?.stages) ? plan.stages : []).map((stage, index) => {
    let start = Number(stage.startSec ?? stage.start);
    let end = Number(stage.end);
    if (!Number.isFinite(start)) start = cursor;
    let duration = Number(stage.durationSec);
    if (!Number.isFinite(duration) || duration <= 0) duration = Number.isFinite(end) && end > start ? end - start : 0.1;
    if (!Number.isFinite(end) || end <= start) end = start + duration;
    cursor = end;
    return {
      index,
      startMs: Math.round(start * 1000),
      endMs: Math.round(end * 1000),
      name: String(stage.name || `第${index + 1}段`),
      waterG: Number(stage.stageWaterG ?? stage.pour ?? 0),
      cumulativeWaterG: Number(stage.cumulativeWaterG ?? stage.cumulative ?? 0),
      temperatureC: Number(stage.temperatureC ?? stage.pourTemperature ?? 90),
      method: String(stage.method || '')
    };
  });
}

function speechTimeline(plan) {
  const stages = stagesOf(plan);
  const events = [];
  stages.forEach((stage, index) => {
    if (index > 0) {
      events.push({
        id: `stage-${index + 1}-prepare`,
        atMs: Math.max(0, stage.startMs - 8000),
        text: `准备第${index + 1}段，注水${Math.round(stage.waterG)}克，水温${Math.round(stage.temperatureC)}度`,
        validWindowMs: 3000
      });
      events.push({
        id: `stage-${index + 1}-countdown`,
        atMs: Math.max(0, stage.startMs - 3200),
        text: '三，二，一',
        validWindowMs: 1200
      });
    }
    events.push({
      id: `stage-${index + 1}-start`,
      atMs: stage.startMs,
      text: `第${index + 1}段，${stage.name}，注水${Math.round(stage.waterG)}克，累计${Math.round(stage.cumulativeWaterG)}克，水温${Math.round(stage.temperatureC)}度`,
      validWindowMs: 4500
    });
  });
  const totalMs = stages.at(-1)?.endMs || 0;
  events.push({ id: 'brew-complete', atMs: totalMs, text: '冲煮完成', validWindowMs: 5000 });
  return { events, totalMs };
}

function speakBrowser(text) {
  if (globalThis.__LUCKYBEAN_ANDROID__ || !globalThis.speechSynthesis || !text) return;
  try {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.05;
    speechSynthesis.speak(utterance);
  } catch { /* speech is optional; timer remains authoritative */ }
}

function stopBrowserSpeechRun() {
  if (!browserSpeechRun) return;
  clearTimeout(browserSpeechRun.timer);
  browserSpeechRun = null;
  if (!globalThis.__LUCKYBEAN_ANDROID__) {
    try { globalThis.speechSynthesis?.cancel?.(); } catch {}
  }
}

function browserElapsed(run) {
  const now = run.paused ? run.pauseStarted : performance.now();
  return Math.max(0, now - run.startedAt - run.pausedTotalMs);
}

function tickBrowserSpeech() {
  const run = browserSpeechRun;
  if (!run || run.paused) return;
  const elapsed = browserElapsed(run);
  for (const event of run.events) {
    if (run.fired.has(event.id) || elapsed < event.atMs) continue;
    run.fired.add(event.id);
    if (elapsed - event.atMs <= event.validWindowMs) speakBrowser(event.text);
  }
  if (elapsed >= run.totalMs + 5500) {
    stopBrowserSpeechRun();
    return;
  }
  run.timer = setTimeout(tickBrowserSpeech, 100);
}

function startBrowserSpeech(plan) {
  if (globalThis.__LUCKYBEAN_ANDROID__ || !plan) return;
  stopBrowserSpeechRun();
  const timeline = speechTimeline(plan);
  browserSpeechRun = {
    ...timeline,
    fired: new Set(),
    startedAt: performance.now(),
    pausedTotalMs: 0,
    pauseStarted: 0,
    paused: false,
    timer: null
  };
  tickBrowserSpeech();
}

function pauseBrowserSpeech() {
  if (!browserSpeechRun || browserSpeechRun.paused) return;
  browserSpeechRun.paused = true;
  browserSpeechRun.pauseStarted = performance.now();
  clearTimeout(browserSpeechRun.timer);
  try { globalThis.speechSynthesis?.cancel?.(); } catch {}
}

function resumeBrowserSpeech() {
  if (!browserSpeechRun || !browserSpeechRun.paused) return;
  browserSpeechRun.pausedTotalMs += performance.now() - browserSpeechRun.pauseStarted;
  browserSpeechRun.pauseStarted = 0;
  browserSpeechRun.paused = false;
  tickBrowserSpeech();
}

function suppressLegacyTimerForThisStartClick() {
  const nativeSetInterval = globalThis.setInterval;
  const captured = [];
  globalThis.setInterval = function guardedSetInterval(callback, delay, ...args) {
    const id = nativeSetInterval(callback, delay, ...args);
    if (Number(delay) === 1000) captured.push(id);
    return id;
  };
  queueMicrotask(() => {
    globalThis.setInterval = nativeSetInterval;
    captured.forEach(id => clearInterval(id));
  });
}

document.addEventListener('luckybean:plan-ready', event => {
  currentPlan = event.detail?.plan || null;
});

document.addEventListener('click', event => {
  if (event.target.closest('#startBrewBtn') && currentPlan) {
    suppressLegacyTimerForThisStartClick();
    queueMicrotask(() => startBrowserSpeech(currentPlan));
    return;
  }
  if (event.target.closest('#timerPauseBtn') && browserSpeechRun) {
    if (browserSpeechRun.paused) resumeBrowserSpeech();
    else pauseBrowserSpeech();
    return;
  }
  if (event.target.closest('#timerEndBtn')) {
    stopBrowserSpeechRun();
  }
}, true);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && browserSpeechRun && !browserSpeechRun.paused) tickBrowserSpeech();
});

window.addEventListener('pagehide', stopBrowserSpeechRun);
