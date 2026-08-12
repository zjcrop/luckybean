import * as core from './qr-core.js';

export * from './qr-core.js';

const LOCAL_JSQR_URL = new URL('../public/vendor/jsqr/jsQR.js', import.meta.url).href;
let jsQrPromise = null;

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value);
  return new Uint8Array();
}

async function ensureLocalJsQR() {
  if (typeof globalThis.jsQR === 'function') return globalThis.jsQR;
  if (jsQrPromise) return jsQrPromise;
  jsQrPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-luckybean-jsqr]');
    if (existing) {
      if (typeof globalThis.jsQR === 'function') return resolve(globalThis.jsQR);
      existing.addEventListener('load', () => typeof globalThis.jsQR === 'function'
        ? resolve(globalThis.jsQR)
        : reject(new Error('本地二维码引擎初始化失败')), { once: true });
      existing.addEventListener('error', () => reject(new Error('本地二维码引擎加载失败')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = LOCAL_JSQR_URL;
    script.async = true;
    script.dataset.luckybeanJsqr = '1';
    script.onload = () => typeof globalThis.jsQR === 'function'
      ? resolve(globalThis.jsQR)
      : reject(new Error('本地二维码引擎初始化失败'));
    script.onerror = () => reject(new Error('本地二维码引擎加载失败'));
    document.head.append(script);
  }).catch(error => {
    jsQrPromise = null;
    throw error;
  });
  return jsQrPromise;
}

function qrCandidate(result, source = 'jsqr-local') {
  if (!result) return null;
  const bytes = toUint8Array(result.binaryData || result.rawBytes);
  return {
    data: String(result.data ?? result.rawValue ?? ''),
    binaryData: bytes.length ? Array.from(bytes) : null,
    rawBytes: bytes.length ? Array.from(bytes) : null,
    engine: source,
    source
  };
}

async function normalizeCandidate(result, source) {
  const candidate = qrCandidate(result, source);
  if (!candidate) return null;
  return core.normalizeQrResult(candidate, source);
}

function runJsQr(data, width, height) {
  if (typeof globalThis.jsQR !== 'function') return null;
  return globalThis.jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
}

function thresholdImageData(imageData, threshold) {
  const data = new Uint8ClampedArray(imageData.data);
  for (let index = 0; index < data.length; index += 4) {
    const luminance = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    const value = luminance > threshold ? 255 : 0;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return data;
}

function scanImageData(imageData) {
  let result = runJsQr(imageData.data, imageData.width, imageData.height);
  if (result) return result;
  for (const threshold of [110, 140, 170, 200, 225]) {
    result = runJsQr(thresholdImageData(imageData, threshold), imageData.width, imageData.height);
    if (result) return result;
  }
  return null;
}

function scanCanvas(canvas, context) {
  const full = scanImageData(context.getImageData(0, 0, canvas.width, canvas.height));
  if (full) return full;
  for (const fraction of [0.88, 0.72, 0.58]) {
    const width = Math.max(1, Math.round(canvas.width * fraction));
    const height = Math.max(1, Math.round(canvas.height * fraction));
    const x = Math.round((canvas.width - width) / 2);
    const y = Math.round((canvas.height - height) / 2);
    const cropped = scanImageData(context.getImageData(x, y, width, height));
    if (cropped) return cropped;
  }
  return null;
}

async function imageFromFile(file) {
  if ('createImageBitmap' in globalThis) {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('无法读取二维码图片'));
      image.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url)
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function barcodeDetectorResult(source) {
  if (!('BarcodeDetector' in globalThis)) return null;
  try {
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const values = await detector.detect(source);
    const first = values?.[0];
    return first ? normalizeCandidate({ data: first.rawValue || '' }, 'barcode-detector') : null;
  } catch {
    return null;
  }
}

async function decodeBitmapSource(source, width, height) {
  await ensureLocalJsQR();
  const maxEdge = 1440;
  const scale = Math.min(1, maxEdge / Math.max(width || 1, height || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const result = scanCanvas(canvas, context);
  return result ? normalizeCandidate(result, 'jsqr-local') : null;
}

export async function scanQrFile(file) {
  if (!file) throw new Error('未选择二维码图片');
  const image = await imageFromFile(file);
  try {
    const local = await decodeBitmapSource(image.source, image.width, image.height);
    if (local) return local;
    const native = await barcodeDetectorResult(image.source);
    if (native) return native;
    throw new Error('未识别到二维码，请保持二维码完整、对焦清晰后重新扫描');
  } finally {
    image.close?.();
  }
}

function cameraErrorMessage(error) {
  const name = String(error?.name || '');
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return '无法使用相机：请在系统或浏览器设置中允许富贵盒子使用相机，然后点击“重新扫描”';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return '未检测到可用摄像头';
  if (name === 'NotReadableError' || name === 'TrackStartError') return '摄像头正被其他应用占用，请关闭占用后重新扫描';
  return error?.message || '摄像头启动失败';
}

export class CameraScanner {
  constructor(video, onResult, onStatus = () => {}) {
    this.video = video;
    this.onResult = onResult;
    this.onStatus = onStatus;
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d', { willReadFrequently: true });
    this.stream = null;
    this.active = false;
    this.processing = false;
    this.frameRequest = 0;
    this.lastScanAt = 0;
    this.lastPayload = '';
    this.lastPayloadAt = 0;
    globalThis.LuckyBeanQrScanner = this;
  }

  status(message) {
    try { this.onStatus(message); } catch { /* overlay may already be closed */ }
  }

  async start() {
    this.stop({ keepGlobal: true });
    globalThis.LuckyBeanQrScanner = this;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前环境不支持摄像头实时扫描');
    this.active = true;
    this.status('正在启动本地二维码引擎…');
    try {
      await ensureLocalJsQR();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      if (!this.active) return;
      this.video.srcObject = this.stream;
      await this.video.play();
      this.status('请将二维码完整放入取景框，识别全程在本机完成');
      this.loop();
    } catch (error) {
      this.active = false;
      this.stream?.getTracks?.().forEach(track => track.stop());
      this.stream = null;
      this.status(cameraErrorMessage(error));
      throw error;
    }
  }

  async restart() {
    this.lastPayload = '';
    this.lastPayloadAt = 0;
    this.status('正在重新扫描…');
    if (!this.active || !this.stream?.active) return this.start();
    this.processing = false;
    if (!this.frameRequest) this.loop();
  }

  loop() {
    if (!this.active) return;
    this.frameRequest = requestAnimationFrame(() => this.loop());
    const now = performance.now();
    if (this.processing || now - this.lastScanAt < 160 || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    this.lastScanAt = now;
    this.processFrame().catch(error => this.status(`扫描暂未成功：${cameraErrorMessage(error)}`));
  }

  async processFrame() {
    if (!this.active || !this.video.videoWidth || !this.video.videoHeight) return;
    this.processing = true;
    try {
      const maxEdge = 960;
      const scale = Math.min(1, maxEdge / Math.max(this.video.videoWidth, this.video.videoHeight));
      const width = Math.max(1, Math.round(this.video.videoWidth * scale));
      const height = Math.max(1, Math.round(this.video.videoHeight * scale));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.context.drawImage(this.video, 0, 0, width, height);
      const result = scanCanvas(this.canvas, this.context);
      if (!result) return;
      const normalized = await normalizeCandidate(result, 'jsqr-local');
      if (!normalized) return;
      const signature = String(normalized.data || '') || JSON.stringify(normalized.binaryData || []).slice(0, 160);
      const now = Date.now();
      if (signature && signature === this.lastPayload && now - this.lastPayloadAt < 1400) return;
      this.lastPayload = signature;
      this.lastPayloadAt = now;
      this.status('二维码已捕捉，正在解析…');
      await this.onResult(normalized);
      if (!document.querySelector('[data-overlay="camera"]')) this.stop();
      else this.status('未完成导入，可继续扫描或点击“重新扫描”');
    } finally {
      this.processing = false;
    }
  }

  stop({ keepGlobal = false } = {}) {
    this.active = false;
    this.processing = false;
    if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
    this.frameRequest = 0;
    if (this.stream) this.stream.getTracks().forEach(track => track.stop());
    this.stream = null;
    if (this.video) {
      try { this.video.pause(); } catch { /* ignore */ }
      this.video.srcObject = null;
    }
    if (!keepGlobal && globalThis.LuckyBeanQrScanner === this) globalThis.LuckyBeanQrScanner = null;
  }
}

export async function normalizeQrResult(result, engine = 'unknown') {
  return core.normalizeQrResult(result, engine);
}

export function decodeJsQrResult(result, codebook) {
  return core.decodeJsQrResult(result, codebook);
}
