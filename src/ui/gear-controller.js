import { getSetting, setSetting } from '../db.js';
import {
  DRIPPER_CATALOG, FILTER_PAPER_CATALOG,
  resolveDripperPhysics, resolveFilterPaperPhysics, legacyMaterialClass
} from '../domain/matching/flavor-vector.js';

const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const $$ = (selector, root = document) => root?.querySelectorAll ? [...root.querySelectorAll(selector)] : [];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const BYPASS = Object.freeze([['none','无'], ['low','少'], ['medium','中'], ['high','多']]);
const FLOW = Object.freeze([['low','低'], ['medium','中'], ['high','高'], ['controllable','可控']]);
const PAPER_FLOW = Object.freeze([['low','低'], ['medium','中'], ['high','高'], ['variable-braking','前快后慢']]);
const GROUPS = Object.freeze([['cone','锥形'], ['flat','平底'], ['hybrid','混合'], ['lowBypass','低旁通'], ['immersion','浸泡式']]);
const OUTLET = Object.freeze([['small','小'], ['medium','中'], ['large','大'], ['open','开放大孔'], ['valve','阀门控制']]);
const MATERIALS = Object.freeze([
  ['genericPlastic','塑料（通用）'], ['asResin','AS 树脂'], ['pctg','PCTG'], ['polycarbonate','聚碳酸酯'],
  ['polypropylene','PP'], ['tritan','Tritan'], ['porcelain','瓷'], ['ceramic','陶瓷'], ['glass','玻璃'],
  ['borosilicateGlass','硼硅玻璃'], ['stainlessSteel','不锈钢'], ['titanium','钛']
]);
const SHAPES = Object.freeze([['cone','锥形'], ['flat','平底'], ['wave-flat','Wave 平底'], ['disc-flat','圆片平底'], ['trapezoid','梯形']]);
const TYPE_BY_GROUP = Object.freeze({ cone:'锥形滤杯', flat:'平底滤杯', hybrid:'混合式滤杯', lowBypass:'低旁路滤杯', immersion:'浸泡式滤杯' });

let renderQueued = false;
let cachedSettings = null;
let cachedAt = 0;

function uid(prefix) { return `${prefix}_${crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`}`; }
function options(rows, selected, { blank = '' } = {}) {
  return `${blank ? `<option value="">${esc(blank)}</option>` : ''}${rows.map(([value, label]) => `<option value="${esc(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`).join('')}`;
}
function catalogOptions(rows, selected, blank = '请选择') {
  return `<option value="">${esc(blank)}</option>${rows.map(item => `<option value="${esc(item.id)}"${item.id === selected ? ' selected' : ''}>${esc(item.brand)} · ${esc(item.name)}</option>`).join('')}`;
}
function normalizeBypass(value) {
  const raw = String(value || 'medium').toLowerCase();
  if (['none','无','0'].includes(raw)) return 'none';
  if (['low','少','1'].includes(raw)) return 'low';
  if (['high','多','3'].includes(raw)) return 'high';
  return 'medium';
}
function normalizePaperSpeed(value) {
  const raw = String(value || 'medium').toLowerCase();
  if (['low','低'].includes(raw)) return 'low';
  if (['high','高'].includes(raw)) return 'high';
  if (raw === 'variable-braking') return raw;
  return 'medium';
}
async function loadSettings({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && cachedSettings && now - cachedAt < 600) return structuredClone(cachedSettings);
  const settings = await getSetting('app.settings', {}).catch(() => ({})) || {};
  settings.gear ||= {};
  settings.gear.filters = Array.isArray(settings.gear.filters) ? settings.gear.filters : [];
  settings.gear.drippers = Array.isArray(settings.gear.drippers) ? settings.gear.drippers : [];
  settings.gear.grinders = Array.isArray(settings.gear.grinders) ? settings.gear.grinders : [];
  settings.matchingGear ||= {};
  settings.matchingGear.drippers ||= {};
  settings.matchingGear.papers ||= {};
  settings.brew ||= {};
  cachedSettings = structuredClone(settings);
  cachedAt = now;
  return settings;
}
async function persistSettings(settings, source) {
  cachedSettings = structuredClone(settings);
  cachedAt = Date.now();
  await setSetting('app.settings', settings);
  closeEditor();
  document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail: { source: source || 'gear-controller' } }));
}
function closeEditor() { $('#overlayRoot')?.replaceChildren(); }
function dialog(title, subtitle, body, overlayId) {
  const root = $('#overlayRoot');
  if (!root) return null;
  root.innerHTML = `<div class="overlay" data-overlay="${esc(overlayId)}"><div class="dialog lb-gear-match-dialog"><div class="dialog-header centered"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><button type="button" class="close-button" data-close-overlay data-lb-gear-close aria-label="关闭">×</button></div>${body}</div></div>`;
  const overlay = root.firstElementChild;
  $('[data-lb-gear-close]', overlay)?.addEventListener('click', closeEditor);
  overlay.addEventListener('click', event => { if (event.target === overlay) closeEditor(); });
  return overlay;
}
function dripperMatch(settings, id) { return settings.matchingGear?.drippers?.[id] || {}; }
function paperMatch(settings, id) { return settings.matchingGear?.papers?.[id] || {}; }
function showInlineStatus(overlay, message) {
  let node = $('[data-lb-gear-status]', overlay);
  if (!node) { node = document.createElement('p'); node.className = 'status-bad small'; node.dataset.lbGearStatus = '1'; $('.row.end', overlay)?.before(node); }
  node.textContent = message;
}
function fieldValue(item, key) { const value = item?.physics?.[key]; return value && typeof value === 'object' && Object.hasOwn(value, 'value') ? value.value : value; }
function templateMaterial(id) { return fieldValue(DRIPPER_CATALOG.find(item => item.id === id), 'materialKey') || 'genericPlastic'; }
function templateGroup(id) { return fieldValue(DRIPPER_CATALOG.find(item => item.id === id), 'group') || 'flat'; }
function materialLabel(value) { return MATERIALS.find(([id]) => id === value)?.[1] || value || '—'; }
function groupLabel(value) { return GROUPS.find(([id]) => id === value)?.[1] || value || '—'; }
function confidenceLabel(value) { const n = Number(value || 0); return n >= .78 ? '高' : n >= .52 ? '中' : '低'; }

function renderDripperResolved(overlay, snapshot) {
  const node = $('[data-dripper-resolved]', overlay); if (!node) return;
  node.textContent = `计算快照：${groupLabel(snapshot.group)} · ${snapshot.angleDeg}° · 排水${snapshot.drainageClass} · 开口${snapshot.outletClass} · 旁通${snapshot.bypassClass} · ${materialLabel(snapshot.materialKey)} · ${snapshot.massG}g（模型可信度${confidenceLabel(snapshot.confidence)}）`;
}
function setDripperFieldsFromTemplate(overlay, templateId) {
  const template = DRIPPER_CATALOG.find(item => item.id === templateId); if (!template) return;
  const snapshot = resolveDripperPhysics({ catalogId:templateId });
  $('#dripperBrand', overlay).value = template.brand;
  $('#dripperName', overlay).value = template.name;
  $('#lbDripperGroup', overlay).value = snapshot.group;
  $('#lbDripperMaterialKey', overlay).value = snapshot.materialKey;
  $('#lbDripperAngle', overlay).value = snapshot.angleDeg;
  $('#lbDripperDrainage', overlay).value = snapshot.drainageClass;
  $('#lbDripperOutlet', overlay).value = snapshot.outletClass;
  $('#lbDripperBypass', overlay).value = snapshot.bypassClass;
  $('#lbDripperMass', overlay).value = snapshot.provenance?.massG?.source === 'manufacturer' ? snapshot.massG : '';
  $('#lbDripperPreheated', overlay).value = snapshot.preheated ? 'true' : 'false';
  renderDripperResolved(overlay, snapshot);
}
function setFilterFieldsFromTemplate(overlay, templateId) {
  const template = FILTER_PAPER_CATALOG.find(item => item.id === templateId); if (!template) return;
  const snapshot = resolveFilterPaperPhysics({ catalogId:templateId });
  $('#filterBrand', overlay).value = template.brand;
  $('#filterType', overlay).value = template.name;
  $('#lbFilterShape', overlay).value = SHAPES.some(([id]) => id === snapshot.shape) ? snapshot.shape : 'cone';
  $('#lbFilterSpeed', overlay).value = snapshot.flowClass;
  $('#lbFilterBypass', overlay).value = snapshot.bypassTendency;
  const node = $('[data-filter-resolved]', overlay);
  if (node) node.textContent = `计算快照：${snapshot.shape} · 流速${snapshot.flowClass} · 旁通倾向${snapshot.bypassTendency}（模型可信度${confidenceLabel(snapshot.confidence)}）`;
}

async function openDripperEditor(existingId = '') {
  const settings = await loadSettings({ fresh:true });
  const existing = settings.gear.drippers.find(item => String(item?.id || '') === String(existingId)) || {};
  const match = dripperMatch(settings, existingId);
  const standardMode = Boolean(existing.catalogId && !existing.basedOnCatalogId);
  const mode = existingId ? (standardMode ? 'catalog' : 'custom') : 'catalog';
  const templateId = existing.catalogId || existing.basedOnCatalogId || '';
  const resolved = resolveDripperPhysics(existing, match);
  const overlay = dialog(existingId ? '编辑滤杯' : '添加滤杯', '标准库用于直接计算；自定义滤杯可选择最接近的标准模板后再编辑。名称、品牌和别名只用于识别，不进入计算。',
    `<div class="grid-2">
      <label class="field"><span>录入方式 *</span><select id="lbDripperMode" class="control"><option value="catalog"${mode==='catalog'?' selected':''}>从标准滤杯库选择</option><option value="custom"${mode==='custom'?' selected':''}>自定义 / 基于模板修改</option></select></label>
      <label class="field"><span>标准/基础模板</span><select id="lbDripperCatalog" class="control">${catalogOptions(DRIPPER_CATALOG, templateId, '选择滤杯或基础模板')}</select></label>
      <label class="field"><span>品牌</span><input id="dripperBrand" class="control" value="${esc(existing.brand || '')}"></label>
      <label class="field"><span>名称 *</span><input id="dripperName" class="control" value="${esc(existing.name || '')}" placeholder="例如 我的平底滤杯"></label>
      <label class="field"><span>滤杯分组 *</span><select id="lbDripperGroup" class="control">${options(GROUPS, resolved.group)}</select></label>
      <label class="field"><span>材质 *</span><select id="lbDripperMaterialKey" class="control">${options(MATERIALS, resolved.materialKey)}</select></label>
      <label class="field"><span>角度</span><input id="lbDripperAngle" class="control" type="number" min="25" max="95" step="1" value="${esc(resolved.angleDeg)}"><small>未知时由模板/分组先验补齐。</small></label>
      <label class="field"><span>结构排水</span><select id="lbDripperDrainage" class="control">${options(FLOW, resolved.drainageClass)}</select></label>
      <label class="field"><span>下开口</span><select id="lbDripperOutlet" class="control">${options(OUTLET, resolved.outletClass)}</select></label>
      <label class="field"><span>旁通量</span><select id="lbDripperBypass" class="control">${options(BYPASS, resolved.bypassClass)}</select></label>
      <label class="field"><span>滤杯质量 g</span><input id="lbDripperMass" class="control" type="number" min="10" max="1000" step="1" value="${existing.physics?.massG ?? existing.massG ?? ''}" placeholder="未知可留空"></label>
      <label class="field"><span>默认预热</span><select id="lbDripperPreheated" class="control"><option value="true"${resolved.preheated?' selected':''}>是</option><option value="false"${!resolved.preheated?' selected':''}>否</option></select></label>
      <label class="field"><span>价格</span><input id="dripperPrice" class="control" type="number" min="0" step="0.01" value="${Number(existing.price || 0)}"></label>
    </div>
    <p class="muted small" data-dripper-resolved></p>
    <div class="row end">${existingId ? '<button id="deleteDripperBtn" class="button danger" type="button">删除</button>' : ''}<button id="saveDripperBtn" class="button primary" type="button">确定</button></div>`, 'dripper-editor');
  if (!overlay) return;
  renderDripperResolved(overlay, resolved);
  const modeNode = $('#lbDripperMode', overlay); const catalogNode = $('#lbDripperCatalog', overlay);
  catalogNode?.addEventListener('change', () => setDripperFieldsFromTemplate(overlay, catalogNode.value));
  modeNode?.addEventListener('change', () => { if (modeNode.value === 'catalog' && catalogNode.value) setDripperFieldsFromTemplate(overlay, catalogNode.value); });
  if (!existingId && DRIPPER_CATALOG[0]) { catalogNode.value = DRIPPER_CATALOG[0].id; setDripperFieldsFromTemplate(overlay, catalogNode.value); }
  $('#saveDripperBtn', overlay)?.addEventListener('click', async () => {
    const sourceMode = modeNode.value; const selectedTemplate = catalogNode.value;
    const name = $('#dripperName', overlay).value.trim();
    if (!name) return showInlineStatus(overlay, '滤杯名称为必填项');
    if (sourceMode === 'catalog' && !selectedTemplate) return showInlineStatus(overlay, '请从标准滤杯库选择一个产品');
    const now = new Date().toISOString(); const id = String(existing.id || uid('dripper'));
    let record;
    if (sourceMode === 'catalog') {
      const template = DRIPPER_CATALOG.find(item => item.id === selectedTemplate);
      const snapshot = resolveDripperPhysics({ catalogId:selectedTemplate });
      record = { ...existing, id, brand:template.brand, name:template.name, type:TYPE_BY_GROUP[snapshot.group], material:legacyMaterialClass(snapshot.materialKey), catalogId:selectedTemplate, basedOnCatalogId:null, physics:{}, price:Math.max(0, Number($('#dripperPrice', overlay).value) || 0), createdAt:existing.createdAt || now, updatedAt:now };
    } else {
      const group = $('#lbDripperGroup', overlay).value; const materialKey = $('#lbDripperMaterialKey', overlay).value;
      const angle = Number($('#lbDripperAngle', overlay).value); const mass = Number($('#lbDripperMass', overlay).value);
      record = { ...existing, id, brand:$('#dripperBrand', overlay).value.trim(), name, type:TYPE_BY_GROUP[group], material:legacyMaterialClass(materialKey), catalogId:null, basedOnCatalogId:selectedTemplate || null,
        physics:{ group, materialKey, ...(Number.isFinite(angle) ? { angleDeg:angle } : {}), drainageClass:$('#lbDripperDrainage', overlay).value, outletClass:$('#lbDripperOutlet', overlay).value, bypassClass:normalizeBypass($('#lbDripperBypass', overlay).value), ...(Number.isFinite(mass) && mass >= 10 ? { massG:mass } : {}), preheated:$('#lbDripperPreheated', overlay).value === 'true' },
        price:Math.max(0, Number($('#dripperPrice', overlay).value) || 0), createdAt:existing.createdAt || now, updatedAt:now };
    }
    const snapshot = resolveDripperPhysics(record, match);
    const recordIndex = settings.gear.drippers.findIndex(item => String(item?.id || '') === id);
    if (recordIndex >= 0) settings.gear.drippers[recordIndex] = record; else settings.gear.drippers.push(record);
    settings.matchingGear.drippers[id] = { angleDeg:snapshot.angleDeg, bypass:snapshot.bypassClass, drainageClass:snapshot.drainageClass, material:record.material, materialKey:snapshot.materialKey, updatedAt:now };
    if (!settings.brew.dripper || [existing.id, existing.name, existing.type].filter(Boolean).includes(settings.brew.dripper)) settings.brew.dripper = id;
    if (settings.brew.dripper === id) settings.brew.dripperMaterial = record.material;
    await persistSettings(settings, 'dripper-saved');
  });
  $('#deleteDripperBtn', overlay)?.addEventListener('click', async () => {
    settings.gear.drippers = settings.gear.drippers.filter(item => String(item?.id || '') !== String(existingId));
    delete settings.matchingGear.drippers[existingId];
    if (settings.brew.dripper === existingId) settings.brew.dripper = settings.gear.drippers[0]?.id || '';
    await persistSettings(settings, 'dripper-deleted');
  });
}

async function openFilterEditor(existingId = '') {
  const settings = await loadSettings({ fresh:true });
  const existing = settings.gear.filters.find(item => String(item?.id || '') === String(existingId)) || {};
  const match = paperMatch(settings, existingId); const standardMode = Boolean(existing.catalogId && !existing.basedOnCatalogId);
  const mode = existingId ? (standardMode ? 'catalog' : 'custom') : 'catalog'; const templateId = existing.catalogId || existing.basedOnCatalogId || '';
  const resolved = resolveFilterPaperPhysics(existing, match);
  const overlay = dialog(existingId ? '编辑滤纸' : '添加滤纸', '标准滤纸库保留品牌、型号和别名用于识别；计算只读取形状、流速与旁通倾向。缺失参数由 Resolver 降级补齐。',
    `<div class="grid-2">
      <label class="field"><span>录入方式 *</span><select id="lbFilterMode" class="control"><option value="catalog"${mode==='catalog'?' selected':''}>从标准滤纸库选择</option><option value="custom"${mode==='custom'?' selected':''}>自定义 / 基于模板修改</option></select></label>
      <label class="field"><span>标准/基础模板</span><select id="lbFilterCatalog" class="control">${catalogOptions(FILTER_PAPER_CATALOG, templateId, '选择滤纸或基础模板')}</select></label>
      <label class="field"><span>品牌</span><input id="filterBrand" class="control" value="${esc(existing.brand || '')}"></label>
      <label class="field"><span>名称/类型 *</span><input id="filterType" class="control" value="${esc(existing.type || '')}"></label>
      <label class="field"><span>形状</span><select id="lbFilterShape" class="control">${options(SHAPES, SHAPES.some(([id]) => id === resolved.shape) ? resolved.shape : 'cone')}</select></label>
      <label class="field"><span>过滤速度</span><select id="lbFilterSpeed" class="control">${options(PAPER_FLOW, resolved.flowClass)}</select></label>
      <label class="field"><span>旁通倾向</span><select id="lbFilterBypass" class="control">${options(BYPASS, resolved.bypassTendency)}</select></label>
      <label class="field"><span>张数 *</span><input id="filterQuantity" class="control" type="number" min="0" step="1" value="${Number(existing.quantity ?? 0)}"></label>
      <label class="field"><span>价格</span><input id="filterPrice" class="control" type="number" min="0" step="0.01" value="${Number(existing.price || 0)}"></label>
    </div>
    <p class="muted small" data-filter-resolved>计算快照：${esc(resolved.shape)} · 流速${esc(resolved.flowClass)} · 旁通倾向${esc(resolved.bypassTendency)}（模型可信度${confidenceLabel(resolved.confidence)}）</p>
    <div class="row end">${existingId ? '<button id="deleteFilterBtn" class="button danger" type="button">删除</button>' : ''}<button id="saveFilterBtn" class="button primary" type="button">确定</button></div>`, 'filter-editor');
  if (!overlay) return;
  const modeNode = $('#lbFilterMode', overlay); const catalogNode = $('#lbFilterCatalog', overlay);
  catalogNode?.addEventListener('change', () => setFilterFieldsFromTemplate(overlay, catalogNode.value));
  modeNode?.addEventListener('change', () => { if (modeNode.value === 'catalog' && catalogNode.value) setFilterFieldsFromTemplate(overlay, catalogNode.value); });
  if (!existingId && FILTER_PAPER_CATALOG[0]) { catalogNode.value = FILTER_PAPER_CATALOG[0].id; setFilterFieldsFromTemplate(overlay, catalogNode.value); }
  $('#saveFilterBtn', overlay)?.addEventListener('click', async () => {
    const sourceMode = modeNode.value; const selectedTemplate = catalogNode.value;
    const type = $('#filterType', overlay).value.trim(); const quantity = Math.floor(Number($('#filterQuantity', overlay).value));
    if (!type) return showInlineStatus(overlay, '滤纸名称/类型为必填项');
    if (!Number.isFinite(quantity) || quantity < 0) return showInlineStatus(overlay, '滤纸张数必须为 0 或正整数');
    if (sourceMode === 'catalog' && !selectedTemplate) return showInlineStatus(overlay, '请从标准滤纸库选择一个产品');
    const id = String(existing.id || uid('filter')); const now = new Date().toISOString(); let record;
    if (sourceMode === 'catalog') {
      const template = FILTER_PAPER_CATALOG.find(item => item.id === selectedTemplate);
      record = { ...existing, id, brand:template.brand, type:template.name, catalogId:selectedTemplate, basedOnCatalogId:null, physics:{}, quantity, price:Math.max(0, Number($('#filterPrice', overlay).value) || 0), createdAt:existing.createdAt || now, updatedAt:now };
    } else {
      record = { ...existing, id, brand:$('#filterBrand', overlay).value.trim(), type, catalogId:null, basedOnCatalogId:selectedTemplate || null,
        physics:{ shape:$('#lbFilterShape', overlay).value, flowClass:normalizePaperSpeed($('#lbFilterSpeed', overlay).value), bypassTendency:normalizeBypass($('#lbFilterBypass', overlay).value) },
        quantity, price:Math.max(0, Number($('#filterPrice', overlay).value) || 0), createdAt:existing.createdAt || now, updatedAt:now };
    }
    const snapshot = resolveFilterPaperPhysics(record, match);
    const recordIndex = settings.gear.filters.findIndex(item => String(item?.id || '') === id);
    if (recordIndex >= 0) settings.gear.filters[recordIndex] = record; else settings.gear.filters.push(record);
    settings.matchingGear.papers[id] = { speed:snapshot.flowClass, bypassTendency:snapshot.bypassTendency, updatedAt:now };
    if (!settings.brew.filterPaperId) settings.brew.filterPaperId = id;
    await persistSettings(settings, 'filter-saved');
  });
  $('#deleteFilterBtn', overlay)?.addEventListener('click', async () => {
    settings.gear.filters = settings.gear.filters.filter(item => String(item?.id || '') !== String(existingId));
    delete settings.matchingGear.papers[existingId];
    if (settings.brew.filterPaperId === existingId) settings.brew.filterPaperId = settings.gear.filters[0]?.id || '';
    await persistSettings(settings, 'filter-deleted');
  });
}

async function decorateRenderedGear() {
  const settings = await loadSettings();
  for (const button of $$('[data-dripper-item]')) {
    const id = button.dataset.dripperItem; const info = $('small', button); if (!info || info.dataset.lbMatchDecorated === '1') continue;
    const item = settings.gear.drippers.find(row => String(row.id) === String(id)) || {};
    const snapshot = resolveDripperPhysics(item, dripperMatch(settings, id));
    info.textContent = `${info.textContent} · ${groupLabel(snapshot.group)} ${snapshot.angleDeg}° · 排水${snapshot.drainageClass} · 旁通${snapshot.bypassClass} · 可信度${confidenceLabel(snapshot.confidence)}`;
    info.dataset.lbMatchDecorated = '1';
  }
  for (const button of $$('[data-filter-item]')) {
    const id = button.dataset.filterItem; const info = $('small', button); if (!info || info.dataset.lbMatchDecorated === '1') continue;
    const item = settings.gear.filters.find(row => String(row.id) === String(id)) || {};
    const snapshot = resolveFilterPaperPhysics(item, paperMatch(settings, id));
    info.textContent = `${info.textContent} · 流速${snapshot.flowClass} · 旁通${snapshot.bypassTendency} · 可信度${confidenceLabel(snapshot.confidence)}`;
    info.dataset.lbMatchDecorated = '1';
  }
}
function bindBrewGearSelect() {
  const dripperSelect = $('#brewDripper');
  if (!dripperSelect || dripperSelect.dataset.lbGearBound === '1') return;
  dripperSelect.dataset.lbGearBound = '1';
  dripperSelect.addEventListener('change', () => { cachedAt = 0; });
}
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; decorateRenderedGear().catch(() => {}); bindBrewGearSelect(); });
}

document.addEventListener('click', event => {
  const dripperAdd = event.target.closest?.('[data-add-gear="dripper"]');
  const dripperItem = event.target.closest?.('[data-dripper-item]');
  const filterAdd = event.target.closest?.('[data-add-gear="filter"]');
  const filterItem = event.target.closest?.('[data-filter-item]');
  if (!dripperAdd && !dripperItem && !filterAdd && !filterItem) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (dripperAdd) openDripperEditor().catch(console.error);
  else if (dripperItem) openDripperEditor(dripperItem.dataset.dripperItem).catch(console.error);
  else if (filterAdd) openFilterEditor().catch(console.error);
  else if (filterItem) openFilterEditor(filterItem.dataset.filterItem).catch(console.error);
}, true);

document.addEventListener('luckybean:app-refreshed', () => { cachedAt = 0; queueRender(); });
document.addEventListener('luckybean:local-app-ready', queueRender);
document.addEventListener('luckybean:settings-rendered', queueRender);
document.addEventListener('luckybean:brew-rendered', queueRender);
queueRender();

globalThis.LuckyBeanGear = { openDripperEditor, openFilterEditor, normalizeBypass, normalizePaperSpeed, dripperCatalog:DRIPPER_CATALOG, filterPaperCatalog:FILTER_PAPER_CATALOG };
