import { parseNaturalLanguage } from '../../codebook.js';
import { automaticEntityResolutionDecision } from '../../services/coffee-knowledge-adapter.js';
import { resolveRecognitionRelations, resolverPriorityDescription } from './recognition-field-resolver-1.24b.js';

export const RECOGNITION_PIPELINE_VERSION = '1.24B-recognition-pipeline.2';

const RELATION_TO_RESULT = Object.freeze({
  country: 'countryCode',
  origin: 'countryCode',
  region: 'regionCode',
  farm: 'entityCode',
  producer: 'entityCode',
  station: 'entityCode',
  cooperative: 'entityCode',
  variety: 'varietyCode',
  species: 'varietyCode',
  process: 'processCode',
  roast: 'roastCode',
  roastDate: 'roastDate',
  harvest: 'harvestYear',
  altitude: 'altitude',
  roastColor: 'roastColor',
  weight: 'initialWeight',
  roaster: 'roasterName',
  flavor: 'flavorCodes',
  aroma: 'flavorCodes',
  productionDate: 'productionDate',
  packDate: 'packDate',
  bestBefore: 'bestBefore',
  expiryDate: 'expiryDate',
  lot: 'lot',
  grade: 'grade'
});

const FIELD_DEFINITIONS = Object.freeze([
  ['countryCode', '国家', 'countries', 'countryCustomName'],
  ['regionCode', '产区', 'regions', 'regionCustomName'],
  ['entityCode', '庄园 / 处理站', 'entities', 'entityCustomName'],
  ['varietyCode', '豆种', 'varieties', 'varietyCustomName'],
  ['processCode', '处理法', 'processes', 'processCustomName'],
  ['roastCode', '烘焙度', null, null],
  ['roastDate', '烘焙日期', null, null],
  ['harvestYear', '产季', null, null],
  ['roastColor', '烘焙色值', null, null],
  ['roasterName', '烘焙商', null, null],
  ['altitude', '海拔', null, null],
  ['initialWeight', '净重', null, null],
  ['flavorCodes', '风味', 'flavors', 'customFlavorNames']
]);

const ROAST_LABELS = Object.freeze({
  'RL-L0': '极浅烘', 'RL-L1': '浅烘', 'RL-L2': '浅中烘', 'RL-L3': '中烘',
  'RL-L4': '中深烘', 'RL-L5': '深烘', 'RL-L6': '极深烘'
});

function clean(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function normalizedComparable(value) {
  return clean(value).toLocaleLowerCase('zh-CN').replace(/[\s·•,，;；:：/_-]+/g, '');
}

function labelForCode(book, table, code) {
  const row = (book?.[table] || []).find(item => String(item?.[0]) === String(code));
  if (!row) return String(code || '');
  if (table === 'regions') return clean(row[2] || row[3] || code);
  if (table === 'entities') return clean(row[3] || row[4] || code);
  if (table === 'flavors') return clean((row.length >= 9 ? row[4] : row[1]) || code);
  return clean(row[1] || row[2] || code);
}

function displayScalar(field, value) {
  if (value === '' || value === null || value === undefined) return '';
  if (field === 'roastCode') return ROAST_LABELS[value] || String(value);
  if (field === 'harvestYear') return String(value);
  if (field === 'altitude') return `${value} m`;
  if (field === 'initialWeight') return `${value} g`;
  if (field === 'roastColor') return `Agtron ${value}`;
  return String(value);
}

function relationEvidence(document) {
  const byResult = new Map();
  for (const relation of document?.relations || []) {
    const resultField = RELATION_TO_RESULT[relation.field];
    if (!resultField) continue;
    const record = {
      value: clean(relation.value),
      label: clean(relation.label),
      score: Number(relation.score || 0),
      mode: String(relation.mode || ''),
      imageId: String(relation.imageId || ''),
      imageRole: String(relation.imageRole || '')
    };
    if (!byResult.has(resultField)) byResult.set(resultField, []);
    byResult.get(resultField).push(record);
  }
  return byResult;
}

function resolvedRelations(relations, field) {
  return resolveRecognitionRelations(relations.get(field) || []);
}

function rawForField(relations, field, parsed) {
  const resolution = resolvedRelations(relations, field);
  if (resolution.winner?.value) return resolution.winner.value;
  const evidence = parsed?.evidence?.[field];
  return Array.isArray(evidence) ? evidence.join('、') : clean(evidence);
}

function relationConfidence(relations, field) {
  return Number(resolvedRelations(relations, field).winner?.confidence || 0);
}

function enforceEntityResolutionSafety(parsed, book) {
  const coreCode = String(parsed?.entityCode || '');
  if (!coreCode) return;
  const evidence = clean(parsed?.evidence?.entityCode);
  const explicitCoreCode = normalizedComparable(evidence) === normalizedComparable(coreCode);
  const decision = automaticEntityResolutionDecision(book, coreCode, { explicitCoreCode });
  if (!decision.issue) return;

  parsed.parseMetadata ||= {};
  if (!decision.blocked) {
    parsed.parseMetadata.entityResolution = {
      blocked: false,
      explicitCoreCode: true,
      coreCode,
      issueClass: decision.issueClass,
      resolutionStatus: decision.resolutionStatus,
      automaticRecognitionPolicy: decision.automaticRecognitionPolicy,
      requiredContext: decision.requiredContext,
      historicalCoreCompatibility: true
    };
    return;
  }

  const display = evidence || labelForCode(book, 'entities', coreCode);
  const originalConfidence = Number(parsed?.confidence?.entityCode || 0);
  delete parsed.entityCode;
  if (display && !parsed.entityCustomName) parsed.entityCustomName = display;
  parsed.evidence ||= {};
  parsed.confidence ||= {};
  if (display && !parsed.evidence.entityCustomName) parsed.evidence.entityCustomName = display;
  if (display && !parsed.evidence.entityCode) parsed.evidence.entityCode = display;
  parsed.confidence.entityCustomName = Math.max(Number(parsed.confidence.entityCustomName || 0), originalConfidence);
  parsed.confidence.entityCode = Math.min(originalConfidence || 0.45, 0.45);
  parsed.parseMetadata.entityResolution = {
    blocked: true,
    explicitCoreCode: false,
    candidateCoreCode: coreCode,
    issueClass: decision.issueClass,
    resolutionStatus: decision.resolutionStatus,
    automaticRecognitionPolicy: decision.automaticRecognitionPolicy,
    requiredContext: decision.requiredContext,
    manualConfirmationRequired: true,
    historicalCoreCompatibility: true
  };
}

function buildFieldRows(document, parsed, book) {
  const relations = relationEvidence(document);
  const rows = [];

  for (const [field, label, table, customField] of FIELD_DEFINITIONS) {
    const resolution = resolvedRelations(relations, field);
    const rawValue = rawForField(relations, field, parsed);
    const value = parsed?.[field];
    const customValue = customField ? parsed?.[customField] : null;
    let standardValue = '';
    if (field === 'flavorCodes') {
      const codes = Array.isArray(value) ? value : [];
      standardValue = codes.map(code => labelForCode(book, table, code)).filter(Boolean).join('、');
      if (!standardValue && Array.isArray(customValue)) standardValue = customValue.join('、');
    } else if (table && value) {
      standardValue = labelForCode(book, table, value);
    } else {
      standardValue = displayScalar(field, value);
    }
    if (!standardValue && customValue) standardValue = Array.isArray(customValue) ? customValue.join('、') : clean(customValue);
    if (!rawValue && !standardValue) continue;

    const categorical = Boolean(table);
    const resolved = field === 'flavorCodes'
      ? Array.isArray(value) && value.length > 0
      : categorical ? Boolean(value) : Boolean(standardValue);
    const confidence = Math.max(Number(parsed?.confidence?.[field] || 0), relationConfidence(relations, field));
    const translated = resolved && rawValue && standardValue
      && normalizedComparable(rawValue) !== normalizedComparable(standardValue);
    const requiresReview = Boolean(resolution.conflict) || !resolved;
    rows.push({
      field,
      label,
      rawValue,
      standardValue: standardValue || rawValue,
      confidence,
      resolved: resolved && !resolution.conflict,
      translated,
      status: requiresReview ? 'review' : (translated ? 'translated' : 'resolved'),
      sources: resolution.winner?.sources || relations.get(field) || [],
      resolution:{
        priority:resolverPriorityDescription(),
        conflict:Boolean(resolution.conflict),
        reason:resolution.reason,
        winningImageIds:resolution.winner?.imageIds || [],
        candidates:(resolution.candidates || []).map(item=>({
          value:item.value,
          confidence:item.confidence,
          explicit:item.explicit,
          imageCount:item.imageCount,
          score:Number(item.score.toFixed(3)),
          imageIds:item.imageIds
        }))
      }
    });
  }
  return rows;
}

export function analyzeRecognitionDocument(document, book) {
  if (!document || typeof document !== 'object') throw new TypeError('识别文档无效');
  const semanticText = String(document.fullText || '')
    .replace(/\r/g, '')
    .split(/\n+/)
    .map(clean)
    .filter(Boolean)
    .join('\n');
  const parsed = parseNaturalLanguage(semanticText, book);
  enforceEntityResolutionSafety(parsed, book);
  const fields = buildFieldRows(document, parsed, book);
  const reviewFields = fields.filter(item => item.status === 'review');

  // A field can be semantically identified while remaining unresolved by the
  // codebook (for example: COUNTRY ATLANTIS). Preserve the value that the review
  // UI actually shows. Prefer raw evidence, but if the parser only retained a
  // custom/unmapped display value, keep that value so the bean-form confirmation
  // step cannot lose the field at the package-to-form boundary. Confidence remains
  // measured parser/relation confidence; manual confirmation never fabricates 1.0.
  parsed.evidence ||= {};
  parsed.confidence ||= {};
  for (const item of reviewFields) {
    const reviewValue = clean(item.rawValue || item.standardValue);
    if (!reviewValue) continue;
    const currentEvidence = parsed.evidence[item.field];
    const missingEvidence = currentEvidence === undefined
      || currentEvidence === null
      || currentEvidence === ''
      || (Array.isArray(currentEvidence) && currentEvidence.length === 0);
    if (missingEvidence) parsed.evidence[item.field] = reviewValue;
    const currentConfidence = Number(parsed.confidence[item.field]);
    if (!Number.isFinite(currentConfidence) || currentConfidence <= 0) {
      parsed.confidence[item.field] = Number(item.confidence || 0);
    }
  }

  parsed.parseMetadata ||= {};
  parsed.parseMetadata.recognition = {
    pipelineVersion: RECOGNITION_PIPELINE_VERSION,
    documentSchemaVersion: document.schemaVersion || '',
    parserVersion: document.parserVersion || '',
    engine: document.engine || '',
    imageCount: Array.isArray(document.images) ? document.images.length : 0,
    blockCount: Array.isArray(document.blocks) ? document.blocks.length : 0,
    relationCount: Array.isArray(document.relations) ? document.relations.length : 0,
    reviewFields: reviewFields.map(item => item.field),
    arbitrationPriority:resolverPriorityDescription(),
    rawFullText: document.rawFullText || '',
    semanticText
  };
  return {
    pipelineVersion: RECOGNITION_PIPELINE_VERSION,
    document,
    semanticText,
    parsed,
    fields,
    resolvedCount: fields.length - reviewFields.length,
    reviewCount: reviewFields.length
  };
}

export function recognitionResultField(relationField) {
  return RELATION_TO_RESULT[String(relationField || '')] || '';
}
