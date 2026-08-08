export const RECOGNITION_DOCUMENT_SCHEMA = 'recognition-document/1.0';

const ROLE_LABELS = Object.freeze({
  front: '正面主体',
  back: '背面参数',
  side: '侧面补充',
  date: '日期标签',
  text: '文字输入'
});

function cleanText(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function normalizePolygon(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const points = value.map(point => Array.isArray(point)
      ? { x: Number(point[0]), y: Number(point[1]) }
      : { x: Number(point?.x), y: Number(point?.y) })
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    return points.length >= 2 ? points : null;
  }
  const x = Number(value.x ?? value.left);
  const y = Number(value.y ?? value.top);
  const width = Number(value.width ?? (Number(value.right) - x));
  const height = Number(value.height ?? (Number(value.bottom) - y));
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

function boundedConfidence(value, fallback = 0.75) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

export function createRecognitionDocument({ images = [], blocks = [], engine = 'unknown', fullText = '', createdAt = new Date().toISOString() } = {}) {
  const imageMap = new Map(images.map((image, index) => {
    const id = String(image?.id || `image-${index + 1}`);
    const role = String(image?.role || 'side');
    return [id, { id, role, roleLabel: String(image?.roleLabel || ROLE_LABELS[role] || role), order: index }];
  }));
  const normalizedBlocks = blocks.map((block, index) => {
    const imageId = String(block?.imageId || images[0]?.id || 'text-1');
    const image = imageMap.get(imageId) || { id: imageId, role: String(block?.imageRole || 'text'), roleLabel: ROLE_LABELS.text, order: imageMap.size };
    if (!imageMap.has(imageId)) imageMap.set(imageId, image);
    return {
      id: String(block?.id || `${imageId}:block-${index + 1}`),
      imageId,
      imageRole: image.role,
      order: Number.isFinite(Number(block?.order)) ? Number(block.order) : index,
      text: cleanText(block?.text ?? block?.rawValue ?? block?.value),
      confidence: boundedConfidence(block?.confidence ?? block?.score),
      polygon: normalizePolygon(block?.polygon ?? block?.corners ?? block?.boundingBox),
      engine: String(block?.engine || engine || 'unknown')
    };
  }).filter(block => block.text);
  return {
    schemaVersion: RECOGNITION_DOCUMENT_SCHEMA,
    parserVersion: '1.23D-recognition-contract.2',
    engine: String(engine || 'unknown'),
    createdAt,
    images: [...imageMap.values()].sort((a, b) => a.order - b.order),
    blocks: normalizedBlocks,
    fullText: String(fullText || normalizedBlocks.map(block => block.text).join('\n'))
  };
}

export function recognitionDocumentFromText(text) {
  const source = String(text || '').replace(/\r/g, '');
  const blocks = source.split(/\n+/).map((line, index) => ({
    id: `text-1:block-${index + 1}`,
    imageId: 'text-1',
    imageRole: 'text',
    order: index,
    text: line,
    confidence: 1
  }));
  return createRecognitionDocument({ images: [{ id: 'text-1', role: 'text', roleLabel: '文字输入' }], blocks, engine: 'manual-text', fullText: source });
}
