export const PACKAGE_OCR_MAX_EDGE = 2200;
export const PACKAGE_OCR_LOW_MEMORY_MAX_EDGE = 1600;
export const PACKAGE_OCR_JPEG_QUALITY = 0.94;
const DEFAULT_MAX_EDGE = PACKAGE_OCR_MAX_EDGE;
const SAMPLE_EDGE = 420;
const HEADER_PROBE_BYTES = 1024 * 1024;

function isAppleMobileLike() {
  const ua = String(globalThis.navigator?.userAgent || '');
  return /iPhone|iPad|iPod/i.test(ua)
    || (globalThis.navigator?.platform === 'MacIntel' && Number(globalThis.navigator?.maxTouchPoints || 0) > 1);
}
function memoryAwareMaxEdge(requested) {
  const deviceMemory = Number(globalThis.navigator?.deviceMemory || 0);
  const lowMemory = isAppleMobileLike() || (deviceMemory > 0 && deviceMemory <= 4);
  return lowMemory ? Math.min(Number(requested) || DEFAULT_MAX_EDGE, PACKAGE_OCR_LOW_MEMORY_MAX_EDGE) : (Number(requested) || DEFAULT_MAX_EDGE);
}
function releaseCanvas(canvas) {
  if (!canvas) return;
  // Resetting dimensions releases the backing pixel buffer immediately on most
  // browser/WebView engines instead of waiting for a later GC cycle.
  canvas.width = 1;
  canvas.height = 1;
}

function canvasBlob(canvas, type = 'image/jpeg', quality = PACKAGE_OCR_JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片压缩失败')), type, quality);
  });
}

function readUint32BE(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function pngDimensions(bytes) {
  if (bytes.length < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) return null;
  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  return width > 0 && height > 0 ? { width, height, format:'png' } : null;
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

function jpegDimensions(bytes) {
  if (bytes.length < 10 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 1 >= bytes.length) break;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (JPEG_SOF_MARKERS.has(marker) && segmentLength >= 7) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return width > 0 && height > 0 ? { width, height, format:'jpeg' } : null;
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(bytes) {
  if (bytes.length < 30) return null;
  const ascii = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') return null;
  if (ascii(12, 4) === 'VP8X') {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return width > 0 && height > 0 ? { width, height, format:'webp' } : null;
  }
  return null;
}

async function encodedDimensions(blob) {
  try {
    const bytes = new Uint8Array(await blob.slice(0, Math.min(blob.size, HEADER_PROBE_BYTES)).arrayBuffer());
    return pngDimensions(bytes) || jpegDimensions(bytes) || webpDimensions(bytes);
  } catch {
    return null;
  }
}

function boundedSize(width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale
  };
}

async function decodeImage(file, maxEdge) {
  const encoded = await encodedDimensions(file);
  if (globalThis.createImageBitmap) {
    if (encoded && Math.max(encoded.width, encoded.height) > maxEdge) {
      const target = boundedSize(encoded.width, encoded.height, maxEdge);
      try {
        const image = await createImageBitmap(file, {
          imageOrientation:'from-image',
          resizeWidth:target.width,
          resizeHeight:target.height,
          resizeQuality:'high'
        });
        return {
          image,
          originalWidth:encoded.width,
          originalHeight:encoded.height,
          decodePreScaled:true,
          encodedFormat:encoded.format
        };
      } catch (error) {
        // Do not silently fall back to decoding a 12/24/48 MP source into a full
        // RGBA bitmap. The compressed file can be only a few MB while the decoded
        // raster consumes hundreds of MB and can freeze/restart the tab/WebView.
        throw new Error(`当前浏览器无法安全缩放高分辨率图片：${error?.message || 'createImageBitmap resize failed'}`);
      }
    }
    try {
      const image = await createImageBitmap(file, { imageOrientation:'from-image' });
      const actual = dimensions(image);
      return {
        image,
        originalWidth:encoded?.width || actual.width,
        originalHeight:encoded?.height || actual.height,
        decodePreScaled:false,
        encodedFormat:encoded?.format || ''
      };
    } catch { /* fallback below */ }
  }

  // The Image element path is retained only for sources that were not identified
  // as oversized above. Known oversized JPEG/PNG/WebP files never reach this path.
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error('图片无法读取'));
      node.src = url;
    });
    const actual = dimensions(image);
    return {
      image,
      originalWidth:encoded?.width || actual.width,
      originalHeight:encoded?.height || actual.height,
      decodePreScaled:false,
      encodedFormat:encoded?.format || ''
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dimensions(image) {
  return {
    width: image.width || image.naturalWidth || 0,
    height: image.height || image.naturalHeight || 0
  };
}

function analysePixels(imageData) {
  const { data, width, height } = imageData;
  const pixelCount = width * height;
  let lumaSum = 0;
  let lumaSqSum = 0;
  let highlight = 0;
  let dark = 0;
  let edge = 0;
  let gradientSum = 0;
  const luma = new Float32Array(pixelCount);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    luma[p] = y;
    lumaSum += y;
    lumaSqSum += y * y;
    if (r > 246 && g > 246 && b > 246) highlight += 1;
    if (r < 24 && g < 24 && b < 24) dark += 1;
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = y * width + x;
      const gx = Math.abs(luma[p + 1] - luma[p - 1]);
      const gy = Math.abs(luma[p + width] - luma[p - width]);
      const magnitude = gx + gy;
      gradientSum += magnitude;
      if (magnitude > 42) edge += 1;
    }
  }

  const meanLuma = lumaSum / pixelCount;
  const varianceLuma = Math.max(0, lumaSqSum / pixelCount - meanLuma * meanLuma);
  const interiorCount = Math.max(1, (width - 2) * (height - 2));
  return {
    meanLuma,
    contrast: Math.sqrt(varianceLuma),
    highlightRatio: highlight / pixelCount,
    darkRatio: dark / pixelCount,
    gradientMean: gradientSum / interiorCount,
    edgeRatio: edge / interiorCount
  };
}

function scoreQuality(metrics, width, height) {
  let score = 100;
  const warnings = [];
  const maxEdge = Math.max(width, height);

  if (maxEdge < 900) {
    score -= 18;
    warnings.push('图片分辨率偏低，请靠近包装拍摄');
  }
  if (metrics.gradientMean < 13 || metrics.edgeRatio < 0.035) {
    score -= 28;
    warnings.push('画面可能模糊，请稳定手机并重新对焦');
  }
  if (metrics.highlightRatio > 0.11) {
    score -= 24;
    warnings.push('反光面积较大，请轻微转动包装或改变光源角度');
  }
  if (metrics.meanLuma < 48 || metrics.darkRatio > 0.42) {
    score -= 18;
    warnings.push('画面偏暗，请增加环境光，避免直接闪光');
  }
  if (metrics.meanLuma > 218) {
    score -= 16;
    warnings.push('画面过曝，请降低曝光或避开强光');
  }
  if (metrics.contrast < 28) {
    score -= 12;
    warnings.push('文字与背景对比偏低，建议换角度补拍一张');
  }

  return {
    score: Math.max(0, Math.round(score)),
    status: score >= 78 ? 'good' : score >= 55 ? 'usable' : 'retry',
    warnings
  };
}

function nativeRecognitionAvailable() {
  if (globalThis.__LUCKYBEAN_ANDROID__ !== true) return false;
  const bridge = globalThis.LuckyBeanRecognitionBridge || globalThis.LuckyBeanNative;
  return typeof bridge?.recognizeCoffeeBag === 'function' || typeof globalThis.LuckyBeanNative?.recognizeImage === 'function';
}

function nativeSource(file, warning = 'Android 原生 OCR 直接读取原始照片；跳过 WebView 解码、像素扫描与 JPEG 重编码') {
  return {
    blob: file,
    originalName: file.name || 'coffee-bag-image',
    originalSize: file.size || 0,
    width: 0,
    height: 0,
    processedWidth: 0,
    processedHeight: 0,
    metrics: null,
    score: 75,
    status: 'usable',
    nativeSource: true,
    warnings: [warning]
  };
}

function androidNativeFallback(file, error) {
  if (!globalThis.__LUCKYBEAN_ANDROID__) throw error;
  return nativeSource(file, 'WebView图片预处理不可用；识别时由 Android 直接读取原始照片');
}

export async function preparePackageImage(file, { maxEdge = DEFAULT_MAX_EDGE } = {}) {
  if (!(file instanceof Blob)) throw new TypeError('需要有效的图片文件');

  // Native Android recognition owns decoding and orientation. Re-decoding a
  // 12–50 MP camera image in WebView, scanning a 420 px quality canvas and then
  // encoding another JPEG adds latency and memory pressure without improving
  // the bytes consumed by the native recognizer. Preserve the source Blob/URI
  // contract and let the native bridge read the original image once.
  if (nativeRecognitionAvailable()) return nativeSource(file);

  const effectiveEdge = memoryAwareMaxEdge(maxEdge);
  let decoded;
  try {
    decoded = await decodeImage(file, effectiveEdge);
  } catch (error) {
    return androidNativeFallback(file, error);
  }
  const image = decoded.image;
  const actual = dimensions(image);
  const width = Number(decoded.originalWidth || actual.width || 0);
  const height = Number(decoded.originalHeight || actual.height || 0);
  if (!actual.width || !actual.height || !width || !height) {
    if (typeof image.close === 'function') image.close();
    return androidNativeFallback(file, new Error('图片尺寸无效'));
  }

  let sampleCanvas;
  let outputCanvas;
  try {
    const sampleScale = Math.min(1, SAMPLE_EDGE / Math.max(actual.width, actual.height));
    sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = Math.max(1, Math.round(actual.width * sampleScale));
    sampleCanvas.height = Math.max(1, Math.round(actual.height * sampleScale));
    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
    sampleContext.drawImage(image, 0, 0, sampleCanvas.width, sampleCanvas.height);
    const metrics = analysePixels(sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height));
    const quality = scoreQuality(metrics, width, height);
    releaseCanvas(sampleCanvas);
    sampleCanvas = null;

    // `image` is already decoder-bounded when the source dimensions exceed the
    // safe OCR edge. The output canvas therefore never receives the full camera
    // raster and only performs the final deterministic JPEG encode.
    const outputScale = Math.min(1, effectiveEdge / Math.max(actual.width, actual.height));
    outputCanvas = document.createElement('canvas');
    outputCanvas.width = Math.max(1, Math.round(actual.width * outputScale));
    outputCanvas.height = Math.max(1, Math.round(actual.height * outputScale));
    const processedWidth = outputCanvas.width;
    const processedHeight = outputCanvas.height;
    const outputContext = outputCanvas.getContext('2d');
    outputContext.drawImage(image, 0, 0, processedWidth, processedHeight);
    const blob = await canvasBlob(outputCanvas);

    return {
      blob,
      originalName: file.name || 'coffee-bag.jpg',
      originalSize: file.size || 0,
      width,
      height,
      processedWidth,
      processedHeight,
      metrics,
      nativeSource: false,
      decodePreScaled:Boolean(decoded.decodePreScaled),
      encodedFormat:decoded.encodedFormat || '',
      ...quality
    };
  } finally {
    releaseCanvas(sampleCanvas);
    releaseCanvas(outputCanvas);
    if (typeof image.close === 'function') image.close();
  }
}
