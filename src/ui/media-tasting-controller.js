import { all, getSetting, setSetting } from '../db.js';
import { loadCodebook, makeIndex, displayName } from '../codebook.js';
import { generateMediaTastingCopy } from '../services/media-tasting-ai-service.js';

const TEMPLATE_SETTING_ID = 'media.tasting.templates.v1';
const MAX_CUSTOM_TEMPLATES = 5;
const MAX_TEMPLATE_CHARS = 8000;
const ROAST_NAMES = Object.freeze({
  'RL-L0':'极浅烘','RL-L1':'浅烘','RL-L2':'浅中烘','RL-L3':'中烘','RL-L4':'中深烘','RL-L5':'深烘','RL-L6':'极深烘'
});

const BUILTIN_TEMPLATES = Object.freeze([
  {
    id:'builtin-clean-card', name:'极简豆卡',
    instructions:'用克制、干净的咖啡豆卡排版。第一行可用 ☕ 或豆名；随后用 4–7 行短句呈现产地/处理/品种/烘焙与品鉴核心。风味使用“✦”或“·”分隔。总分如存在放在结尾。不要长段落，不要营销夸张，不要补造缺失字段。'
  },
  {
    id:'builtin-social-note', name:'社交媒体短文',
    instructions:'生成适合直接发布的中文社交媒体品鉴文字。保留 1 个简短标题，正文 2–4 个短段落，使用少量 ☕️ / 🌿 / 🍑 / ✨ 等与事实风味匹配的符号。语气自然、像真实饮用记录，不写“作为AI”等说明，不使用夸张广告语。末尾可用一行简洁参数/评分。'
  },
  {
    id:'builtin-professional', name:'专业杯测',
    instructions:'采用专业咖啡杯测/感官记录风格。先列咖啡基础信息，再分“香气 / 风味 / 酸质 / 甜感 / 口感 / 余韵 / 平衡”等有实际证据的维度组织；没有证据的维度直接省略。保留评分与专业数据，避免生活化修辞，禁止杜撰 SCA 分项分数。'
  },
  {
    id:'builtin-brew-log', name:'冲煮日志',
    instructions:'生成“冲煮参数 + 杯中表现”的日志型文字。先以简短标题开场；有冲煮记录时列粉量、水量、粉水比、时间、方案等真实参数；随后用 2–3 段描述实际品鉴表现和下一次调整方向。没有冲煮参数时不要虚构。可使用 ▸ / → / ◦ 等符号增强可读性。'
  },
  {
    id:'builtin-caption', name:'图片配文',
    instructions:'生成适合照片配文的短版品鉴。控制在约 120–260 个中文字符；第一行简短有辨识度，第二部分突出最核心的 2–4 个风味/口感事实，最后一行放产地/处理/烘焙/评分中已有的信息。符号简洁，不堆叠标签，不编造故事背景。'
  }
]);

let codebookIndexPromise = null;
let activeSession = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function clean(value) { return String(value ?? '').trim(); }
function notice(message, kind = 'status-good') {
  document.dispatchEvent(new CustomEvent('luckybean:user-notice', { detail:{ message, kind } }));
}
function injectStyle() {
  if (document.querySelector('#lbMediaTastingStyle')) return;
  const style = document.createElement('style');
  style.id = 'lbMediaTastingStyle';
  style.textContent = `
    .media-tasting-generate-button{display:block;margin:6px 0 14px auto;padding:8px 12px;border:1px solid rgba(120,110,96,.22);border-radius:10px;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer}
    .media-tasting-generate-button:hover{background:rgba(120,110,96,.07)}
    .media-tasting-dialog{max-width:760px;width:min(94vw,760px)}
    .media-template-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}
    .media-template-card{display:flex;flex-direction:column;gap:5px;align-items:flex-start;text-align:left;padding:12px;border:1px solid rgba(120,110,96,.22);border-radius:12px;background:transparent;color:inherit;cursor:pointer}
    .media-template-card.selected{border-color:currentColor;box-shadow:0 0 0 1px currentColor inset}
    .media-template-card small{opacity:.62;line-height:1.45}
    .media-template-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0 14px}
    .media-template-custom-row{display:flex;align-items:center;gap:8px}
    .media-template-custom-row .media-template-card{flex:1}
    .media-template-delete{border:0;background:transparent;color:#9f4f4a;cursor:pointer;padding:8px}
    .media-tasting-editor{width:100%;min-height:320px;resize:vertical;line-height:1.7;white-space:pre-wrap}
    .media-tasting-status{min-height:1.6em;margin:8px 0;opacity:.72;font-size:13px}
    .media-tasting-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}
    .media-ephemeral-note{font-size:12px;opacity:.62;line-height:1.6}
  `;
  document.head.append(style);
}
async function codebookIndex() {
  if (!codebookIndexPromise) codebookIndexPromise = loadCodebook().then(result => makeIndex(result.data)).catch(() => null);
  return codebookIndexPromise;
}
function label(index, table, code, custom = '') {
  return clean(custom) || (code ? displayName(index, table, code, clean(code)) : '');
}
function formatHarvest(bean) {
  return clean(bean?.harvestSeason || bean?.harvestYear || bean?.cropYear);
}
function compactProfessional(record) {
  const value = record?.professionalData;
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const key of ['fragrance','aroma','flavor','aftertaste','acidity','body','balance','uniformity','cleanCup','sweetness','overall','score','notes','descriptors']) {
    const item = value[key];
    if (item !== undefined && item !== null && item !== '') out[key] = item;
  }
  return Object.keys(out).length ? out : value;
}
async function buildFacts(recordId) {
  const [records, beans, sessions, index] = await Promise.all([
    all('sensoryRecords'), all('beans'), all('brewSessions'), codebookIndex()
  ]);
  const record = records.find(item => String(item.id) === String(recordId));
  if (!record) throw new Error('品鉴记录不存在或已删除');
  const bean = beans.find(item => String(item.id) === String(record.beanId)) || {};
  const session = sessions.find(item => String(item.id) === String(record.brewSessionId)) || null;
  const facts = {
    bean: {
      name: clean(bean.name || bean.productName || bean.roasterProductName),
      country: label(index, 'countries', bean.countryCode, bean.countryCustomName),
      region: label(index, 'regions', bean.regionCode, bean.regionCustomName),
      entity: label(index, 'entities', bean.entityCode, bean.entityCustomName),
      variety: label(index, 'varieties', bean.varietyCode, bean.varietyCustomName),
      process: label(index, 'processes', bean.processCode, bean.processCustomName),
      harvest: formatHarvest(bean),
      roastDate: clean(bean.roastDate),
      roastLevel: clean(ROAST_NAMES[bean.roastCode] || bean.roastCode),
      roastColor: bean.roastColor === undefined || bean.roastColor === null || bean.roastColor === '' ? '' : Number(bean.roastColor),
      roaster: clean(bean.roasterName),
      altitude: clean(bean.altitude)
    },
    tasting: {
      mode: clean(record.evaluationMode || record.sourceMode),
      score: Number.isFinite(Number(record.subjectiveScore ?? record.score)) ? Number(record.subjectiveScore ?? record.score) : '',
      autoScore: Number.isFinite(Number(record.autoScore)) ? Number(record.autoScore) : '',
      scoreDelta: Number.isFinite(Number(record.scoreDelta)) ? Number(record.scoreDelta) : '',
      summary: Array.isArray(record.summary) ? record.summary.map(String) : [],
      note: clean(record.naturalNote),
      answers: record.answers && typeof record.answers === 'object' ? record.answers : null,
      professional: compactProfessional(record),
      createdAt: clean(record.createdAt)
    }
  };
  if (session) {
    facts.brew = {
      profile: clean(session.profile?.label || session.profileName || session.profileVersion),
      doseG: Number.isFinite(Number(session.totals?.doseG)) ? Number(session.totals.doseG) : '',
      waterG: Number.isFinite(Number(session.totals?.waterG)) ? Number(session.totals.waterG) : '',
      brewWaterG: Number.isFinite(Number(session.totals?.brewWaterG)) ? Number(session.totals.brewWaterG) : '',
      ratio: Number.isFinite(Number(session.totals?.ratio)) ? Number(session.totals.ratio) : '',
      targetTimeSec: Number.isFinite(Number(session.totals?.targetTimeSec)) ? Number(session.totals.targetTimeSec) : '',
      serveMode: clean(session.normalizedInput?.brew?.serveMode || session.rawInput?.brew?.serveMode),
      stages: Array.isArray(session.stages) ? session.stages.slice(0, 8).map(stage => ({
        name:clean(stage.name), waterG:Number(stage.stageWaterG || 0), temperatureC:Number(stage.temperatureC || 0), durationSec:Number(stage.durationSec || 0), method:clean(stage.method)
      })) : []
    };
  }
  return { record, bean, facts };
}
async function customTemplates() {
  const saved = await getSetting(TEMPLATE_SETTING_ID, []);
  return Array.isArray(saved) ? saved.filter(item => item?.id && item?.instructions).slice(0, MAX_CUSTOM_TEMPLATES) : [];
}
async function saveCustomTemplates(templates) {
  await setSetting(TEMPLATE_SETTING_ID, templates.slice(0, MAX_CUSTOM_TEMPLATES));
}
function shortTemplateDescription(template) {
  const text = clean(template.instructions).replace(/\s+/g, ' ');
  return text.length > 56 ? `${text.slice(0, 56)}…` : text;
}
function templateCard(template, selected, custom = false) {
  const card = `<button class="media-template-card${selected ? ' selected' : ''}" type="button" data-media-template="${esc(template.id)}"><strong>${esc(template.name)}</strong><small>${esc(shortTemplateDescription(template))}</small></button>`;
  return custom ? `<div class="media-template-custom-row">${card}<button type="button" class="media-template-delete" data-media-template-delete="${esc(template.id)}" aria-label="删除自定义模板">删</button></div>` : card;
}
function root() { return document.querySelector('#overlayRoot'); }
function destroySession() {
  if (activeSession) activeSession.draftText = '';
  activeSession = null;
  root()?.replaceChildren();
}
function confirmDestroy() {
  if (!activeSession?.draftText) { destroySession(); return true; }
  if (!globalThis.confirm('当前生成的媒体品鉴文字不会保存。退出后将立即销毁，确认退出？')) return false;
  destroySession();
  return true;
}
async function renderTemplatePicker() {
  if (!activeSession) return;
  activeSession.custom = await customTemplates();
  const templates = [...BUILTIN_TEMPLATES, ...activeSession.custom];
  if (!templates.some(item => item.id === activeSession.selectedTemplateId)) activeSession.selectedTemplateId = BUILTIN_TEMPLATES[0].id;
  const host = root(); if (!host) return;
  host.innerHTML = `<div class="overlay full" data-overlay="media-tasting"><div class="dialog media-tasting-dialog">
    <div class="dialog-header"><div><h2>生成媒体品鉴</h2><p>${esc(activeSession.beanName || '本次品鉴')} · 选择模板后由 AI 只依据现有记录改写</p></div><button class="close-button" type="button" data-media-close aria-label="关闭">×</button></div>
    <div class="media-template-grid">${BUILTIN_TEMPLATES.map(item => templateCard(item, item.id === activeSession.selectedTemplateId)).join('')}</div>
    ${activeSession.custom.length ? `<div class="media-template-grid">${activeSession.custom.map(item => templateCard(item, item.id === activeSession.selectedTemplateId, true)).join('')}</div>` : ''}
    <div class="media-template-tools"><label class="button" for="mediaTemplateUpload">上传并保存自定义模板</label><input id="mediaTemplateUpload" type="file" accept=".txt,.md,text/plain,text/markdown" hidden><span class="media-ephemeral-note">最多保存 ${MAX_CUSTOM_TEMPLATES} 个；模板仅保存格式要求，生成文字不保存。</span></div>
    <p class="media-ephemeral-note">AI 仅改变表达和排版，不允许新增咖啡事实。缺少的产地、参数、评分或风味会被省略。</p>
    <div class="media-tasting-actions"><button class="button primary" type="button" data-media-generate>生成</button></div>
  </div></div>`;
}
function selectedTemplate() {
  if (!activeSession) return null;
  return [...BUILTIN_TEMPLATES, ...(activeSession.custom || [])].find(item => item.id === activeSession.selectedTemplateId) || BUILTIN_TEMPLATES[0];
}
function renderEditor() {
  if (!activeSession) return;
  const host = root(); if (!host) return;
  host.innerHTML = `<div class="overlay full" data-overlay="media-tasting"><div class="dialog media-tasting-dialog">
    <div class="dialog-header"><div><h2>媒体品鉴文字</h2><p>${esc(selectedTemplate()?.name || '模板')} · 可直接编辑后复制</p></div><button class="close-button" type="button" data-media-close aria-label="关闭">×</button></div>
    <textarea id="mediaTastingEditor" class="control media-tasting-editor" spellcheck="true">${esc(activeSession.draftText)}</textarea>
    <p class="media-tasting-status" data-media-status>${esc(activeSession.model ? `AI：${activeSession.model}` : '')}</p>
    <p class="media-ephemeral-note">本页内容为临时草稿：不会写入豆卡、品鉴记录或云同步。退出后自动销毁。</p>
    <div class="media-tasting-actions"><button class="button" type="button" data-media-back>更换模板</button><button class="button" type="button" data-media-regenerate>重新生成</button><button class="button primary" type="button" data-media-copy>复制</button><button class="button subtle" type="button" data-media-exit>退出</button></div>
  </div></div>`;
}
async function generateCurrent() {
  if (!activeSession || activeSession.generating) return;
  const template = selectedTemplate(); if (!template) return;
  activeSession.generating = true;
  const status = document.querySelector('[data-media-status]');
  if (status) status.textContent = '正在根据模板整理品鉴文字…';
  try {
    const response = await generateMediaTastingCopy({ template, facts:activeSession.facts });
    if (!activeSession) return;
    if (!response.ok) {
      notice(`媒体品鉴生成失败：${response.reason || 'AI不可用'}`, 'status-bad');
      if (status) status.textContent = '生成失败，可更换模板后重试。';
      return;
    }
    activeSession.draftText = response.text;
    activeSession.model = response.model;
    renderEditor();
  } finally {
    if (activeSession) activeSession.generating = false;
  }
}
async function copyDraft() {
  if (!activeSession) return;
  const editor = document.querySelector('#mediaTastingEditor');
  activeSession.draftText = editor?.value || activeSession.draftText || '';
  if (!activeSession.draftText.trim()) return notice('没有可复制的文字', 'status-warn');
  try {
    await navigator.clipboard.writeText(activeSession.draftText);
  } catch {
    if (!editor) throw new Error('当前浏览器无法访问剪贴板');
    editor.focus(); editor.select();
    if (!document.execCommand?.('copy')) throw new Error('复制失败');
  }
  notice('已复制全部媒体品鉴文字，可直接粘贴到媒体平台', 'status-good');
}
async function uploadTemplate(file) {
  if (!file || !activeSession) return;
  if (file.size > 64 * 1024) return notice('模板文件过大，请控制在 64KB 以内', 'status-warn');
  const text = clean(await file.text()).slice(0, MAX_TEMPLATE_CHARS);
  if (text.length < 8) return notice('模板内容过短', 'status-warn');
  const custom = await customTemplates();
  if (custom.length >= MAX_CUSTOM_TEMPLATES) return notice(`最多保存 ${MAX_CUSTOM_TEMPLATES} 个自定义模板，请先删除一个`, 'status-warn');
  const baseName = clean(file.name).replace(/\.(?:txt|md)$/i, '') || '自定义模板';
  const template = { id:`custom-${Date.now().toString(36)}`, name:baseName.slice(0, 80), instructions:text };
  custom.push(template);
  await saveCustomTemplates(custom);
  activeSession.selectedTemplateId = template.id;
  await renderTemplatePicker();
  notice('自定义模板已保存', 'status-good');
}
async function deleteTemplate(id) {
  if (!activeSession) return;
  const custom = (await customTemplates()).filter(item => item.id !== id);
  await saveCustomTemplates(custom);
  if (activeSession.selectedTemplateId === id) activeSession.selectedTemplateId = BUILTIN_TEMPLATES[0].id;
  await renderTemplatePicker();
}
async function openMediaTasting(recordId) {
  const payload = await buildFacts(recordId);
  activeSession = {
    recordId:String(recordId),
    facts:payload.facts,
    beanName:clean(payload.bean?.name || payload.bean?.productName || '本次品鉴'),
    custom:await customTemplates(),
    selectedTemplateId:BUILTIN_TEMPLATES[0].id,
    draftText:'', model:'', generating:false
  };
  await renderTemplatePicker();
}
function enhanceSensoryRows(rootNode = document) {
  rootNode.querySelectorAll?.('.sensory-record-button[data-sensory-record]').forEach(recordButton => {
    if (recordButton.dataset.mediaTastingEnhanced === '1') return;
    recordButton.dataset.mediaTastingEnhanced = '1';
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'media-tasting-generate-button';
    action.dataset.mediaTastingRecord = recordButton.dataset.sensoryRecord || '';
    action.textContent = '生成媒体品鉴';
    recordButton.insertAdjacentElement('afterend', action);
  });
}

injectStyle();
new MutationObserver(mutations => {
  for (const mutation of mutations) for (const node of mutation.addedNodes) if (node?.nodeType === 1) enhanceSensoryRows(node);
}).observe(document.documentElement, { childList:true, subtree:true });

document.addEventListener('click', event => {
  const action = event.target.closest?.('[data-media-tasting-record]');
  if (action) {
    event.preventDefault(); event.stopPropagation();
    openMediaTasting(action.dataset.mediaTastingRecord).catch(error => notice(error.message || '无法打开媒体品鉴', 'status-bad'));
    return;
  }
  if (!event.target.closest?.('[data-overlay="media-tasting"]')) return;
  const templateButton = event.target.closest?.('[data-media-template]');
  if (templateButton && activeSession) { activeSession.selectedTemplateId = templateButton.dataset.mediaTemplate; void renderTemplatePicker(); return; }
  const deleteButton = event.target.closest?.('[data-media-template-delete]');
  if (deleteButton) { void deleteTemplate(deleteButton.dataset.mediaTemplateDelete); return; }
  if (event.target.closest?.('[data-media-generate]')) { void generateCurrent(); return; }
  if (event.target.closest?.('[data-media-regenerate]')) { const editor=document.querySelector('#mediaTastingEditor'); if(activeSession&&editor)activeSession.draftText=editor.value; void generateCurrent(); return; }
  if (event.target.closest?.('[data-media-copy]')) { void copyDraft().catch(error => notice(error.message || '复制失败', 'status-bad')); return; }
  if (event.target.closest?.('[data-media-back]')) { if(activeSession){const editor=document.querySelector('#mediaTastingEditor');if(editor)activeSession.draftText=editor.value;} void renderTemplatePicker(); return; }
  if (event.target.closest?.('[data-media-close],[data-media-exit]')) { confirmDestroy(); return; }
}, true);

document.addEventListener('change', event => {
  if (event.target?.id !== 'mediaTemplateUpload') return;
  const file = event.target.files?.[0];
  if (file) void uploadTemplate(file).catch(error => notice(error.message || '模板读取失败', 'status-bad'));
});

document.addEventListener('input', event => {
  if (event.target?.id === 'mediaTastingEditor' && activeSession) activeSession.draftText = event.target.value;
});

document.addEventListener('luckybean:app-refreshed', () => queueMicrotask(() => enhanceSensoryRows(document)));
document.addEventListener('luckybean:local-app-ready', () => queueMicrotask(() => enhanceSensoryRows(document)));
queueMicrotask(() => enhanceSensoryRows(document));

export const MediaTasting = Object.freeze({
  open: openMediaTasting,
  builtInTemplates: BUILTIN_TEMPLATES.map(item => ({ id:item.id, name:item.name })),
  storagePolicy:'custom-template-local-only; generated-copy-ephemeral'
});
globalThis.LuckyBeanMediaTasting = MediaTasting;
