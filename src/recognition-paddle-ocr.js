const VERSION = '0.4.6';
const ENGINE = `PP-OCRv5-browser-${VERSION}-self-hosted`;

function isAppleMobileLike() {
  const ua = String(navigator.userAgent || '');
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
}
function isWebKitFamily() {
  const ua = String(navigator.userAgent || '');
  return /AppleWebKit/i.test(ua) && !/(Chrome|Chromium|CriOS|Edg|OPR|SamsungBrowser)/i.test(ua);
}

const APPLE_MOBILE = isAppleMobileLike();
const WEBKIT = isWebKitFamily();
const LOW_MEMORY = APPLE_MOBILE || Number(navigator.deviceMemory || 4) <= 4;
const LIMIT_SIDE = LOW_MEMORY ? 640 : 960;
const ENGINE_INIT_TIMEOUT_MS = WEBKIT ? 30000 : 75000;
const PREDICT_TIMEOUT_MS = WEBKIT ? 30000 : 45000;
const ROI_CROP_TIMEOUT_MS = 20000;

let modulePromise = null;
let enginePromise = null;
let engineMode = WEBKIT ? 'direct-wasm-no-simd' : 'worker';
let engineGeneration = 0;
let busy = false;
let disposeTimer = 0;
let roiRequestSequence = 0;

function defaultRuntimeBase() { return new URL('../public/vendor/paddleocr/', import.meta.url); }
function runtimeBase() {
  const configured = String(globalThis.CoffeeFoundationOcrAssetBase || '').trim();
  if (configured) { try { return new URL(configured, globalThis.location?.href || 'http://localhost/'); } catch {} }
  return defaultRuntimeBase();
}
function assetUrl(relativePath) { return new URL(relativePath, runtimeBase()).href; }
function emit(status, progress = 0) {
  const detail = { status:String(status || ''), progress:Math.max(0, Math.min(100, Number(progress) || 0)) };
  globalThis.dispatchEvent(new CustomEvent('luckybean:ocr-progress', { detail }));
  globalThis.dispatchEvent(new CustomEvent('coffee-foundation:ocr-progress', { detail }));
}
function timeoutError(message) { const error = new Error(message); error.name = 'RecognitionTimeoutError'; return error; }
function withTimeout(promise, timeoutMs, message, onTimeout) {
  let timer = 0;
  const timeout = new Promise((_, reject) => { timer = globalThis.setTimeout(() => { try { onTimeout?.(); } catch {} reject(timeoutError(message)); }, timeoutMs); });
  return Promise.race([promise, timeout]).finally(() => globalThis.clearTimeout(timer));
}
function clamp01(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback; }
function normalizeRegion(input) {
  const source = input && typeof input === 'object' ? input : {};
  const left = clamp01(source.left), top = clamp01(source.top), right = clamp01(source.right, 1), bottom = clamp01(source.bottom, 1);
  if (right - left < 0.01 || bottom - top < 0.01) throw new Error('ROI 范围过小或无效');
  return Object.freeze({ left, top, right, bottom });
}
async function cropRegionInWorker(blob, regionInput, options = {}) {
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error('ROI 原图不可用');
  const region = normalizeRegion(regionInput); roiRequestSequence += 1;
  const requestId = `roi-${Date.now().toString(36)}-${roiRequestSequence.toString(36)}`;
  const worker = new Worker(assetUrl('roi-worker.js'), { type:'classic', name:'luckybean-roi-crop' });
  let settled = false;
  const cleanup = () => { if (settled) return; settled = true; try { worker.terminate(); } catch {} };
  const operation = new Promise((resolve, reject) => {
    worker.onmessage = event => {
      if (String(event.data?.requestId || '') !== requestId) return;
      if (event.data?.ok !== true) { cleanup(); reject(new Error(String(event.data?.error || 'ROI Worker 裁剪失败'))); return; }
      const result = event.data; cleanup(); resolve(result);
    };
    worker.onerror = event => { cleanup(); reject(new Error(`ROI Worker 运行失败：${event.message || 'unknown error'}`)); };
    worker.postMessage({ requestId, blob, region, maxEdge:Number(options.maxEdge || (LOW_MEMORY ? 1280 : 2200)) });
  });
  return withTimeout(operation, ROI_CROP_TIMEOUT_MS, 'ROI Worker 裁剪超时，已终止本次局部识别', cleanup);
}
async function loadModule() {
  if (!modulePromise) {
    emit('正在按需加载本地 PP-OCRv5 网页运行时', 2);
    modulePromise = import(assetUrl('sdk.mjs')).catch(error => { modulePromise = null; throw new Error(`本地 PP-OCRv5 SDK 加载失败：${error.message}`); });
  }
  return modulePromise;
}
function createModuleWorker() {
  try { return new Worker(assetUrl('worker.js'), { type:'module', name:'luckybean-ppocr-v5' }); }
  catch (error) { throw new Error(`本地 PP-OCRv5 Worker 创建失败：${error.message}`); }
}
function ocrCreateOptions({ compatibility = false } = {}) {
  return {
    lang:'ch', ocrVersion:'PP-OCRv5',
    textDetectionModelName:'PP-OCRv5_mobile_det', textDetectionModelAsset:{ url:assetUrl('models/PP-OCRv5_mobile_det_onnx_infer.tar') },
    textRecognitionModelName:'PP-OCRv5_mobile_rec', textRecognitionModelAsset:{ url:assetUrl('models/PP-OCRv5_mobile_rec_onnx_infer.tar') },
    ...(compatibility ? {} : { worker:{ createWorker:() => createModuleWorker() } }),
    textDetectionBatchSize:1, textRecognitionBatchSize:1,
    ortOptions:{ backend:'wasm', wasmPaths:assetUrl('ort/'), numThreads:1, simd:compatibility ? false : true }
  };
}
async function createWorkerEngine() {
  const module = await loadModule(); if (!module?.PaddleOCR?.create) throw new Error('PP-OCRv5 SDK 接口不可用');
  return module.PaddleOCR.create(ocrCreateOptions({ compatibility:false }));
}
async function createCompatibilityEngine() {
  const module = await loadModule(); if (!module?.PaddleOCR?.create) throw new Error('PP-OCRv5 SDK 接口不可用');
  return module.PaddleOCR.create(ocrCreateOptions({ compatibility:true }));
}
function disposeInstance(ocr) { if (!ocr?.dispose) return; Promise.resolve().then(() => ocr.dispose()).catch(() => {}); }
function detachEngine() { const current = enginePromise; enginePromise = null; engineGeneration += 1; if (current) current.then(disposeInstance).catch(() => {}); }
async function startWorkerEngine() {
  const generation = ++engineGeneration; const raw = createWorkerEngine();
  try {
    const ocr = await withTimeout(raw, ENGINE_INIT_TIMEOUT_MS, 'PP-OCRv5 Worker 初始化超时，已退出本次识别；界面仍可继续操作', () => { if (generation === engineGeneration) engineGeneration += 1; });
    if (generation !== engineGeneration) { disposeInstance(ocr); throw new Error('PP-OCRv5 Worker 初始化结果已失效，请重新识别'); }
    return ocr;
  } catch (error) { raw.then(ocr => { if (generation !== engineGeneration) disposeInstance(ocr); }).catch(() => {}); throw error; }
}
async function startCompatibilityEngine() {
  emit('Safari 正在启用低内存兼容识别模式', 9);
  return withTimeout(createCompatibilityEngine(), ENGINE_INIT_TIMEOUT_MS, 'PP-OCRv5 Safari 兼容模式初始化超时', () => {});
}
async function ensureEngine() {
  globalThis.clearTimeout(disposeTimer); if (enginePromise) return enginePromise;
  emit(WEBKIT ? '正在按需准备 Safari 本地 OCR' : '正在后台准备本地 PP-OCRv5 中文检测与识别模型', 7);
  const pending = WEBKIT
    ? startCompatibilityEngine().then(ocr => { engineMode='direct-wasm-no-simd'; emit('PP-OCRv5 Safari 兼容模式已就绪', 18); return ocr; })
    : startWorkerEngine().then(ocr => { engineMode='worker'; emit('PP-OCRv5 Worker 中文模型已就绪', 18); return ocr; });
  const tracked = pending.catch(error => { if (enginePromise === tracked) enginePromise = null; throw new Error(`PP-OCRv5 初始化失败：${error.message}`); });
  enginePromise = tracked; return tracked;
}
async function dispose() {
  globalThis.clearTimeout(disposeTimer); const current = enginePromise; enginePromise = null; engineGeneration += 1; if (!current) return;
  try { const ocr = await current; await ocr?.dispose?.(); } catch {}
}
function scheduleDispose() {
  globalThis.clearTimeout(disposeTimer);
  if (LOW_MEMORY || engineMode === 'direct-wasm-no-simd') { void dispose(); return; }
  disposeTimer = globalThis.setTimeout(() => { void dispose(); }, 90000);
}
function meaningful(text) {
  const chars = [...String(text || '')]; if (!chars.length) return 0;
  return chars.filter(char => /[\p{Script=Han}A-Za-z0-9年月日海拔处理烘焙庄园产区豆种%°./:+-]/u.test(char)).length / chars.length;
}
function normalizeItems(result, imageId) {
  return (result?.items || []).map(item => ({ text:String(item?.text || '').trim(), confidence:Number(item?.score ?? 0), polygon:item?.poly || null, imageId, engine:ENGINE }))
    .filter(item => item.text && item.confidence >= 0.28 && meaningful(item.text) >= 0.55)
    .sort((a,b) => Number(a.polygon?.[0]?.[1] || 0) - Number(b.polygon?.[0]?.[1] || 0) || Number(a.polygon?.[0]?.[0] || 0) - Number(b.polygon?.[0]?.[0] || 0));
}
async function predict(images) {
  const ocr = await ensureEngine(); const blocks = [], groups = [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index]; emit(`PP-OCRv5 正在识别第 ${index + 1}/${images.length} 张图片`, 20 + Math.round(index / Math.max(1, images.length) * 70));
    const prediction = ocr.predict(image.blob, { textDetLimitSideLen:LIMIT_SIDE, textDetLimitType:'min', textDetMaxSideLimit:LOW_MEMORY ? 1280 : 2200, textDetThresh:0.22, textDetBoxThresh:0.35, textDetUnclipRatio:1.55, textRecScoreThresh:0.28 });
    const results = await withTimeout(prediction, PREDICT_TIMEOUT_MS, `PP-OCRv5 第 ${index + 1} 张图片识别超时，已退出本次任务`, detachEngine);
    const current = normalizeItems(results?.[0], image.id); blocks.push(...current); if (current.length) groups.push(current.map(item => item.text).join('\n'));
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
  }
  if (!blocks.length) throw new Error('PP-OCRv5 没有得到可信文字。请靠近文字区域拍摄，避免整只包装占画面过小。');
  emit('PP-OCRv5 中英文识别完成', 100);
  return { engine:`${ENGINE}-${engineMode}${LOW_MEMORY ? '-low-memory' : ''}`, blocks, fullText:groups.join('\n\n') };
}
async function predictRegion(blob, region, options = {}) {
  emit('正在 Worker 中裁剪待复核区域', 10);
  const crop = await cropRegionInWorker(blob, region, options), imageId = String(options.imageId || 'roi');
  const result = await predict([{ id:imageId, blob:crop.blob }]);
  return { ...result, regionProtocol:'recognition-roi/1.0', region:crop.region, sourceWidth:Number(crop.sourceWidth || 0), sourceHeight:Number(crop.sourceHeight || 0), cropX:Number(crop.cropX || 0), cropY:Number(crop.cropY || 0), cropWidth:Number(crop.cropWidth || 0), cropHeight:Number(crop.cropHeight || 0), outputWidth:Number(crop.outputWidth || 0), outputHeight:Number(crop.outputHeight || 0) };
}
async function run(task) {
  if (busy) throw new Error('识别任务正在运行，请勿重复点击'); busy = true;
  try { return await task(); }
  catch (error) { detachEngine(); emit(`识别失败：${error.message}`, 0); throw new Error(`${error.message}；已停止当前任务。不会切换到 Tesseract 或其他未知 OCR。`); }
  finally {
    busy = false;
    if (LOW_MEMORY || engineMode === 'direct-wasm-no-simd') await dispose();
    else if (enginePromise) scheduleDispose();
  }
}
async function preload() {
  if (globalThis.__LUCKYBEAN_ANDROID__ || LOW_MEMORY || WEBKIT) return null;
  try { const ocr = await ensureEngine(); emit('PP-OCRv5 已在后台预热', 18); scheduleDispose(); return ocr; }
  catch (error) { emit(`PP-OCRv5 后台预热未完成：${error.message}`, 0); return null; }
}
const paddleOcrApi = Object.freeze({
  version:VERSION, engine:ENGINE, lowMemory:LOW_MEMORY, appleMobile:APPLE_MOBILE,
  workerOnly:false, browserSafe:true, primaryIsolation:WEBKIT ? 'webkit-direct-wasm-no-simd' : 'module-worker', compatibilityFallback:'webkit-direct-wasm-no-simd',
  autoPreload:false, disposePolicy:LOW_MEMORY || WEBKIT ? 'after-each-task' : 'idle-90s',
  roiWorkerOnly:true, regionRecognition:'recognition-roi/1.0', runtimeOrigin:'same-origin-vendored', workerBootstrap:'same-origin-vendored-module',
  runtimeBase() { return runtimeBase().href; },
  recognizeCoffeeBag(images) { return run(() => predict(images)); },
  recognizeRegion(blob, region, options = {}) { return run(() => predictRegion(blob, region, options)); },
  async recognize(blob) { const result = await run(() => predict([{ id:'single', blob }])); return { blocks:result.blocks }; }, preload, dispose
});
globalThis.LuckyBeanPaddleOCR = paddleOcrApi;
globalThis.CoffeeFoundationPaddleOCR = paddleOcrApi;
document.addEventListener('visibilitychange', () => { if (document.hidden && !busy) void dispose(); });
globalThis.addEventListener('pagehide', () => { if (!busy) void dispose(); });
document.documentElement.dataset.webOcr = `ppocr-v5-${VERSION}-self-hosted-lazy-memory-bounded`;
