export const PACKAGE_OCR_MAX_EDGE = 2200;
export const PACKAGE_OCR_JPEG_QUALITY = 0.94;
const DEFAULT_MAX_EDGE = PACKAGE_OCR_MAX_EDGE;
const SAMPLE_EDGE = 420;

function canvasBlob(canvas, type = 'image/jpeg', quality = PACKAGE_OCR_JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片压缩失败')), type, quality);
  });
}

async function decodeImage(file) {
  if (globalThis.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* fallback below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('图片无法读取'));
      image.src = url;
    });
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

  let image;
  try {
    image = await decodeImage(file);
  } catch (error) {
    return androidNativeFallback(file, error);
  }
  const { width, height } = dimensions(image);
  if (!width || !height) return androidNativeFallback(file, new Error('图片尺寸无效'));

  const sampleScale = Math.min(1, SAMPLE_EDGE / Math.max(width, height));
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = Math.max(1, Math.round(width * sampleScale));
  sampleCanvas.height = Math.max(1, Math.round(height * sampleScale));
  const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
  sampleContext.drawImage(image, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const metrics = analysePixels(sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height));
  const quality = scoreQuality(metrics, width, height);

  // Preserve enough package detail for small roast/date/origin text. The OCR
  // provider itself caps detection at 2200 px on normal-memory browsers, so a
  // 1600 px source was discarding detail before PP-OCR could inspect it.
  const outputScale = Math.min(1, maxEdge / Math.max(width, height));
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = Math.max(1, Math.round(width * outputScale));
  outputCanvas.height = Math.max(1, Math.round(height * outputScale));
  const outputContext = outputCanvas.getContext('2d');
  outputContext.drawImage(image, 0, 0, outputCanvas.width, outputCanvas.height);
  const blob = await canvasBlob(outputCanvas);

  if (typeof image.close === 'function') image.close();
  return {
    blob,
    originalName: file.name || 'coffee-bag.jpg',
    originalSize: file.size || 0,
    width,
    height,
    processedWidth: outputCanvas.width,
    processedHeight: outputCanvas.height,
    metrics,
    nativeSource: false,
    ...quality
  };
}