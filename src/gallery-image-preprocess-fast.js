await import('./gallery-image-preprocess.js');

const base = globalThis.LuckyBeanGalleryImagePreprocess;
if (!base || typeof base.preprocessFiles !== 'function') throw new Error('相册低内存预处理基座未就绪');

const OUTPUT_MAX_EDGE = 2200;
const LOW_MEMORY_OUTPUT_MAX_EDGE = 1600;
const DECODE_MAX_EDGE = 2800;
const LOW_MEMORY_DECODE_MAX_EDGE = 2200;
const OUTPUT_QUALITY = 0.92;
const PROCESS_TIMEOUT_MS = 30000;
const FULL_REGION = Object.freeze({ left:0, top:0, right:1, bottom:1 });
let manualCropRequested = false;

function isAppleMobileLike() {
  const ua = String(globalThis.navigator?.userAgent || '');
  return /iPhone|iPad|iPod/i.test(ua)
    || (globalThis.navigator?.platform === 'MacIntel' && Number(globalThis.navigator?.maxTouchPoints || 0) > 1);
}

function lowMemoryMode() {
  const memory = Number(globalThis.navigator?.deviceMemory || 0);
  return isAppleMobileLike() || (memory > 0 && memory <= 4);
}

function readyKey(file) {
  return [String(file?.name || ''), Number(file?.size || 0), Number(file?.lastModified || 0), String(file?.type || '')].join('|');
}

function registerOcrReady(file, metadata) {
  if (!(globalThis.__LUCKYBEAN_GALLERY_OCR_READY__ instanceof Map)) {
    globalThis.__LUCKYBEAN_GALLERY_OCR_READY__ = new Map();
  }
  globalThis.__LUCKYBEAN_GALLERY_OCR_READY__.set(readyKey(file), Object.freeze({ ...metadata }));
}

function processFastFile(file) {
  if (!(file instanceof Blob) || !file.size) return Promise.reject(new Error('相册图片不可用'));
  if (typeof Worker !== 'function') return Promise.reject(new Error('当前浏览器不支持低内存图片 Worker'));
  const lowMemory = lowMemoryMode();
  const worker = new Worker(new URL('./gallery-image-finalize-worker.js', import.meta.url), { type:'module' });
  const requestId = `gallery_fast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      callback(value);
    };
    const timer = setTimeout(() => finish(reject, new Error('相册快速预处理超时')), PROCESS_TIMEOUT_MS);
    worker.onerror = event => finish(reject, new Error(event?.message || '相册快速预处理 Worker 异常'));
    worker.onmessage = event => {
      const data = event.data || {};
      if (String(data.requestId || '') !== requestId) return;
      if (!data.ok || !(data.blob instanceof Blob)) {
        finish(reject, new Error(data.error || '相册快速预处理失败'));
        return;
      }
      const stem = String(file.name || 'image').replace(/\.[^.]+$/, '');
      const prepared = new File([data.blob], `${stem}-ocr-fast.jpg`, {
        type:'image/jpeg',
        lastModified:Date.now()
      });
      registerOcrReady(prepared, {
        width:Number(data.width || 0),
        height:Number(data.height || 0),
        quality:OUTPUT_QUALITY,
        source:'gallery-worker-auto-fast',
        skipSecondEncode:true
      });
      finish(resolve, prepared);
    };
    worker.postMessage({
      requestId,
      blob:file,
      options:{
        region:FULL_REGION,
        quarterTurns:0,
        deskewDegrees:0,
        perspectiveQuad:null,
        outputMaxEdge:lowMemory ? LOW_MEMORY_OUTPUT_MAX_EDGE : OUTPUT_MAX_EDGE,
        decodeMaxEdge:lowMemory ? LOW_MEMORY_DECODE_MAX_EDGE : DECODE_MAX_EDGE,
        quality:OUTPUT_QUALITY
      }
    });
  });
}

async function preprocessFilesFast(files) {
  const input = [...(files || [])];
  const output = [];
  for (let index = 0; index < input.length; index += 1) {
    const file = input[index];
    if (!file) continue;
    output.push(await processFastFile(file));
    input[index] = null;
  }
  return output;
}

async function preprocessFiles(files) {
  const useManual = manualCropRequested;
  manualCropRequested = false;
  if (useManual) return base.preprocessFiles(files);
  return preprocessFilesFast(files);
}

function installManualCropOption() {
  const ensure = () => {
    const galleryButton = document.querySelector('#bagGalleryBtn');
    if (!galleryButton || document.querySelector('#bagGalleryManualCropLabel')) return;
    const label = document.createElement('label');
    label.id = 'bagGalleryManualCropLabel';
    label.className = 'muted small';
    label.style.display = 'inline-flex';
    label.style.alignItems = 'center';
    label.style.gap = '.35rem';
    label.style.whiteSpace = 'nowrap';
    label.innerHTML = '<input id="bagGalleryManualCrop" type="checkbox">手工裁切';
    galleryButton.insertAdjacentElement('afterend', label);
  };
  const overlayRoot = document.querySelector('#overlayRoot');
  if (overlayRoot) new MutationObserver(() => queueMicrotask(ensure)).observe(overlayRoot, { childList:true, subtree:true });
  document.addEventListener('click', event => {
    if (!event.target?.closest?.('#bagGalleryBtn')) return;
    manualCropRequested = Boolean(document.querySelector('#bagGalleryManualCrop')?.checked);
  }, true);
  ensure();
}

installManualCropOption();

globalThis.LuckyBeanGalleryImagePreprocess = Object.freeze({
  ...base,
  preprocessFiles,
  preprocessFilesFast,
  preprocessFilesManual:base.preprocessFiles,
  requestManualCrop() { manualCropRequested = true; },
  readyKey:base.readyKey || readyKey
});
