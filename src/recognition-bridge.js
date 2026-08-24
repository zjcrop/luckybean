export class RecognitionUnavailableError extends Error {
  constructor(message = '当前设备尚未安装豆袋文字识别引擎') {
    super(message);
    this.name = 'RecognitionUnavailableError';
  }
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeBlock(block, imageId, engine, imageRole = '') {
  const text = cleanText(block?.text ?? block?.rawValue ?? block?.value);
  if (!text) return null;
  const box = block?.polygon || block?.corners || block?.boundingBox || null;
  const confidence = Number(block?.confidence ?? block?.score ?? 0.75);
  return {
    text,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.75,
    polygon: box,
    imageId,
    imageRole,
    engine
  };
}

function deduplicateBlocks(blocks) {
  const map = new Map();
  for (const block of blocks) {
    const polygonKey = Array.isArray(block.polygon) ? JSON.stringify(block.polygon) : '';
    const key = `${block.imageId}|${block.text.toLocaleLowerCase('zh-CN').replace(/[\s·•,，;；:：/_-]+/g, '')}|${polygonKey}`;
    if (!key) continue;
    const current = map.get(key);
    if (!current || block.confidence > current.confidence) map.set(key, block);
  }
  return [...map.values()];
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('图片编码失败'));
    reader.readAsDataURL(blob);
  });
}

async function imagePayloadForNative(image) {
  const nativeSource = image?.nativeSource === true;
  return {
    id: image.id,
    role: image.role,
    mimeType: image.blob?.type || 'image/jpeg',
    nativeSource,
    dataUrl: nativeSource ? '' : await blobToDataUrl(image.blob)
  };
}

async function nativeRecognize(images, options) {
  const bridge = globalThis.LuckyBeanRecognitionBridge || globalThis.LuckyBeanNative;
  if (typeof bridge?.recognizeCoffeeBag !== 'function') return null;
  const payloadImages = [];
  for (const image of images) payloadImages.push(await imagePayloadForNative(image));
  const result = await bridge.recognizeCoffeeBag({ images:payloadImages, locale:options.locale || 'zh-CN' });
  return { ...result, engine:result?.engine || 'native-ppocr' };
}

async function webProviderRecognize(images, options) {
  const provider = globalThis.LuckyBeanPaddleOCR || globalThis.LuckyBeanWebOCR;
  if (typeof provider?.recognizeCoffeeBag === 'function') {
    const result = await provider.recognizeCoffeeBag(images, options);
    return { ...result, engine:result?.engine || 'web-ppocr' };
  }
  if (typeof provider?.recognize === 'function') {
    const results = [];
    for (const image of images) {
      const value = await provider.recognize(image.blob, options);
      results.push({ imageId:image.id, value });
    }
    return { engine:'web-ppocr', results };
  }
  return null;
}

async function textDetectorRecognize(images) {
  if (typeof globalThis.TextDetector !== 'function' || typeof globalThis.createImageBitmap !== 'function') return null;
  const detector = new TextDetector();
  const results = [];
  for (const image of images) {
    const bitmap = await createImageBitmap(image.blob);
    try { results.push({ imageId:image.id, value:await detector.detect(bitmap) }); }
    finally { bitmap.close?.(); }
  }
  return { engine:'browser-text-detector', results };
}

function collectBlocks(result, images) {
  const engine = result?.engine || 'unknown';
  const blocks = [];
  const roleByImage = new Map(images.map(image => [image.id, image.role || 'side']));
  if (Array.isArray(result?.blocks)) {
    for (const block of result.blocks) {
      const imageId = block.imageId || images[0]?.id || '';
      const normalized = normalizeBlock(block, imageId, engine, block.imageRole || roleByImage.get(imageId) || 'side');
      if (normalized) blocks.push(normalized);
    }
  }
  for (const item of result?.results || []) {
    const rawBlocks = Array.isArray(item?.value) ? item.value : item?.value?.blocks || item?.value?.results || [];
    for (const block of rawBlocks) {
      const normalized = normalizeBlock(block, item.imageId, engine, roleByImage.get(item.imageId) || 'side');
      if (normalized) blocks.push(normalized);
    }
  }
  if (!blocks.length && result?.fullText) {
    const imageId = images[0]?.id || '';
    const normalized = normalizeBlock({ text:result.fullText, confidence:result.confidence }, imageId, engine, roleByImage.get(imageId) || 'side');
    if (normalized) blocks.push(normalized);
  }
  return deduplicateBlocks(blocks);
}

export function getRecognitionCapabilities() {
  const nativeBridge = globalThis.LuckyBeanRecognitionBridge || globalThis.LuckyBeanNative;
  return {
    native:typeof nativeBridge?.recognizeCoffeeBag === 'function',
    webPaddle:Boolean(globalThis.LuckyBeanPaddleOCR || globalThis.LuckyBeanWebOCR),
    textDetector:typeof globalThis.TextDetector === 'function'
  };
}

async function recognizeSingleImage(image, options) {
  let result = await nativeRecognize([image], options);
  if (!result) result = await webProviderRecognize([image], options);
  if (!result) result = await textDetectorRecognize([image]);
  if (!result) throw new RecognitionUnavailableError();
  return result;
}

export async function recognizeCoffeeBag(images, options = {}) {
  if (!Array.isArray(images) || !images.length) throw new Error('请先添加豆袋照片');
  const allBlocks = [];
  const perImage = [];
  let engine = '';
  const total = images.length;

  for (let index=0; index<images.length; index+=1) {
    const image = images[index];
    const order = index + 1;
    const taskId = `IMG-${String(order).padStart(3,'0')}`;
    options.onProgress?.({ taskId, order, total, imageId:image.id, status:'processing' });
    try {
      const result = await recognizeSingleImage(image, options);
      engine ||= result.engine || 'OCR';
      const blocks = collectBlocks(result, [image]);
      allBlocks.push(...blocks);
      perImage.push({ taskId, order, imageId:image.id, engine:result.engine || engine, blocks, status:'completed' });
      options.onProgress?.({ taskId, order, total, imageId:image.id, status:'completed' });
    } catch (error) {
      perImage.push({ taskId, order, imageId:image.id, status:'failed', error:String(error?.message || error) });
      options.onProgress?.({ taskId, order, total, imageId:image.id, status:'failed', error:String(error?.message || error) });
      throw error;
    }
  }

  const blocks = deduplicateBlocks(allBlocks);
  const groupedText = images.map(image => {
    const text = blocks.filter(block => block.imageId === image.id).map(block => block.text).join('\n');
    return text ? `【${image.roleLabel || image.role || '豆袋照片'}】\n${text}` : '';
  }).filter(Boolean);
  const fullText = groupedText.join('\n\n') || blocks.map(block => block.text).join('\n');
  return { engine:engine || 'OCR', blocks, fullText, results:perImage, serial:true, queueConcurrency:1 };
}
