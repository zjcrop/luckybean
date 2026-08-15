export const RECOGNITION_DOCUMENT_SCHEMA = 'recognition-document/1.1';

const ROLE_LABELS = Object.freeze({
  front: '正面主体',
  back: '背面参数',
  side: '侧面补充',
  date: '日期标签',
  text: '文字输入'
});

// 这里只负责理解“项目名称”，不负责把值强行写入豆卡。
// 别名包含简中、繁中、行业口语和常见英文标签；值的最终归属仍由后续领域解析器校验。
export const RECOGNITION_FIELD_ALIASES = Object.freeze({
  country: ['国家','产国','原产国','生产国','咖啡产国','國家','產國','原產國','country','country of origin','origin country'],
  origin: ['产地','原产地','来源','产地信息','咖啡产地','產地','原產地','來源','origin','coffee origin'],
  region: ['产区','地区','区域','种植区','生产区','微产区','子产区','次产区','產區','地區','區域','種植區','region','growing region','producing region','area','zone','district','province','terroir'],
  farm: ['庄园','农场','农园','农庄','咖啡庄园','莊園','農場','農園','farm','estate','finca','fazenda','hacienda'],
  producer: ['生产者','农户','种植者','庄园主','生产单位','生產者','農戶','種植者','producer','farmer','grower','produced by'],
  station: ['水洗站','处理站','加工站','处理厂','咖啡处理站','處理站','加工站','處理廠','washing station','processing station','wet mill','dry mill','factory'],
  cooperative: ['合作社','小农合作社','農民合作社','cooperative','co-op','coop'],
  variety: ['品种','豆种','树种','咖啡品种','栽培种','種屬','品種','豆種','樹種','variety','varietal','cultivar','botanical variety','var.','var','cv.','cv'],
  species: ['种属','物种','咖啡种','種屬','物種','species'],
  process: ['处理法','处理方式','处理','精制法','后制处理','后制法','加工法','加工方式','发酵方式','处理工艺','處理法','處理方式','後製法','process','processing','processing method','post-harvest process','proc.','proc','method'],
  roastDate: ['烘焙日期','烘焙日','烘豆日期','烘焙时间','出炉日期','焙炒日期','烘烤日期','烘焙日期','烘焙日','烘豆日期','烘焙時間','出爐日期','roast date','roasted on','roasting date','date roasted','roast on','rst date','rst dt','rd'],
  productionDate: ['生产日期','制造日期','生產日期','製造日期','production date','prod date','manufactured on','mfg date','mfd'],
  packDate: ['包装日期','分装日期','包裝日期','分裝日期','pack date','packed on','packing date','pkd'],
  bestBefore: ['最佳赏味期','最佳飲用期','建议饮用日期','賞味期限','best before','best by','bbe'],
  expiryDate: ['到期日','有效期至','保质期至','有效期限','expiry','expiration date','use by','exp'],
  harvest: ['产季','收获季','采收季','采收年份','收获年份','年度','生豆产季','產季','收穫季','採收季','crop','crop year','harvest','harvest year','season','crop season','cy'],
  altitude: ['海拔','种植海拔','海拔高度','种植高度','種植海拔','高度','altitude','elevation','elev.','elev','alt.','alt','masl','m.a.s.l.','meters above sea level','metres above sea level','ft asl','feet above sea level'],
  flavor: ['风味','风味描述','风味笔记','杯测风味','杯测描述','风味标签','品鉴笔记','風味','風味描述','杯測風味','flavor notes','flavour notes','tasting notes','cup notes','cupping notes','sensory notes'],
  aroma: ['香气','干香','湿香','香氣','乾香','濕香','aroma','fragrance'],
  roast: ['烘焙度','焙度','烘焙程度','烘焙程度描述','焙度','roast level','roast profile','roast'],
  roastColor: ['烘焙色值','色值','艾格壮','艾格壯','agtron','gourmet agtron','commercial agtron','roast color','colour value','color value'],
  weight: ['净含量','净重','重量','规格','克重','包裝重量','淨含量','淨重','net weight','net wt','net wt.','n.w.','nw'],
  lot: ['批次','批号','批次号','批次编号','地块批次','批號','批次編號','lot','lot no','lot number','batch','batch no'],
  grade: ['等级','分级','等級','分級','grade','screen size','screen','cup score','score'],
  roaster: ['烘焙商','烘焙厂','烘焙品牌','烘焙者','品牌','烘焙廠','roaster','roasted by','roast house','roastery']
});

export const RECOGNITION_FIELD_LABELS = Object.freeze({
  country: '国家', origin: '产地', region: '产区', farm: '庄园', producer: '生产者',
  station: '处理站', cooperative: '合作社', variety: '豆种', species: '种属',
  process: '处理法', roastDate: '烘焙日期', productionDate: '生产日期',
  packDate: '包装日期', bestBefore: '最佳赏味期', expiryDate: '到期日期',
  harvest: '产季', altitude: '海拔', flavor: '风味', aroma: '香气', roast: '烘焙度',
  roastColor: '烘焙色值', weight: '净重', lot: '批次', grade: '等级', roaster: '烘焙商'
});

const OCR_ALIAS_NORMALIZATION = Object.freeze({
  '烘培日期': '烘焙日期',
  '烘焙曰期': '烘焙日期',
  '烘焙日朗': '烘焙日期',
  '处埋法': '处理法',
  '處埋法': '處理法',
  '產區': '产区',
  '產地': '产地'
});

function cleanText(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function semanticText(value) {
  const cleaned = cleanText(value).replace(/[﹕︰]/g, ':').replace(/[｜丨]/g, '|');
  return OCR_ALIAS_NORMALIZATION[cleaned] || cleaned;
}

function anchorKey(value) {
  return semanticText(value)
    .toLocaleLowerCase('zh-CN')
    .replace(/^[\s【\[(]+|[\s】\])]+$/g, '')
    .replace(/[\s:：=|｜;；.。]+$/g, '')
    .trim();
}

const FIELD_ALIAS_INDEX = (() => {
  const map = new Map();
  for (const [field, aliases] of Object.entries(RECOGNITION_FIELD_ALIASES)) {
    for (const alias of aliases) {
      const key = anchorKey(alias);
      if (key && !map.has(key)) map.set(key, { field, alias });
    }
  }
  return map;
})();

function detectFieldAnchor(value) {
  const key = anchorKey(value);
  if (!key) return null;
  const exact = FIELD_ALIAS_INDEX.get(key);
  if (exact) return { ...exact, confidence: 1 };
  // 仅容忍字段名末尾的常见 OCR 附着字符，避免对正文做宽泛模糊匹配。
  for (const [aliasKey, match] of FIELD_ALIAS_INDEX.entries()) {
    if (key.length >= 3 && aliasKey.length >= 3 && (key.startsWith(aliasKey) || aliasKey.startsWith(key))) {
      const delta = Math.abs(key.length - aliasKey.length);
      if (delta <= 1) return { ...match, confidence: 0.86 };
    }
  }
  return null;
}

function splitInlinePair(value) {
  const text = semanticText(value);
  if (!text) return null;
  // 冒号、等号和竖线属于强结构；短横线仅在两侧均有空格时作为弱结构，避免拆开 1500-1800m。
  const separators = [/:|：|=|\||｜/, /\s+[–—-]\s+/];
  for (const separator of separators) {
    const match = separator.exec(text);
    if (!match || match.index <= 0) continue;
    const left = cleanText(text.slice(0, match.index));
    const right = cleanText(text.slice(match.index + match[0].length));
    if (!left || !right) continue;
    const leftAnchor = detectFieldAnchor(left);
    const rightAnchor = detectFieldAnchor(right);
    if (leftAnchor && !rightAnchor) return { field: leftAnchor.field, label: left, value: right, labelSide: 'left', confidence: leftAnchor.confidence };
    if (rightAnchor && !leftAnchor) return { field: rightAnchor.field, label: right, value: left, labelSide: 'right', confidence: rightAnchor.confidence };
  }
  return null;
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

function polygonBox(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 2) return null;
  const xs = polygon.map(point => Number(point.x)).filter(Number.isFinite);
  const ys = polygon.map(point => Number(point.y)).filter(Number.isFinite);
  if (!xs.length || !ys.length) return null;
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  return {
    left, right, top, bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2
  };
}

function boundedConfidence(value, fallback = 0.75) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function overlapRatio(a1, a2, b1, b2) {
  const overlap = Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
  const base = Math.max(1, Math.min(a2 - a1, b2 - b1));
  return overlap / base;
}

function sameRow(a, b) {
  if (!a?.box || !b?.box) return false;
  return overlapRatio(a.box.top, a.box.bottom, b.box.top, b.box.bottom) >= 0.42
    || Math.abs(a.box.centerY - b.box.centerY) <= Math.max(a.box.height, b.box.height) * 0.62;
}

function sameColumn(a, b) {
  if (!a?.box || !b?.box) return false;
  return overlapRatio(a.box.left, a.box.right, b.box.left, b.box.right) >= 0.34
    || Math.abs(a.box.centerX - b.box.centerX) <= Math.max(a.box.width, b.box.width) * 0.5;
}

function edgeDistance(a, b) {
  if (!a?.box || !b?.box) return Number.POSITIVE_INFINITY;
  const dx = Math.max(0, Math.max(a.box.left, b.box.left) - Math.min(a.box.right, b.box.right));
  const dy = Math.max(0, Math.max(a.box.top, b.box.top) - Math.min(a.box.bottom, b.box.bottom));
  return Math.hypot(dx, dy);
}

function relationScore(anchorBlock, valueBlock) {
  if (!anchorBlock?.box || !valueBlock?.box || anchorBlock.id === valueBlock.id) return -Infinity;
  if (valueBlock.anchor) return -Infinity;
  const row = sameRow(anchorBlock, valueBlock);
  const column = sameColumn(anchorBlock, valueBlock);
  if (!row && !column) return -Infinity;
  const scale = Math.max(8, anchorBlock.box.height, valueBlock.box.height);
  const distance = edgeDistance(anchorBlock, valueBlock) / scale;
  if (row && distance > 18) return -Infinity;
  if (!row && column && distance > 5.5) return -Infinity;
  let score = row ? 4.2 : 2.8;
  if (column) score += 0.9;
  score += Math.max(0, 2.2 - distance * 0.35);
  score += valueBlock.confidence * 0.5;
  // 左右方向只作为很弱先验；数值在标题左侧、标题在数值下方均允许。
  if (row && valueBlock.box.left >= anchorBlock.box.right) score += 0.12;
  if (!row && valueBlock.box.top >= anchorBlock.box.bottom) score += 0.08;
  return score;
}

function spatialSort(a, b) {
  if (a.box && b.box) {
    const rowTolerance = Math.max(a.box.height, b.box.height) * 0.65;
    if (Math.abs(a.box.centerY - b.box.centerY) <= rowTolerance) return a.box.left - b.box.left;
    return a.box.top - b.box.top;
  }
  if (a.box) return -1;
  if (b.box) return 1;
  return a.order - b.order;
}

function inferRelations(blocks) {
  const relations = [];
  const usedValues = new Set();
  const consumed = new Set();

  // 第一优先级：同一个 OCR 文本块内部已经存在显式标点关系。
  for (const block of blocks) {
    const pair = splitInlinePair(block.text);
    if (!pair) continue;
    relations.push({
      id: `relation-${relations.length + 1}`,
      field: pair.field,
      labelBlockId: block.id,
      valueBlockId: block.id,
      label: pair.label,
      value: pair.value,
      mode: 'inline-punctuation',
      score: Math.min(1, 0.94 + 0.05 * pair.confidence)
    });
    consumed.add(block.id);
  }

  // 第二优先级：独立字段标题与同行/同列文本建立双向候选关系。
  const anchors = blocks.filter(block => block.anchor && !consumed.has(block.id));
  for (const anchorBlock of anchors) {
    const candidates = blocks
      .filter(block => !consumed.has(block.id) && !usedValues.has(block.id) && block.id !== anchorBlock.id)
      .map(block => ({ block, score: relationScore(anchorBlock, block) }))
      .filter(item => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best || best.score < 3.0) continue;
    const mode = sameRow(anchorBlock, best.block) ? 'same-row' : 'same-column';
    relations.push({
      id: `relation-${relations.length + 1}`,
      field: anchorBlock.anchor.field,
      labelBlockId: anchorBlock.id,
      valueBlockId: best.block.id,
      label: anchorBlock.text,
      value: best.block.text,
      mode,
      score: Math.min(0.97, 0.64 + best.score / 20)
    });
    consumed.add(anchorBlock.id);
    consumed.add(best.block.id);
    usedValues.add(best.block.id);
  }

  return { relations, consumed };
}

function buildStructuredText(blocks, relations, consumed) {
  const records = [];
  const relationByBlock = new Map();
  for (const relation of relations) {
    const block = blocks.find(item => item.id === relation.labelBlockId) || blocks.find(item => item.id === relation.valueBlockId);
    relationByBlock.set(relation.id, block);
    records.push({
      orderBlock: block,
      order: block?.order ?? Number.MAX_SAFE_INTEGER,
      text: `${RECOGNITION_FIELD_LABELS[relation.field] || relation.label}: ${relation.value}`,
      relationId: relation.id
    });
  }
  for (const block of blocks) {
    if (consumed.has(block.id)) continue;
    records.push({ orderBlock: block, order: block.order, text: block.text, relationId: null });
  }
  records.sort((a, b) => {
    if (a.orderBlock && b.orderBlock) return spatialSort(a.orderBlock, b.orderBlock);
    return a.order - b.order;
  });
  return records.map(record => record.text).filter(Boolean).join('\n');
}

function analyzeImageLayout(blocks) {
  const prepared = blocks.map(block => ({ ...block, anchor: detectFieldAnchor(block.text) }));
  prepared.sort(spatialSort);
  const { relations, consumed } = inferRelations(prepared);
  return { blocks: prepared, relations, fullText: buildStructuredText(prepared, relations, consumed) };
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
    const polygon = normalizePolygon(block?.polygon ?? block?.corners ?? block?.boundingBox);
    return {
      id: String(block?.id || `${imageId}:block-${index + 1}`),
      imageId,
      imageRole: image.role,
      order: Number.isFinite(Number(block?.order)) ? Number(block.order) : index,
      text: semanticText(block?.text ?? block?.rawValue ?? block?.value),
      confidence: boundedConfidence(block?.confidence ?? block?.score),
      polygon,
      box: polygonBox(polygon),
      engine: String(block?.engine || engine || 'unknown')
    };
  }).filter(block => block.text);

  const analyzedBlocks = [];
  const relations = [];
  const structuredSections = [];
  for (const image of [...imageMap.values()].sort((a, b) => a.order - b.order)) {
    const imageBlocks = normalizedBlocks.filter(block => block.imageId === image.id);
    if (!imageBlocks.length) continue;
    const analyzed = analyzeImageLayout(imageBlocks);
    analyzedBlocks.push(...analyzed.blocks);
    relations.push(...analyzed.relations.map(relation => ({ ...relation, imageId: image.id, imageRole: image.role })));
    if (analyzed.fullText) structuredSections.push(analyzed.fullText);
  }

  const rawFullText = String(fullText || normalizedBlocks.map(block => block.text).join('\n'));
  const structuredFullText = structuredSections.join('\n').trim() || rawFullText;
  return {
    schemaVersion: RECOGNITION_DOCUMENT_SCHEMA,
    parserVersion: '1.23E-recognition-layout.2',
    engine: String(engine || 'unknown'),
    createdAt,
    images: [...imageMap.values()].sort((a, b) => a.order - b.order),
    blocks: analyzedBlocks.map(({ anchor, ...block }) => ({ ...block, fieldAnchor: anchor?.field || null, fieldAnchorConfidence: anchor?.confidence || null })),
    relations,
    rawFullText,
    fullText: structuredFullText
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
