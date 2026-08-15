import { get, put, all, activateCodebook } from './db.js';
import { sha256Hex } from './utils.js';

export const REMOTE_CODEBOOK_URL = 'https://raw.githubusercontent.com/zjcrop/BrewIon/main/coffee-qr-codebook/coffee_qr_codebook_v6.json';
export const REMOTE_LABEL_LEXICON_URL = 'https://raw.githubusercontent.com/zjcrop/BrewIon/main/coffee-qr-codebook/coffee_label_lexicon_v1.json';
export const FALLBACK_CODEBOOK_URL = './public/fallback-codebook.json';

const REQUIRED_TABLES = ['countries', 'regions', 'entities', 'varieties', 'processes', 'flavors'];

function customCodeRow(record) {
  const table = String(record?.table || '');
  const name = String(record?.name || record?.label || '').trim();
  if (!record?.code || !name || record.status === 'merged_to_official') return null;
  if (table === 'regions') return [record.code, record.countryCode || '', name, name];
  if (table === 'entities') return [record.code, record.countryCode || '', record.regionCode || '', name, name];
  if (table === 'countries' || table === 'varieties' || table === 'processes' || table === 'flavors') return [record.code, name, name];
  return null;
}

async function appendLocalCustomCodes(book) {
  const merged = structuredClone(book);
  const records = await all('customCodes').catch(() => []);
  for (const record of records) {
    const table = String(record?.table || '');
    const row = customCodeRow(record);
    if (!row || !REQUIRED_TABLES.includes(table)) continue;
    merged[table] ||= [];
    if (!merged[table].some(item => item?.[0] === row[0])) merged[table].push(row);
  }
  return validateCodebook(merged);
}

export function validateCodebook(book) {
  if (!book || typeof book !== 'object' || Array.isArray(book)) throw new Error('编码表不是对象');
  for (const table of REQUIRED_TABLES) {
    if (!Array.isArray(book[table])) throw new Error(`编码表缺少 ${table}`);
    const seen = new Set();
    for (const row of book[table]) {
      if (!Array.isArray(row) || !row[0]) throw new Error(`${table} 存在无效条目`);
      if (seen.has(row[0])) throw new Error(`${table} 存在重复编码 ${row[0]}`);
      seen.add(row[0]);
    }
  }
  return book;
}

export function mergeCodebooks(primary, fallback) {
  const main = validateCodebook(structuredClone(primary));
  const reserve = validateCodebook(fallback);
  const merged = { ...reserve, ...main };
  for (const table of REQUIRED_TABLES) {
    const rows = [];
    const seen = new Set();
    for (const row of [...(main[table] || []), ...(reserve[table] || [])]) {
      if (!row?.[0] || seen.has(row[0])) continue;
      rows.push(row);
      seen.add(row[0]);
    }
    merged[table] = rows;
  }
  merged._fallbackMerged = true;
  return validateCodebook(merged);
}

export function makeIndex(book) {
  const index = {};
  for (const table of REQUIRED_TABLES) {
    index[table] = new Map(book[table].map((row, i) => [row[0], { row, index: i + 1 }]));
  }
  index.aliases = new Map();
  for (const table of REQUIRED_TABLES) {
    for (const row of book[table]) {
      const values = row.slice(1).filter(v => typeof v === 'string' && v && !['active', 'candidate'].includes(v));
      for (const value of values) {
        for (const alias of value.split(/[\/、,，;；]/).map(x => x.trim()).filter(Boolean)) {
          const key = alias.toLocaleLowerCase('zh-CN');
          if (!index.aliases.has(key)) index.aliases.set(key, []);
          index.aliases.get(key).push({ table, code: row[0], row });
        }
      }
    }
  }
  return index;
}

export function displayName(index, table, code, fallback = '—') {
  const row = index?.[table]?.get(code)?.row;
  if (!row) return fallback;
  const labelIndex = table === 'regions' ? 2 : table === 'entities' ? 3 : 1;
  const value = String(table === 'flavors' ? (row.length >= 9 ? row[4] : row[1]) : row[labelIndex] || '').trim();
  return value || fallback;
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return { data: JSON.parse(text), text, url };
  } finally { clearTimeout(timer); }
}

export function attachLabelLexicon(book, lexicon) {
  if (!lexicon || typeof lexicon !== 'object' || Array.isArray(lexicon)) return book;
  const fields = lexicon.fields || {};
  const aliasesOf = key => Array.isArray(fields[key]) ? fields[key] : Array.isArray(fields[key]?.aliases) ? fields[key].aliases : [];
  const mapped = {};
  for (const key of ['country','region','variety','process','roastDate','productionDate','packDate','bestBefore','expiryDate','roaster','harvest','flavor','altitude','roastColor','weight','lot','grade']) {
    mapped[key] = { aliases: aliasesOf(key) };
  }
  mapped.roast = { aliases: aliasesOf('roastLevel') };
  mapped.entity = { aliases: [...new Set(['producer','farm','cooperative','station'].flatMap(aliasesOf))] };
  const merged = structuredClone(book);
  merged.labelLexicon = {
    version: String(lexicon.version || 'unknown'),
    updatedAt: lexicon.updatedAt || '',
    fields: mapped,
    valueAliases: lexicon.valueAliases || {},
    dateRecognition: lexicon.dateRecognition || {},
    harvestRecognition: lexicon.harvestRecognition || {},
    numericRecognition: lexicon.numericRecognition || {}
  };
  return merged;
}

export async function loadCodebook() {
  const fallbackResponse = await fetchJson(FALLBACK_CODEBOOK_URL, 5000);
  const fallback = validateCodebook(fallbackResponse.data);
  const cached = await get('codebookCache', 'active').catch(() => null);
  if (cached?.data) {
    try {
      const data = await appendLocalCustomCodes(mergeCodebooks(cached.data, fallback));
      const record = { ...cached, data, checkedAt: cached.checkedAt || new Date().toISOString() };
      if (JSON.stringify(data) !== JSON.stringify(cached.data)) await put('codebookCache', record).catch(() => {});
      return { data, source: 'cache', meta: record };
    } catch { /* 使用内置回退表 */ }
  }
  const data = await appendLocalCustomCodes(fallback);
  const hash = await sha256Hex(JSON.stringify(data));
  const record = { id: 'active', data, source: 'embedded', hash, version: String(data.version || data._version || '6'), updatedAt: data.updatedAt || '', checkedAt: new Date().toISOString() };
  await put('codebookCache', record).catch(() => {});
  return { data, source: 'embedded', meta: record };
}

export async function checkCodebookUpdate({ force = false } = {}) {
  const [remote, fallbackResponse, labelLexiconResponse] = await Promise.all([
    fetchJson(REMOTE_CODEBOOK_URL, force ? 12000 : 8000),
    fetchJson(FALLBACK_CODEBOOK_URL, 5000),
    fetchJson(REMOTE_LABEL_LEXICON_URL, force ? 12000 : 8000).catch(() => null)
  ]);
  let data = mergeCodebooks(remote.data, fallbackResponse.data);
  if (labelLexiconResponse?.data) data = attachLabelLexicon(data, labelLexiconResponse.data);
  data = await appendLocalCustomCodes(data);
  const hash = await sha256Hex(JSON.stringify(data));
  const active = await get('codebookCache', 'active').catch(() => null);
  if (active?.hash === hash) {
    const record = { ...active, data, checkedAt: new Date().toISOString(), source: 'remote+fallback' };
    await put('codebookCache', record);
    return { updated: false, data, meta: record };
  }
  const candidate = { id: 'candidate', data, source: 'remote+fallback', hash, version: String(data.version || data._version || 'unknown'), updatedAt: data.updatedAt || '', checkedAt: new Date().toISOString() };
  await activateCodebook(candidate);
  return { updated: true, data, meta: candidate };
}

export function optionsHtml(rows, selected = '', labelIndex = 1, blank = '请选择') {
  return [`<option value="">${blank}</option>`, ...rows.map(row => `<option value="${row[0]}"${row[0] === selected ? ' selected' : ''}>${row[labelIndex] || row[0]}</option>`)].join('');
}

export function relatedRows(book, table, parentCode) {
  const rows = book[table] || [];
  if (!parentCode) return rows;
  if (table === 'regions') return rows.filter(row => row[1] === parentCode);
  if (table === 'entities') return rows.filter(row => row[1] === parentCode || row[2] === parentCode);
  return rows;
}

function normalizeCodeSource(value) {
  return String(value || '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[‐‑‒–—―−﹣－]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/[\t\r]+/g, ' ');
}

function directCodeMatch(source, rows) {
  for (const row of rows || []) {
    const code = normalizeCodeSource(row?.[0]);
    if (!code) continue;
    const index = source.indexOf(code);
    if (index < 0) continue;
    const before = source[index - 1] || '';
    const after = source[index + code.length] || '';
    if (/[A-Z0-9]/.test(before) || /[A-Z0-9]/.test(after)) continue;
    return { code: row[0], alias: row[0], row, direct: true };
  }
  return null;
}

function normalizeLabelValue(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/^[\s【\[]*(?:正面主体|背面参数|侧面补充|日期标签)[】\]]?\s*/i, '')
    .replace(/^[-—–•·*]+\s*/, '')
    .trim();
}

export const COFFEE_LABEL_LEXICON_VERSION = '1.0.0';
export const DEFAULT_LABEL_LEXICON = Object.freeze({
  country: ['产地国','原产国','原产地','国家','产地','產地國','原產國','原產地','國家','產地','生産国','原産国','原産地','생산국','원산국','원산지','origin','country of origin','origin country','country'],
  region: ['产区','地区','区域','省','州','县','產區','地區','區域','産地','地域','生産地域','生産地','산지','지역','생산 지역','생산지','region','growing region','origin region','zone','district','province','terroir'],
  entity: ['庄园','农场','生产者','农户','合作社','处理站','水洗站','处理厂','磨坊','工厂','莊園','農場','生產者','農戶','合作社','處理站','水洗站','處理廠','農園','農場','生産者','協同組合','精製所','ウォッシングステーション','농장','생산자','협동조합','가공소','워싱 스테이션','producer','farmer','grower','farm','estate','finca','hacienda','cooperative','co-op','coop','washing station','ws','wet mill','dry mill','mill','factory'],
  variety: ['豆种','品种','咖啡品种','栽培种','种属','豆種','品種','咖啡品種','栽培種','種屬','品種','栽培品種','品種名','품종','재배 품종','variety','varietal','cultivar','var.','var','cv.','cv','species','botanical variety'],
  process: ['处理法','处理方式','加工法','加工方式','发酵方式','处理工艺','處理法','處理方式','加工法','發酵方式','精製方法','精製法','加工方法','処理方法','発酵方法','가공 방식','가공법','프로세싱','정제 방식','발효 방식','process','processing','processing method','proc.','proc','method','fermentation'],
  roast: ['烘焙度','烘焙程度','焙度','烘焙度','焙度','焙煎度','ローストレベル','焼き加減','배전도','로스팅 정도','로스트 레벨','roast level','roast profile','roast'],
  roastDate: ['烘焙日期','烘焙时间','烘焙日','焙炒日期','烘烤日期','出炉日期','烘焙日期','烘焙時間','焙煎日','焙煎日付','焙煎年月日','로스팅 날짜','로스팅일','배전일','roast date','roasted on','roast on','rst date','rst dt','rd'],
  productionDate: ['生产日期','制造日期','production date','prod date','manufactured on','mfg date','mfd'],
  packDate: ['包装日期','分装日期','pack date','packed on','packing date','pkd'],
  bestBefore: ['最佳赏味期','建议饮用日期','best before','best by','bbe'],
  expiryDate: ['到期日','有效期至','保质期至','use by','expiry','expiration date','exp'],
  roaster: ['烘焙商','烘焙厂','烘焙品牌','烘焙者','品牌','roaster','roasted by','roast house','roastery'],
  harvest: ['产季','收获季','收获年份','采收季','采收年份','生豆产季','收获年度','產季','收穫季','收穫年份','採收季','採收年份','生豆產季','收穫年度','採收年度','クロップ','クロップ年','クロップ年度','収穫年','収穫年度','収穫期','収穫シーズン','年産','크롭','크롭 연도','수확 연도','수확년도','수확기','수확 시기','수확 시즌','생산 연도','crop','crop year','harvest','harvest year','season','crop season','cy'],
  flavor: ['风味','风味描述','杯测风味','风味标签','品鉴笔记','香气','風味','風味描述','杯測風味','香氣','フレーバー','風味','カッピングコメント','テイスティングノート','香り','플레이버','향미','컵노트','테이스팅 노트','아로마','flavor notes','flavour notes','tasting notes','cup notes','cupping notes','sensory notes','aroma'],
  altitude: ['海拔','种植海拔','高度','種植海拔','標高','栽培標高','고도','재배 고도','elevation','altitude','elev.','elev','alt.','alt','masl','m.a.s.l.','meters above sea level','metres above sea level','ft asl','feet above sea level'],
  roastColor: ['烘焙色值','色值','艾格壮','烘焙色值','色值','焙煎色','アグトロン','배전 색도','애그트론','agtron','gourmet agtron','commercial agtron','roast color','colour value','color value','whole bean color','ground color'],
  weight: ['净重','重量','克重','包装重量','淨重','重量','包裝重量','内容量','正味重量','중량','내용량','순중량','net weight','net wt','net wt.','n.w.','nw'],
  price: ['价格','售价','购买价','price','retail price'],
  lot: ['批次','批号','地块批次','lot','lot no','lot number','batch','batch no'],
  grade: ['等级','分级','grade','screen size','screen','cup score','score']
});

function lexiconTerms(book, field) {
  const defaults = DEFAULT_LABEL_LEXICON[field] || [];
  const external = book?.labelLexicon?.fields?.[field];
  const aliases = Array.isArray(external) ? external : Array.isArray(external?.aliases) ? external.aliases : [];
  return [...new Set([...defaults, ...aliases].map(value => String(value || '').trim()).filter(Boolean))];
}

function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function labeledFieldValues(source, book) {
  const fieldOrder = ['roastDate','productionDate','packDate','bestBefore','expiryDate','roastColor','country','region','entity','variety','process','roast','roaster','harvest','flavor','altitude','weight','price','lot','grade'];
  const definitions = fieldOrder.map(field => [field, new RegExp(`^(?:${lexiconTerms(book, field).sort((a,b)=>b.length-a.length).map(escapeRegex).join('|')})\\s*(?:[:：=]|-\\s+)?\\s*(.+)$`, 'i')]);
  const result = {};
  const lines = String(source || '').replace(/\r/g, '').split(/\n+/).map(normalizeLabelValue).filter(Boolean);
  for (const line of lines) {
    for (const [field, regex] of definitions) {
      const match = line.match(regex);
      if (match && !result[field]) { result[field] = normalizeLabelValue(match[1]); break; }
    }
  }
  return result;
}

const MULTILINGUAL_VALUE_NORMALIZATION = Object.freeze([
  [/^(?:ゲイシャ|ゲシャ|게이샤)$/i, 'Gesha'],
  [/^(?:ウォッシュド|水洗式|워시드|수세식)$/i, 'Washed'],
  [/^(?:ナチュラル|自然乾燥|내추럴|건식)$/i, 'Natural'],
  [/^(?:ハニー|허니)$/i, 'Honey'],
  [/^(?:エチオピア|에티오피아)$/i, 'Ethiopia'],
  [/^(?:コロンビア|콜롬비아)$/i, 'Colombia'],
  [/^(?:パナマ|파나마)$/i, 'Panama'],
  [/^(?:ケニア|케냐)$/i, 'Kenya'],
  [/^(?:ブラジル|브라질)$/i, 'Brazil']
]);

function normalizeMultilingualValue(value) {
  const raw = normalizeLabelValue(value);
  for (const [pattern, canonical] of MULTILINGUAL_VALUE_NORMALIZATION) if (pattern.test(raw)) return canonical;
  return raw;
}

function bestTableMatch(value, rows) {
  const source = normalizeMultilingualValue(value);
  if (!source) return null;
  const normalizedCodes = normalizeCodeSource(source);
  const directMatches = (rows || []).map(row => directCodeMatch(normalizedCodes, [row])).filter(Boolean);
  if (directMatches.length === 1) return directMatches[0];
  if (directMatches.length > 1) return null;
  const lower = source.toLocaleLowerCase('zh-CN');
  const exactFragments = lower.split(/[\/、,，;；|]+/).map(item => item.trim()).filter(Boolean);
  const exactMatches = [];
  for (const row of rows || []) {
    const aliases = row.slice(1).filter(item => typeof item === 'string').map(item => item.toLocaleLowerCase('zh-CN').trim()).filter(Boolean);
    const alias = aliases.find(item => exactFragments.includes(item));
    if (alias) exactMatches.push({ code: row[0], alias, row, direct: false });
  }
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) return null;
  let best = null;
  for (const row of rows || []) {
    const aliases = row.slice(1)
      .filter(item => typeof item === 'string' && item && !['active', 'candidate'].includes(item))
      .flatMap(item => item.split(/[\\/、,，;；|]/))
      .map(item => item.trim())
      .filter(item => item.length >= 1);
    for (const alias of aliases) {
      const needle = alias.toLocaleLowerCase('zh-CN');
      if ((lower === needle || lower.includes(needle) || needle.includes(lower)) && (!best || needle.length > best.alias.length)) {
        best = { code: row[0], alias, row, direct: false };
      }
    }
  }
  return best;
}

function validIsoDate(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || y < 2000 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return '';
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const MONTH_NUMBER = Object.freeze({ jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12 });
function fullYear(value) { const number=Number(value); return number < 100 ? 2000 + number : number; }
function dateResult(rawValue, normalizedValue, formatId, confidence, extra = {}) {
  return { rawValue: String(rawValue || ''), normalizedValue, formatId, confidence, candidates: extra.candidates || (normalizedValue ? [normalizedValue] : []), warnings: extra.warnings || [] };
}

export function parseCoffeeDateValue(value, { field = 'roastDate' } = {}) {
  const text = normalizeLabelValue(value).replace(/[,，]/g, ' ').trim();
  let m;
  m = text.match(/(?:^|\D)(20\d{2})[年](\d{1,2})月(\d{1,2})日?(?:\D|$)/);
  if (m) { const iso=validIsoDate(m[1],m[2],m[3]); if(iso)return dateResult(m[0].trim(),iso,'YMD_CN',0.995); }
  m = text.match(/(?:^|\D)(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D|$)/);
  if (m) { const iso=validIsoDate(m[1],m[2],m[3]); if(iso)return dateResult(m[0].trim(),iso,'YMD_SEPARATED',0.995); }
  m = text.match(/(?:^|\D)(20\d{2})(\d{2})(\d{2})(?:\D|$)/);
  if (m) { const iso=validIsoDate(m[1],m[2],m[3]); if(iso)return dateResult(m[0].trim(),iso,'YYYYMMDD',0.99); }
  m = text.match(/(?:^|\D)(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2}|\d{2})(?:\D|$)/i);
  if (m && MONTH_NUMBER[m[2].toLowerCase()]) { const iso=validIsoDate(fullYear(m[3]),MONTH_NUMBER[m[2].toLowerCase()],m[1]); if(iso)return dateResult(m[0].trim(),iso,'D_MON_Y',0.98); }
  m = text.match(/(?:^|\D)([A-Za-z]{3,9})\s+(\d{1,2})\s+(20\d{2}|\d{2})(?:\D|$)/i);
  if (m && MONTH_NUMBER[m[1].toLowerCase()]) { const iso=validIsoDate(fullYear(m[3]),MONTH_NUMBER[m[1].toLowerCase()],m[2]); if(iso)return dateResult(m[0].trim(),iso,'MON_D_Y',0.98); }
  m = text.match(/(?:^|\D)(\d{2})[年](\d{1,2})月(\d{1,2})日?(?:\D|$)/);
  if (m) { const iso=validIsoDate(fullYear(m[1]),m[2],m[3]); if(iso)return dateResult(m[0].trim(),iso,'YYMD_CN',0.97); }
  m = text.match(/(?:^|\D)(\d{2})[.\/-](\d{3,4})(?:\D|$)/);
  if (m) { const tail=m[2], month=tail.length===3?tail.slice(0,1):tail.slice(0,2), day=tail.slice(-2); const iso=validIsoDate(fullYear(m[1]),month,day); if(iso)return dateResult(m[0].trim(),iso,'YY_MDD_COMPACT',0.96); }
  m = text.match(/(?:^|\D)(\d{2})(\d{2})(\d{2})(?:\D|$)/);
  if (m) { const iso=validIsoDate(fullYear(m[1]),m[2],m[3]); if(iso)return dateResult(m[0].trim(),iso,'YYMMDD',0.96); }
  m = text.match(/(?:^|\D)(\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D|$)/);
  if (m) {
    const currentTwoDigit = new Date().getFullYear() % 100;
    const possibleYear = Number(m[1]);
    if (possibleYear >= 20 && possibleYear <= currentTwoDigit + 1) {
      const ymd=validIsoDate(fullYear(m[1]),m[2],m[3]);
      if (ymd) return dateResult(m[0].trim(),ymd,'YYMD_SEPARATED',0.95);
    }
  }
  m = text.match(/(?:^|\D)(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|20\d{2})(?:\D|$)/);
  if (m) {
    const year=fullYear(m[3]);
    const dmy=validIsoDate(year,m[2],m[1]), mdy=validIsoDate(year,m[1],m[2]);
    const candidates=[...new Set([dmy,mdy].filter(Boolean))];
    if (candidates.length===1) return dateResult(m[0].trim(),candidates[0],dmy?'DMY_SEPARATED':'MDY_SEPARATED',0.91);
    if (candidates.length>1) return dateResult(m[0].trim(),'','AMBIGUOUS_DMY_MDY',0.45,{candidates,warnings:[`${field}数字顺序不明确，需人工确认日/月。`]});
  }
  return dateResult(text,'','UNRECOGNIZED',0,{warnings:text?[`${field}日期格式未识别。`]:[]});
}

export function parseHarvestSeasonValue(value) {
  const text=normalizeLabelValue(value);
  const suffix='(?:crop(?:\s*year|\s*season)?|harvest(?:\s*year|\s*season)?|season|产季|產季|收获年度|收穫年度|クロップ(?:年|年度)?|収穫(?:年|年度|期|シーズン)|年産|크롭(?:\s*연도)?|수확(?:\s*연도|년도|기|\s*시기|\s*시즌)|생산\s*연도)';
  let m=text.match(new RegExp(`(?:^|\\D)(20\\d{2}|\\d{2})\\s*[-–—/]\\s*(20\\d{2}|\\d{2})(?:\\s*${suffix})?(?:\\D|$)`,'i'));
  if(m){const a=fullYear(m[1]),rawB=fullYear(m[2]);const b=rawB<a&&m[2].length===2?a-(a%100)+Number(m[2]):rawB;return {rawValue:m[0].trim(),normalizedValue:`${a}/${b}`,harvestYear:a,harvestEndYear:b,formatId:'HARVEST_RANGE',confidence:0.985,candidates:[`${a}/${b}`],warnings:[]};}
  m=text.match(new RegExp(`(?:^|\\D)(20\\d{2}|\\d{2})(?:\\s*${suffix})?(?:\\D|$)`,'i'));
  if(m){const year=fullYear(m[1]);return {rawValue:m[0].trim(),normalizedValue:String(year),harvestYear:year,harvestEndYear:year,formatId:'HARVEST_YEAR',confidence:0.975,candidates:[String(year)],warnings:[]};}
  return {rawValue:text,normalizedValue:'',harvestYear:0,harvestEndYear:0,formatId:'UNRECOGNIZED',confidence:0,candidates:[],warnings:text?['产季年份格式未识别。']:[]};
}

export function parseRoastColorValue(value) {
  const text=normalizeLabelValue(value);
  const values=[...text.matchAll(/(?:agtron\s*)?(\d{2,3}(?:\.\d+)?)/ig)].map(match=>Number(match[1])).filter(number=>number>=20&&number<=120);
  if(!values.length)return {rawValue:text,normalizedValue:'',value:0,scale:'',formatId:'UNRECOGNIZED',confidence:0,candidates:[],warnings:text?['未找到20–120范围内的烘焙色值。']:[]};
  const scale=/ground|粉/i.test(text)?'ground':/whole\s*bean|整豆/i.test(text)?'whole-bean':/gourmet/i.test(text)?'gourmet':/commercial/i.test(text)?'commercial':'unspecified';
  return {rawValue:text,normalizedValue:String(values[0]),value:values[0],scale,formatId:'AGTRON_VALUE',confidence:values.length===1?0.98:0.76,candidates:values.map(String),warnings:values.length>1?['同一标签包含多个色值，默认采用第一个并保留全部候选。']:[]};
}

function recordMatch(result, field, match, labeled = false) {
  if (!match) return;
  result[field] = match.code;
  result.confidence[field] = match.direct ? 0.995 : (labeled ? 0.96 : Math.min(0.94, 0.62 + match.alias.length / 20));
  result.evidence[field] = match.alias;
}

export function parseNaturalLanguage(text, book) {
  const source = String(text || '').trim();
  const lower = source.toLocaleLowerCase('zh-CN');
  const normalizedCodes = normalizeCodeSource(source);
  const labeled = labeledFieldValues(source, book);
  const result = { confidence: {}, evidence: {}, parseMetadata: {}, sourceText: source };
  const definitions = [
    ['countries', 'countryCode', 'country', 'countryCustomName'],
    ['regions', 'regionCode', 'region', 'regionCustomName'],
    ['entities', 'entityCode', 'entity', 'entityCustomName'],
    ['varieties', 'varietyCode', 'variety', 'varietyCustomName'],
    ['processes', 'processCode', 'process', 'processCustomName']
  ];

  for (const [table, field, labelKey, customField] of definitions) {
    const labeledValue = labeled[labelKey] || '';
    if (labeledValue) {
      const labeledMatch = bestTableMatch(labeledValue, book[table]);
      if (labeledMatch) {
        recordMatch(result, field, labeledMatch, true);
      } else {
        result[customField] = labeledValue;
        result.confidence[customField] = 0.86;
        result.evidence[customField] = labeledValue;
        result.confidence[field] = 0.45;
        result.evidence[field] = labeledValue;
      }
      continue;
    }

    let best = directCodeMatch(normalizedCodes, book[table]);
    if (!best) {
      for (const row of book[table] || []) {
        const aliases = row.slice(1)
          .filter(value => typeof value === 'string' && value && !['active', 'candidate'].includes(value))
          .flatMap(value => value.split(/[\\/、,，;；|]/))
          .map(value => value.trim())
          .filter(value => value.length >= 2);
        for (const alias of aliases) {
          const needle = alias.toLocaleLowerCase('zh-CN');
          if (lower.includes(needle) && (!best || needle.length > best.alias.length)) best = { code: row[0], alias, row, direct: false };
        }
      }
    }
    recordMatch(result, field, best, false);
  }

  const harvestAliases = lexiconTerms(book, 'harvest').map(term => term.toLocaleLowerCase('zh-CN'));
  const sourceWithoutHarvest = source.replace(/\r/g, '').split(/\n+/).filter(line => {
    const normalized = normalizeLabelValue(line).toLocaleLowerCase('zh-CN');
    return !harvestAliases.some(alias => normalized === alias || normalized.startsWith(`${alias}:`) || normalized.startsWith(`${alias}：`) || normalized.startsWith(`${alias} `) || normalized.endsWith(alias));
  }).join('\n');
  const roastSource = labeled.roast || sourceWithoutHarvest;
  const roastMap = [
    [/极浅|超浅|極淺|最浅煎り|ライトest|lightest/i, 'RL-L0'], [/浅中|淺中|中浅煎り|미디엄 라이트|medium\s*light/i, 'RL-L2'], [/浅烘|浅度|淺焙|浅煎り|ライトロースト|약배전|라이트 로스트|light/i, 'RL-L1'],
    [/中深|中深焙|中深煎り|강중배전|medium\s*dark/i, 'RL-L4'], [/中烘|中度|中焙|中煎り|ミディアムロースト|중배전|미디엄 로스트|medium/i, 'RL-L3'], [/极深|極深|法式|深深煎り|프렌치 로스트|very\s*dark/i, 'RL-L6'], [/深烘|深度|深焙|深煎り|ダークロースト|강배전|다크 로스트|dark/i, 'RL-L5']
  ];
  for (const [regex, code] of roastMap) {
    if (regex.test(roastSource)) {
      result.roastCode = code;
      result.confidence.roastCode = labeled.roast ? 0.96 : 0.9;
      result.evidence.roastCode = roastSource.match(regex)?.[0];
      break;
    }
  }
  const roastCode = normalizeCodeSource(roastSource).match(/(?:^|[^A-Z0-9])(RL-L[0-6])(?:$|[^A-Z0-9])/);
  if (roastCode) {
    result.roastCode = roastCode[1];
    result.confidence.roastCode = 0.995;
    result.evidence.roastCode = roastCode[1];
  }

  const roastDateInput = labeled.roastDate || '';
  const roastDateMatch = parseCoffeeDateValue(roastDateInput, { field: 'roastDate' });
  if (roastDateInput) result.parseMetadata.roastDate = { ...roastDateMatch, sourceLabel: 'roastDate' };
  if (roastDateMatch.normalizedValue) {
    result.roastDate = roastDateMatch.normalizedValue;
    result.confidence.roastDate = roastDateMatch.confidence;
    result.evidence.roastDate = roastDateMatch.rawValue;
  }

  for (const field of ['productionDate', 'packDate', 'bestBefore', 'expiryDate']) {
    if (!labeled[field]) continue;
    const match = parseCoffeeDateValue(labeled[field], { field });
    result.parseMetadata[field] = { ...match, sourceLabel: field, excludedFromRoastDate: true };
  }

  const harvestMatch = parseHarvestSeasonValue(labeled.harvest || '');
  if (labeled.harvest) result.parseMetadata.harvest = { ...harvestMatch, sourceLabel: 'harvest' };
  if (harvestMatch.harvestYear) {
    result.harvestYear = harvestMatch.harvestYear;
    result.harvestSeason = harvestMatch.normalizedValue;
    result.confidence.harvestYear = harvestMatch.confidence;
    result.evidence.harvestYear = harvestMatch.rawValue;
  }

  const roastColorMatch = parseRoastColorValue(labeled.roastColor || '');
  if (labeled.roastColor) result.parseMetadata.roastColor = { ...roastColorMatch, sourceLabel: 'roastColor' };
  if (roastColorMatch.value) {
    result.roastColor = roastColorMatch.value;
    result.confidence.roastColor = roastColorMatch.confidence;
    result.evidence.roastColor = `${roastColorMatch.rawValue}${roastColorMatch.scale !== 'unspecified' ? ` · ${roastColorMatch.scale}` : ''}`;
  }

  if (labeled.roaster) {
    result.roasterName = labeled.roaster;
    result.confidence.roasterName = 0.97;
    result.evidence.roasterName = labeled.roaster;
  }

  const altitudeSource = labeled.altitude || sourceWithoutHarvest;
  const altitude = altitudeSource.match(/(\d{3,4})\s*(?:m|米)?/i);
  if (altitude) {
    result.altitude = Number(altitude[1]);
    result.confidence.altitude = labeled.altitude ? 0.97 : 0.85;
    result.evidence.altitude = labeled.altitude || altitude[0];
  }
  const weightSource = labeled.weight || sourceWithoutHarvest;
  const weight = weightSource.match(/(\d{2,4}(?:\.\d+)?)\s*(?:g|克)?/i);
  if (weight) {
    result.initialWeight = Number(weight[1]);
    result.confidence.initialWeight = labeled.weight ? 0.95 : 0.8;
    result.evidence.initialWeight = labeled.weight || weight[0];
  }
  const priceSource = labeled.price || source;
  const price = priceSource.match(/[¥￥]?\s*(\d+(?:\.\d+)?)/);
  if (labeled.price && price) {
    result.price = Number(price[1]);
    result.confidence.price = 0.95;
    result.evidence.price = labeled.price;
  }

  const flavorSource = labeled.flavor || source;
  const flavorLower = flavorSource.toLocaleLowerCase('zh-CN');
  const flavorMatches = [];
  let residue = flavorSource;
  for (const row of book.flavors || []) {
    const direct = directCodeMatch(normalizeCodeSource(flavorSource), [row]);
    if (direct) {
      flavorMatches.push(row[0]);
      residue = residue.replaceAll(String(row[0]), ' ');
      continue;
    }
    const flavorFields = row.length >= 9 ? [row[4], row[5], row[6], row[7]] : [row[1], row[2], row[3]];
    const aliases = flavorFields
      .filter(value => typeof value === 'string')
      .flatMap(value => value.split(/[/、,，;；|]/).map(item => item.trim()).filter(Boolean));
    const matchedAlias = aliases.sort((a, b) => b.length - a.length).find(alias => alias.length >= 2 && flavorLower.includes(alias.toLocaleLowerCase('zh-CN')));
    if (matchedAlias) {
      flavorMatches.push(row[0]);
      residue = residue.replaceAll(matchedAlias, ' ');
    }
  }
  result.flavorCodes = [...new Set(flavorMatches)].slice(0, 12);
  if (labeled.flavor) {
    const custom = residue
      .split(/[、,，;；/|\s]+/)
      .map(value => value.trim())
      .filter(value => value.length >= 2 && !/^(风味|描述|杯测)$/.test(value));
    if (custom.length) {
      result.customFlavorNames = [...new Set(custom)].slice(0, 8);
      result.confidence.customFlavorNames = 0.7;
      result.evidence.customFlavorNames = custom.join('、');
    }
  }
  return result;
}
