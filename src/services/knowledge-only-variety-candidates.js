function clean(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value) {
  return clean(value)
    .toLocaleUpperCase('en-US')
    .replace(/[‐‑‒–—―−﹣－]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/[\s_/·•、，,。.!！?？;；:：'’"“”()（）\[\]【】{}]/g, '');
}

function editDistance(leftValue, rightValue) {
  const left = [...normalize(leftValue)];
  const right = [...normalize(rightValue)];
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function similarity(leftValue, rightValue) {
  const left = normalize(leftValue);
  const right = normalize(rightValue);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const shorter = Math.min(left.length, right.length);
  const longer = Math.max(left.length, right.length);
  if (shorter >= 4 && (left.includes(right) || right.includes(left))) {
    return Math.min(0.96, 0.86 + (shorter / longer) * 0.1);
  }
  if (shorter < 4) return 0;
  return Math.max(0, 1 - editDistance(left, right) / longer);
}

function knowledgeOnlyDetails(book) {
  const details = book?.coffeeKnowledge?.unboundKnowledge?.varietyDetails;
  return Array.isArray(details) ? details.filter(detail => detail?.id && !detail?.coreCode) : [];
}

function localizedTerms(book, targetId) {
  const records = [
    ...(Array.isArray(book?.coffeeKnowledge?.localizedNames) ? book.coffeeKnowledge.localizedNames : []),
    ...(Array.isArray(book?.coffeeKnowledge?.localizedAliases) ? book.coffeeKnowledge.localizedAliases : [])
  ];
  return records
    .filter(record => String(record?.targetId || '') === String(targetId))
    .map(record => ({
      text: clean(record?.name || record?.alias),
      nameType: String(record?.nameType || ''),
      language: String(record?.language || ''),
      reviewStatus: String(record?.reviewStatus || ''),
      confidence: Number(record?.confidence ?? 0.5)
    }))
    .filter(record => record.text && Number.isFinite(record.confidence) && record.confidence >= 0.6);
}

function candidateTerms(book, detail) {
  const terms = [
    { text: clean(detail?.canonicalNameEn), nameType: 'canonical', language: 'en', reviewStatus: '', confidence: 1 },
    ...(Array.isArray(detail?.aliases) ? detail.aliases.map(alias => ({ text: clean(alias), nameType: 'source_alias', language: '', reviewStatus: '', confidence: Number(detail?.confidence ?? 1) })) : []),
    ...localizedTerms(book, detail.id)
  ];
  const seen = new Set();
  return terms.filter(term => {
    const key = normalize(term.text);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function evidenceFragments(value) {
  const text = clean(value);
  const fragments = text
    .split(/[\n\r|；;，,。:：/／、]+/)
    .map(clean)
    .filter(Boolean);
  return [...new Set([text, ...fragments].filter(Boolean))];
}

export function knowledgeOnlyVarietyCandidates(book, evidence, limit = 5) {
  const fragments = evidenceFragments(evidence);
  if (!fragments.length) return [];
  const candidates = [];
  for (const detail of knowledgeOnlyDetails(book)) {
    let best = null;
    for (const term of candidateTerms(book, detail)) {
      for (const fragment of fragments) {
        const lexicalScore = similarity(term.text, fragment);
        const score = Math.min(1, lexicalScore * Math.max(0.6, Math.min(1, term.confidence || 1)));
        if (!best || score > best.score) best = { term, fragment, score };
      }
    }
    if (!best || best.score < 0.84) continue;
    candidates.push({
      knowledgeId: String(detail.id),
      canonicalNameEn: clean(detail.canonicalNameEn),
      matchedText: best.term.text,
      evidenceText: best.fragment,
      matchedNameType: best.term.nameType,
      matchedLanguage: best.term.language,
      matchedReviewStatus: best.term.reviewStatus,
      score: Math.round(best.score * 1000) / 1000,
      knowledgeConfidence: Number(detail.confidence ?? 0.5),
      recordType: String(detail.recordType || ''),
      coreEligibility: String(detail.coreEligibility || ''),
      sourceRefs: Array.isArray(detail.sourceRefs) ? [...detail.sourceRefs] : [],
      knowledgeOnly: true,
      qrCoreCode: null,
      qrEligible: false,
      productionCoreApproved: false,
      manualConfirmationRequired: true
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.canonicalNameEn.localeCompare(b.canonicalNameEn, 'en'));
  return candidates.slice(0, Math.max(1, Number(limit) || 5));
}

export function bestKnowledgeOnlyVarietyCandidate(book, evidence) {
  const candidates = knowledgeOnlyVarietyCandidates(book, evidence, 2);
  const best = candidates[0] || null;
  if (!best) return null;
  const runnerUp = candidates[1] || null;
  const exact = best.score >= 0.995;
  if (!exact && best.score < 0.88) return null;
  if (!exact && runnerUp && best.score - runnerUp.score < 0.06) return null;
  return best;
}
