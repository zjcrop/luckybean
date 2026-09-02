const CORE_TABLES = ['countries', 'regions', 'entities', 'varieties', 'processes', 'flavors'];

function aliasText(record) {
  return String(record?.alias || record?.name || '').normalize('NFKC').trim();
}

function usableLocalizedRecord(record) {
  if (!record?.targetCode || !aliasText(record)) return false;
  const language = String(record.language || '');
  if (!language) return false;
  const confidence = Number(record.confidence ?? 0.5);
  if (!Number.isFinite(confidence) || confidence < 0.65) return false;
  const type = String(record.nameType || '');
  if (['official', 'canonical', 'market_verified', 'common'].includes(type)) return true;
  // AI-generated translations/transliterations remain candidates in the source bundle.
  // LuckyBean may use sufficiently strong exact strings for OCR/search matching, but
  // never promotes their source metadata to official/canonical status.
  return ['ai_translated', 'ai_transliterated'].includes(type)
    && String(record.reviewStatus || '').startsWith('pending');
}

export function applyCoffeeKnowledge(baseBook, knowledge) {
  const book = structuredClone(baseBook);
  if (!knowledge || knowledge._format !== 'coffee-knowledge-bundle' || knowledge.contract !== 'coffee-knowledge/1.0') return book;
  if (knowledge?.compatibility?.qrIndexesChanged === true) return book;

  const rowByCode = new Map();
  for (const table of CORE_TABLES) {
    for (const row of book[table] || []) {
      if (row?.[0]) rowByCode.set(String(row[0]), { table, row });
    }
  }

  const applied = [];
  const seen = new Set();
  const localized = [
    ...(Array.isArray(knowledge.localizedNames) ? knowledge.localizedNames : []),
    ...(Array.isArray(knowledge.localizedAliases) ? knowledge.localizedAliases : [])
  ];
  for (const record of localized) {
    if (!usableLocalizedRecord(record)) continue;
    const target = rowByCode.get(String(record.targetCode));
    if (!target) continue; // knowledge-only records deliberately have no QR core target.
    const text = aliasText(record);
    const key = `${record.targetCode}\u0000${text.toLocaleLowerCase('zh-CN')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!target.row.some(value => typeof value === 'string' && value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN') === text.toLocaleLowerCase('zh-CN'))) {
      target.row.push(text);
    }
    applied.push({
      targetCode: String(record.targetCode),
      language: String(record.language || ''),
      text,
      nameType: String(record.nameType || ''),
      reviewStatus: String(record.reviewStatus || ''),
      confidence: Number(record.confidence ?? 0.5)
    });
  }

  book.coffeeKnowledge = structuredClone(knowledge);
  book.coffeeKnowledgeClient = {
    contract: knowledge.contract,
    version: String(knowledge.version || ''),
    aliasesAppliedToMatchingRows: applied.length,
    appliedAliases: applied,
    qrIndexesChanged: false
  };
  return book;
}

export function canonicalEntityId(book, coreCode) {
  const entity = book?.coffeeKnowledge?.entities?.find(record => record?.code === coreCode);
  return entity?.canonicalIdentityId || coreCode || '';
}

export function canonicalRegionId(book, coreCode) {
  const region = book?.coffeeKnowledge?.regions?.find(record => record?.code === coreCode);
  return region?.canonicalGeoIdentityId || coreCode || '';
}

export function canonicalCountryDisplay(book, coreCode) {
  const country = book?.coffeeKnowledge?.countries?.find(record => record?.code === coreCode);
  return country?.canonicalGeo || null;
}
