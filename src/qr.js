import * as core from './qr-core.js';
import { decodeEncryptedShareEnvelope } from './share-codec.js';

const LOCAL_JSQR_URL = new URL('../public/vendor/jsqr/jsQR.js', import.meta.url).href;
let jsQrPromise = null;

export * from './qr-core.js';

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
      existing.addEventListener('load', () => typeof globalThis.jsQR === 'function' ? resolve(globalThis.jsQR) : reject(new Error('本地二维码引擎初始化失败')), { once: true });
      existing.addEventListener('error', () => reject(new Error('本地二维码引擎加载失败')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = LOCAL_JSQR_URL;
    script.async = true;
    script.dataset.luckybeanJsqr = '1';
    script.onload = () => typeof globalThis.jsQR === 'function' ? resolve(globalThis.jsQR) : reject(new Error('本地二维码引擎初始化失败'));
    script.onerror = () => reject(new Error('本地二维码引擎加载失败'));
    document.head.append(script);
  }).catch(error => {
    jsQrPromise = null;
    throw error;
  });
  return jsQrPromise;
}

function qrResultFromJsQR(result) {
  if (!result) return null;
  const bytes = toUint8Array(result.binaryData);
  return core.normalizeQrResult({
    text: String(result.data || ''),
    rawBytes: bytes,
    rawBytesExact: bytes.length > 0,
    source: 'jsqr-local'
  });
}

function decodeImageData(imageData) {
  if (typeof globalThis.jsQR !== 'function') return null;
  return qrResultFromJsQR(globalThis.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' }));
}

async function decodeBitmapSource(source, width, height) {
  await ensureLocalJsQR();
  const maxEdge = 1280;
  const scale = Math.min(1, maxEdge / Math.max(width || 1, height || 1));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, targetWidth, targetHeight);
  return decodeImageData(context.getImageData(0, 0, targetWidth, targetHeight));
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
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
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
    if (!first) return null;
    return core.normalizeQrResult({ text: first.rawValue || '', rawBytes: new Uint8Array(), rawBytesExact: false, source: 'barcode-detector' });
  } catch {
    return null;
  }
}

export async function scanQrFile(file) {
  if (!file) throw new Error('未选择二维码图片');
  const image = await imageFromFile(file);
  try {
    const local = await decodeBitmapSource(image.source, image.width, image.height);
    if (local) return expandQrResult(local);
    const native = await barcodeDetectorResult(image.source);
    if (native) return expandQrResult(native);
    throw new Error('未识别到二维码，请调整距离、对焦或重新扫描');
  } finally {
    image.close?.();
  }
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
  }

  status(message) {
    try { this.onStatus(message); } catch { /* overlay may have closed */ }
  }

  async start() {
    this.stop();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前环境不支持摄像头实时扫描');
    this.active = true;
    this.status('正在启动本地二维码引擎…');
    await ensureLocalJsQR();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    if (!this.active) return;
    this.video.srcObject = this.stream;
    await this.video.play();
    this.status('请将二维码完整放入取景框，识别全程在本机完成');
    globalThis.LuckyBeanQrScanner = this;
    this.loop();
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
    this.processFrame().catch(error => this.status(`扫描暂未成功：${error.message}`));
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
      const result = decodeImageData(this.context.getImageData(0, 0, width, height));
      if (!result) return;
      const signature = result.text || Array.from(result.rawBytes || []).slice(0, 48).join(',');
      const now = Date.now();
      if (signature && signature === this.lastPayload && now - this.lastPayloadAt < 1400) return;
      this.lastPayload = signature;
      this.lastPayloadAt = now;
      this.status('二维码已捕捉，正在解析…');
      await this.onResult(expandQrResult(result));
      if (!document.querySelector('[data-overlay="camera"]')) {
        this.stop();
      } else {
        this.status('未完成导入，可继续扫描或点击“重新扫描”');
      }
    } finally {
      this.processing = false;
    }
  }

  stop() {
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
    if (globalThis.LuckyBeanQrScanner === this) globalThis.LuckyBeanQrScanner = null;
  }
}

export function expandQrResult(value) {
  const normalized = core.normalizeQrResult(value);
  const envelope = decodeEncryptedShareEnvelope(normalized.text);
  if (!envelope) return normalized;
  return { ...normalized, family: 'luckybean-share', encryptedEnvelope: envelope, source: envelope.source || normalized.source };
}

export async function decodeJsQrResult(result, codebook, options = {}) {
  const normalized = expandQrResult(result);
  if (normalized.encryptedEnvelope) {
    const passphrase = String(options.passphrase || '').trim();
    if (!passphrase) {
      const error = new Error('这是受保护的 Lucky Bean 分享码，需要口令');
      error.code = 'share-passphrase-required';
      error.envelope = normalized.encryptedEnvelope;
      throw error;
    }
    const payload = await core.decodeEncryptedShareEnvelope(normalized.encryptedEnvelope, passphrase);
    return { family: 'luckybean-share', format: 'encrypted', payload, raw: normalized, source: normalized.source || 'encrypted-share' };
  }
  return core.decodeJsQrResult(normalized, codebook);
}

export function exportSharePayload(bean, options = {}) {
  return core.exportSharePayload(bean, options);
}
