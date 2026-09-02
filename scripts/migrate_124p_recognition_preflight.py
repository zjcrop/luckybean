from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f'missing anchor: {label}')
    return text.replace(old, new, 1)


def migrate_app():
    path = 'src/app.js'
    s = read(path)
    s = replace_once(
        s,
        "import { loadCodebook, makeIndex, displayName, optionsHtml, relatedRows, REMOTE_CODEBOOK_URL } from './codebook.js';",
        "import { loadCodebook, makeIndex, displayName, optionsHtml, relatedRows, parseHarvestSeasonValue, REMOTE_CODEBOOK_URL } from './codebook.js';",
        'codebook import')
    s = replace_once(
        s,
        "return [codeName('regions', bean.regionCode, ''), codeName('processes', bean.processCode, '')].filter(Boolean).join(' · ') || '产区与处理法未记录';",
        "return [codeName('regions', bean.regionCode, ''), bean.harvestSeason ? `产季 ${bean.harvestSeason}` : '', codeName('processes', bean.processCode, '')].filter(Boolean).join(' · ') || '产区与处理法未记录';",
        'bean summary harvest')
    if 'id="beanHarvestSeason"' not in s:
        anchor = "${fieldHtml('beanVariety','豆种',`<select id=\"beanVariety\" class=\"control\">${beanSelectOptions('varieties',state.codebook.varieties,bean.varietyCode)}</select>`,'required')}"
        addition = anchor + "\n        ${fieldHtml('beanHarvestSeason','产季',`<input id=\"beanHarvestSeason\" class=\"control\" maxlength=\"20\" value=\"${esc(bean.harvestSeason || (bean.harvestYear ? String(bean.harvestYear) : ''))}\" placeholder=\"例如 2025/26\">`)}"
        s = replace_once(s, anchor, addition, 'bean harvest form field')
    if "const harvestInput = formValue('beanHarvestSeason');" not in s:
        s = replace_once(s, "    const now = new Date().toISOString();\n    const record = {", "    const now = new Date().toISOString();\n    const harvestInput = formValue('beanHarvestSeason');\n    const harvestParsed = parseHarvestSeasonValue(harvestInput);\n    const record = {", 'harvest parse before save')
    if 'harvestEndYear: harvestParsed.harvestEndYear || 0' not in s:
        s = replace_once(s,
            "countryCode, regionCode: formValue('beanRegion'), entityCode: formValue('beanEntity'), varietyCode, processCode: formValue('beanProcess'),",
            "countryCode, regionCode: formValue('beanRegion'), entityCode: formValue('beanEntity'), varietyCode, processCode: formValue('beanProcess'),\n      harvestSeason: harvestParsed.normalizedValue || harvestInput, harvestYear: harvestParsed.harvestYear || 0, harvestEndYear: harvestParsed.harvestEndYear || 0,",
            'harvest saved fields')
    if "harvestSeason: formValue('beanHarvestSeason')" not in s:
        s = replace_once(s,
            "varietyCode: formValue('beanVariety'), processCode: formValue('beanProcess'), roastColor:",
            "varietyCode: formValue('beanVariety'), harvestSeason: formValue('beanHarvestSeason'), processCode: formValue('beanProcess'), roastColor:",
            'harvest draft field')
    if '<span>待确认</span></div>`)' not in s:
        s, count = re.subn(r"<span>\$\{Math\.round\(\(confidence\[key\]\|\|0\)\*100\)\}%</span>", '<span>待确认</span>', s, count=1)
        if count != 1:
            raise RuntimeError('missing anchor: evidence confidence display')
    if 'source.internalEvidence || source.evidence || {}' not in s:
        s = replace_once(s,
            "evidence: structuredClone(source.evidence || {}), confidence: structuredClone(source.confidence || {}),",
            "evidence: structuredClone(source.internalEvidence || source.evidence || {}), confidence: structuredClone(source.internalConfidence || source.confidence || {}),",
            'internal recognition provenance')
    if 'function openRecognitionPreflight' not in s:
        old = "  openBeanForm(merged, { type: 'text', text: sourceText, recognitionDocument, evidence: parsed.evidence, confidence: parsed.confidence, parseMetadata: parsed.parseMetadata });\n}\n\nfunction openRecognitionDateReview"
        new = '''  openRecognitionPreflight({ merged, parsed, sourceText, dateDecision, recognitionDocument });
}

function recognitionPreflightRows(bean = {}, parsed = {}) {
  const review = new Set(parsed.parseMetadata?.recognition?.reviewFields || []);
  const flavorText = (bean.flavorCodes || []).map(code => codeName('flavors', code, '')).filter(Boolean).join('、');
  const rows = [
    ['countryCode','国家', codeName('countries', bean.countryCode, bean.countryCustomName || '')],
    ['regionCode','产区', codeName('regions', bean.regionCode, bean.regionCustomName || '')],
    ['entityCode','庄园 / 处理站', codeName('entities', bean.entityCode, bean.entityCustomName || '')],
    ['varietyCode','豆种', codeName('varieties', bean.varietyCode, bean.varietyCustomName || '')],
    ['harvestYear','产季', bean.harvestSeason || (bean.harvestYear ? String(bean.harvestYear) : '')],
    ['processCode','处理法', codeName('processes', bean.processCode, bean.processCustomName || '')],
    ['altitude','海拔', bean.altitude ? `${bean.altitude} m` : ''],
    ['roasterName','烘焙商', bean.roasterName || ''],
    ['roastDate','烘焙日期', bean.roastDate || ''],
    ['roastCode','烘焙度', ROAST_NAME.get(bean.roastCode) || ''],
    ['roastColor','烘焙色值', bean.roastColor ? `Agtron ${bean.roastColor}` : ''],
    ['flavorCodes','风味', flavorText || (bean.customFlavorNames || []).join('、')],
    ['initialWeight','净含量', bean.initialWeight ? `${bean.initialWeight} g` : '']
  ];
  return rows.map(([field,label,value]) => ({ field, label, value: String(value || '').trim() || '—', review: review.has(field) }));
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

function openRecognitionPreflight({ merged, parsed, sourceText, dateDecision, recognitionDocument }) {
  const rows = recognitionPreflightRows(merged, parsed);
  const extra = recognitionPreflightExtra(parsed, dateDecision);
  const rowHtml = rows.map(row => `<div class="recognition-preflight-row${row.review ? ' is-review' : ''}"><span>${esc(row.label)}${row.review ? ' · 待确认' : ''}</span><strong>${esc(row.value)}</strong></div>`).join('');
  const extraHtml = extra.length ? `<section class="recognition-preflight-extra"><h3>其他识别信息</h3>${extra.map(item => `<p>${esc(item)}</p>`).join('')}</section>` : '';
  const content = `${dialogHeader('识别信息确认', '已自动识别、翻译并整理标签信息；待确认项不会静默写入标准编码')}<section class="recognition-preflight-card"><div class="recognition-preflight-grid">${rowHtml}</div>${extraHtml}<details class="recognition-source-details"><summary>查看识别原文</summary><pre>${esc(sourceText)}</pre></details></section><div class="row recognition-preflight-actions"><button id="preflightBackBtn" class="button subtle" type="button">返回识别</button><span class="grow"></span><button id="preflightConfirmBtn" class="button primary" type="button">确认并填入</button></div>`;
  const overlay = showOverlay(content, { full: true, id: 'recognition-preflight' });
  bindClose(overlay);
  $('#preflightBackBtn').addEventListener('click', () => openTextRecognition(sourceText, merged, recognitionDocument));
  $('#preflightConfirmBtn').addEventListener('click', () => openBeanForm(merged, {
    type: 'text', text: sourceText, recognitionDocument,
    parseMetadata: parsed.parseMetadata,
    internalEvidence: parsed.evidence,
    internalConfidence: parsed.confidence
  }));
}

function openRecognitionDateReview'''
        s = replace_once(s, old, new, 'preflight insertion')
    s = s.replace('粘贴豆袋文字，系统按 BrewIon 词表提取字段', '支持简体、繁体、英文、日文和韩文；系统先识别、归一化，再进入固定格式确认')
    s = s.replace('低置信度字段会要求人工确认；确认后表单仅显示最终值，识别证据保留为内部来源记录。', '识别结果会先按固定字段顺序展示；确认后再填入豆卡。置信度不在普通界面显示，只保留为内部来源记录。')
    s = s.replace('>识别并填表</button>', '>识别并整理</button>', 1)
    if 'decoded.harvestSeason = decoded.harvestSeason' not in s:
        old = "decoded.notes = [`扫码识别`, decoded.agtron ? `Agtron ${decoded.agtron}` : '', decoded.harvestYear ? `产季 ${decoded.harvestYear}` : ''].filter(Boolean).join('；');"
        if old in s:
            s = s.replace(old, "decoded.harvestSeason = decoded.harvestSeason || (decoded.harvestYear ? String(decoded.harvestYear) : '');\n    decoded.notes = [`扫码识别`, decoded.agtron ? `Agtron ${decoded.agtron}` : ''].filter(Boolean).join('；');", 1)
    write(path, s)


def migrate_codebook():
    path = 'src/codebook.js'
    s = read(path)
    replacements = {
        "  country: ['产地国','原产国','原产地','国家','产地','origin','country of origin','origin country','country'],": "  country: ['产地国','原产国','原产地','国家','产地','產地國','原產國','原產地','國家','產地','生産国','原産国','原産地','생산국','원산국','원산지','origin','country of origin','origin country','country'],",
        "  region: ['产区','地区','区域','省','州','县','region','growing region','origin region','zone','district','province','terroir'],": "  region: ['产区','地区','区域','省','州','县','產區','地區','區域','産地','地域','生産地域','生産地','산지','지역','생산 지역','생산지','region','growing region','origin region','zone','district','province','terroir'],",
        "  variety: ['豆种','品种','咖啡品种','栽培种','种属','variety','varietal','cultivar','var.','var','cv.','cv','species','botanical variety'],": "  variety: ['豆种','品种','咖啡品种','栽培种','种属','豆種','品種','咖啡品種','栽培種','種屬','栽培品種','品種名','품종','재배 품종','variety','varietal','cultivar','var.','var','cv.','cv','species','botanical variety'],",
        "  process: ['处理法','处理方式','加工法','加工方式','发酵方式','处理工艺','process','processing','processing method','proc.','proc','method','fermentation'],": "  process: ['处理法','处理方式','加工法','加工方式','发酵方式','处理工艺','處理法','處理方式','加工法','發酵方式','精製方法','精製法','加工方法','処理方法','発酵方法','가공 방식','가공법','프로세싱','정제 방식','발효 방식','process','processing','processing method','proc.','proc','method','fermentation'],",
        "  roast: ['烘焙度','烘焙程度','焙度','roast level','roast profile','roast'],": "  roast: ['烘焙度','烘焙程度','焙度','焙煎度','ローストレベル','焼き加減','배전도','로스팅 정도','로스트 레벨','roast level','roast profile','roast'],",
        "  roastDate: ['烘焙日期','烘焙时间','烘焙日','焙炒日期','烘烤日期','出炉日期','roast date','roasted on','roast on','rst date','rst dt','rd'],": "  roastDate: ['烘焙日期','烘焙时间','烘焙日','焙炒日期','烘烤日期','出炉日期','烘焙時間','焙煎日','焙煎日付','焙煎年月日','로스팅 날짜','로스팅일','배전일','roast date','roasted on','roast on','rst date','rst dt','rd'],",
        "  harvest: ['产季','收获季','收获年份','采收季','采收年份','生豆产季','crop','crop year','harvest','harvest year','season','crop season','cy'],": "  harvest: ['产季','收获季','收获年份','采收季','采收年份','生豆产季','收获年度','產季','收穫季','收穫年份','採收季','採收年份','生豆產季','收穫年度','採收年度','クロップ','クロップ年','クロップ年度','収穫年','収穫年度','収穫期','収穫シーズン','年産','크롭','크롭 연도','수확 연도','수확년도','수확기','수확 시기','수확 시즌','생산 연도','crop','crop year','harvest','harvest year','season','crop season','cy'],",
        "  altitude: ['海拔','种植海拔','高度','elevation','altitude','elev.','elev','alt.','alt','masl','m.a.s.l.','meters above sea level','metres above sea level','ft asl','feet above sea level'],": "  altitude: ['海拔','种植海拔','高度','種植海拔','標高','栽培標高','고도','재배 고도','elevation','altitude','elev.','elev','alt.','alt','masl','m.a.s.l.','meters above sea level','metres above sea level','ft asl','feet above sea level'],",
        "  weight: ['净重','重量','克重','包装重量','net weight','net wt','net wt.','n.w.','nw'],": "  weight: ['净重','重量','克重','包装重量','淨重','包裝重量','内容量','正味重量','중량','내용량','순중량','net weight','net wt','net wt.','n.w.','nw'],"
    }
    for old, new in replacements.items():
        if new not in s:
            if old not in s:
                raise RuntimeError(f'missing codebook alias anchor: {old[:30]}')
            s = s.replace(old, new, 1)
    if 'MULTILINGUAL_VALUE_NORMALIZATION' not in s:
        anchor = "function bestTableMatch(value, rows) {\n  const source = normalizeLabelValue(value);"
        block = """const MULTILINGUAL_VALUE_NORMALIZATION = Object.freeze([
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
        s = replace_once(s, anchor, block, 'multilingual canonical values')
    write(path, s)


def migrate_document():
    path = 'src/domain/recognition/recognition-document.js'
    s = read(path)
    replacements = {
        "  country: ['国家','产国','原产国','生产国','咖啡产国','國家','產國','原產國','country','country of origin','origin country'],": "  country: ['国家','产国','原产国','生产国','咖啡产国','國家','產國','原產國','生産国','原産国','생산국','원산국','country','country of origin','origin country'],",
        "  variety: ['品种','豆种','树种','咖啡品种','栽培种','種屬','品種','豆種','樹種','variety','varietal','cultivar','botanical variety','var.','var','cv.','cv'],": "  variety: ['品种','豆种','树种','咖啡品种','栽培种','種屬','品種','豆種','樹種','栽培品種','품종','재배 품종','variety','varietal','cultivar','botanical variety','var.','var','cv.','cv'],",
        "  harvest: ['产季','收获季','采收季','采收年份','收获年份','年度','生豆产季','產季','收穫季','採收季','crop','crop year','harvest','harvest year','season','crop season','cy'],": "  harvest: ['产季','收获季','采收季','采收年份','收获年份','年度','生豆产季','收获年度','產季','收穫季','採收季','採收年份','收穫年份','生豆產季','收穫年度','採收年度','クロップ','クロップ年','クロップ年度','収穫年','収穫年度','収穫期','収穫シーズン','年産','크롭','크롭 연도','수확 연도','수확년도','수확기','수확 시기','수확 시즌','생산 연도','crop','crop year','harvest','harvest year','season','crop season','cy'],",
        "  roast: ['烘焙度','焙度','烘焙程度','烘焙程度描述','焙度','roast level','roast profile','roast'],": "  roast: ['烘焙度','焙度','烘焙程度','烘焙程度描述','焙度','焙煎度','ローストレベル','焼き加減','배전도','로스팅 정도','로스트 레벨','roast level','roast profile','roast'],"
    }
    for old, new in replacements.items():
        if new not in s:
            if old not in s:
                raise RuntimeError(f'missing recognition alias anchor: {old[:30]}')
            s = s.replace(old, new, 1)
    write(path, s)


def migrate_css_docs_tests():
    path = 'src/ui/app-components.css'
    s = read(path)
    marker = '/* recognition-preflight/1.24P */'
    if marker not in s:
        s += '''\n\n/* recognition-preflight/1.24P */
.recognition-preflight-card{max-width:760px;margin:0 auto;display:grid;gap:14px}
.recognition-preflight-grid{border:1px solid rgba(190,151,80,.24);border-radius:16px;overflow:hidden;background:rgba(255,255,255,.025)}
.recognition-preflight-row{display:grid;grid-template-columns:minmax(92px,34%) 1fr;gap:12px;align-items:center;padding:10px 13px;border-bottom:1px solid rgba(255,255,255,.07)}
.recognition-preflight-row:last-child{border-bottom:0}.recognition-preflight-row.is-review{outline:1px solid rgba(190,151,80,.35);outline-offset:-1px}
.recognition-preflight-row span{font-size:12px;color:var(--muted,#aaa)}.recognition-preflight-row strong{font-size:14px;font-weight:600;word-break:break-word}
.recognition-preflight-extra,.recognition-source-details{padding:12px 14px;border:1px solid rgba(190,151,80,.2);border-radius:14px;background:rgba(255,255,255,.02)}
.recognition-preflight-extra h3{margin:0 0 8px;font-size:13px}.recognition-preflight-extra p{margin:4px 0;font-size:12px;color:var(--muted,#aaa)}
.recognition-source-details pre{white-space:pre-wrap;word-break:break-word;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;max-height:34vh;overflow:auto}
.recognition-preflight-actions{position:sticky;bottom:0;padding:12px 0 calc(8px + env(safe-area-inset-bottom));background:linear-gradient(transparent,var(--bg,#090a0a) 28%)}
@media(max-width:520px){.recognition-preflight-row{grid-template-columns:90px 1fr}}
'''
        write(path, s)
    write('docs/recognition-preflight.md', '''# Recognition Preflight 1.24P\n\n`OCR -> layout relations -> multilingual normalization -> field audit -> date ownership review (when required) -> fixed-format preflight -> user confirmation -> bean form`\n\n普通界面不展示置信度百分比；置信度与原始证据只保留在识别 provenance 中，用于冲突裁决与追溯。字段锚点覆盖简体中文、繁体中文、英文、日文、韩文。`harvestSeason` 作为豆卡一等字段保存，并在可解析时派生 `harvestYear` / `harvestEndYear`。Knowledge 标记为 `blockAutomaticEntityResolution` 的歧义实体继续进入人工确认，不静默落稳定编码。现有日期归属审查保持优先，不被 preflight 绕过。\n''')
    write('test/harvest-multilingual-preflight.test.js', '''import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { DEFAULT_LABEL_LEXICON, parseHarvestSeasonValue, parseNaturalLanguage } from '../src/codebook.js';\nimport { RECOGNITION_FIELD_ALIASES, recognitionDocumentFromText } from '../src/domain/recognition/recognition-document.js';\n\nconst emptyBook = { countries: [], regions: [], entities: [], varieties: [], processes: [], flavors: [] };\n\ntest('harvest aliases cover five languages', () => {\n  for (const token of ['产季','產季','crop year','クロップ年度','収穫年','수확년도','크롭 연도']) {\n    assert.ok(DEFAULT_LABEL_LEXICON.harvest.includes(token), token);\n    assert.ok(RECOGNITION_FIELD_ALIASES.harvest.includes(token), token);\n  }\n});\n\ntest('harvest parser normalizes multilingual seasons', () => {\n  assert.equal(parseHarvestSeasonValue('產季：2025/26').normalizedValue, '2025/2026');\n  assert.equal(parseHarvestSeasonValue('25/26クロップ').normalizedValue, '2025/2026');\n  assert.equal(parseHarvestSeasonValue('수확년도 2026').normalizedValue, '2026');\n});\n\ntest('labelled harvest data cannot leak into roast altitude or weight', () => {\n  const result = parseNaturalLanguage('產季：2025/26\\n品種：ゲイシャ', emptyBook);\n  assert.equal(result.harvestSeason, '2025/2026');\n  assert.equal(result.roastCode, undefined);\n  assert.equal(result.altitude, undefined);\n  assert.equal(result.initialWeight, undefined);\n});\n\ntest('layout parser recognizes reversed Japanese and Korean harvest labels', () => {\n  assert.equal(recognitionDocumentFromText('2025/26：クロップ年度').relations[0]?.field, 'harvest');\n  assert.equal(recognitionDocumentFromText('2026：수확년도').relations[0]?.field, 'harvest');\n});\n''')


if __name__ == '__main__':
    migrate_app()
    migrate_codebook()
    migrate_document()
    migrate_css_docs_tests()
    print('1.24P recognition preflight migration prepared')
