export const DATE_REVIEW_VERSION = '1.23D-date-review.2';

const ALLOWED_TYPES = new Set(['ignore', 'roastDate', 'productionDate', 'packDate', 'bestBefore', 'expiryDate']);

function candidateValues(candidate) {
  return [...new Set([
    ...(Array.isArray(candidate?.values) ? candidate.values : []),
    candidate?.normalizedValue
  ].filter(Boolean).map(String))];
}

export function buildDateReviewModel(dateDecision) {
  const candidates = Array.isArray(dateDecision?.candidates) ? dateDecision.candidates : [];
  return candidates.map(candidate => ({
    candidateId: String(candidate.id),
    rawValue: String(candidate.rawValue || ''),
    values: candidateValues(candidate),
    defaultType: candidate.decision === 'auto-fill'
      ? 'roastDate'
      : candidate.decision === 'exclude' && ALLOWED_TYPES.has(candidate.fieldType)
        ? candidate.fieldType
        : 'ignore',
    fieldType: String(candidate.fieldType || 'unknown'),
    fieldLabel: String(candidate.fieldLabel || '未确定日期'),
    imageId: String(candidate.imageId || ''),
    imageRole: String(candidate.imageRole || 'text'),
    blockId: String(candidate.blockId || ''),
    confidence: Number(candidate.confidence || 0),
    labelEvidence: String(candidate.labelEvidence || ''),
    warnings: Array.isArray(candidate.warnings) ? candidate.warnings.map(String) : []
  }));
}

export function resolveDateReviewSelections(dateDecision, selections = []) {
  const model = buildDateReviewModel(dateDecision);
  const byId = new Map(model.map(candidate => [candidate.candidateId, candidate]));
  const normalized = [];
  const errors = [];
  const seen = new Set();

  for (const selection of selections) {
    const candidateId = String(selection?.candidateId || '');
    const candidate = byId.get(candidateId);
    if (!candidate) {
      errors.push('日期候选不存在或已经失效，请返回后重新识别。');
      continue;
    }
    if (seen.has(candidateId)) {
      errors.push(`日期候选 ${candidate.rawValue} 被重复提交。`);
      continue;
    }
    seen.add(candidateId);
    const type = ALLOWED_TYPES.has(selection?.type) ? selection.type : 'ignore';
    const value = String(selection?.value || candidate.values[0] || '');
    if (type !== 'ignore' && (!value || !candidate.values.includes(value))) {
      errors.push(`日期 ${candidate.rawValue} 的确认值不属于识别候选。`);
      continue;
    }
    normalized.push({ candidateId, type, value, candidate });
  }

  const roastSelections = normalized.filter(item => item.type === 'roastDate' && item.value);
  if (roastSelections.length > 1) errors.push('只能确认一个烘焙日期，请重新选择。');
  if (errors.length) return { ok: false, errors, roastDate: '', assignments: [] };

  const chosen = roastSelections[0] || null;
  return {
    ok: true,
    errors: [],
    roastDate: chosen?.value || '',
    assignments: normalized.map(({ candidate, ...item }) => ({
      candidateId: item.candidateId,
      type: item.type,
      value: item.type === 'ignore' ? '' : item.value,
      rawValue: candidate.rawValue
    })),
    confirmedRoastDate: chosen ? {
      value: chosen.value,
      decisionSource: 'user-confirmed',
      candidateId: chosen.candidate.candidateId,
      rawValue: chosen.candidate.rawValue,
      imageId: chosen.candidate.imageId,
      imageRole: chosen.candidate.imageRole,
      blockId: chosen.candidate.blockId,
      labelEvidence: chosen.candidate.labelEvidence,
      sourceConfidence: chosen.candidate.confidence,
      reviewVersion: DATE_REVIEW_VERSION
    } : null
  };
}
