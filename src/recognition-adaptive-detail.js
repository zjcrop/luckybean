import { originalCompressedSource } from './image-quality.js';

export const ADAPTIVE_OCR_IMAGE_POLICY = 'label-scale-roi/2.1';
export const PACKAGE_OCR_FAST_EDGE = 2200;
export const PACKAGE_OCR_DETAIL_EDGE = 2200;

const LABEL_AREA_TRIGGER = 0.46;
const LABEL_SPAN_TRIGGER = 0.70;
const SMALL_TEXT_HEIGHT_TRIGGER = 0.038;
const MIN_ROI_BLOCKS = 2;
const ROI_PADDING = 0.075;

function emit(status, progress) {
  const detail = { status:String(status || ''), progress:Math.max(0, Math.min(100, Number(progress) || 0)) };
  globalThis.dispatchEvent(new CustomEvent('luckybean:ocr-progress', { detail }));
  globalThis.dispatchEvent(new CustomEvent('coffee-foundation:ocr-progress', { detail }));
}

function blocksForImage(result, imageId) {
  return (result?.blocks || []).filter(block => String(block?.imageId || '') === String(imageId || ''));
}

function textChars(blocks) {
  return blocks.reduce((sum, block) => sum + [...String(block?.text || '').replace(/\s+/g, '')].length, 0);
}

function blockStats(blocks) {
  const items = Array.isArray(blocks) ? blocks.filter(Boolean) : [];
  if (!items.length) return { count:0, chars:0, average:0, high:0, score:0 };
  const chars = textChars(items);
  const average = items.reduce((sum, block) => sum + Math.max(0, Math.min(1, Number(block?.confidence) || 0)), 0) / items.length;
  const high = items.filter(block => Number(block?.confidence || 0) >= 0.72).length;
  const score = average * 2.2 + Math.min(items.length, 10) * 0.10 + Math.min(chars, 140) / 140 * 0.9 + Math.min(high, 6) * 0.08;
  return { count:items.length, chars, average, high, score };
}

function materiallyBetter(detailBlocks, baseBlocks) {
  const detail = blockStats(detailBlocks);
  const base = blockStats(baseBlocks);
  if (!base.count && detail.count) return true;
  if (detail.count >= base.count + 2 && detail.average >= base.average - 0.05) return true;
  if (detail.chars >= base.chars + 10 && detail.average >= base.average - 0.04) return true;
  if (detail.average >= base.average + 0.08 && detail.chars >= Math.max(8, base.chars - 3)) return true;
  return detail.score >= base.score + 0.10;
}

function pointXY(point) {
  if (Array.isArray(point)) return { x:Number(point[0]), y:Number(point[1]) };
  if (point && typeof point === 'object') return { x:Number(point.x ?? point[0]), y:Number(point.y ?? point[1]) };
  return { x:NaN, y:NaN };
}

function imageDimensions(image) {
  return {
    width:Number(image?.processedWidth || image?.width || 0),
    height:Number(image?.processedHeight || image?.height || 0)
  };
}

function labelGeometry(blocks, image) {
  const { width, height } = imageDimensions(image);
  if (!width || !height || blocks.length < MIN_ROI_BLOCKS) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const heights = [];
  let validBlocks = 0;
  for (const block of blocks) {
    const points = Array.isArray(block?.polygon) ? block.polygon.map(pointXY).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y)) : [];
    if (points.length < 2) continue;
    const xs = points.map(point => point.x), ys = points.map(point => point.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    if (right <= left || bottom <= top) continue;
    validBlocks += 1;
    minX = Math.min(minX, left); minY = Math.min(minY, top); maxX = Math.max(maxX, right); maxY = Math.max(maxY, bottom);
    heights.push((bottom - top) / height);
  }
  if (validBlocks < MIN_ROI_BLOCKS || !Number.isFinite(minX + minY + maxX + maxY)) return null;
  const raw = {
    left:Math.max(0, minX / width), top:Math.max(0, minY / height),
    right:Math.min(1, maxX / width), bottom:Math.min(1, maxY / height)
  };
  const spanW = Math.max(0.01, raw.right - raw.left), spanH = Math.max(0.01, raw.bottom - raw.top);
  const sortedHeights = heights.sort((a,b) => a - b);
  const medianHeight = sortedHeights[Math.floor(sortedHeights.length / 2)] || 1;
  const area = spanW * spanH;
  const padX = Math.min(0.16, Math.max(ROI_PADDING, spanW * 0.12));
  const padY = Math.min(0.16, Math.max(ROI_PADDING, spanH * 0.14));
  const region = {
    left:Math.max(0, raw.left - padX), top:Math.max(0, raw.top - padY),
    right:Math.min(1, raw.right + padX), bottom:Math.min(1, raw.bottom + padY)
  };
  const regionArea = (region.right - region.left) * (region.bottom - region.top);
  const smallLabel = area <= LABEL_AREA_TRIGGER
    || (Math.max(spanW, spanH) <= LABEL_SPAN_TRIGGER && medianHeight <= SMALL_TEXT_HEIGHT_TRIGGER);
  return { region, area, regionArea, spanW, spanH, medianHeight, validBlocks, smallLabel };
}

function needsFocusedRetry(blocks, geometry) {
  if (!geometry?.smallLabel || geometry.regionArea >= 0.78) return false;
  const stats = blockStats(blocks);
  if (stats.count < 3 || stats.chars < 18 || stats.average < 0.68) return true;
  return geometry.medianHeight <= SMALL_TEXT_HEIGHT_TRIGGER;
}

function fullTextForImages(images, blocks) {
  return images.map(image => blocksForImage({ blocks }, image.id).map(block => String(block.text || '').trim()).filter(Boolean).join('\n')).filter(Boolean).join('\n\n');
}

async function adaptiveRecognize(base, images, options = {}) {
  const sourceImages = Array.isArray(images) ? images : [];
  // Precision-first: never create a 1600px second-generation JPEG before OCR.
  // The package preparation layer has already performed one bounded decode. Run
  // the normal 2200px (or device-safe low-memory) image exactly once first.
  const first = await base.recognizeCoffeeBag(sourceImages, options);
  if (typeof base.recognizeRegion !== 'function') {
    return { ...first, adaptiveImagePolicy:ADAPTIVE_OCR_IMAGE_POLICY, labelScale:{ attempted:[], accepted:[] } };
  }

  const replaceByImage = new Map();
  const attempted = [];
  const accepted = [];
  const diagnostics = [];

  for (let index = 0; index < sourceImages.length; index += 1) {
    const image = sourceImages[index];
    if (image?.nativeSource || !(image?.blob instanceof Blob) || !image.blob.size) continue;
    const baseBlocks = blocksForImage(first, image.id);
    const geometry = labelGeometry(baseBlocks, image);
    if (!needsFocusedRetry(baseBlocks, geometry)) {
      if (geometry) diagnostics.push({ imageId:image.id, attempted:false, area:geometry.area, medianTextHeight:geometry.medianHeight });
      continue;
    }
    const originalSource = originalCompressedSource(image.blob);
    const roiSource = originalSource instanceof Blob && originalSource.size ? originalSource : image.blob;
    attempted.push(image.id);
    diagnostics.push({ imageId:image.id, attempted:true, area:geometry.area, medianTextHeight:geometry.medianHeight, region:geometry.region, source:roiSource === image.blob ? 'prepared-bounded' : 'original-compressed' });
    emit(`标签在整图中占比较小，正在从原压缩图放大标签区域复核 ${attempted.length}`, 91 + Math.min(4, attempted.length));
    try {
      const detailResult = await base.recognizeRegion(roiSource, geometry.region, { ...options, imageId:image.id, maxEdge:PACKAGE_OCR_DETAIL_EDGE });
      const detailBlocks = blocksForImage(detailResult, image.id);
      if (materiallyBetter(detailBlocks, baseBlocks)) {
        replaceByImage.set(String(image.id), detailBlocks);
        accepted.push(image.id);
      }
    } catch (error) {
      console.warn('[LuckyBean] label-scale ROI retry skipped', image.id, error);
    }
  }

  if (!attempted.length) {
    return { ...first, adaptiveImagePolicy:ADAPTIVE_OCR_IMAGE_POLICY, labelScale:{ attempted:[], accepted:[], diagnostics } };
  }

  const mergedBlocks = [];
  for (const image of sourceImages) {
    const replacement = replaceByImage.get(String(image.id));
    mergedBlocks.push(...(replacement || blocksForImage(first, image.id)));
  }
  emit(accepted.length ? '标签局部复核完成，已采用更清晰的识别结果' : '标签局部复核完成，保留原识别结果', 96);
  return {
    ...first,
    blocks:mergedBlocks,
    fullText:fullTextForImages(sourceImages, mergedBlocks),
    engine:`${first.engine || 'PP-OCRv5'}${accepted.length ? '-label-roi' : '-single-pass'}`,
    adaptiveImagePolicy:ADAPTIVE_OCR_IMAGE_POLICY,
    labelScale:{ attempted, accepted, diagnostics }
  };
}

export function installAdaptivePaddleOcrProvider() {
  const base = globalThis.LuckyBeanPaddleOCR;
  if (!base || typeof base.recognizeCoffeeBag !== 'function') return false;
  if (base.adaptiveImagePolicy === ADAPTIVE_OCR_IMAGE_POLICY) return true;
  const descriptors = Object.getOwnPropertyDescriptors(base);
  descriptors.recognizeCoffeeBag = {
    configurable:false,
    enumerable:true,
    writable:false,
    value:(images, options = {}) => adaptiveRecognize(base, images, options)
  };
  descriptors.adaptiveImagePolicy = {
    configurable:false,
    enumerable:true,
    writable:false,
    value:ADAPTIVE_OCR_IMAGE_POLICY
  };
  descriptors.fastImageEdge = { configurable:false, enumerable:true, writable:false, value:PACKAGE_OCR_FAST_EDGE };
  descriptors.detailImageEdge = { configurable:false, enumerable:true, writable:false, value:PACKAGE_OCR_DETAIL_EDGE };
  const wrapped = Object.freeze(Object.create(Object.getPrototypeOf(base), descriptors));
  globalThis.LuckyBeanPaddleOCR = wrapped;
  if (globalThis.CoffeeFoundationPaddleOCR === base) globalThis.CoffeeFoundationPaddleOCR = wrapped;
  document.documentElement.dataset.webOcrAdaptive = ADAPTIVE_OCR_IMAGE_POLICY;
  return true;
}

if (!installAdaptivePaddleOcrProvider()) {
  document.addEventListener('luckybean:runtime-features-ready', () => installAdaptivePaddleOcrProvider(), { once:true });
}
