from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_regex(path: Path, pattern: str, replacement: str, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'missing or ambiguous {label} pattern in {path}: {count}')
    path.write_text(updated, encoding='utf-8')


# ---------------------------------------------------------------------------
# 1. Label-aware OCR/text parsing.
# ---------------------------------------------------------------------------
codebook = ROOT / 'src/codebook.js'
parser_replacement = r'''function normalizeLabelValue(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/^[\s【\[]*(?:正面主体|背面参数|侧面补充|日期标签)[】\]]?\s*/i, '')
    .replace(/^[-—–•·*]+\s*/, '')
    .trim();
}

function labeledFieldValues(source) {
  const definitions = [
    ['country', /^(?:产地国|原产国|国家)\s*[:：]\s*(.+)$/i],
    ['region', /^(?:产区|地区|区域)\s*[:：]\s*(.+)$/i],
    ['entity', /^(?:庄园|处理站|处理厂|合作社|农场)\s*[:：]\s*(.+)$/i],
    ['variety', /^(?:豆种|品种|咖啡品种)\s*[:：]\s*(.+)$/i],
    ['process', /^(?:处理法|处理方式|加工法|加工方式)\s*[:：]\s*(.+)$/i],
    ['roast', /^(?:烘焙度|烘焙程度|焙度)\s*[:：]\s*(.+)$/i],
    ['roastDate', /^(?:烘焙日期|烘焙时间|烘焙日|焙炒日期)\s*[:：]\s*(.+)$/i],
    ['roaster', /^(?:烘焙商|烘焙厂|烘焙品牌|品牌)\s*[:：]\s*(.+)$/i],
    ['harvest', /^(?:产季|收获季|收获年份|生豆产季)\s*[:：]\s*(.+)$/i],
    ['flavor', /^(?:风味|风味描述|杯测风味|风味标签)\s*[:：]\s*(.+)$/i],
    ['altitude', /^(?:海拔|种植海拔)\s*[:：]\s*(.+)$/i],
    ['weight', /^(?:净重|重量|克重|包装重量)\s*[:：]\s*(.+)$/i],
    ['price', /^(?:价格|售价|购买价)\s*[:：]\s*(.+)$/i]
  ];
  const result = {};
  const lines = String(source || '')
    .replace(/\r/g, '')
    .split(/\n+/)
    .map(normalizeLabelValue)
    .filter(Boolean);
  for (const line of lines) {
    for (const [field, regex] of definitions) {
      const match = line.match(regex);
      if (match && !result[field]) {
        result[field] = normalizeLabelValue(match[1]);
        break;
      }
    }
  }
  return result;
}

function bestTableMatch(value, rows) {
  const source = normalizeLabelValue(value);
  if (!source) return null;
  const normalizedCodes = normalizeCodeSource(source);
  const direct = directCodeMatch(normalizedCodes, rows);
  if (direct) return direct;
  const lower = source.toLocaleLowerCase('zh-CN');
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

function parseRoastDateValue(value) {
  const text = normalizeLabelValue(value);
  let match = text.match(/(20\d{2})[年.\/-](\d{1,2})[月.\/-](\d{1,2})日?/);
  if (match) return validIsoDate(match[1], match[2], match[3]);
  match = text.match(/(?:^|\D)(\d{2})[年.\/-](\d{1,2})[月.\/-](\d{1,2})日?(?:\D|$)/);
  if (match) return validIsoDate(2000 + Number(match[1]), match[2], match[3]);
  match = text.match(/(?:^|\D)(\d{2})[.\/-](\d{3,4})(?:\D|$)/);
  if (match) {
    const tail = match[2];
    const month = tail.length === 3 ? tail.slice(0, 1) : tail.slice(0, 2);
    const day = tail.slice(-2);
    return validIsoDate(2000 + Number(match[1]), month, day);
  }
  match = text.match(/(?:^|\D)(\d{2})(\d{2})(\d{2})(?:\D|$)/);
  if (match) return validIsoDate(2000 + Number(match[1]), match[2], match[3]);
  return '';
}

function parseHarvestYearValue(value) {
  const text = normalizeLabelValue(value);
  const match = text.match(/(?:^|\D)(20\d{2}|\d{2})(?:\s*(?:产季|年度|年))?(?:\D|$)/);
  if (!match) return 0;
  const number = Number(match[1]);
  return number < 100 ? 2000 + number : number;
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
  const labeled = labeledFieldValues(source);
  const result = { confidence: {}, evidence: {}, sourceText: source };
  const definitions = [
    ['countries', 'countryCode', 'country', 'countryCustomName'],
    ['regions', 'regionCode', 'region', 'regionCustomName'],
    ['entities', 'entityCode', 'entity', 'entityCustomName'],
    ['varieties', 'varietyCode', 'variety', 'varietyCustomName'],
    ['processes', 'processCode', 'process', 'processCustomName']
  ];

  for (const [table, field, labelKey, customField] of definitions) {
    const labeledValue = labeled[labelKey] || '';
    const labeledMatch = bestTableMatch(labeledValue, book[table]);
    if (labeledMatch) recordMatch(result, field, labeledMatch, true);
    if (!result[field]) {
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
    if (labeledValue && !result[field]) {
      result[customField] = labeledValue;
      result.confidence[customField] = 0.72;
      result.evidence[customField] = labeledValue;
    }
  }

  const roastSource = labeled.roast || source;
  const roastMap = [
    [/极浅|超浅|lightest/i, 'RL-L0'], [/浅中|medium\s*light/i, 'RL-L2'], [/浅烘|浅度|light/i, 'RL-L1'],
    [/中深|medium\s*dark/i, 'RL-L4'], [/中烘|中度|medium/i, 'RL-L3'], [/极深|法式|very\s*dark/i, 'RL-L6'], [/深烘|深度|dark/i, 'RL-L5']
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

  const roastDate = parseRoastDateValue(labeled.roastDate || source);
  if (roastDate) {
    result.roastDate = roastDate;
    result.confidence.roastDate = labeled.roastDate ? 0.98 : 0.9;
    result.evidence.roastDate = labeled.roastDate || roastDate;
  }

  const harvestYear = parseHarvestYearValue(labeled.harvest || '');
  if (harvestYear) {
    result.harvestYear = harvestYear;
    result.confidence.harvestYear = 0.98;
    result.evidence.harvestYear = labeled.harvest;
  }

  if (labeled.roaster) {
    result.roasterName = labeled.roaster;
    result.confidence.roasterName = 0.97;
    result.evidence.roasterName = labeled.roaster;
  }

  const altitudeSource = labeled.altitude || source;
  const altitude = altitudeSource.match(/(\d{3,4})\s*(?:m|米)?/i);
  if (altitude) {
    result.altitude = Number(altitude[1]);
    result.confidence.altitude = labeled.altitude ? 0.97 : 0.85;
    result.evidence.altitude = labeled.altitude || altitude[0];
  }
  const weightSource = labeled.weight || source;
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
'''
replace_regex(codebook, r'export function parseNaturalLanguage\(text, book\) \{.*?\n\}\s*$', parser_replacement, 'label-aware parser')


# ---------------------------------------------------------------------------
# 2. Bean form: harvest season and custom values for every coded field.
# ---------------------------------------------------------------------------
app = ROOT / 'src/app.js'
bean_form_replacement = r'''function codedControl(id, rows, selected, customName, labelIndex = 1, blank = '请选择', noun = '项目') {
  const custom = String(customName || '').trim();
  const customSelected = Boolean(custom && !selected);
  return `<select id="${id}" class="control">${selectOptions(rows, selected, labelIndex, blank)}<option value="__custom__"${customSelected ? ' selected' : ''}>自定义${esc(noun)}</option></select><input id="${id}Custom" class="control coded-custom-input${customSelected ? '' : ' hidden'}" maxlength="80" value="${esc(custom)}" placeholder="输入编码表中没有的${esc(noun)}">`;
}

function beanFormHtml(bean = {}, source = {}) {
  const regions = relatedRows(state.codebook, 'regions', bean.countryCode);
  const entities = relatedRows(state.codebook, 'entities', bean.countryCode);
  const flavors = visibleFlavorCodes(bean);
  const colorValue = bean.roastColor || '';
  const roastValue = colorValue ? roastFromColor(colorValue) : (bean.roastCode || '');
  const recognizedSource = ['text', 'photo'].includes(source.type);
  const roastDateValue = bean.roastDate || (recognizedSource ? '' : todayISO());
  return `${dialogHeader(bean.id ? '编辑豆卡' : '新增豆卡', `来源：${source.type || bean.source || '手工录入'}`)}
    <form id="beanForm" novalidate>
      <div class="form-grid">
        ${fieldHtml('beanCountry','国家',codedControl('beanCountry',state.codebook.countries,bean.countryCode,bean.countryCustomName,1,'请选择国家','国家'),'required')}
        ${fieldHtml('beanRegion','产区',codedControl('beanRegion',regions,bean.regionCode,bean.regionCustomName,2,bean.countryCode?'请选择产区':'先选择国家','产区'))}
        ${fieldHtml('beanEntity','庄园 / 处理站',codedControl('beanEntity',entities,bean.entityCode,bean.entityCustomName,3,bean.countryCode?'请选择庄园 / 处理站':'先选择国家','庄园 / 处理站'))}
        ${fieldHtml('beanVariety','豆种',codedControl('beanVariety',state.codebook.varieties,bean.varietyCode,bean.varietyCustomName,1,'请选择豆种','豆种'),'required')}
        ${fieldHtml('beanProcess','处理法',codedControl('beanProcess',state.codebook.processes,bean.processCode,bean.processCustomName,1,'请选择处理法','处理法'),'required')}
        ${fieldHtml('beanHarvestYear','产季',`<input id="beanHarvestYear" class="control" type="number" min="1900" max="2100" step="1" value="${esc(bean.harvestYear || '')}" placeholder="例如 2026">`,'recommended')}
        ${fieldHtml('beanRoastColor','烘焙色值',`<input id="beanRoastColor" class="control" type="number" min="20" max="120" step="1" value="${esc(colorValue)}" placeholder="Agtron 20–120">`,'recommended')}
        ${fieldHtml('beanRoast','烘焙度',`<select id="beanRoast" class="control"><option value="">填写色值自动生成</option>${ROASTS.map(([value,label])=>`<option value="${value}"${roastValue===value?' selected':''}>${label}</option>`).join('')}</select>`,'required')}
        ${fieldHtml('beanRoastDate','烘焙日期',`<input id="beanRoastDate" class="control" type="date" value="${esc(roastDateValue)}">`,'required')}
        ${fieldHtml('beanInitialWeight','初始克重',`<input id="beanInitialWeight" class="control" type="number" min="1" max="10000" step="0.1" value="${esc(bean.initialWeight || '')}">`,'required')}
        ${fieldHtml('beanRefrigerated','是否冷藏',`<select id="beanRefrigerated" class="control"><option value="false"${!bean.refrigerated?' selected':''}>否</option><option value="true"${bean.refrigerated?' selected':''}>是</option></select>`,'recommended')}
        ${fieldHtml('beanPrice','购买价格',`<input id="beanPrice" class="control" type="number" min="0" step="0.01" value="${esc(bean.price || '')}">`,'recommended')}
        ${fieldHtml('beanRoaster','烘焙商',`<input id="beanRoaster" class="control" maxlength="60" value="${esc(bean.roasterName || bean.roaster || '')}">`,'recommended')}
        ${fieldHtml('beanAltitude','海拔',`<input id="beanAltitude" class="control" type="number" min="0" max="5000" value="${esc(bean.altitude || '')}">`)}
        ${fieldHtml('beanNotes','备注',`<input id="beanNotes" class="control" maxlength="300" value="${esc(bean.notes || '')}">`)}
      </div>
      <section class="panel"><div class="panel-title"><div><h3>风味标签</h3><p>${state.codebook.flavors?.length || 0}项可用</p></div><button id="editFlavorsBtn" class="button" type="button">编辑</button></div><div id="formFlavorSummary" class="flavor-summary">${flavors.map(code=>`<span class="tag" data-summary-code="${esc(code)}">${esc(codeName('flavors',code,code))}</span>`).join('') || '<span class="muted small">尚未选择编码标签</span>'}</div><label class="field custom-flavor-field"><span>自定义风味</span><input id="beanCustomFlavors" class="control" maxlength="240" value="${esc((bean.customFlavorNames || []).join('、'))}" placeholder="编码表中没有的风味，以、分隔"></label></section>
      ${source.evidence ? evidenceHtml(source.evidence, source.confidence) : ''}
      <div class="row"><button id="beanFormBackBtn" class="button subtle" type="button">返回</button><span class="grow"></span><button class="button primary" type="submit">保存</button></div>
    </form>`;
}

function fieldHtml'''
replace_regex(app, r'function beanFormHtml\(bean = \{\}, source = \{\}\) \{.*?\n\}\n\nfunction fieldHtml', bean_form_replacement, 'beanFormHtml')

evidence_replacement = r'''function evidenceHtml(evidence = {}, confidence = {}) {
  const labels = {
    countryCode:'国家',countryCustomName:'自定义国家',regionCode:'产区',regionCustomName:'自定义产区',
    entityCode:'庄园/处理站',entityCustomName:'自定义庄园/处理站',varietyCode:'豆种',varietyCustomName:'自定义豆种',
    processCode:'处理法',processCustomName:'自定义处理法',roastCode:'烘焙度',roastDate:'烘焙日期',
    roasterName:'烘焙商',harvestYear:'产季',altitude:'海拔',initialWeight:'初始克重',price:'价格',
    customFlavorNames:'自定义风味'
  };
  const rows = Object.entries(evidence).map(([key, value]) => `<div class="evidence-row"><span>${esc(labels[key]||key)}</span><span>${esc(value)}</span><span>${Math.round((confidence[key]||0)*100)}%</span></div>`).join('');
  return rows ? `<section class="panel"><div class="panel-title"><div><h3>识别证据</h3><p>标签名优先拆分；低置信度和自定义字段请人工确认</p></div></div><div class="text-evidence">${rows}</div></section>` : '';
}

function openBeanForm'''
replace_regex(app, r'function evidenceHtml\(evidence = \{\}, confidence = \{\}\) \{.*?\n\}\n\nfunction openBeanForm', evidence_replacement, 'evidenceHtml')

open_form_replacement = r'''function openBeanForm(bean = {}, source = { type: 'manual' }) {
  state.beanFormSource = source;
  state.beanFormDraft = structuredClone(bean);
  const overlay = showOverlay(beanFormHtml(bean, source), { full: true, id: 'bean-form' }); bindClose(overlay);
  const form = $('#beanForm');
  const syncRoastColor = () => {
    const color = formValue('beanRoastColor');
    const select = $('#beanRoast');
    if (color) {
      select.value = roastFromColor(color);
      select.dataset.autoFromColor = 'true';
      select.disabled = true;
    } else if (select.dataset.autoFromColor === 'true') {
      select.value = '';
      delete select.dataset.autoFromColor;
      select.disabled = false;
    }
    refreshControlState(select);
  };
  const bindCodedCustom = (selectId, inputId) => {
    const select = $(`#${selectId}`), input = $(`#${inputId}`);
    if (!select || !input) return;
    const update = () => {
      const custom = select.value === '__custom__';
      input.classList.toggle('hidden', !custom);
      input.disabled = !custom;
      if (custom) requestAnimationFrame(() => input.focus());
    };
    select.addEventListener('change', update);
    update();
  };
  const dependentOptions = (id, rows, labelIndex, blank, noun) => {
    const select = $(`#${id}`);
    if (!select) return;
    select.innerHTML = `${selectOptions(rows, '', labelIndex, blank)}<option value="__custom__">自定义${noun}</option>`;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  $('#beanCountry').addEventListener('change', () => {
    const country = $('#beanCountry').value;
    const codedCountry = country === '__custom__' ? '' : country;
    dependentOptions('beanRegion', relatedRows(state.codebook, 'regions', codedCountry), 2, codedCountry ? '请选择产区' : '请选择或自定义产区', '产区');
    dependentOptions('beanEntity', relatedRows(state.codebook, 'entities', codedCountry), 3, codedCountry ? '请选择庄园 / 处理站' : '请选择或自定义庄园 / 处理站', '庄园 / 处理站');
    bindControlStates(form);
  });
  [['beanCountry','beanCountryCustom'],['beanRegion','beanRegionCustom'],['beanEntity','beanEntityCustom'],['beanVariety','beanVarietyCustom'],['beanProcess','beanProcessCustom']].forEach(args => bindCodedCustom(...args));
  $('#beanRoastColor').addEventListener('input', syncRoastColor);
  if (formValue('beanRoastColor')) { $('#beanRoast').dataset.autoFromColor = 'true'; syncRoastColor(); }
  $('#editFlavorsBtn').addEventListener('click', () => openFlavorEditor(selectedSummaryCodes(), bean, source));
  $('#beanFormBackBtn').addEventListener('click', () => {
    if (source.type === 'text') openTextRecognition(source.text || '', captureBeanFormDraft()); else closeOverlay();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const resolveCoded = (selectId, customId, label, required = false) => {
      const selected = formValue(selectId);
      const custom = formValue(customId);
      if (selected === '__custom__') {
        if (required && !custom) { toast(`请填写自定义${label}`, 'status-bad'); return null; }
        return { code: '', custom };
      }
      if (required && !selected) { toast(`请选择${label}或填写自定义${label}`, 'status-bad'); return null; }
      return { code: selected, custom: '' };
    };
    const country = resolveCoded('beanCountry','beanCountryCustom','国家',true); if (!country) return;
    const region = resolveCoded('beanRegion','beanRegionCustom','产区'); if (!region) return;
    const entity = resolveCoded('beanEntity','beanEntityCustom','庄园 / 处理站'); if (!entity) return;
    const variety = resolveCoded('beanVariety','beanVarietyCustom','豆种',true); if (!variety) return;
    const process = resolveCoded('beanProcess','beanProcessCustom','处理法',true); if (!process) return;
    for (const [id,label] of [['beanRoast','烘焙度'],['beanRoastDate','烘焙日期'],['beanInitialWeight','初始克重']]) if (!formValue(id)) return toast(`请填写${label}`, 'status-bad');
    const initialWeight = parseNumber(formValue('beanInitialWeight'));
    if (initialWeight <= 0) return toast('初始克重必须大于 0', 'status-bad');
    const harvestYear = parseNumber(formValue('beanHarvestYear'), 0) || '';
    const customFlavorNames = formValue('beanCustomFlavors').split(/[、,，;；/|\n]+/).map(value => value.trim()).filter(Boolean).slice(0, 12);
    const countryName = country.custom || codeName('countries', country.code, '未定国家');
    const varietyName = variety.custom || codeName('varieties', variety.code, '未定豆种');
    const now = new Date().toISOString();
    const record = {
      ...bean, id: bean.id || uid('bean'), name: `${countryName} · ${varietyName}`,
      countryCode: country.code, countryCustomName: country.custom,
      regionCode: region.code, regionCustomName: region.custom,
      entityCode: entity.code, entityCustomName: entity.custom,
      varietyCode: variety.code, varietyCustomName: variety.custom,
      processCode: process.code, processCustomName: process.custom,
      harvestYear,
      roastColor: parseNumber(formValue('beanRoastColor'), 0) || '', roastCode: formValue('beanRoast'), roastDate: formValue('beanRoastDate'), initialWeight,
      remainingWeight: bean.id ? Number(bean.remainingWeight) : initialWeight, refrigerated: formValue('beanRefrigerated') === 'true', freezeDate: formValue('beanRefrigerated') === 'true' ? (bean.freezeDate || todayISO()) : '',
      price: parseNumber(formValue('beanPrice'), 0), roasterName: formValue('beanRoaster'), altitude: parseNumber(formValue('beanAltitude'), 0), notes: formValue('beanNotes'),
      flavorCodes: selectedSummaryCodes(), customFlavorNames, archived: Boolean(bean.archived), source: source.type || bean.source || 'manual',
      codebookSchemaVersion: Number(state.codebook._schemaVersion || 1), codebookDataVersion: String(state.codebook.version || '6'),
      createdAt: bean.createdAt || now, updatedAt: now
    };
    await put('beans', record); await refreshData(); closeOverlay(); renderBeans(); toast(bean.id ? '豆卡已更新' : '豆卡已加入豆藏', 'status-good');
  });
  bindControlStates(form);
}

function selectedSummaryCodes'''
replace_regex(app, r'function openBeanForm\(bean = \{\}, source = \{ type: \'manual\' \}\) \{.*?\n\}\n\nfunction selectedSummaryCodes', open_form_replacement, 'openBeanForm')

capture_replacement = r'''function captureBeanFormDraft() {
  const coded = id => formValue(id) === '__custom__' ? '' : formValue(id);
  return {
    ...state.beanFormDraft,
    countryCode: coded('beanCountry'), countryCustomName: formValue('beanCountryCustom'),
    regionCode: coded('beanRegion'), regionCustomName: formValue('beanRegionCustom'),
    entityCode: coded('beanEntity'), entityCustomName: formValue('beanEntityCustom'),
    varietyCode: coded('beanVariety'), varietyCustomName: formValue('beanVarietyCustom'),
    processCode: coded('beanProcess'), processCustomName: formValue('beanProcessCustom'),
    harvestYear: formValue('beanHarvestYear'), roastColor: formValue('beanRoastColor'), roastCode: formValue('beanRoast'), roastDate: formValue('beanRoastDate'), initialWeight: formValue('beanInitialWeight'),
    refrigerated: formValue('beanRefrigerated') === 'true', price: formValue('beanPrice'), roasterName: formValue('beanRoaster'), altitude: formValue('beanAltitude'), notes: formValue('beanNotes'),
    flavorCodes: selectedSummaryCodes(), customFlavorNames: formValue('beanCustomFlavors').split(/[、,，;；/|\n]+/).map(value => value.trim()).filter(Boolean)
  };
}

function flavorGroupLabel'''
replace_regex(app, r'function captureBeanFormDraft\(\) \{.*?\n\}\n\nfunction flavorGroupLabel', capture_replacement, 'captureBeanFormDraft')

flavor_replacement = r'''function flavorGroupLabel(name = '') {
  const value = String(name);
  if (/花|茉莉|玫瑰|紫罗兰|洋甘菊|橙花|白玉兰/.test(value)) return '花香';
  if (/果|莓|柑|橘|柠檬|桃|苹果|葡萄|芒果|菠萝|李子|樱桃/.test(value)) return '果香';
  if (/茶|乌龙|红茶|绿茶|香料|肉桂|丁香|胡椒|坚果|可可|巧克力|杏仁|榛子/.test(value)) return '茶感、香料、坚果、可可';
  return '其他';
}

function openFlavorEditor(selected, bean, source) {
  const draft = captureBeanFormDraft();
  const set = new Set((selected || []).filter(code => state.codebookIndex?.flavors?.has(code)));
  const rows = (state.codebook.flavors || []).filter(row => row?.[0] && String(row.length >= 9 ? row[4] : row[1] || '').trim());
  const order = ['花香','果香','茶感、香料、坚果、可可','其他'];
  const groups = new Map(order.map(label => [label, []]));
  rows.forEach(row => {
    const name = row.length >= 9 ? row[4] : row[1];
    groups.get(flavorGroupLabel(name || row[2] || row[1])).push(row);
  });
  const groupHtml = order.map(label => {
    const items = groups.get(label) || [];
    const selectedCount = items.filter(row => set.has(row[0])).length;
    return `<details class="flavor-group flavor-accordion"><summary><strong>${esc(label)}</strong><span>${selectedCount ? `已选${selectedCount} · ` : ''}${items.length}项</span></summary><div class="flavor-grid">${items.map(row=>`<button type="button" class="flavor-button${set.has(row[0])?' selected':''}" data-flavor-code="${esc(row[0])}">${esc(String(row.length >= 9 ? row[4] : row[1]).trim())}</button>`).join('')}</div></details>`;
  }).join('');
  const content = `${dialogHeader('风味标签', `四组默认折叠，最多选择 12 项`, { closable: false })}<div class="flavor-groups">${groupHtml}</div><div class="row end flavor-actions"><button id="backFlavorsBtn" class="button subtle" type="button">返回</button><button id="clearFlavorsBtn" class="button subtle" type="button">清空</button><button id="confirmFlavorsBtn" class="button primary" type="button">确定</button></div>`;
  const overlay = showOverlay(content, { full: true, id: 'flavors' }); bindClose(overlay);
  requestAnimationFrame(() => {
    const dialog = $('.dialog', overlay);
    if (dialog) dialog.scrollTop = 0;
    overlay.scrollTop = 0;
  });
  overlay.addEventListener('click', event => {
    const button = event.target.closest('[data-flavor-code]'); if (!button) return;
    if (!button.classList.contains('selected') && $$('.flavor-button.selected', overlay).length >= 12) return toast('风味标签最多选择 12 项');
    button.classList.toggle('selected');
  });
  $('#backFlavorsBtn').addEventListener('click', () => openBeanForm(draft, source));
  $('#clearFlavorsBtn').addEventListener('click', () => $$('.flavor-button.selected', overlay).forEach(button => button.classList.remove('selected')));
  $('#confirmFlavorsBtn').addEventListener('click', () => { draft.flavorCodes = selectedFlavorCodes(overlay); openBeanForm(draft, source); });
}

function openTextRecognition'''
replace_regex(app, r'function flavorGroupLabel\(name = \'\'\) \{.*?\n\}\n\nfunction openTextRecognition', flavor_replacement, 'flavor editor')

text_recognition_replacement = r'''function openTextRecognition(text = '', existingDraft = null) {
  if (existingDraft) state.beanFormDraft = structuredClone(existingDraft);
  const content = `${dialogHeader('文字识别', '先捕捉“烘焙日期、烘焙商、处理法、风味、产季”等标签，再匹配标签后的内容')}<label class="field"><span>豆袋文字</span><textarea id="recognitionText" class="control" placeholder="例如：国家：埃塞俄比亚\n产区：西达摩\n豆种：74110\n处理法：水洗\n产季：26产季\n烘焙时间：26.727\n风味：茉莉、白玉兰">${esc(text)}</textarea></label><label class="toggle"><input id="overwriteRecognizedFields" type="checkbox" checked>识别结果覆盖已有表单字段</label><p class="muted small">标签名优先确定字段归属；编码表未收录的内容会进入对应的“自定义”输入框，不会被静默丢弃。</p><div class="row"><button id="speechTextBtn" class="button" type="button">语音输入</button><button id="clearRecognitionTextBtn" class="button subtle" type="button">清空</button><button id="manualBeanFormBtn" class="button subtle" type="button">直接填表</button><span class="grow"></span><button id="parseTextBtn" class="button primary" type="button">识别并填表</button></div>`;
  const overlay = showOverlay(content, { full: true, id: 'text-recognition' }); bindClose(overlay);
  $('#clearRecognitionTextBtn').addEventListener('click', () => { $('#recognitionText').value = ''; $('#recognitionText').focus(); });
  $('#manualBeanFormBtn').addEventListener('click', () => openBeanForm(existingDraft || {}, { type: 'manual' }));
  $('#parseTextBtn').addEventListener('click', () => {
    const sourceText = $('#recognitionText').value.trim();
    if (!sourceText) return toast('请先输入文字');
    const parsed = parseNaturalLanguage(sourceText, state.codebook);
    const existing = existingDraft || {};
    const overwrite = $('#overwriteRecognizedFields').checked;
    const merged = overwrite ? { ...existing, ...parsed } : { ...parsed, ...Object.fromEntries(Object.entries(existing).filter(([, value]) => value !== '' && value !== null && value !== undefined)) };
    const countryName = merged.countryCustomName || codeName('countries', merged.countryCode, '');
    const varietyName = merged.varietyCustomName || codeName('varieties', merged.varietyCode, '');
    merged.name = merged.name || [countryName, varietyName].filter(Boolean).join(' ') || '新豆卡';
    openBeanForm(merged, { type: 'text', text: sourceText, evidence: parsed.evidence, confidence: parsed.confidence });
  });
  $('#speechTextBtn').addEventListener('click', () => startSpeechRecognition('recognitionText'));
}

function startSpeechRecognition'''
replace_regex(app, r'function openTextRecognition\(text = \'\', existingDraft = null\) \{.*?\n\}\n\nfunction startSpeechRecognition', text_recognition_replacement, 'openTextRecognition')

# ---------------------------------------------------------------------------
# 3. Independent sensory record bridge and UI styles.
# ---------------------------------------------------------------------------
app_text = app.read_text(encoding='utf-8')
if 'LuckyBeanSensoryBridgeV105' not in app_text:
    app_text += r'''

async function saveIndependentSensoryRecord(input = {}) {
  const beanId = String(input.beanId || state.selectedBeanId || '');
  const bean = state.beans.find(item => item.id === beanId);
  if (!bean) throw new Error('未找到本次品鉴对应的豆卡');
  const now = new Date().toISOString();
  const subjectiveScore = clamp(Number(input.subjectiveScore ?? input.score ?? 0), 0, 100);
  const autoScore = clamp(Number(input.autoScore ?? subjectiveScore), 0, 100);
  const record = {
    ...input,
    id: input.id || uid('sensory'),
    beanId,
    brewSessionId: String(input.brewSessionId || ''),
    answers: input.answers || {},
    summary: Array.isArray(input.summary) ? input.summary : [],
    evaluationMode: input.evaluationMode || 'note',
    autoScore,
    subjectiveScore,
    score: subjectiveScore,
    scoreDelta: Number((subjectiveScore - autoScore).toFixed(1)),
    naturalNote: String(input.naturalNote || '').trim(),
    direct: Boolean(input.direct),
    createdAt: input.createdAt || now,
    updatedAt: now
  };
  record.preferenceTags = sensoryPreferenceTags(record, bean);
  const session = state.brewSessions.find(item => item.id === record.brewSessionId);
  if (session) {
    session.sensoryRecordId = record.id;
    session.sensoryNote = record.naturalNote;
    session.autoScore = autoScore;
    session.subjectiveScore = subjectiveScore;
    session.scoreDelta = record.scoreDelta;
    session.status = session.status === 'planned' ? 'evaluated' : session.status;
    await put('brewSessions', session);
  }
  await put('sensoryRecords', record);
  await refreshData();
  state.evaluation = null;
  switchPage('beans');
  requestAnimationFrame(() => detailBean(beanId));
  toast(record.evaluationMode === 'professional' ? '杯测品鉴已保存' : '札记品鉴已保存', 'status-good');
  return record;
}

globalThis.LuckyBeanSensoryBridgeV105 = {
  save: saveIndependentSensoryRecord,
  reset: () => { state.evaluation = null; renderSensory(); },
  selectedBeanId: () => state.selectedBeanId
};

if (!document.querySelector('#luckyBeanV105Styles')) {
  const style = document.createElement('style');
  style.id = 'luckyBeanV105Styles';
  style.textContent = `
    .coded-custom-input.hidden{display:none!important}
    .coded-custom-input{margin-top:8px}
    .custom-flavor-field{margin-top:14px}
    [data-overlay="flavors"] .dialog{overflow-y:auto;overscroll-behavior:contain;scroll-behavior:auto}
    .flavor-groups{display:grid;gap:10px;padding-bottom:12px}
    .flavor-accordion{border:1px solid rgba(196,161,102,.32);border-radius:12px;background:rgba(255,255,255,.025)}
    .flavor-accordion>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;cursor:pointer;list-style:none}
    .flavor-accordion>summary::-webkit-details-marker{display:none}
    .flavor-accordion>summary:after{content:'＋';font-size:18px;color:#c7a66b}
    .flavor-accordion[open]>summary:after{content:'－'}
    .flavor-accordion>summary span{font-size:12px;color:#999}
    .flavor-accordion .flavor-grid{padding:0 12px 14px}
    .flavor-actions{position:sticky;bottom:0;z-index:3;padding:12px 0 calc(12px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(8,9,9,0),#080909 26%)}
    .v105-independent-card{display:grid;gap:18px;min-width:min(92vw,560px)}
    .v105-score-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center}
    .v105-score-row output{font-size:28px;font-weight:700;color:#d0ad6d}
    .v105-score-row input{grid-column:1/-1;width:100%}
    .v105-note{min-height:180px;resize:vertical}
    .v105-summary{max-height:220px;overflow:auto;padding:12px;border:1px solid rgba(196,161,102,.24);border-radius:10px;white-space:pre-wrap;font-size:12px;color:#aaa}
  `;
  document.head.append(style);
}
'''
app.write_text(app_text, encoding='utf-8')

print('Applied LuckyBean v1.0.5 label-aware data and form fixes.')
