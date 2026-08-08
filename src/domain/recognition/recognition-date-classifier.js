import { DEFAULT_LABEL_LEXICON, parseCoffeeDateValue } from '../../codebook.js';
import { recognitionDocumentFromText } from './recognition-document.js';

export const DATE_CLASSIFIER_VERSION = '1.23D-date-fields.2';

const DATE_FIELDS = Object.freeze(['roastDate', 'productionDate', 'packDate', 'bestBefore', 'expiryDate', 'harvest']);
const FIELD_LABEL = Object.freeze({
  roastDate: '烘焙日期', productionDate: '生产日期', packDate: '包装日期',
  bestBefore: '最佳赏味期', expiryDate: '到期日期', harvest: '产季', unknown: '未确定日期'
});

function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function labelPattern(field) {
  const terms = (DEFAULT_LABEL_LEXICON[field] || []).slice().sort((a, b) => b.length - a.length);
  return terms.length ? new RegExp(`(?:^|[^A-Za-z])(?:${terms.map(escapeRegex).join('|')})(?:$|[^A-Za-z])`, 'i') : null;
}

const LABEL_PATTERNS = Object.fromEntries(DATE_FIELDS.map(field => [field, labelPattern(field)]));

function fieldLabels(text) {
  return DATE_FIELDS.filter(field => LABEL_PATTERNS[field]?.test(String(text || '')));
}

function dateSnippets(text) {
  const value = String(text || '').normalize('NFKC');
  const patterns = [
    /(?:20\d{2}|\d{2})年\d{1,2}月\d{1,2}日?/g,
    /(?:20\d{2}|\d{2})[-/.]\d{1,2}[-/.]\d{1,2}/g,
    /\d{2}[-/.]\d{3,4}/g,
    /(?:20\d{2}|\d{2})\d{4}/g,
    /\d{1,2}\s+[A-Za-z]{3,9}\s+(?:20\d{2}|\d{2})/gi,
    /[A-Za-z]{3,9}\s+\d{1,2}\s+(?:20\d{2}|\d{2})/gi,
    /\d{1,2}[-/.]\d{1,2}[-/.](?:20\d{2}|\d{2})/g
  ];
  const found = [];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      if (!found.some(item => item.start === match.index && item.raw === match[0])) found.push({ raw: match[0], start: match.index || 0 });
    }
  }
  return found.sort((a, b) => a.start - b.start || b.raw.length - a.raw.length)
    .filter((item, index, list) => !list.some((other, otherIndex) => otherIndex < index && item.start >= other.start && item.start + item.raw.length <= other.start + other.raw.length));
}

function rect(polygon) {
  if (!Array.isArray(polygon) || !polygon.length) return null;
  const xs = polygon.map(point => Number(point.x)).filter(Number.isFinite);
  const ys = polygon.map(point => Number(point.y)).filter(Number.isFinite);
  if (!xs.length || !ys.length) return null;
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

function spatiallyAdjacent(labelBlock, dateBlock) {
  if (labelBlock.imageId !== dateBlock.imageId) return false;
  const a = rect(labelBlock.polygon), b = rect(dateBlock.polygon);
  if (!a || !b) return Math.abs(Number(labelBlock.order) - Number(dateBlock.order)) <= 1;
  const ah = Math.max(1, a.bottom - a.top), bh = Math.max(1, b.bottom - b.top);
  const verticalOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const sameLine = verticalOverlap / Math.min(ah, bh) >= 0.35 && b.left >= a.left - ah;
  const below = b.top >= a.top && b.top - a.bottom <= Math.max(ah, bh) * 2.2;
  return sameLine || below;
}

function uniqueCandidateKey(block, parsed) {
  return `${block.imageId}|${parsed.normalizedValue || parsed.candidates.join(',')}|${parsed.rawValue}`;
}

export function classifyRecognitionDates(input) {
  const document = typeof input === 'string' ? recognitionDocumentFromText(input) : input;
  const blocks = Array.isArray(document?.blocks) ? document.blocks : [];
  // A label that already owns a date in the same OCR block must not leak into the
  // following block (for example `BEST BEFORE 2026-10-28` followed by `LOT 20260729`).
  // Only label-only blocks participate in cross-block spatial binding.
  const labelBlocks = blocks.map(block => ({ block, fields: fieldLabels(block.text), ownsDate: dateSnippets(block.text).length > 0 }))
    .filter(item => item.fields.length && !item.ownsDate);
  const candidates = [];
  const seen = new Set();

  for (const block of blocks) {
    for (const snippet of dateSnippets(block.text)) {
      const parsed = parseCoffeeDateValue(snippet.raw, { field: 'dateCandidate' });
      if (!parsed.normalizedValue && !parsed.candidates.length) continue;
      const key = uniqueCandidateKey(block, parsed);
      if (seen.has(key)) continue;
      seen.add(key);
      const sameBlockFields = fieldLabels(block.text);
      const nearby = labelBlocks.filter(item => item.block.id !== block.id && spatiallyAdjacent(item.block, block));
      const nearbyFields = [...new Set(nearby.flatMap(item => item.fields))];
      const fields = sameBlockFields.length ? sameBlockFields : nearbyFields;
      const fieldType = fields.length === 1 ? fields[0] : 'unknown';
      const conflict = fields.length > 1;
      const ambiguous = !parsed.normalizedValue || parsed.candidates.length > 1;
      const explicitlyRoast = fieldType === 'roastDate' && !conflict;
      const excluded = fieldType !== 'unknown' && fieldType !== 'roastDate';
      const automatic = explicitlyRoast && !ambiguous;
      const confidenceBase = Math.min(Number(block.confidence ?? 0.75), Number(parsed.confidence || 0));
      candidates.push({
        id: `${block.id}:date-${candidates.length + 1}`,
        rawValue: snippet.raw,
        normalizedValue: parsed.normalizedValue,
        values: parsed.candidates,
        fieldType,
        fieldLabel: FIELD_LABEL[fieldType] || FIELD_LABEL.unknown,
        decision: automatic ? 'auto-fill' : excluded ? 'exclude' : 'review',
        confidence: automatic ? Math.min(0.995, confidenceBase + 0.02) : excluded ? confidenceBase : Math.min(0.79, confidenceBase),
        imageId: block.imageId,
        imageRole: block.imageRole || 'text',
        blockId: block.id,
        polygon: block.polygon || null,
        labelEvidence: sameBlockFields.length ? block.text : nearby.map(item => item.block.text).join(' | '),
        warnings: [
          ...(conflict ? ['同一区域存在多个日期字段标签，禁止自动填写。'] : []),
          ...(ambiguous ? ['日期格式或日月顺序存在歧义，需要人工确认。'] : []),
          ...(excluded ? [`该日期属于${FIELD_LABEL[fieldType]}，不得填入烘焙日期。`] : []),
          ...(fieldType === 'unknown' ? ['未找到可靠字段标签，需要人工指定日期类型。'] : [])
        ]
      });
    }
  }

  const autoRoast = candidates.filter(candidate => candidate.decision === 'auto-fill' && candidate.fieldType === 'roastDate');
  const roastDate = autoRoast.length === 1 ? autoRoast[0].normalizedValue : '';
  if (autoRoast.length > 1) autoRoast.forEach(candidate => {
    candidate.decision = 'review';
    candidate.warnings.push('发现多个明确烘焙日期，禁止静默选择。');
  });
  return {
    schemaVersion: 'recognition-date-decision/1.0',
    classifierVersion: DATE_CLASSIFIER_VERSION,
    roastDate: autoRoast.length === 1 ? roastDate : '',
    candidates,
    reviewRequired: candidates.some(candidate => candidate.decision === 'review') || autoRoast.length > 1,
    excludedCount: candidates.filter(candidate => candidate.decision === 'exclude').length
  };
}
