import { preparePackageImage } from './image-quality.js';

export const ADAPTIVE_OCR_IMAGE_POLICY = 'adaptive-compressed-source/1.0';
export const PACKAGE_OCR_FAST_EDGE = 1600;
export const PACKAGE_OCR_DETAIL_EDGE = 2200;

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
  const score = average * 2.2 + Math.min(items.length, 8) * 0.11 + Math.min(chars, 120) / 120 * 0.85 + Math.min(high, 5) * 0.08;
  return { count:items.length, chars, average, high, score };
}

function needsDetail(blocks) {
  const stats = blockStats(blocks);
  return stats.count < 3 || stats.chars < 20 || stats.average < 0.68 || stats.high < 2;
}

function materiallyBetter(detailBlocks, fastBlocks) {
  const detail = blockStats(detailBlocks);
  const fast = blockStats(fastBlocks);
  if (!fast.count && detail.count) return true;
  if (detail.count >= fast.count + 2 && detail.average >= fast.average - 0.04) return true;
  if (detail.chars >= fast.chars + 12 && detail.average >= fast.average - 0.03) return true;
  return detail.score >= fast.score + 0.12;
}

function fullTextForImages(images, blocks) {
  return images.map(image => blocksForImage({ blocks }, image.id).map(block => String(block.text || '').trim()).filter(Boolean).join('\n')).filter(Boolean).join('\n\n');
}

function canUseCompressedSource(image) {
  if (!image || image.nativeSource) return false;
  if (!(image.sourceBlob instanceof Blob) || image.sourceBlob.size <= 0) return false;
  const sourceEdge = Math.max(Number(image.sourceWidth || image.width || 0), Number(image.sourceHeight || image.height || 0));
  const fastEdge = Math.max(Number(image.processedWidth || 0), Number(image.processedHeight || 0));
  return !sourceEdge || !fastEdge || sourceEdge > fastEdge * 1.08;
}

async function recognizeOneDetail(base, image, index, total) {
  emit(`第一遍文字证据不足，正在从压缩原图生成高细节识别版本 ${index + 1}/${total}`, 91 + Math.round(index / Math.max(1, total) * 4));
  const prepared = await preparePackageImage(image.sourceBlob, { maxEdge:PACKAGE_OCR_DETAIL_EDGE });
  const detailEdge = Math.max(Number(prepared.processedWidth || 0), Number(prepared.processedHeight || 0));
  const fastEdge = Math.max(Number(image.processedWidth || 0), Number(image.processedHeight || 0));
  if (detailEdge && fastEdge && detailEdge <= fastEdge * 1.05) return null;
  const detailImage = {
    ...image,
    blob:prepared.blob,
    processedWidth:prepared.processedWidth,
    processedHeight:prepared.processedHeight,
    sourceBlob:null
  };
  const result = await base.recognizeCoffeeBag([detailImage]);
  return { result, prepared };
}

async function adaptiveRecognize(base, images, options = {}) {
  const list = Array.isArray(images) ? images : [];
  let first;
  try {
    first = await base.recognizeCoffeeBag(list, options);
  } catch (error) {
    const message = String(error?.message || error || '');
    if (!/没有得到可信文字/u.test(message) || !list.some(canUseCompressedSource)) throw error;
    emit('第一遍未得到可信文字，正在从压缩原图执行一次高细节恢复识别', 88);
    const detailImages = [];
    for (const image of list) {
      if (!canUseCompressedSource(image)) { detailImages.push(image); continue; }
      const prepared = await preparePackageImage(image.sourceBlob, { maxEdge:PACKAGE_OCR_DETAIL_EDGE });
      detailImages.push({ ...image, blob:prepared.blob, processedWidth:prepared.processedWidth, processedHeight:prepared.processedHeight, sourceBlob:null });
    }
    const recovered = await base.recognizeCoffeeBag(detailImages, options);
    emit('高细节恢复识别完成', 96);
    return { ...recovered, adaptiveImagePolicy:ADAPTIVE_OCR_IMAGE_POLICY, adaptiveDetail:{ attempted:list.length, accepted:list.map(image => image.id), recoveredFromEmpty:true } };
  }

  const replaceByImage = new Map();
  const attempted = [];
  const accepted = [];
  const eligible = list.filter(image => canUseCompressedSource(image) && needsDetail(blocksForImage(first, image.id)));
  for (let index = 0; index < eligible.length; index += 1) {
    const image = eligible[index];
    attempted.push(image.id);
    try {
      const detail = await recognizeOneDetail(base, image, index, eligible.length);
      if (!detail) continue;
      const fastBlocks = blocksForImage(first, image.id);
      const detailBlocks = blocksForImage(detail.result, image.id);
      if (materiallyBetter(detailBlocks, fastBlocks)) {
        replaceByImage.set(String(image.id), detailBlocks);
        accepted.push(image.id);
      }
    } catch (error) {
      console.warn('[LuckyBean] adaptive OCR detail pass skipped', image.id, error);
    }
  }

  if (!attempted.length) return { ...first, adaptiveImagePolicy:ADAPTIVE_OCR_IMAGE_POLICY, adaptiveDetail:{ attempted:[], accepted:[] } };

  const mergedBlocks = [];
  for (const image of list) {
    const replacement = replaceByImage.get(String(image.id));
    mergedBlocks.push(...(replacement || blocksForImage(first, image.id)));
  }
  emit(accepted.length ? '高细节复核完成，已采用更清晰的文字结果' : '高细节复核完成，保留第一遍结果', 96);
  return {
    ...first,
    blocks:mergedBlocks,
    fullText:fullTextForImages(list, mergedBlocks),
    engine:`${first.engine || 'PP-OCRv5'}${accepted.length ? '-adaptive-detail' : '-adaptive-fast'}`,
    adaptiveImagePolicy:ADAPTIVE_OCR_IMAGE_POLICY,
    adaptiveDetail:{ attempted, accepted }
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
