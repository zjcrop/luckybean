const APPLE_MOBILE = /iPhone|iPad|iPod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
const LOW_MEMORY = APPLE_MOBILE || Number(navigator.deviceMemory || 4) <= 4;
const DEFAULT_MAX_EDGE = LOW_MEMORY ? 1280 : 1600;
const SAMPLE_EDGE = LOW_MEMORY ? 320 : 420;

function canvasBlob(canvas, type = 'image/jpeg', quality = 0.88) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片压缩失败')), type, quality);
  });
}
function releaseCanvas(canvas) {
  if (!canvas) return;
  try { canvas.width = 1; canvas.height = 1; } catch {}
}
async function decodeImage(file) {
  if (globalThis.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { /* fallback below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('图片无法读取'));
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}
function dimensions(image) {
  return { width: image.width || image.naturalWidth || 0, height: image.height || image.naturalHeight || 0 };
}
function analysePixels(imageData) {
  const { data, width, height } = imageData;
  const pixelCount = width * height;
  let lumaSum = 0, lumaSqSum = 0, highlight = 0, dark = 0, edge = 0, gradientSum = 0;
  const luma = new Float32Array(pixelCount);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    luma[p] = y; lumaSum += y; lumaSqSum += y * y;
    if (r > 246 && g > 246 && b > 246) highlight += 1;
    if (r < 24 && g < 24 && b < 24) dark += 1;
  }
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = y * width + x;
      const gx = Math.abs(luma[p + 1] - luma[p - 1]);
      const gy = Math.abs(luma[p + width] - luma[p - width]);
      const magnitude = gx + gy; gradientSum += magnitude; if (magnitude > 42) edge += 1;
    }
  }
  const meanLuma = lumaSum / pixelCount;
  const varianceLuma = Math.max(0, lumaSqSum / pixelCount - meanLuma * meanLuma);
  const interiorCount = Math.max(1, (width - 2) * (height - 2));
  return { meanLuma, contrast:Math.sqrt(varianceLuma), highlightRatio:highlight / pixelCount, darkRatio:dark / pixelCount, gradientMean:gradientSum / interiorCount, edgeRatio:edge / interiorCount };
}
function scoreQuality(metrics, width, height) {
  let score = 100; const warnings = []; const maxEdge = Math.max(width, height);
  if (maxEdge < 900) { score -= 18; warnings.push('图片分辨率偏低，请靠近包装拍摄'); }
  if (metrics.gradientMean < 13 || metrics.edgeRatio < 0.035) { score -= 28; warnings.push('画面可能模糊，请稳定手机并重新对焦'); }
  if (metrics.highlightRatio > 0.11) { score -= 24; warnings.push('反光面积较大，请轻微转动包装或改变光源角度'); }
  if (metrics.meanLuma < 48 || metrics.darkRatio > 0.42) { score -= 18; warnings.push('画面偏暗，请增加环境光，避免直接闪光'); }
  if (metrics.meanLuma > 218) { score -= 16; warnings.push('画面过曝，请降低曝光或避开强光'); }
  if (metrics.contrast < 28) { score -= 12; warnings.push('文字与背景对比偏低，建议换角度补拍一张'); }
  return { score:Math.max(0, Math.round(score)), status:score >= 78 ? 'good' : score >= 55 ? 'usable' : 'retry', warnings };
}
function androidNativeFallback(file, error) {
  if (!globalThis.__LUCKYBEAN_ANDROID__) throw error;
  return { blob:file, originalName:file.name || 'coffee-bag-image', originalSize:file.size || 0, width:0, height:0, processedWidth:0, processedHeight:0, metrics:null, score:65, status:'usable', nativeSource:true, warnings:['WebView预览不可用；识别时由 Android 直接读取原始照片，不再依赖空 Blob'] };
}
export async function preparePackageImage(file, { maxEdge = DEFAULT_MAX_EDGE } = {}) {
  if (!(file instanceof Blob)) throw new TypeError('需要有效的图片文件');
  let image = null, sampleCanvas = null, outputCanvas = null;
  try {
    try { image = await decodeImage(file); }
    catch (error) { return androidNativeFallback(file, error); }
    const { width, height } = dimensions(image);
    if (!width || !height) return androidNativeFallback(file, new Error('图片尺寸无效'));

    const sampleScale = Math.min(1, SAMPLE_EDGE / Math.max(width, height));
    sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = Math.max(1, Math.round(width * sampleScale));
    sampleCanvas.height = Math.max(1, Math.round(height * sampleScale));
    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently:true });
    sampleContext.drawImage(image, 0, 0, sampleCanvas.width, sampleCanvas.height);
    const metrics = analysePixels(sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height));
    const quality = scoreQuality(metrics, width, height);
    releaseCanvas(sampleCanvas); sampleCanvas = null;

    const boundedMaxEdge = LOW_MEMORY ? Math.min(Number(maxEdge || DEFAULT_MAX_EDGE), 1280) : Number(maxEdge || DEFAULT_MAX_EDGE);
    const outputScale = Math.min(1, boundedMaxEdge / Math.max(width, height));
    outputCanvas = document.createElement('canvas');
    outputCanvas.width = Math.max(1, Math.round(width * outputScale));
    outputCanvas.height = Math.max(1, Math.round(height * outputScale));
    const processedWidth = outputCanvas.width, processedHeight = outputCanvas.height;
    const outputContext = outputCanvas.getContext('2d');
    outputContext.drawImage(image, 0, 0, processedWidth, processedHeight);
    const blob = await canvasBlob(outputCanvas, 'image/jpeg', LOW_MEMORY ? 0.84 : 0.88);
    releaseCanvas(outputCanvas); outputCanvas = null;

    return { blob, originalName:file.name || 'coffee-bag.jpg', originalSize:file.size || 0, width, height, processedWidth, processedHeight, metrics, nativeSource:false, memoryProfile:LOW_MEMORY ? 'bounded-low-memory' : 'standard', ...quality };
  } finally {
    releaseCanvas(sampleCanvas); releaseCanvas(outputCanvas);
    try { if (typeof image?.close === 'function') image.close(); } catch {}
  }
}
