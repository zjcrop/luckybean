const FIELD_LABELS = Object.freeze({
  country: ['国家','國家','产地国','產地國','原产国','原產國','生产国','生產國','country','country of origin','origin country'],
  region: ['产区','產區','地区','地區','区域','區域','种植区','種植區','微产区','微產區','region','growing region','producing region','district','province','terroir'],
  entity: ['庄园','莊園','农场','農場','农园','農園','处理站','處理站','水洗站','加工站','处理厂','處理廠','生产者','生產者','合作社','producer','farm','estate','finca','washing station','processing station','cooperative','wet mill','dry mill'],
  variety: ['豆种','豆種','品种','品種','咖啡品种','咖啡品種','栽培种','栽培種','种属','種屬','variety','varietal','cultivar','species'],
  process: ['处理法','處理法','处理方式','處理方式','加工法','加工方式','发酵方式','發酵方式','精制法','精製法','后制法','後製法','process','processing','processing method','fermentation','method'],
  roast: ['烘焙度','烘焙程度','焙度','roast level','roast profile','roast'],
  roastDate: ['烘焙日期','烘焙日','烘豆日期','烘焙时间','烘焙時間','出炉日期','出爐日期','roast date','roasted on','roasting date'],
  productionDate: ['生产日期','生產日期','制造日期','製造日期','production date','manufactured on','mfg date'],
  packDate: ['包装日期','包裝日期','分装日期','分裝日期','pack date','packed on','packing date'],
  bestBefore: ['最佳赏味期','最佳賞味期','最佳饮用期','最佳飲用期','赏味期限','賞味期限','best before','best by'],
  expiryDate: ['到期日','有效期至','有效期限','保质期至','保質期至','expiry','expiration date','use by'],
  roaster: ['烘焙商','烘焙厂','烘焙廠','烘焙品牌','烘焙者','品牌','roaster','roasted by','roast house','roastery'],
  harvest: ['产季','產季','收获季','收穫季','采收季','採收季','收获年份','收穫年份','采收年份','採收年份','crop','crop year','harvest','harvest year'],
  flavor: ['风味','風味','风味描述','風味描述','杯测风味','杯測風味','风味标签','風味標籤','品鉴笔记','品鑑筆記','香气','香氣','flavor notes','flavour notes','tasting notes','cup notes','aroma'],
  altitude: ['海拔','种植海拔','種植海拔','海拔高度','种植高度','種植高度','altitude','elevation','masl'],
  roastColor: ['烘焙色值','色值','艾格壮','艾格壯','agtron','roast color','colour value','color value'],
  weight: ['净重','淨重','净含量','淨含量','重量','规格','規格','克重','包装重量','包裝重量','net weight','net wt'],
  lot: ['批次','批号','批號','批次号','批次號','批次编号','批次編號','lot','lot no','lot number','batch','batch no'],
  grade: ['等级','等級','分级','分級','grade','screen size','screen','cup score','score']
});

const CANONICAL_LABEL = Object.freeze({
  country: '国家', region: '产区', entity: '庄园 / 处理站', variety: '豆种', process: '处理法',
  roast: '烘焙度', roastDate: '烘焙日期', productionDate: '生产日期', packDate: '包装日期',
  bestBefore: '最佳赏味期', expiryDate: '到期日', roaster: '烘焙商', harvest: '产季', flavor: '风味',
  altitude: '海拔', roastColor: '烘焙色值', weight: '净重', lot: '批次', grade: '等级'
});

const TABLE_FOR_FIELD = Object.freeze({
  country: 'countries', region: 'regions', entity: 'entities', variety: 'varieties', process: 'processes', flavor: 'flavors'
});

// Taiwan/HK coffee vocabulary can differ by more than glyph shape. These aliases
// are used only as lookup candidates. The OCR text itself is always retained.
const SAFE_VALUE_EQUIVALENTS = Object.freeze({
  '衣索比亞': ['埃塞俄比亚'],
  '肯亞': ['肯尼亚'],
  '哥倫比亞': ['哥伦比亚'],
  '巴拿馬': ['巴拿马'],
  '瓜地馬拉': ['危地马拉'],
  '宏都拉斯': ['洪都拉斯'],
  '薩爾瓦多': ['萨尔瓦多'],
  '盧安達': ['卢旺达'],
  '蒲隆地': ['布隆迪'],
  '藝伎': ['艺伎','瑰夏','Geisha','Gesha'],
  '日曬': ['日晒'],
  '蜜處理': ['蜜处理'],
  '厭氧': ['厌氧'],
  '厭氧發酵': ['厌氧发酵'],
  '濕刨': ['湿刨'],
  '碳酸浸漬': ['碳酸浸渍']
});

const TRADITIONAL_LOOKUP_FOLD = Object.freeze({
  '國':'国','產':'产','區':'区','莊':'庄','園':'园','農':'农','處':'处','廠':'厂','種':'种','屬':'属','藝':'艺',
  '曬':'晒','發':'发','厭':'厌','濕':'湿','漬':'渍','風':'风','標':'标','籤':'签','鑑':'鉴','記':'记','氣':'气',
  '淨':'净','規':'规','號':'号','編':'编','級':'级','灣':'湾','倫':'伦','亞':'亚','馬':'马','達':'达','薩':'萨',
  '爾':'尔','盧':'卢','東':'东','門':'门','義':'义','羅':'罗','蘭':'兰','島':'岛','縣':'县','鎮':'镇','鄉':'乡',
  '嶺':'岭','嶽':'岳','穀':'谷','臺':'台','烏':'乌','貝':'贝','爾':'尔','爾':'尔','獅':'狮','葉':'叶','樹':'树'
});

function clean(value) {
  return String(value ?? '').normalize('NFKC').replace(/[﹕︰]/g, ':').replace(/[｜丨]/g, '|').replace(/\s+/g, ' ').trim();
}

function key(value) {
  return clean(value).toLocaleLowerCase('zh-CN').replace(/[\s:：=|｜;；.。]+$/g, '').trim();
}

const LABEL_INDEX = (() => {
  const map = new Map();
  for (const [field, aliases] of Object.entries(FIELD_LABELS)) {
    for (const alias of aliases) {
      const normalized = key(alias);
      if (normalized && !map.has(normalized)) map.set(normalized, field);
    }
  }
  return map;
})();

function detectLabelOnly(line) {
  const normalized = key(line);
  const field = LABEL_INDEX.get(normalized);
  return field ? { field, label: CANONICAL_LABEL[field] } : null;
}

function splitInline(line) {
  const text = clean(line);
  for (const separator of [/:|：|=|\||｜/, /\s+[–—-]\s+/]) {
    const match = separator.exec(text);
    if (!match || match.index <= 0) continue;
    const left = clean(text.slice(0, match.index));
    const right = clean(text.slice(match.index + match[0].length));
    if (!left || !right) continue;
    const leftField = LABEL_INDEX.get(key(left));
    if (leftField) return { field: leftField, label: CANONICAL_LABEL[leftField], value: right };
  }
  return null;
}

function foldTraditional(value) {
  return [...String(value || '')].map(character => TRADITIONAL_LOOKUP_FOLD[character] || character).join('');
}

function tableAliases(book, table) {
  const aliases = new Map();
  for (const row of book?.[table] || []) {
    for (const item of row.slice(1)) {
      if (typeof item !== 'string') continue;
      for (const alias of item.split(/[\\/、,，;；|]/).map(value => clean(value)).filter(Boolean)) {
        aliases.set(alias.toLocaleLowerCase('zh-CN'), alias);
      }
    }
  }
  return aliases;
}

function lookupAugmentedValue(field, value, book, aliasCache) {
  const raw = clean(value);
  const table = TABLE_FOR_FIELD[field];
  if (!raw || !table) return raw;
  let aliases = aliasCache.get(table);
  if (!aliases) {
    aliases = tableAliases(book, table);
    aliasCache.set(table, aliases);
  }
  const candidates = [foldTraditional(raw), ...(SAFE_VALUE_EQUIVALENTS[raw] || [])]
    .map(clean)
    .filter(candidate => candidate && candidate !== raw);
  for (const candidate of candidates) {
    const exact = aliases.get(candidate.toLocaleLowerCase('zh-CN'));
    if (exact) return `${raw} / ${exact}`;
  }
  return raw;
}

/**
 * Repairs OCR semantic text without rewriting the OCR evidence itself.
 * - label-only lines are paired with the next value line;
 * - Traditional/variant labels are normalized to canonical field labels;
 * - known Traditional value variants get an additional codebook lookup alias only
 *   when that alias actually exists in the current book.
 * Unknown proper names are never converted or discarded.
 */
export function repairRecognitionSemanticText(source, book) {
  const lines = String(source || '').replace(/\r/g, '').split(/\n+/).map(clean).filter(Boolean);
  const output = [];
  const aliasCache = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const inline = splitInline(line);
    if (inline) {
      output.push(`${inline.label}: ${lookupAugmentedValue(inline.field, inline.value, book, aliasCache)}`);
      continue;
    }

    const label = detectLabelOnly(line);
    if (!label) {
      output.push(line);
      continue;
    }

    const next = lines[index + 1];
    if (next && !detectLabelOnly(next) && !splitInline(next)) {
      output.push(`${label.label}: ${lookupAugmentedValue(label.field, next, book, aliasCache)}`);
      index += 1;
      continue;
    }
    output.push(label.label);
  }
  return output.join('\n');
}
