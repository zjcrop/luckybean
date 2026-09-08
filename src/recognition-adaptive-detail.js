import { preparePackageImage } from './image-quality.js';

export const ADAPTIVE_OCR_IMAGE_POLICY = 'adaptive-compressed-source/1.1';
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

function imageEdge(image) {
  return Math.max(Number(image?.processedWidth || image?.width || 0), Number(image?.processedHeight || image?.height || 0));
}

function canFastDownscale(image) {
  return Boolean(image && !image.nativeSource && image.blob instanceof Blob && image.blob.size > 0 && imageEdge(image) > PACKAGE_OCR_FAST_EDGE * 1.05);
}

async function makeFastImage(image, index, total) {
  if (!canFastDownscale(image)) return image;
  emit(`正在从压缩图生成轻量识别版本 ${index + 1}/${total}`, 4 + Math.round(index / Math.max(1, total) * 5));
  const prepared = await preparePackageImage(image.blob, { maxEdge:PACKAGE_OCR_FAST_EDGE });
  return {
    ...image,
    blob:prepared.blob,
    processedWidth:prepared.processedWidth,
    processedHeight:prepared.processedHeight,
    adaptiveDetailBlob:image.blob
  };
}

function detailSource(image) {
  return image?.adaptiveDetailBlob instanceof Blob ? image.adaptiveDetailBlob : null;
}

async function adaptiveRecognize(base, images, options = {}) {
  const original = Array.isArray(images) ? images : [];
  const fastImages = [];
  for (let index = 0; index < original.length; index += 1) fastImages.push(await makeFastImage(original[index], index, original.length));

  let first;
  try {
    first = await base.recognizeCoffeeBag(fastImages, options);
  } catch (error) {
    const message = String(error?.message || error || '');
    const recoverable = /没有得到可信文字/u.test(message) && fastImages.some(image => detailSource(image));
    if (!recoverable) throw error;
    emit('轻量识别未得到可信文字，正在用受控 2200px 压缩图恢复一次', 88);
    const detailImages = fastImages.map(image => detailSource(image) ? { ...image, blob:detailSource(image), adaptiveDetailBlob:null } : image);
    const recovered = await base.recognizeCoffeeBag(detailImages, options);
    emit('高细节恢复识别完成', 96);
    return { ...recovered, adaptiveImagePolicy:ADAPTIVE_OCR_IMAGE_POLICY, adaptiveDetail:{ attempted:detailImages.map(image => image.id), accepted:detailImages.map(image => image.id), recoveredFromEmpty:true } };
  }

  const replaceByImage = new Map();
  const attempted = [];
  const accepted = [];
  const eligible = fastImages.filter(image => detailSource(image) && needsDetail(blocksForImage(first, image.id)));
  for (let index = 0; index < eligible.length; index += 1) {
    const image = eligible[index];
    attempted.push(image.id);
    emit(`第一遍文字证据不足，正在用 2200px 压缩图复核 ${index + 1}/${eligible.length}`, 91 + Math.round(index / Math.max(1, eligible.length) * 4));
    try {
      const detailResult = await base.recognizeCoffeeBag([{ ...image, blob:detailSource(image), adaptiveDetailBlob:null }], options);
      const fastBlocks = blocksForImage(first, image.id);
      const detailBlocks = blocksForImage(detailResult, image.id);
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
  for (const image of fastImages) {
    const replacement = replaceByImage.get(String(image.id));
    mergedBlocks.push(...(replacement || blocksForImage(first, image.id)));
  }
  emit(accepted.length ? '高细节复核完成，已采用更清晰的文字结果' : '高细节复核完成，保留轻量识别结果', 96);
  return {
    ...first,
    blocks:mergedBlocks,
    fullText:fullTextForImages(fastImages, mergedBlocks),
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

if (!installAdaptivePaddleOcrProvider()) {
  document.addEventListener('luckybean:runtime-features-ready', () => installAdaptivePaddleOcrProvider(), { once:true });
}
