import fs from 'node:fs';

// Trigger after workflow registration on the default branch.
function replaceOnce(text, before, after, label) {
  if (text.includes(after)) return text;
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`);
  return text.replace(before, after);
}

const path = 'src/app.js';
let app = fs.readFileSync(path, 'utf8');
app = replaceOnce(app,
`function evidenceHtml(evidence = {}, confidence = {}) {
  const labels = { countryCode:'国家',regionCode:'产区',entityCode:'庄园/处理站',varietyCode:'豆种',processCode:'处理法',roastCode:'烘焙度',roastDate:'烘焙日期',harvestYear:'产季',roastColor:'烘焙色值',roasterName:'烘焙商',altitude:'海拔',initialWeight:'初始克重',price:'价格' };
  const rows = Object.entries(evidence).map(([key, value]) => \`<div class="evidence-row"><span>\${esc(labels[key]||key)}</span><span>\${esc(value)}</span><span>\${Math.round((confidence[key]||0)*100)}%</span></div>\`).join('');
  return rows ? \`<section class="panel"><div class="panel-title"><div><h3>识别证据</h3><p>低置信度字段请人工确认</p></div></div><div class="text-evidence">\${rows}</div></section>\` : '';
}`,
`function evidenceHtml(evidence = {}, confidence = {}, reviewFields = []) {
  const labels = { countryCode:'国家',regionCode:'产区',entityCode:'庄园/处理站',varietyCode:'豆种',processCode:'处理法',roastCode:'烘焙度',roastDate:'烘焙日期',harvestYear:'产季',roastColor:'烘焙色值',roasterName:'烘焙商',altitude:'海拔',initialWeight:'初始克重',price:'价格' };
  const pending = new Set(Array.isArray(reviewFields) ? reviewFields.map(String) : []);
  const rows = Object.entries(evidence)
    .filter(([key]) => pending.has(key))
    .map(([key, value]) => \`<div class="evidence-row" data-evidence-field="\${esc(key)}" data-evidence-value="\${esc(String(value))}"><span>\${esc(labels[key]||key)}</span><span>\${esc(value)}</span><span>\${Math.round((confidence[key]||0)*100)}%</span></div>\`)
    .join('');
  return rows ? \`<section class="panel" data-recognition-review="pending"><div class="panel-title"><div><h3>待确认识别项</h3><p>仅保留尚未解决的字段；确认完成后本区自动消失</p></div></div><div class="text-evidence">\${rows}</div></section>\` : '';
}`,
'review-only evidence renderer');
app = replaceOnce(app,
"      ${source.showRecognitionEvidence === true && source.evidence ? evidenceHtml(source.evidence, source.confidence) : ''}",
"      ${source.evidence ? evidenceHtml(source.evidence, source.confidence, source.parseMetadata?.recognition?.reviewFields || []) : ''}",
'render only unresolved recognition fields');
app = replaceOnce(app,
"  openBeanForm(merged, { type: 'text', text: sourceText, recognitionDocument, evidence: parsed.evidence, confidence: parsed.confidence, parseMetadata: parsed.parseMetadata, showRecognitionEvidence: false });",
"  openBeanForm(merged, { type: 'text', text: sourceText, recognitionDocument, evidence: parsed.evidence, confidence: parsed.confidence, parseMetadata: parsed.parseMetadata });",
'remove obsolete all-or-nothing evidence flag');
app = replaceOnce(app,
`      if (select.value === CUSTOM_BEAN_OPTION_VALUE) {
        select.value = select.dataset.previousValue || '';
        openAddBeanOptionDialog(table, captureBeanFormDraft());
        return;
      }`,
`      if (select.value === CUSTOM_BEAN_OPTION_VALUE) {
        const draft = captureBeanFormDraft();
        select.value = select.dataset.previousValue || '';
        queueMicrotask(() => openAddBeanOptionDialog(table, draft));
        return;
      }`,
'stable custom option event ordering');
fs.writeFileSync(path, app);
console.log('Refined recognition review and custom option event ordering.');
