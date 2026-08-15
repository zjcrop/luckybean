from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing replacement anchor: {label}')
    return text.replace(old, new, 1)


# --- src/codebook.js -------------------------------------------------------
path = ROOT / 'src/codebook.js'
text = path.read_text(encoding='utf-8')

text = replace_once(text,
"  country: ['产地国','原产国','原产地','国家','产地','origin','country of origin','origin country','country'],\n  region: ['产区','地区','区域','省','州','县','region','growing region','origin region','zone','district','province','terroir'],\n  entity: ['庄园','农场','生产者','农户','合作社','处理站','水洗站','处理厂','磨坊','工厂','producer','farmer','grower','farm','estate','finca','hacienda','cooperative','co-op','coop','washing station','ws','wet mill','dry mill','mill','factory'],\n  variety: ['豆种','品种','咖啡品种','栽培种','种属','variety','varietal','cultivar','var.','var','cv.','cv','species','botanical variety'],\n  process: ['处理法','处理方式','加工法','加工方式','发酵方式','处理工艺','process','processing','processing method','proc.','proc','method','fermentation'],\n  roast: ['烘焙度','烘焙程度','焙度','roast level','roast profile','roast'],\n  roastDate: ['烘焙日期','烘焙时间','烘焙日','焙炒日期','烘烤日期','出炉日期','roast date','roasted on','roast on','rst date','rst dt','rd'],",
"  country: ['产地国','原产国','原产地','国家','产地','產地國','原產國','原產地','國家','產地','生産国','原産国','原産地','생산국','원산국','원산지','origin','country of origin','origin country','country'],\n  region: ['产区','地区','区域','省','州','县','產區','地區','區域','産地','地域','生産地域','生産地','산지','지역','생산 지역','생산지','region','growing region','origin region','zone','district','province','terroir'],\n  entity: ['庄园','农场','生产者','农户','合作社','处理站','水洗站','处理厂','磨坊','工厂','莊園','農場','生產者','農戶','合作社','處理站','水洗站','處理廠','農園','農場','生産者','協同組合','精製所','ウォッシングステーション','농장','생산자','협동조합','가공소','워싱 스테이션','producer','farmer','grower','farm','estate','finca','hacienda','cooperative','co-op','coop','washing station','ws','wet mill','dry mill','mill','factory'],\n  variety: ['豆种','品种','咖啡品种','栽培种','种属','豆種','品種','咖啡品種','栽培種','種屬','品種','栽培品種','品種名','품종','재배 품종','variety','varietal','cultivar','var.','var','cv.','cv','species','botanical variety'],\n  process: ['处理法','处理方式','加工法','加工方式','发酵方式','处理工艺','處理法','處理方式','加工法','發酵方式','精製方法','精製法','加工方法','処理方法','発酵方法','가공 방식','가공법','프로세싱','정제 방식','발효 방식','process','processing','processing method','proc.','proc','method','fermentation'],\n  roast: ['烘焙度','烘焙程度','焙度','烘焙度','焙度','焙煎度','ローストレベル','焼き加減','배전도','로스팅 정도','로스트 레벨','roast level','roast profile','roast'],\n  roastDate: ['烘焙日期','烘焙时间','烘焙日','焙炒日期','烘烤日期','出炉日期','烘焙日期','烘焙時間','焙煎日','焙煎日付','焙煎年月日','로스팅 날짜','로스팅일','배전일','roast date','roasted on','roast on','rst date','rst dt','rd'],",
'default field aliases core')

text = replace_once(text,
"  harvest: ['产季','收获季','收获年份','采收季','采收年份','生豆产季','crop','crop year','harvest','harvest year','season','crop season','cy'],\n  flavor: ['风味','风味描述','杯测风味','风味标签','品鉴笔记','香气','flavor notes','flavour notes','tasting notes','cup notes','cupping notes','sensory notes','aroma'],\n  altitude: ['海拔','种植海拔','高度','elevation','altitude','elev.','elev','alt.','alt','masl','m.a.s.l.','meters above sea level','metres above sea level','ft asl','feet above sea level'],\n  roastColor: ['烘焙色值','色值','艾格壮','agtron','gourmet agtron','commercial agtron','roast color','colour value','color value','whole bean color','ground color'],\n  weight: ['净重','重量','克重','包装重量','net weight','net wt','net wt.','n.w.','nw'],",
"  harvest: ['产季','收获季','收获年份','采收季','采收年份','生豆产季','收获年度','產季','收穫季','收穫年份','採收季','採收年份','生豆產季','收穫年度','採收年度','クロップ','クロップ年','クロップ年度','収穫年','収穫年度','収穫期','収穫シーズン','年産','크롭','크롭 연도','수확 연도','수확년도','수확기','수확 시기','수확 시즌','생산 연도','crop','crop year','harvest','harvest year','season','crop season','cy'],\n  flavor: ['风味','风味描述','杯测风味','风味标签','品鉴笔记','香气','風味','風味描述','杯測風味','香氣','フレーバー','風味','カッピングコメント','テイスティングノート','香り','플레이버','향미','컵노트','테이스팅 노트','아로마','flavor notes','flavour notes','tasting notes','cup notes','cupping notes','sensory notes','aroma'],\n  altitude: ['海拔','种植海拔','高度','種植海拔','標高','栽培標高','고도','재배 고도','elevation','altitude','elev.','elev','alt.','alt','masl','m.a.s.l.','meters above sea level','metres above sea level','ft asl','feet above sea level'],\n  roastColor: ['烘焙色值','色值','艾格壮','烘焙色值','色值','焙煎色','アグトロン','배전 색도','애그트론','agtron','gourmet agtron','commercial agtron','roast color','colour value','color value','whole bean color','ground color'],\n  weight: ['净重','重量','克重','包装重量','淨重','重量','包裝重量','内容量','正味重量','중량','내용량','순중량','net weight','net wt','net wt.','n.w.','nw'],",
'harvest and misc multilingual aliases')

# Normalize a compact set of high-value Japanese/Korean label values before table matching.
anchor = "function bestTableMatch(value, rows) {\n  const source = normalizeLabelValue(value);"
replacement = """const MULTILINGUAL_VALUE_NORMALIZATION = Object.freeze([
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
  const source = normalizeMultilingualValue(value);"""
text = replace_once(text, anchor, replacement, 'multilingual value normalization')

# Harvest parser: JA/KO suffixes, ranges, compact 25/26 style.
old = """export function parseHarvestSeasonValue(value) {
  const text=normalizeLabelValue(value);
  let m=text.match(/(?:^|\\D)(20\\d{2}|\\d{2})\\s*[-–—\\/]\\s*(20\\d{2}|\\d{2})(?:\\s*(?:crop|产季|season))?(?:\\D|$)/i);
  if(m){const a=fullYear(m[1]),b=fullYear(m[2]);return {rawValue:m[0].trim(),normalizedValue:`${a}/${b}`,harvestYear:a,harvestEndYear:b,formatId:'HARVEST_RANGE',confidence:0.98,candidates:[`${a}/${b}`],warnings:[]};}
  m=text.match(/(?:^|\\D)(20\\d{2}|\\d{2})(?:\\s*(?:产季|年度|年|crop|crop year|harvest|season))?(?:\\D|$)/i);
  if(m){const year=fullYear(m[1]);return {rawValue:m[0].trim(),normalizedValue:String(year),harvestYear:year,harvestEndYear:year,formatId:'HARVEST_YEAR',confidence:0.97,candidates:[String(year)],warnings:[]};}
  return {rawValue:text,normalizedValue:'',harvestYear:0,harvestEndYear:0,formatId:'UNRECOGNIZED',confidence:0,candidates:[],warnings:text?['产季年份格式未识别。']:[]};
}"""
new = """export function parseHarvestSeasonValue(value) {
  const text=normalizeLabelValue(value);
  const suffix='(?:crop(?:\\s*year|\\s*season)?|harvest(?:\\s*year|\\s*season)?|season|产季|產季|收获年度|收穫年度|クロップ(?:年|年度)?|収穫(?:年|年度|期|シーズン)|年産|크롭(?:\\s*연도)?|수확(?:\\s*연도|년도|기|\\s*시기|\\s*시즌)|생산\\s*연도)';
  let m=text.match(new RegExp(`(?:^|\\\\D)(20\\\\d{2}|\\\\d{2})\\\\s*[-–—/]\\\\s*(20\\\\d{2}|\\\\d{2})(?:\\\\s*${suffix})?(?:\\\\D|$)`,'i'));
  if(m){const a=fullYear(m[1]),rawB=fullYear(m[2]);const b=rawB<a&&m[2].length===2?a-(a%100)+Number(m[2]):rawB;return {rawValue:m[0].trim(),normalizedValue:`${a}/${b}`,harvestYear:a,harvestEndYear:b,formatId:'HARVEST_RANGE',confidence:0.985,candidates:[`${a}/${b}`],warnings:[]};}
  m=text.match(new RegExp(`(?:^|\\\\D)(20\\\\d{2}|\\\\d{2})(?:\\\\s*${suffix})?(?:\\\\D|$)`,'i'));
  if(m){const year=fullYear(m[1]);return {rawValue:m[0].trim(),normalizedValue:String(year),harvestYear:year,harvestEndYear:year,formatId:'HARVEST_YEAR',confidence:0.975,candidates:[String(year)],warnings:[]};}
  return {rawValue:text,normalizedValue:'',harvestYear:0,harvestEndYear:0,formatId:'UNRECOGNIZED',confidence:0,candidates:[],warnings:text?['产季年份格式未识别。']:[]};
}"""
text = replace_once(text, old, new, 'harvest parser')

# Prevent harvest-labelled lines from leaking into roast/altitude/weight fallback scanning.
anchor = "  const roastSource = labeled.roast || source;"
replacement = """  const harvestAliases = lexiconTerms(book, 'harvest').map(term => term.toLocaleLowerCase('zh-CN'));
  const sourceWithoutHarvest = source.replace(/\\r/g, '').split(/\\n+/).filter(line => {
    const normalized = normalizeLabelValue(line).toLocaleLowerCase('zh-CN');
    return !harvestAliases.some(alias => normalized === alias || normalized.startsWith(`${alias}:`) || normalized.startsWith(`${alias}：`) || normalized.startsWith(`${alias} `) || normalized.endsWith(alias));
  }).join('\\n');
  const roastSource = labeled.roast || sourceWithoutHarvest;"""
text = replace_once(text, anchor, replacement, 'exclude harvest from roast fallback')
text = replace_once(text, "  const altitudeSource = labeled.altitude || source;", "  const altitudeSource = labeled.altitude || sourceWithoutHarvest;", 'exclude harvest from altitude fallback')
text = replace_once(text, "  const weightSource = labeled.weight || source;", "  const weightSource = labeled.weight || sourceWithoutHarvest;", 'exclude harvest from weight fallback')

# Expand roast values for Japanese/Korean direct semantics.
text = replace_once(text,
"    [/极浅|超浅|lightest/i, 'RL-L0'], [/浅中|medium\\s*light/i, 'RL-L2'], [/浅烘|浅度|light/i, 'RL-L1'],\n    [/中深|medium\\s*dark/i, 'RL-L4'], [/中烘|中度|medium/i, 'RL-L3'], [/极深|法式|very\\s*dark/i, 'RL-L6'], [/深烘|深度|dark/i, 'RL-L5']",
"    [/极浅|超浅|極淺|最浅煎り|ライトest|lightest/i, 'RL-L0'], [/浅中|淺中|中浅煎り|미디엄 라이트|medium\\s*light/i, 'RL-L2'], [/浅烘|浅度|淺焙|浅煎り|ライトロースト|약배전|라이트 로스트|light/i, 'RL-L1'],\n    [/中深|中深焙|中深煎り|강중배전|medium\\s*dark/i, 'RL-L4'], [/中烘|中度|中焙|中煎り|ミディアムロースト|중배전|미디엄 로스트|medium/i, 'RL-L3'], [/极深|極深|法式|深深煎り|프렌치 로스트|very\\s*dark/i, 'RL-L6'], [/深烘|深度|深焙|深煎り|ダークロースト|강배전|다크 로스트|dark/i, 'RL-L5']",
'roast multilingual values')

path.write_text(text, encoding='utf-8')


# --- src/domain/recognition/recognition-document.js ------------------------
path = ROOT / 'src/domain/recognition/recognition-document.js'
text = path.read_text(encoding='utf-8')
text = replace_once(text,
"  harvest: ['产季','收获季','采收季','采收年份','收获年份','年度','生豆产季','產季','收穫季','採收季','crop','crop year','harvest','harvest year','season','crop season','cy'],",
"  harvest: ['产季','收获季','采收季','采收年份','收获年份','年度','生豆产季','收获年度','產季','收穫季','採收季','採收年份','收穫年份','生豆產季','收穫年度','採收年度','クロップ','クロップ年','クロップ年度','収穫年','収穫年度','収穫期','収穫シーズン','年産','크롭','크롭 연도','수확 연도','수확년도','수확기','수확 시기','수확 시즌','생산 연도','crop','crop year','harvest','harvest year','season','crop season','cy'],",
'recognition harvest multilingual')

# Add representative JA/KO field aliases to the layout anchor layer.
text = replace_once(text,
"  country: ['国家','产国','原产国','生产国','咖啡产国','國家','產國','原產國','country','country of origin','origin country'],",
"  country: ['国家','产国','原产国','生产国','咖啡产国','國家','產國','原產國','生産国','原産国','생산국','원산국','country','country of origin','origin country'],",
'recognition country multilingual')
text = replace_once(text,
"  variety: ['品种','豆种','树种','咖啡品种','栽培种','種屬','品種','豆種','樹種','variety','varietal','cultivar','botanical variety','var.','var','cv.','cv'],",
"  variety: ['品种','豆种','树种','咖啡品种','栽培种','種屬','品種','豆種','樹種','品種','栽培品種','품종','재배 품종','variety','varietal','cultivar','botanical variety','var.','var','cv.','cv'],",
'recognition variety multilingual')
text = replace_once(text,
"  process: ['处理法','处理方式','处理','精制法','后制处理','后制法','加工法','加工方式','发酵方式','处理工艺','處理法','處理方式','後製法','process','processing','processing method','post-harvest process','proc.','proc','method'],",
"  process: ['处理法','处理方式','处理','精制法','后制处理','后制法','加工法','加工方式','发酵方式','处理工艺','處理法','處理方式','後製法','精製方法','精製法','加工方法','処理方法','가공 방식','가공법','프로세싱','정제 방식','process','processing','processing method','post-harvest process','proc.','proc','method'],",
'recognition process multilingual')
text = replace_once(text,
"  roastDate: ['烘焙日期','烘焙日','烘豆日期','烘焙时间','出炉日期','焙炒日期','烘烤日期','烘焙日期','烘焙日','烘豆日期','烘焙時間','出爐日期','roast date','roasted on','roasting date','date roasted','roast on','rst date','rst dt','rd'],",
"  roastDate: ['烘焙日期','烘焙日','烘豆日期','烘焙时间','出炉日期','焙炒日期','烘烤日期','烘焙日期','烘焙日','烘豆日期','烘焙時間','出爐日期','焙煎日','焙煎日付','焙煎年月日','로스팅 날짜','로스팅일','배전일','roast date','roasted on','roasting date','date roasted','roast on','rst date','rst dt','rd'],",
'recognition roast date multilingual')
text = replace_once(text,
"  roast: ['烘焙度','焙度','烘焙程度','烘焙程度描述','焙度','roast level','roast profile','roast'],",
"  roast: ['烘焙度','焙度','烘焙程度','烘焙程度描述','焙度','焙煎度','ローストレベル','焼き加減','배전도','로스팅 정도','로스트 레벨','roast level','roast profile','roast'],",
'recognition roast multilingual')
path.write_text(text, encoding='utf-8')


# --- src/app.js -------------------------------------------------------------
path = ROOT / 'src/app.js'
text = path.read_text(encoding='utf-8')
text = replace_once(text,
"import { loadCodebook, makeIndex, displayName, optionsHtml, relatedRows, parseNaturalLanguage, REMOTE_CODEBOOK_URL } from './codebook.js';",
"import { loadCodebook, makeIndex, displayName, optionsHtml, relatedRows, parseNaturalLanguage, parseHarvestSeasonValue, REMOTE_CODEBOOK_URL } from './codebook.js';",
'app codebook import')

# Compact, logical bean form and formal harvest field.
old = """        ${fieldHtml('beanCountry','国家',`<select id=\"beanCountry\" class=\"control\">${beanSelectOptions('countries',state.codebook.countries,bean.countryCode)}</select>`,'required')}
        ${fieldHtml('beanRegion','产区',`<div class=\"select-with-add\"><select id=\"beanRegion\" class=\"control\">${beanSelectOptions('regions',regions,bean.regionCode,2,bean.countryCode?'请选择产区':'先选择国家')}</select><button class=\"button subtle add-select-option\" type=\"button\" data-add-bean-option=\"regions\">新增选项</button></div>`)}
        ${fieldHtml('beanEntity','庄园 / 处理站',`<div class=\"select-with-add\"><select id=\"beanEntity\" class=\"control\">${beanSelectOptions('entities',entities,bean.entityCode,3,bean.countryCode?'请选择庄园 / 处理站':'先选择国家')}</select><button class=\"button subtle add-select-option\" type=\"button\" data-add-bean-option=\"entities\">新增选项</button></div>`)}
        ${fieldHtml('beanVariety','豆种',`<select id=\"beanVariety\" class=\"control\">${beanSelectOptions('varieties',state.codebook.varieties,bean.varietyCode)}</select>`,'required')}
        ${fieldHtml('beanProcess','处理法',`<select id=\"beanProcess\" class=\"control\">${beanSelectOptions('processes',state.codebook.processes,bean.processCode)}</select>`,'required')}
        ${fieldHtml('beanRoastColor','烘焙色值',`<input id=\"beanRoastColor\" class=\"control\" type=\"number\" min=\"20\" max=\"120\" step=\"1\" value=\"${esc(colorValue)}\" placeholder=\"Agtron 20–120\">`,'recommended')}
        ${fieldHtml('beanRoast','烘焙度',`<select id=\"beanRoast\" class=\"control\"><option value=\"\">填写色值自动生成</option>${ROASTS.map(([value,label])=>`<option value=\"${value}\"${roastValue===value?' selected':''}>${label}</option>`).join('')}</select>`,'required')}
        ${fieldHtml('beanRoastDate','烘焙日期',`<input id=\"beanRoastDate\" class=\"control\" type=\"date\" value=\"${esc(bean.roastDate || (source.type === 'manual' ? todayISO() : ''))}\">`,'required')}
        ${fieldHtml('beanInitialWeight','初始克重',`<input id=\"beanInitialWeight\" class=\"control\" type=\"number\" min=\"1\" max=\"10000\" step=\"0.1\" value=\"${esc(bean.initialWeight || '')}\">`,'required')}
        ${fieldHtml('beanRefrigerated','是否冷藏',`<select id=\"beanRefrigerated\" class=\"control\"><option value=\"false\"${!bean.refrigerated?' selected':''}>否</option><option value=\"true\"${bean.refrigerated?' selected':''}>是</option></select>`,'recommended')}
        ${fieldHtml('beanPrice','购买价格',`<input id=\"beanPrice\" class=\"control\" type=\"number\" min=\"0\" step=\"0.01\" value=\"${esc(bean.price || '')}\">`,'recommended')}
        ${fieldHtml('beanRoaster','烘焙商',`<input id=\"beanRoaster\" class=\"control\" maxlength=\"60\" value=\"${esc(bean.roasterName || bean.roaster || '')}\">`,'recommended')}
        ${fieldHtml('beanAltitude','海拔',`<input id=\"beanAltitude\" class=\"control\" type=\"number\" min=\"0\" max=\"5000\" value=\"${esc(bean.altitude || '')}\">`)}
        ${fieldHtml('beanNotes','备注',`<input id=\"beanNotes\" class=\"control\" maxlength=\"300\" value=\"${esc(bean.notes || '')}\">`)}"""
new = """        ${fieldHtml('beanCountry','国家',`<select id=\"beanCountry\" class=\"control\">${beanSelectOptions('countries',state.codebook.countries,bean.countryCode)}</select>`,'required')}
        ${fieldHtml('beanRegion','产区',`<div class=\"select-with-add\"><select id=\"beanRegion\" class=\"control\">${beanSelectOptions('regions',regions,bean.regionCode,2,bean.countryCode?'请选择产区':'先选择国家')}</select><button class=\"button subtle add-select-option\" type=\"button\" data-add-bean-option=\"regions\">新增选项</button></div>`)}
        ${fieldHtml('beanEntity','庄园 / 处理站',`<div class=\"select-with-add\"><select id=\"beanEntity\" class=\"control\">${beanSelectOptions('entities',entities,bean.entityCode,3,bean.countryCode?'请选择庄园 / 处理站':'先选择国家')}</select><button class=\"button subtle add-select-option\" type=\"button\" data-add-bean-option=\"entities\">新增选项</button></div>`)}
        ${fieldHtml('beanAltitude','海拔',`<input id=\"beanAltitude\" class=\"control\" type=\"number\" min=\"0\" max=\"5000\" value=\"${esc(bean.altitude || '')}\" placeholder=\"m\">`)}
        ${fieldHtml('beanVariety','豆种',`<select id=\"beanVariety\" class=\"control\">${beanSelectOptions('varieties',state.codebook.varieties,bean.varietyCode)}</select>`,'required')}
        ${fieldHtml('beanHarvestSeason','产季',`<input id=\"beanHarvestSeason\" class=\"control\" maxlength=\"20\" value=\"${esc(bean.harvestSeason || (bean.harvestYear ? String(bean.harvestYear) : ''))}\" placeholder=\"例如 2025/26\">`)}
        ${fieldHtml('beanProcess','处理法',`<select id=\"beanProcess\" class=\"control\">${beanSelectOptions('processes',state.codebook.processes,bean.processCode)}</select>`,'required')}
        ${fieldHtml('beanRoaster','烘焙商',`<input id=\"beanRoaster\" class=\"control\" maxlength=\"60\" value=\"${esc(bean.roasterName || bean.roaster || '')}\">`,'recommended')}
        ${fieldHtml('beanRoastDate','烘焙日期',`<input id=\"beanRoastDate\" class=\"control\" type=\"date\" value=\"${esc(bean.roastDate || (source.type === 'manual' ? todayISO() : ''))}\">`,'required')}
        ${fieldHtml('beanRoast','烘焙度',`<select id=\"beanRoast\" class=\"control\"><option value=\"\">填写色值自动生成</option>${ROASTS.map(([value,label])=>`<option value=\"${value}\"${roastValue===value?' selected':''}>${label}</option>`).join('')}</select>`,'required')}
        ${fieldHtml('beanRoastColor','烘焙色值',`<input id=\"beanRoastColor\" class=\"control\" type=\"number\" min=\"20\" max=\"120\" step=\"1\" value=\"${esc(colorValue)}\" placeholder=\"Agtron 20–120\">`,'recommended')}
        ${fieldHtml('beanInitialWeight','初始克重',`<input id=\"beanInitialWeight\" class=\"control\" type=\"number\" min=\"1\" max=\"10000\" step=\"0.1\" value=\"${esc(bean.initialWeight || '')}\">`,'required')}
        ${fieldHtml('beanPrice','购买价格',`<input id=\"beanPrice\" class=\"control\" type=\"number\" min=\"0\" step=\"0.01\" value=\"${esc(bean.price || '')}\">`,'recommended')}
        ${fieldHtml('beanRefrigerated','是否冷藏',`<select id=\"beanRefrigerated\" class=\"control\"><option value=\"false\"${!bean.refrigerated?' selected':''}>否</option><option value=\"true\"${bean.refrigerated?' selected':''}>是</option></select>`,'recommended')}
        ${fieldHtml('beanNotes','备注',`<input id=\"beanNotes\" class=\"control\" maxlength=\"300\" value=\"${esc(bean.notes || '')}\">`)}"""
text = replace_once(text, old, new, 'bean form layout')

# Confidence/evidence panel no longer shown to normal users; preflight is the review surface.
text = replace_once(text, "      ${source.evidence ? evidenceHtml(source.evidence, source.confidence) : ''}\n", "      ${source.preflightSummary ? `<details class=\"recognition-audit-details\"><summary>识别整理详情</summary><div class=\"details-content\">${esc(source.preflightSummary)}</div></details>` : ''}\n", 'remove confidence display')

# Persist harvest as formal optional bean fields.
text = replace_once(text,
"    const now = new Date().toISOString();\n    const record = {",
"    const now = new Date().toISOString();\n    const harvestInput = formValue('beanHarvestSeason');\n    const harvestParsed = parseHarvestSeasonValue(harvestInput);\n    const record = {",
'harvest parse on save')
text = replace_once(text,
"      roastColor: parseNumber(formValue('beanRoastColor'), 0) || '', roastCode: formValue('beanRoast'), roastDate: formValue('beanRoastDate'), initialWeight,",
"      harvestSeason: harvestParsed.normalizedValue || harvestInput, harvestYear: harvestParsed.harvestYear || 0, harvestEndYear: harvestParsed.harvestEndYear || 0,\n      roastColor: parseNumber(formValue('beanRoastColor'), 0) || '', roastCode: formValue('beanRoast'), roastDate: formValue('beanRoastDate'), initialWeight,",
'persist harvest fields')
text = replace_once(text,
"  return { ...state.beanFormDraft, countryCode: formValue('beanCountry'), regionCode: formValue('beanRegion'), entityCode: formValue('beanEntity'), varietyCode: formValue('beanVariety'), processCode: formValue('beanProcess'), roastColor: formValue('beanRoastColor'), roastCode: formValue('beanRoast'), roastDate: formValue('beanRoastDate'), initialWeight: formValue('beanInitialWeight'), refrigerated: formValue('beanRefrigerated') === 'true', price: formValue('beanPrice'), roasterName: formValue('beanRoaster'), altitude: formValue('beanAltitude'), notes: formValue('beanNotes'), flavorCodes: selectedSummaryCodes() };",
"  return { ...state.beanFormDraft, countryCode: formValue('beanCountry'), regionCode: formValue('beanRegion'), entityCode: formValue('beanEntity'), varietyCode: formValue('beanVariety'), harvestSeason: formValue('beanHarvestSeason'), processCode: formValue('beanProcess'), roastColor: formValue('beanRoastColor'), roastCode: formValue('beanRoast'), roastDate: formValue('beanRoastDate'), initialWeight: formValue('beanInitialWeight'), refrigerated: formValue('beanRefrigerated') === 'true', price: formValue('beanPrice'), roasterName: formValue('beanRoaster'), altitude: formValue('beanAltitude'), notes: formValue('beanNotes'), flavorCodes: selectedSummaryCodes() };",
'capture harvest draft')

# QR should map harvest into the formal field instead of burying it in notes.
text = replace_once(text,
"    decoded.notes = [`扫码识别`, decoded.agtron ? `Agtron ${decoded.agtron}` : '', decoded.harvestYear ? `产季 ${decoded.harvestYear}` : ''].filter(Boolean).join('；');",
"    decoded.harvestSeason = decoded.harvestSeason || (decoded.harvestYear ? String(decoded.harvestYear) : '');\n    decoded.notes = [`扫码识别`, decoded.agtron ? `Agtron ${decoded.agtron}` : ''].filter(Boolean).join('；');",
'qr harvest mapping')

# Bean detail summary includes harvest when available.
text = replace_once(text,
"  return [codeName('regions', bean.regionCode, ''), codeName('processes', bean.processCode, '')].filter(Boolean).join(' · ') || '产区与处理法未记录';",
"  return [codeName('regions', bean.regionCode, ''), bean.harvestSeason ? `产季 ${bean.harvestSeason}` : '', codeName('processes', bean.processCode, '')].filter(Boolean).join(' · ') || '产区与处理法未记录';",
'bean detail harvest summary')

# Replace direct-to-form recognition with a fixed-format preflight review.
old_finish = """  const merged = overwrite ? { ...existing, ...parsed } : { ...parsed, ...Object.fromEntries(Object.entries(existing).filter(([, value]) => value !== '' && value !== null && value !== undefined)) };
  merged.name = merged.name || [codeName('countries', merged.countryCode, ''), codeName('varieties', merged.varietyCode, '')].filter(Boolean).join(' ') || '新豆卡';
  openBeanForm(merged, { type: 'text', text: sourceText, evidence: parsed.evidence, confidence: parsed.confidence, parseMetadata: parsed.parseMetadata });
}"""
new_finish = """  const merged = overwrite ? { ...existing, ...parsed } : { ...parsed, ...Object.fromEntries(Object.entries(existing).filter(([, value]) => value !== '' && value !== null && value !== undefined)) };
  merged.name = merged.name || [codeName('countries', merged.countryCode, ''), codeName('varieties', merged.varietyCode, '')].filter(Boolean).join(' ') || '新豆卡';
  openRecognitionPreflight({ merged, parsed, sourceText, dateDecision });
}"""
text = replace_once(text, old_finish, new_finish, 'route recognition to preflight')

# Insert preflight renderer before legacy date review; legacy function remains as compatibility code but is no longer called.
marker = "\nfunction openRecognitionDateReview({ parsed, sourceText, existingDraft, overwrite, dateDecision, recognitionDocument }) {"
preflight = r'''

function recognitionPreflightRows(bean = {}) {
  const flavorText = (bean.flavorCodes || []).map(code => codeName('flavors', code, '')).filter(Boolean).join('、');
  const rows = [
    ['国家', codeName('countries', bean.countryCode, bean.countryCustomName || '')],
    ['产区', codeName('regions', bean.regionCode, bean.regionCustomName || '')],
    ['庄园 / 处理站', codeName('entities', bean.entityCode, bean.entityCustomName || '')],
    ['豆种', codeName('varieties', bean.varietyCode, bean.varietyCustomName || '')],
    ['产季', bean.harvestSeason || (bean.harvestYear ? String(bean.harvestYear) : '')],
    ['处理法', codeName('processes', bean.processCode, bean.processCustomName || '')],
    ['海拔', bean.altitude ? `${bean.altitude} m` : ''],
    ['烘焙商', bean.roasterName || ''],
    ['烘焙日期', bean.roastDate || ''],
    ['烘焙度', ROAST_NAME.get(bean.roastCode) || ''],
    ['烘焙色值', bean.roastColor ? `Agtron ${bean.roastColor}` : ''],
    ['风味', flavorText || (bean.customFlavorNames || []).join('、')],
    ['净含量', bean.initialWeight ? `${bean.initialWeight} g` : '']
  ];
  return rows.map(([label, value]) => ({ label, value: String(value || '').trim() || '—' }));
}

function recognitionPreflightExtra(parsed, dateDecision) {
  const items = [];
  for (const candidate of dateDecision?.candidates || []) {
    if (candidate.decision === 'exclude') items.push(`${candidate.fieldLabel}：${candidate.normalizedValue || candidate.rawValue}`);
    else if (candidate.decision === 'review') items.push(`未自动写入日期：${candidate.rawValue}`);
  }
  for (const value of parsed.customFlavorNames || []) items.push(`未编码风味：${value}`);
  return [...new Set(items)];
}

function openRecognitionPreflight({ merged, parsed, sourceText, dateDecision }) {
  const rows = recognitionPreflightRows(merged);
  const extra = recognitionPreflightExtra(parsed, dateDecision);
  const correctedCount = Object.values(parsed.parseMetadata || {}).filter(item => item && typeof item === 'object' && item.normalizedValue && item.rawValue && item.normalizedValue !== item.rawValue).length;
  const rowHtml = rows.map(row => `<div class="recognition-preflight-row"><span>${esc(row.label)}</span><strong>${esc(row.value)}</strong></div>`).join('');
  const extraHtml = extra.length ? `<section class="recognition-preflight-extra"><h3>其他识别信息</h3>${extra.map(item => `<p>${esc(item)}</p>`).join('')}</section>` : '';
  const detailSummary = `已自动识别、翻译并整理${correctedCount ? `，其中规范化 ${correctedCount} 项` : ''}。原始文字保留在识别元数据中。`;
  const content = `${dialogHeader('识别信息确认', '已自动识别、翻译并整理标签信息，请确认后填入豆卡')}<section class="recognition-preflight-card"><div class="recognition-preflight-grid">${rowHtml}</div>${extraHtml}<details class="recognition-source-details"><summary>查看识别原文</summary><pre>${esc(sourceText)}</pre></details></section><div class="row recognition-preflight-actions"><button id="preflightBackBtn" class="button subtle" type="button">返回识别</button><span class="grow"></span><button id="preflightConfirmBtn" class="button primary" type="button">确认并填入</button></div>`;
  const overlay = showOverlay(content, { full: true, id: 'recognition-preflight' });
  bindClose(overlay);
  $('#preflightBackBtn').addEventListener('click', () => openTextRecognition(sourceText, merged));
  $('#preflightConfirmBtn').addEventListener('click', () => openBeanForm(merged, { type: 'text', text: sourceText, parseMetadata: parsed.parseMetadata, preflightSummary: detailSummary }));
}
'''
if marker not in text:
    raise SystemExit('missing preflight insertion marker')
text = text.replace(marker, preflight + marker, 1)

# Recognition page language/UI simplification and no manual date decision branch.
text = replace_once(text,
"  const content = `${dialogHeader('文字识别', '粘贴豆袋文字，系统按 BrewIon 词表提取字段')}<label class=\"field\"><span>豆袋文字</span><textarea id=\"recognitionText\" class=\"control\" placeholder=\"例如：埃塞俄比亚 古吉 日晒 Heirloom，浅烘，2026-07-20，海拔2100m，净重150g，茉莉、蓝莓、蜂蜜\">${esc(text)}</textarea></label><label class=\"toggle\"><input id=\"overwriteRecognizedFields\" type=\"checkbox\" checked>识别结果覆盖已有表单字段</label><p class=\"muted small\">语音识别可能由浏览器联网服务处理；识别证据和置信度会在表单中显示。</p><div class=\"row\"><button id=\"speechTextBtn\" class=\"button\" type=\"button\">语音输入</button><button id=\"clearRecognitionTextBtn\" class=\"button subtle\" type=\"button\">清空</button><button id=\"manualBeanFormBtn\" class=\"button subtle\" type=\"button\">直接填表</button><span class=\"grow\"></span><button id=\"parseTextBtn\" class=\"button primary\" type=\"button\">识别并填表</button></div>`;",
"  const content = `${dialogHeader('文字识别', '支持简体、繁体、英文、日文和韩文；系统会先自动翻译、审核和整理')}<label class=\"field\"><span>豆袋文字</span><textarea id=\"recognitionText\" class=\"control\" placeholder=\"例如：埃塞俄比亚 古吉 日晒 Heirloom，2026产季，浅烘，2026-07-20，海拔2100m\">${esc(text)}</textarea></label><label class=\"toggle\"><input id=\"overwriteRecognizedFields\" type=\"checkbox\" checked>识别结果覆盖已有表单字段</label><p class=\"muted small\">识别后先展示固定格式的整理结果；确认后再填入豆卡。原始文字仍保留用于追溯。</p><div class=\"row\"><button id=\"speechTextBtn\" class=\"button\" type=\"button\">语音输入</button><button id=\"clearRecognitionTextBtn\" class=\"button subtle\" type=\"button\">清空</button><button id=\"manualBeanFormBtn\" class=\"button subtle\" type=\"button\">直接填表</button><span class=\"grow\"></span><button id=\"parseTextBtn\" class=\"button primary\" type=\"button\">识别并整理</button></div>`;",
'recognition page copy')
text = replace_once(text,
"    if (dateDecision.reviewRequired) return openRecognitionDateReview({ parsed, sourceText, existingDraft, overwrite, dateDecision, recognitionDocument });\n    finishRecognitionParse({ parsed, sourceText, existingDraft, overwrite, dateDecision });",
"    finishRecognitionParse({ parsed, sourceText, existingDraft, overwrite, dateDecision });",
'remove manual date review branch')

path.write_text(text, encoding='utf-8')


# --- src/ui/app-components.css ---------------------------------------------
path = ROOT / 'src/ui/app-components.css'
text = path.read_text(encoding='utf-8')
css = r'''

/* recognition-preflight/1.0: fixed-format review between OCR and bean mapping */
.recognition-preflight-card{max-width:760px;margin:0 auto;display:grid;gap:14px}
.recognition-preflight-grid{border:1px solid rgba(190,151,80,.24);border-radius:16px;overflow:hidden;background:rgba(255,255,255,.025)}
.recognition-preflight-row{display:grid;grid-template-columns:minmax(92px,34%) 1fr;gap:12px;align-items:center;padding:10px 13px;border-bottom:1px solid rgba(255,255,255,.07)}
.recognition-preflight-row:last-child{border-bottom:0}
.recognition-preflight-row span{font-size:12px;color:var(--muted,#aaa)}
.recognition-preflight-row strong{font-size:14px;font-weight:600;word-break:break-word}
.recognition-preflight-extra,.recognition-source-details{padding:12px 14px;border:1px solid rgba(190,151,80,.2);border-radius:14px;background:rgba(255,255,255,.02)}
.recognition-preflight-extra h3{margin:0 0 8px;font-size:13px}.recognition-preflight-extra p{margin:4px 0;font-size:12px;color:var(--muted,#aaa)}
.recognition-source-details pre{white-space:pre-wrap;word-break:break-word;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;max-height:34vh;overflow:auto}
.recognition-preflight-actions{position:sticky;bottom:0;padding:12px 0 calc(8px + env(safe-area-inset-bottom));background:linear-gradient(transparent,var(--bg,#090a0a) 28%)}
.recognition-audit-details{grid-column:1/-1;margin-top:4px}
#beanForm .form-grid{column-gap:10px;row-gap:9px}
#beanForm .form-field>label{margin-bottom:4px;font-size:12px}
@media(max-width:520px){#beanForm .form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.recognition-preflight-row{grid-template-columns:90px 1fr}.select-with-add{gap:4px}.select-with-add .add-select-option{padding-inline:7px}}
'''
if 'recognition-preflight/1.0' not in text:
    text += css
path.write_text(text, encoding='utf-8')


# --- tests -----------------------------------------------------------------
test = ROOT / 'test/harvest-multilingual-preflight.test.js'
test.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LABEL_LEXICON, parseHarvestSeasonValue, parseNaturalLanguage } from '../src/codebook.js';
import { RECOGNITION_FIELD_ALIASES, recognitionDocumentFromText } from '../src/domain/recognition/recognition-document.js';

const emptyBook = { countries: [], regions: [], entities: [], varieties: [], processes: [], flavors: [] };

test('harvest aliases cover simplified/traditional/English/Japanese/Korean', () => {
  for (const token of ['产季','產季','crop year','クロップ年度','収穫年','수확년도','크롭 연도']) {
    assert.ok(DEFAULT_LABEL_LEXICON.harvest.includes(token), token);
    assert.ok(RECOGNITION_FIELD_ALIASES.harvest.includes(token), token);
  }
});

test('harvest parser normalizes Chinese, Japanese and Korean seasons', () => {
  assert.equal(parseHarvestSeasonValue('產季：2025/26').normalizedValue, '2025/2026');
  assert.equal(parseHarvestSeasonValue('25/26クロップ').normalizedValue, '2025/2026');
  assert.equal(parseHarvestSeasonValue('수확년도 2026').normalizedValue, '2026');
  assert.equal(parseHarvestSeasonValue('2026年産').normalizedValue, '2026');
});

test('harvest line is consumed and cannot leak into roast altitude or weight', () => {
  const result = parseNaturalLanguage('產季：2025/26\n品種：ゲイシャ', emptyBook);
  assert.equal(result.harvestSeason, '2025/2026');
  assert.equal(result.roastCode, undefined);
  assert.equal(result.altitude, undefined);
  assert.equal(result.initialWeight, undefined);
});

test('layout parser recognizes reversed Japanese and Korean harvest labels', () => {
  const ja = recognitionDocumentFromText('2025/26：クロップ年度');
  const ko = recognitionDocumentFromText('2026：수확년도');
  assert.equal(ja.relations[0]?.field, 'harvest');
  assert.equal(ko.relations[0]?.field, 'harvest');
});
''', encoding='utf-8')

print('recognition preflight migration applied')
