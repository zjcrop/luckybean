import { readGalleryImageHeader } from './gallery-image-preview.js';
await import('./gallery-image-preprocess.js');

const base = globalThis.LuckyBeanGalleryImagePreprocess;
if (!base || typeof base.preprocessFiles !== 'function') throw new Error('相册低内存预处理基座未就绪');

const AUTO_CROP_TRIGGER_EDGE = 3000;
const FULL_IMAGE_OUTPUT_MAX_EDGE = 1600;
const FULL_IMAGE_DECODE_MAX_EDGE = 1600;
const FULL_IMAGE_QUALITY = 0.90;
const PROCESS_TIMEOUT_MS = 30000;
const FULL_REGION = Object.freeze({ left:0, top:0, right:1, bottom:1 });

function readyKey(file) {
  return [String(file?.name || ''), Number(file?.size || 0), Number(file?.lastModified || 0), String(file?.type || '')].join('|');
}

function registerOcrReady(file, metadata) {
  if (!(globalThis.__LUCKYBEAN_GALLERY_OCR_READY__ instanceof Map)) {
    globalThis.__LUCKYBEAN_GALLERY_OCR_READY__ = new Map();
  }
  globalThis.__LUCKYBEAN_GALLERY_OCR_READY__.set(readyKey(file), Object.freeze({ ...metadata }));
}

function orientedSize(header) {
  if (!header?.width || !header?.height) return null;
  const orientation = Number(header.orientation || 1);
  return orientation >= 5 && orientation <= 8
    ? { width:Number(header.height), height:Number(header.width) }
    : { width:Number(header.width), height:Number(header.height) };
}

function directFile(file, header) {
  const size = orientedSize(header);
  if (!size) return null;
  registerOcrReady(file, {
    width:size.width,
    height:size.height,
    quality:null,
    source:'gallery-original-direct',
    skipSecondEncode:true,
    untouched:true
  });
  return file;
}

function processFastFile(file, header = null) {
  if (!(file instanceof Blob) || !file.size) return Promise.reject(new Error('相册图片不可用'));
  const size = orientedSize(header);
  const orientation = Number(header?.orientation || 1);
  if (size && Math.max(size.width, size.height) <= FULL_IMAGE_OUTPUT_MAX_EDGE && orientation === 1) {
    return Promise.resolve(directFile(file, header));
  }
  if (typeof Worker !== 'function') return Promise.reject(new Error('当前浏览器不支持低内存图片 Worker'));

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
        quality:FULL_IMAGE_QUALITY,
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
        outputMaxEdge:FULL_IMAGE_OUTPUT_MAX_EDGE,
        decodeMaxEdge:FULL_IMAGE_DECODE_MAX_EDGE,
        quality:FULL_IMAGE_QUALITY
      }
    });
  });
}

async function preprocessOne(file) {
  if (!(file instanceof Blob) || !file.size) throw new Error('相册图片不可用');
  const header = await readGalleryImageHeader(file);
  const size = orientedSize(header);
  const maxEdge = size ? Math.max(size.width, size.height) : 0;

  // Manual crop is an automatic safety/precision step only for oversized gallery uploads.
  // Camera capture never enters this module, and gallery images at or below 3000 px never
  // force user interaction. Small images are never enlarged.
  if (maxEdge > AUTO_CROP_TRIGGER_EDGE) {
    const [processed] = await base.preprocessFiles([file]);
    return processed;
  }
  return processFastFile(file, header);
}

async function preprocessFilesFast(files) {
  const input = [...(files || [])];
  const output = [];
  for (let index = 0; index < input.length; index += 1) {
    const file = input[index];
    if (!file) continue;
    output.push(await preprocessOne(file));
    input[index] = null;
  }
  return output;
}

async function preprocessFiles(files) {
  return preprocessFilesFast(files);
}

globalThis.LuckyBeanGalleryImagePreprocess = Object.freeze({
  ...base,
  preprocessFiles,
  preprocessFilesFast,
  preprocessFilesManual:base.preprocessFiles,
  autoCropTriggerEdge:AUTO_CROP_TRIGGER_EDGE,
  fullImageOutputMaxEdge:FULL_IMAGE_OUTPUT_MAX_EDGE,
  readyKey:base.readyKey || readyKey
});
