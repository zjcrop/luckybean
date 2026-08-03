const BASE_PROVIDER = globalThis.LuckyBeanWebOCR;
const OCR_REVISION = '099d-cn-priority-multipass';
const DOMAIN_REPLACEMENTS = new Map([
  ['水冼', '水洗'], ['水先', '水洗'], ['日哂', '日晒'], ['曰晒', '日晒'],
  ['处埋', '处理'], ['処理', '处理'], ['蜜処理', '蜜处理'], ['厌氣', '厌氧'],
  ['瑰厦', '瑰夏'], ['瑰下', '瑰夏'], ['海拨', '海拔'], ['烘焙曰期', '烘焙日期'],
  ['埃塞俄比亞', '埃塞俄比亚'], ['哥倫比亞', '哥伦比亚'], ['發酵', '发酵']
]);

function clean(value) {
  let text = String(value || '').normalize('NFKC');
  for (const [from, to] of DOMAIN_REPLACEMENTS) text = text.replaceAll(from, to);
  return text
    .replace(/([\u3400-\u9FFF])\s+(?=[\u3400-\u9FFF])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function quality(text, confidence = 0) {
  const value = clean(text);
  const cjk = (value.match(/[\u3400-\u9FFF]/g) || []).length;
  const latin = (value.match(/[A-Za-z0-9]/g) || []).length;
  const domain = (value.match(/水洗|日晒|蜜处理|厌氧|发酵|瑰夏|波旁|铁皮卡|卡杜艾|海拔|产区|庄园|处理法|烘焙日期|风味/g) || []).length;
  const noise = (value.match(/[�□■]/g) || []).length;
  return cjk * 3.8 + latin * 0.45 + domain * 8 + Number(confidence || 0) * 0.1 - noise * 8;
}

function textFromResult(result, imageId = '') {
  const item = (result?.results || []).find(entry => entry.imageId === imageId);
  const blocks = Array.isArray(item?.value) ? item.value : item?.value?.blocks || [];
  const local = blocks.map(block => block?.text || block?.rawValue || '').filter(Boolean).join('\n');
  return clean(local || result?.fullText || '');
}

function confidenceFromResult(result, imageId = '') {
  const item = (result?.results || []).find(entry => entry.imageId === imageId);
  const blocks = Array.isArray(item?.value) ? item.value : item?.value?.blocks || [];
  const values = blocks.map(block => Number(block?.confidence || 0)).filter(Number.isFinite);
  if (!values.length) return Number(result?.confidence || 0);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return average <= 1 ? average * 100 : average;
}

function lineKey(line) {
  return line.toLocaleLowerCase('zh-CN').replace(/[\s，,。.;；:：\-_·•]/g, '');
}

function mergeTexts(values) {
  const candidates = [];
  for (const value of values) {
    const text = clean(value.text);
    for (const line of text.split(/\n+/)) {
      const trimmed = line.trim();
      const key = lineKey(trimmed);
      if (!key || key.length < 2) continue;
      candidates.push({ line: trimmed, key, score: quality(trimmed, value.confidence) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const selected = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.key)) continue;
    if ([...seen].some(key => key.includes(candidate.key) && candidate.key.length >= 4)) continue;
    seen.add(candidate.key);
    selected.push(candidate.line);
  }
  return selected.join('\n');
}

async function decode(blob) {
  if (globalThis.createImageBitmap) return createImageBitmap(blob, { imageOrientation: 'from-image' });
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('旋转识别图片读取失败'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('旋转识别图片生成失败')), 'image/png', 0.96));
}

async function rotateBlob(blob, degrees) {
  const image = await decode(blob);
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  const quarter = Math.abs(degrees) % 180 === 90;
  const canvas = document.createElement('canvas');
  canvas.width = quarter ? height : width;
  canvas.height = quarter ? width : height;
  const context = canvas.getContext('2d');
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(degrees * Math.PI / 180);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  image.close?.();
  return canvasBlob(canvas);
}

function emit(status, progress) {
  globalThis.dispatchEvent(new CustomEvent('luckybean:ocr-progress', { detail: { status, progress } }));
}

async function recognizePass(images, languages, label) {
  emit(label, 0.02);
  return BASE_PROVIDER.recognizeCoffeeBag(images, { locale: 'zh-CN', languages });
}

async function enhancedRecognize(images, options = {}) {
  if (!BASE_PROVIDER?.recognizeCoffeeBag) throw new Error('基础 OCR 引擎未加载');
  const mixed = await recognizePass(images, ['chi_sim', 'eng'], '中英文混合识别');
  const mixedScores = images.map(image => quality(textFromResult(mixed, image.id), confidenceFromResult(mixed, image.id)));
  const needChinesePass = mixedScores.some(score => score < 42) || images.some(image => (textFromResult(mixed, image.id).match(/[\u3400-\u9FFF]/g) || []).length < 4);
  const chinese = needChinesePass
    ? await recognizePass(images, ['chi_sim'], '中文优先复核')
    : null;

  const perImage = new Map();
  for (const image of images) {
    const values = [{ text: textFromResult(mixed, image.id), confidence: confidenceFromResult(mixed, image.id), source: 'mixed' }];
    if (chinese) values.push({ text: textFromResult(chinese, image.id), confidence: confidenceFromResult(chinese, image.id), source: 'cn' });
    perImage.set(image.id, values);
  }

  const weakImages = images.filter(image => {
    const values = perImage.get(image.id) || [];
    return Math.max(...values.map(value => quality(value.text, value.confidence)), 0) < 52;
  });
  if (weakImages.length) {
    emit('文字方向复核', 0.05);
    for (const angle of [90, -90]) {
      const rotated = [];
      for (const image of weakImages) rotated.push({ ...image, blob: await rotateBlob(image.blob, angle) });
      const result = await recognizePass(rotated, ['chi_sim'], angle > 0 ? '顺时针方向复核' : '逆时针方向复核');
      for (const image of weakImages) {
        perImage.get(image.id).push({
          text: textFromResult(result, image.id),
          confidence: confidenceFromResult(result, image.id),
          source: `rotate-${angle}`
        });
      }
    }
  }

  const results = images.map(image => {
    const values = perImage.get(image.id) || [];
    const text = mergeTexts(values);
    const best = values.sort((a, b) => quality(b.text, b.confidence) - quality(a.text, a.confidence))[0] || { confidence: 0 };
    return {
      imageId: image.id,
      value: { blocks: text ? [{ text, confidence: Math.max(0, Math.min(1, Number(best.confidence || 0) / 100)) }] : [] }
    };
  });
  const fullText = results.map(item => item.value.blocks[0]?.text || '').filter(Boolean).join('\n\n');
  emit('中文优先多通道识别完成', 1);
  return { engine: `tesseract.js-${OCR_REVISION}`, results, fullText };
}

if (BASE_PROVIDER?.recognizeCoffeeBag) {
  BASE_PROVIDER.baseRecognizeCoffeeBag = BASE_PROVIDER.recognizeCoffeeBag.bind(BASE_PROVIDER);
  BASE_PROVIDER.recognizeCoffeeBag = enhancedRecognize;
  BASE_PROVIDER.engine = `tesseract.js-${OCR_REVISION}`;
  BASE_PROVIDER.pipeline = {
    revision: OCR_REVISION,
    strategy: 'mixed-pass + conditional Chinese-only + conditional ±90° orientation + conservative coffee-domain correction',
    limitation: 'generic Tesseract chi_sim model; not a fine-tuned coffee-package OCR model'
  };
  document.documentElement.dataset.webOcr = OCR_REVISION;
}

globalThis.LuckyBeanV099dOCR = { quality, mergeTexts, clean, rotateBlob };
