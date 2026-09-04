const VERSION = '0.4.2';
const DEFAULT_RUNTIME_BASE = new URL('../public/vendor/paddleocr/', import.meta.url);
const ENGINE = `PP-OCRv5-browser-${VERSION}-self-hosted`;
const LOW_MEMORY = Number(navigator.deviceMemory || 4) <= 4 || /iPhone|iPad|iPod/i.test(navigator.userAgent);
const LIMIT_SIDE = LOW_MEMORY ? 736 : 960;
const ENGINE_INIT_TIMEOUT_MS = 75000;
const PREDICT_TIMEOUT_MS = 45000;

let modulePromise = null;
let enginePromise = null;
let engineGeneration = 0;
let busy = false;
let disposeTimer = 0;

function runtimeBase() {
  const configured = String(globalThis.CoffeeFoundationOcrAssetBase || '').trim();
  if (!configured) return DEFAULT_RUNTIME_BASE;
  try {
    return new URL(configured, globalThis.location?.href || import.meta.url);
  } catch {
    return DEFAULT_RUNTIME_BASE;
  }
}

function assetUrl(relativePath) {
  return new URL(relativePath, runtimeBase()).href;
}

function emit(status, progress = 0) {
  globalThis.dispatchEvent(new CustomEvent('luckybean:ocr-progress', {
    detail: {
      status: String(status || ''),
      progress: Math.max(0, Math.min(100, Number(progress) || 0))
    }
  }));
  globalThis.dispatchEvent(new CustomEvent('coffee-foundation:ocr-progress', {
    detail: {
      status: String(status || ''),
      progress: Math.max(0, Math.min(100, Number(progress) || 0))
    }
  }));
}

function timeoutError(message) {
  const error = new Error(message);
  error.name = 'RecognitionTimeoutError';
  return error;
}

function withTimeout(promise, timeoutMs, message, onTimeout) {
  let timer = 0;
  const timeout = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => {
      try { onTimeout?.(); } catch { /* timeout cleanup is best-effort */ }
      reject(timeoutError(message));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => globalThis.clearTimeout(timer));
}

async function loadModule() {
  if (!modulePromise) {
    emit('正在加载本地 PP-OCRv5 网页运行时', 2);
    modulePromise = import(assetUrl('sdk.mjs')).catch(error => {
      modulePromise = null;
      throw new Error(`本地 PP-OCRv5 SDK 加载失败：${error.message}`);
    });
  }
  return modulePromise;
}

function createModuleWorker() {
  try {
    return new Worker(assetUrl('worker.js'), { type: 'module', name: 'luckybean-ppocr-v5' });
  } catch (error) {
    throw new Error(`本地 PP-OCRv5 Worker 创建失败：${error.message}`);
  }
}

async function createWorkerEngine() {
  const module = await loadModule();
  if (!module?.PaddleOCR?.create) throw new Error('PP-OCRv5 SDK 接口不可用');
  return module.PaddleOCR.create({
    lang: 'ch',
    ocrVersion: 'PP-OCRv5',
    textDetectionModelName: 'PP-OCRv5_mobile_det',
    textDetectionModelAsset: { url: assetUrl('models/PP-OCRv5_mobile_det_onnx_infer.tar') },
    textRecognitionModelName: 'PP-OCRv5_mobile_rec',
    textRecognitionModelAsset: { url: assetUrl('models/PP-OCRv5_mobile_rec_onnx_infer.tar') },
    worker: { createWorker: () => createModuleWorker() },
    textDetectionBatchSize: 1,
    textRecognitionBatchSize: 1,
    ortOptions: {
      backend: 'wasm',
      wasmPaths: assetUrl('ort/'),
      numThreads: 1,
      simd: true
    }
  });
}

function disposeInstance(ocr) {
  if (!ocr?.dispose) return;
  Promise.resolve().then(() => ocr.dispose()).catch(() => {});
}

function detachEngine() {
  const current = enginePromise;
  enginePromise = null;
  engineGeneration += 1;
  if (current) current.then(disposeInstance).catch(() => {});
}

async function startWorkerEngine() {
  const generation = ++engineGeneration;
  const raw = createWorkerEngine();
  try {
    const ocr = await withTimeout(
      raw,
      ENGINE_INIT_TIMEOUT_MS,
      'PP-OCRv5 Worker 初始化超时，已退出本次识别；界面仍可继续操作',
      () => {
        if (generation === engineGeneration) engineGeneration += 1;
      }
    );
    if (generation !== engineGeneration) {
      disposeInstance(ocr);
      throw new Error('PP-OCRv5 Worker 初始化结果已失效，请重新识别');
    }
    return ocr;
  } catch (error) {
    raw.then(ocr => {
      if (generation !== engineGeneration) disposeInstance(ocr);
    }).catch(() => {});
    throw error;
  }
}

async function ensureEngine() {
  globalThis.clearTimeout(disposeTimer);
  if (enginePromise) return enginePromise;
  emit('正在后台准备本地 PP-OCRv5 中文检测与识别模型', 7);
  const pending = startWorkerEngine();
  const tracked = pending.then(ocr => {
    emit('PP-OCRv5 Worker 中文模型已就绪', 18);
    return ocr;
  }).catch(error => {
    if (enginePromise === tracked) enginePromise = null;
    throw new Error(`PP-OCRv5 Worker 初始化失败：${error.message}`);
  });
  enginePromise = tracked;
  return tracked;
}

async function dispose() {
  globalThis.clearTimeout(disposeTimer);
  const current = enginePromise;
  enginePromise = null;
  engineGeneration += 1;
  if (!current) return;
  try {
    const ocr = await current;
    await ocr?.dispose?.();
  } catch { /* failed initialization has nothing reliable to dispose */ }
}

function scheduleDispose() {
  globalThis.clearTimeout(disposeTimer);
  disposeTimer = globalThis.setTimeout(() => { void dispose(); }, LOW_MEMORY ? 30000 : 120000);
}

function meaningful(text) {
  const chars = [...String(text || '')];
  if (!chars.length) return 0;
  return chars.filter(char => /[\p{Script=Han}A-Za-z0-9年月日海拔处理烘焙庄园产区豆种%°./:+-]/u.test(char)).length / chars.length;
}

function normalizeItems(result, imageId) {
  return (result?.items || [])
    .map(item => ({
      text: String(item?.text || '').trim(),
      confidence: Number(item?.score ?? 0),
      polygon: item?.poly || null,
      imageId,
      engine: ENGINE
    }))
    .filter(item => item.text && item.confidence >= 0.28 && meaningful(item.text) >= 0.55)
    .sort((a, b) => {
      const ay = Number(a.polygon?.[0]?.[1] || 0);
      const by = Number(b.polygon?.[0]?.[1] || 0);
      return ay - by || Number(a.polygon?.[0]?.[0] || 0) - Number(b.polygon?.[0]?.[0] || 0);
    });
}

async function predict(images) {
  const ocr = await ensureEngine();
  const blocks = [];
  const groups = [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    emit(`PP-OCRv5 Worker 正在识别第 ${index + 1}/${images.length} 张图片`, 20 + Math.round(index / Math.max(1, images.length) * 70));
    const prediction = ocr.predict(image.blob, {
      textDetLimitSideLen: LIMIT_SIDE,
      textDetLimitType: 'min',
      textDetMaxSideLimit: 2200,
      textDetThresh: 0.22,
      textDetBoxThresh: 0.35,
      textDetUnclipRatio: 1.55,
      textRecScoreThresh: 0.28
    });
    const results = await withTimeout(
      prediction,
      PREDICT_TIMEOUT_MS,
      `PP-OCRv5 第 ${index + 1} 张图片识别超时，已退出本次任务`,
      detachEngine
    );
    const result = results?.[0];
    const current = normalizeItems(result, image.id);
    blocks.push(...current);
    if (current.length) groups.push(current.map(item => item.text).join('\n'));
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
  }
  if (!blocks.length) throw new Error('PP-OCRv5 没有得到可信文字。请靠近文字区域拍摄，避免整只包装占画面过小。');
  emit('PP-OCRv5 中英文识别完成', 100);
  scheduleDispose();
  return {
    engine: `${ENGINE}${LOW_MEMORY ? '-low-memory-worker' : '-worker'}`,
    blocks,
    fullText: groups.join('\n\n')
  };
}

async function run(task) {
  if (busy) throw new Error('识别任务正在运行，请勿重复点击');
  busy = true;
  try {
    return await task();
  } catch (error) {
    detachEngine();
    emit(`识别失败：${error.message}`, 0);
    throw new Error(`${error.message}；已停止当前任务，不会切换到主线程 OCR 或 Tesseract 重处理。`);
  } finally {
    busy = false;
    if (enginePromise) scheduleDispose();
  }
}

async function preload() {
  if (globalThis.__LUCKYBEAN_ANDROID__) return null;
  try {
    const ocr = await ensureEngine();
    emit('PP-OCRv5 Worker 已在后台预热', 18);
    scheduleDispose();
    return ocr;
  } catch (error) {
    emit(`PP-OCRv5 后台预热未完成：${error.message}`, 0);
    return null;
  }
}

function schedulePreload() {
  if (globalThis.__LUCKYBEAN_ANDROID__) return;
  const start = () => { void preload(); };
  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(start, { timeout: 4000 });
  } else {
    globalThis.setTimeout(start, 1200);
  }
}

const paddleOcrApi = Object.freeze({
  version: VERSION,
  engine: ENGINE,
  lowMemory: LOW_MEMORY,
  workerOnly: true,
  runtimeOrigin: 'same-origin-vendored',
  workerBootstrap: 'same-origin-vendored-module',
  runtimeBase() {
    return runtimeBase().href;
  },
  recognizeCoffeeBag(images) {
    return run(() => predict(images));
  },
  async recognize(blob) {
    const result = await run(() => predict([{ id: 'single', blob }]));
    return { blocks: result.blocks };
  },
  preload,
  dispose
});

globalThis.LuckyBeanPaddleOCR = paddleOcrApi;
globalThis.CoffeeFoundationPaddleOCR = paddleOcrApi;

document.addEventListener('visibilitychange', () => {
  if (document.hidden && LOW_MEMORY && !busy) void dispose();
});
globalThis.addEventListener('pagehide', () => {
  if (!busy) void dispose();
});
document.documentElement.dataset.webOcr = `ppocr-v5-${VERSION}-self-hosted-worker-only`;
schedulePreload();
