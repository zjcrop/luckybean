const VERSION = '0.5.0-fastpath';
const ENGINE = `PP-OCRv5-browser-${VERSION}-self-hosted`;

function isAppleMobileLike() {
  const ua = String(globalThis.navigator?.userAgent || '');
  return /iPhone|iPad|iPod/i.test(ua)
    || (globalThis.navigator?.platform === 'MacIntel' && Number(globalThis.navigator?.maxTouchPoints || 0) > 1);
}
function isWebKitFamily() {
  const ua = String(globalThis.navigator?.userAgent || '');
  return /AppleWebKit/i.test(ua) && !/(Chrome|Chromium|CriOS|Edg|OPR|SamsungBrowser)/i.test(ua);
}

const APPLE_MOBILE = isAppleMobileLike();
const WEBKIT = isWebKitFamily();
const DEVICE_MEMORY_GB = Number(globalThis.navigator?.deviceMemory || 0);
const LOW_MEMORY = APPLE_MOBILE || (DEVICE_MEMORY_GB > 0 && DEVICE_MEMORY_GB <= 4);
const LIMIT_SIDE = LOW_MEMORY ? 736 : 960;
const MAX_SIDE = 2200;
const ENGINE_INIT_TIMEOUT_MS = WEBKIT ? 30000 : 60000;
const PREDICT_TIMEOUT_MS = WEBKIT ? 30000 : 45000;
const ROI_CROP_TIMEOUT_MS = 20000;
const OUTSIDE_SESSION_IDLE_MS = 120000;

let modulePromise = null;
let enginePromise = null;
let engineGeneration = 0;
let engineMode = WEBKIT ? 'webkit-direct-wasm-no-simd' : 'worker-simd-fastpath';
let busy = false;
let disposeTimer = 0;
let sessionDepth = 0;
let pendingEnd = false;
let roiRequestSequence = 0;
const activeWorkers = new Set();

function diagnosticNow() { return Number(globalThis.performance?.now?.() ?? Date.now()); }
function recordDiagnostic(phase, startedAt, detail = {}) {
  const sink = globalThis.__LUCKYBEAN_RECOGNITION_DIAGNOSTICS__;
  if (typeof sink?.record !== 'function') return;
  try {
    sink.record({ scope:'ocr', phase:String(phase), durationMs:Math.max(0, diagnosticNow() - Number(startedAt || 0)), ...detail });
  } catch {}
}
function emit(status, progress = 0) {
  const detail = { status:String(status || ''), progress:Math.max(0, Math.min(100, Number(progress) || 0)) };
  globalThis.dispatchEvent(new CustomEvent('luckybean:ocr-progress', { detail }));
  globalThis.dispatchEvent(new CustomEvent('coffee-foundation:ocr-progress', { detail }));
}
function timeoutError(message) { const error = new Error(message); error.name = 'RecognitionTimeoutError'; return error; }
function withTimeout(promise, timeoutMs, message, onTimeout) {
  let timer = 0;
  const timeout = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => {
      try { onTimeout?.(); } catch {}
      reject(timeoutError(message));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => globalThis.clearTimeout(timer));
}
function delay(ms) { return new Promise(resolve => globalThis.setTimeout(resolve, ms)); }
function clamp01(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}
function normalizeRegion(input) {
  const source = input && typeof input === 'object' ? input : {};
  const left = clamp01(source.left), top = clamp01(source.top), right = clamp01(source.right, 1), bottom = clamp01(source.bottom, 1);
  if (right - left < 0.01 || bottom - top < 0.01) throw new Error('ROI 范围过小或无效');
  return Object.freeze({ left, top, right, bottom });
}

function defaultRuntimeBase() { return new URL('../public/vendor/paddleocr/', import.meta.url); }
function runtimeBase() {
  const configured = String(globalThis.CoffeeFoundationOcrAssetBase || '').trim();
  if (configured) {
    try { return new URL(configured, globalThis.location?.href || 'http://localhost/'); } catch {}
  }
  return defaultRuntimeBase();
}
function assetUrl(relativePath) { return new URL(relativePath, runtimeBase()).href; }

async function cropRegionInWorker(blob, regionInput, options = {}) {
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error('ROI 原图不可用');
  const startedAt = diagnosticNow();
  const region = normalizeRegion(regionInput);
  const requestId = `roi-${Date.now().toString(36)}-${(++roiRequestSequence).toString(36)}`;
  const worker = new Worker(assetUrl('roi-worker.js'), { type:'classic', name:'luckybean-roi-crop' });
  let settled = false;
  const cleanup = () => {
    if (settled) return;
    settled = true;
    try { worker.terminate(); } catch {}
  };
  const operation = new Promise((resolve, reject) => {
    worker.onmessage = event => {
      if (String(event.data?.requestId || '') !== requestId) return;
      if (event.data?.ok !== true) { cleanup(); reject(new Error(String(event.data?.error || 'ROI Worker 裁剪失败'))); return; }
      const result = event.data; cleanup(); resolve(result);
    };
    worker.onerror = event => { cleanup(); reject(new Error(`ROI Worker 运行失败：${event.message || 'unknown error'}`)); };
    worker.postMessage({ requestId, blob, region, maxEdge:Number(options.maxEdge || MAX_SIDE) });
  });
  try { return await withTimeout(operation, ROI_CROP_TIMEOUT_MS, 'ROI Worker 裁剪超时，已终止本次局部识别', cleanup); }
  finally { recordDiagnostic('roi-crop', startedAt); }
}

async function loadModule() {
  if (!modulePromise) {
    emit('正在加载本地 PP-OCRv5 运行时', 2);
    modulePromise = import(assetUrl('sdk.mjs')).catch(error => {
      modulePromise = null;
      throw new Error(`本地 PP-OCRv5 SDK 加载失败：${error.message}`);
    });
  }
  return modulePromise;
}
function trackWorker(worker) { activeWorkers.add(worker); return worker; }
function terminateWorkers() {
  for (const worker of activeWorkers) { try { worker.terminate(); } catch {} }
  activeWorkers.clear();
}
function createModuleWorker() {
  return trackWorker(new Worker(assetUrl('worker.js'), { type:'module', name:'luckybean-ppocr-v5-fast' }));
}
function ocrCreateOptions({ compatibility = false, forceWorker = false } = {}) {
  return {
    lang:'ch',
    ocrVersion:'PP-OCRv5',
    textDetectionModelName:'PP-OCRv5_mobile_det',
    textDetectionModelAsset:{ url:assetUrl('models/PP-OCRv5_mobile_det_onnx_infer.tar') },
    textRecognitionModelName:'PP-OCRv5_mobile_rec',
    textRecognitionModelAsset:{ url:assetUrl('models/PP-OCRv5_mobile_rec_onnx_infer.tar') },
    ...((forceWorker || !compatibility) ? { worker:{ createWorker:createModuleWorker } } : {}),
    textDetectionBatchSize:1,
    textRecognitionBatchSize:1,
    ortOptions:{ backend:'wasm', wasmPaths:assetUrl('ort/'), numThreads:1, simd:!compatibility }
  };
}
async function createWorkerEngine({ compatibility = false } = {}) {
  const module = await loadModule();
  if (!module?.PaddleOCR?.create) throw new Error('PP-OCRv5 SDK 接口不可用');
  return module.PaddleOCR.create(ocrCreateOptions({ compatibility, forceWorker:true }));
}
async function createWebKitEngine() {
  const module = await loadModule();
  if (!module?.PaddleOCR?.create) throw new Error('PP-OCRv5 SDK 接口不可用');
  return module.PaddleOCR.create(ocrCreateOptions({ compatibility:true, forceWorker:false }));
}
function looksLikeCompatibilityFailure(error) {
  return /Unknown worker error|Failed to construct.*Worker|SecurityError|WebAssembly|WASM|out of memory|could not allocate memory|InferenceSession|ONNX session|No available adapters/iu.test(String(error?.message || error || ''));
}
function disposeInstance(ocr) { if (ocr?.dispose) Promise.resolve(ocr.dispose()).catch(() => {}); }
function detachEngine() {
  const current = enginePromise;
  enginePromise = null;
  engineGeneration += 1;
  terminateWorkers();
  if (current) current.then(disposeInstance).catch(() => {});
}
async function startEngine() {
  const generation = ++engineGeneration;
  const startedAt = diagnosticNow();
  if (WEBKIT) {
    engineMode = 'webkit-direct-wasm-no-simd';
    const raw = createWebKitEngine();
    try {
      const ocr = await withTimeout(raw, ENGINE_INIT_TIMEOUT_MS, 'PP-OCRv5 Safari 初始化超时', () => {});
      if (generation !== engineGeneration) { disposeInstance(ocr); throw new Error('PP-OCRv5 初始化结果已失效'); }
      recordDiagnostic('runtime-init', startedAt, { mode:engineMode, sessionDepth, lowMemory:LOW_MEMORY });
      return ocr;
    } catch (error) {
      raw.then(disposeInstance).catch(() => {});
      throw error;
    }
  }

  engineMode = 'worker-simd-fastpath';
  let raw = createWorkerEngine({ compatibility:false });
  try {
    const ocr = await withTimeout(raw, ENGINE_INIT_TIMEOUT_MS, 'PP-OCRv5 Worker 初始化超时', terminateWorkers);
    if (generation !== engineGeneration) { disposeInstance(ocr); throw new Error('PP-OCRv5 初始化结果已失效'); }
    recordDiagnostic('runtime-init', startedAt, { mode:engineMode, sessionDepth, lowMemory:LOW_MEMORY });
    return ocr;
  } catch (error) {
    raw.then(disposeInstance).catch(() => {});
    terminateWorkers();
    if (!looksLikeCompatibilityFailure(error) || generation !== engineGeneration) throw error;
    engineMode = 'worker-no-simd-fallback';
    emit('PP-OCRv5 SIMD Worker 不可用，正在使用同一模型的无 SIMD Worker 兜底', 10);
    await delay(80);
    raw = createWorkerEngine({ compatibility:true });
    try {
      const ocr = await withTimeout(raw, ENGINE_INIT_TIMEOUT_MS, 'PP-OCRv5 无 SIMD Worker 初始化超时', terminateWorkers);
      if (generation !== engineGeneration) { disposeInstance(ocr); throw new Error('PP-OCRv5 兼容初始化结果已失效'); }
      recordDiagnostic('runtime-init-fallback', startedAt, { mode:engineMode, reason:String(error?.message || error) });
      return ocr;
    } catch (fallbackError) {
      raw.then(disposeInstance).catch(() => {});
      terminateWorkers();
      throw new Error(`PP-OCRv5 快路径与兼容 Worker 均失败：${fallbackError?.message || fallbackError}`);
    }
  }
}
async function ensureEngine() {
  globalThis.clearTimeout(disposeTimer);
  if (enginePromise) return enginePromise;
  emit(sessionDepth > 0 ? '正在为本次添加流程预热 PP-OCRv5' : '正在准备 PP-OCRv5', 7);
  const pending = startEngine();
  const tracked = pending.then(ocr => {
    emit('PP-OCRv5 已就绪', 18);
    return ocr;
  }).catch(error => {
    if (enginePromise === tracked) enginePromise = null;
    throw new Error(`PP-OCRv5 初始化失败：${error.message}`);
  });
  enginePromise = tracked;
  return tracked;
}
async function dispose() {
  globalThis.clearTimeout(disposeTimer);
  if (busy) { pendingEnd = true; return; }
  const current = enginePromise;
  enginePromise = null;
  engineGeneration += 1;
  terminateWorkers();
  if (!current) return;
  try { const ocr = await current; await ocr?.dispose?.(); } catch {}
  emit('PP-OCRv5 已释放', 0);
}
function scheduleOutsideSessionDispose() {
  globalThis.clearTimeout(disposeTimer);
  if (sessionDepth > 0 || busy) return;
  disposeTimer = globalThis.setTimeout(() => { void dispose(); }, OUTSIDE_SESSION_IDLE_MS);
}

function meaningful(text) {
  const chars = [...String(text || '')];
  if (!chars.length) return 0;
  return chars.filter(char => /[\p{Script=Han}A-Za-z0-9年月日海拔处理烘焙庄园产区豆种%°./:+-]/u.test(char)).length / chars.length;
}
function normalizeItems(result, imageId) {
  return (result?.items || [])
    .map(item => ({ text:String(item?.text || '').trim(), confidence:Number(item?.score ?? 0), polygon:item?.poly || null, imageId, engine:ENGINE }))
    .filter(item => item.text && item.confidence >= 0.28 && meaningful(item.text) >= 0.55)
    .sort((a,b) => Number(a.polygon?.[0]?.[1] || 0) - Number(b.polygon?.[0]?.[1] || 0) || Number(a.polygon?.[0]?.[0] || 0) - Number(b.polygon?.[0]?.[0] || 0));
}
async function predict(images) {
  const ocr = await ensureEngine();
  const blocks = [], groups = [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    emit(`PP-OCRv5 正在识别第 ${index + 1}/${images.length} 张图片`, 20 + Math.round(index / Math.max(1, images.length) * 70));
    const startedAt = diagnosticNow();
    const prediction = ocr.predict(image.blob, {
      textDetLimitSideLen:LIMIT_SIDE,
      textDetLimitType:'min',
      textDetMaxSideLimit:MAX_SIDE,
      textDetThresh:0.22,
      textDetBoxThresh:0.35,
      textDetUnclipRatio:1.55,
      textRecScoreThresh:0.28
    });
    const results = await withTimeout(prediction, PREDICT_TIMEOUT_MS, `PP-OCRv5 第 ${index + 1} 张图片识别超时`, detachEngine);
    const current = normalizeItems(results?.[0], image.id);
    recordDiagnostic('ocr-predict', startedAt, { imageIndex:index, imageCount:images.length, mode:engineMode, limitSide:LIMIT_SIDE, maxSide:MAX_SIDE });
    blocks.push(...current);
    if (current.length) groups.push(current.map(item => item.text).join('\n'));
    await delay(0);
  }
  if (!blocks.length) throw new Error('PP-OCRv5 没有得到可信文字。请靠近文字区域拍摄或先框选有效区域。');
  emit('PP-OCRv5 中英文识别完成', 100);
  return { engine:`${ENGINE}-${engineMode}`, blocks, fullText:groups.join('\n\n') };
}
async function predictRegion(blob, region, options = {}) {
  emit('正在裁剪待识别区域', 10);
  const crop = await cropRegionInWorker(blob, region, options);
  const imageId = String(options.imageId || 'roi');
  const result = await predict([{ id:imageId, blob:crop.blob }]);
  return { ...result, regionProtocol:'recognition-roi/1.0', region:crop.region, sourceWidth:Number(crop.sourceWidth || 0), sourceHeight:Number(crop.sourceHeight || 0), cropX:Number(crop.cropX || 0), cropY:Number(crop.cropY || 0), cropWidth:Number(crop.cropWidth || 0), cropHeight:Number(crop.cropHeight || 0), outputWidth:Number(crop.outputWidth || 0), outputHeight:Number(crop.outputHeight || 0) };
}
async function run(task) {
  if (busy) throw new Error('识别任务正在运行，请勿重复点击');
  busy = true;
  try { return await task(); }
  catch (error) { detachEngine(); emit(`识别失败：${error.message}`, 0); throw error; }
  finally {
    busy = false;
    if (pendingEnd && sessionDepth === 0) { pendingEnd = false; void dispose(); }
    else scheduleOutsideSessionDispose();
  }
}

async function beginSession(reason = 'add-flow') {
  sessionDepth += 1;
  globalThis.clearTimeout(disposeTimer);
  recordDiagnostic('session-begin', diagnosticNow(), { reason, sessionDepth });
  if (globalThis.__LUCKYBEAN_ANDROID__) return null;
  try { return await ensureEngine(); }
  catch (error) { emit(`PP-OCRv5 预热未完成：${error.message}`, 0); return null; }
}
async function endSession(reason = 'add-flow') {
  sessionDepth = Math.max(0, sessionDepth - 1);
  recordDiagnostic('session-end', diagnosticNow(), { reason, sessionDepth });
  if (sessionDepth === 0) {
    if (busy) pendingEnd = true;
    else await dispose();
  }
}
async function warmForRecognition() {
  if (globalThis.__LUCKYBEAN_ANDROID__) return null;
  try { const ocr = await ensureEngine(); scheduleOutsideSessionDispose(); return ocr; }
  catch (error) { emit(`PP-OCRv5 预热未完成：${error.message}`, 0); return null; }
}

const paddleOcrApi = Object.freeze({
  version:VERSION,
  engine:ENGINE,
  lowMemory:LOW_MEMORY,
  appleMobile:APPLE_MOBILE,
  browserSafe:true,
  primaryIsolation:WEBKIT ? 'webkit-direct-wasm-no-simd' : 'module-worker',
  compatibilityFallback:WEBKIT ? 'webkit-direct-wasm-no-simd' : 'module-worker-no-simd',
  autoPreload:false,
  disposePolicy:'capture-session',
  roiWorkerOnly:true,
  regionRecognition:'recognition-roi/1.0',
  runtimeOrigin:'same-origin-vendored',
  inputPolicy:`${LIMIT_SIDE}/${MAX_SIDE}`,
  get sessionDepth() { return sessionDepth; },
  runtimeBase() { return runtimeBase().href; },
  recognizeCoffeeBag(images) { return run(() => predict(images)); },
  recognizeRegion(blob, region, options = {}) { return run(() => predictRegion(blob, region, options)); },
  async recognize(blob) { const result = await run(() => predict([{ id:'single', blob }])); return { blocks:result.blocks }; },
  preload:warmForRecognition,
  warmForRecognition,
  beginSession,
  endSession,
  dispose
});

globalThis.LuckyBeanPaddleOCR = paddleOcrApi;
globalThis.CoffeeFoundationPaddleOCR = paddleOcrApi;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && sessionDepth === 0 && !busy) void dispose();
});
globalThis.addEventListener('pagehide', () => { if (!busy) void dispose(); });
document.documentElement.dataset.webOcr = `ppocr-v5-${VERSION}-session-fastpath`;
