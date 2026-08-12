import { getSetting, setSetting } from '../db.js';

const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const $$ = (selector, root = document) => root?.querySelectorAll ? [...root.querySelectorAll(selector)] : [];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const MATERIALS = Object.freeze([
  ['glass', '玻璃'], ['ceramic', '陶瓷'], ['plastic', '塑料'], ['titanium', '钛']
]);
const BYPASS = Object.freeze([
  ['none', '无'], ['low', '少'], ['medium', '中'], ['high', '多']
]);
const PAPER_SPEED = Object.freeze([
  ['low', '低'], ['medium', '中'], ['high', '高']
]);

let repairQueued = false;
let cachedSettings = null;
let cachedAt = 0;

function uid(prefix) {
  return `${prefix}_${crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`}`;
}

function normalizeMaterial(value) {
  const key = String(value || '').toLowerCase();
  return MATERIALS.some(([id]) => id === key) ? key : 'plastic';
}

function normalizeBypass(value) {
  const raw = String(value || 'medium').toLowerCase();
  if (['none', '无', '0'].includes(raw)) return 'none';
  if (['low', '少', '1'].includes(raw)) return 'low';
  if (['high', '多', '3'].includes(raw)) return 'high';
  return 'medium';
}

function normalizeSpeed(value) {
  const raw = String(value || 'medium').toLowerCase();
  if (['low', '低'].includes(raw)) return 'low';
  if (['high', '高'].includes(raw)) return 'high';
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
  document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', {
    detail: { source: source || 'gear-matching-controller' }
  }));
}

function closeEditor() {
  $('#overlayRoot')?.replaceChildren();
}

function dialog(title, subtitle, body, overlayId) {
  const root = $('#overlayRoot');
  if (!root) return null;
  root.innerHTML = `<div class="overlay" data-overlay="${esc(overlayId)}">
    <div class="dialog lb-gear-match-dialog">
      <div class="dialog-header centered"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><button type="button" class="close-button" data-close-overlay data-lb-gear-close aria-label="关闭">×</button></div>
      ${body}
    </div>
  </div>`;
  const overlay = root.firstElementChild;
  $('[data-lb-gear-close]', overlay)?.addEventListener('click', closeEditor);
  overlay.addEventListener('click', event => { if (event.target === overlay) closeEditor(); });
  return overlay;
}

function options(rows, selected) {
  return rows.map(([value, label]) => `<option value="${esc(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`).join('');
}

function dripperMatch(settings, id) {
  return settings.matchingGear?.drippers?.[id] || {};
}

function paperMatch(settings, id) {
  return settings.matchingGear?.papers?.[id] || {};
}

async function openDripperEditor(existingId = '') {
  const settings = await loadSettings({ fresh: true });
  const existing = settings.gear.drippers.find(item => String(item?.id || '') === String(existingId)) || {};
  const match = dripperMatch(settings, existingId);
  const angle = Number.isFinite(Number(match.angleDeg ?? existing.angleDeg)) ? Number(match.angleDeg ?? existing.angleDeg) : 60;
  const bypass = normalizeBypass(match.bypass ?? existing.bypass);
  const material = normalizeMaterial(existing.material || match.material);
  const overlay = dialog(existingId ? '编辑滤杯' : '添加滤杯',
    '滤杯角度、旁通量与滤杯本身绑定；小酌选择滤杯后自动读取，不再重复设置。',
    `<div class="grid-2">
      <label class="field"><span>名称 *</span><input id="dripperName" class="control" value="${esc(existing.name || '')}" placeholder="例如 V60 02"></label>
      <label class="field"><span>类型 *</span><select id="dripperType" class="control">${['平底滤杯','锥形滤杯','混合式滤杯','低旁路滤杯','浸泡式滤杯'].map(type => `<option${type === (existing.type || '平底滤杯') ? ' selected' : ''}>${type}</option>`).join('')}</select></label>
      <label class="field"><span>材质 *</span><select id="dripperMaterial" class="control">${options(MATERIALS, material)}</select></label>
      <label class="field"><span>滤杯角度 *</span><input id="lbDripperAngle" class="control" type="number" min="25" max="95" step="1" value="${esc(angle)}"><small>25–95°；60°为中性参考。角度随滤杯保存。</small></label>
      <label class="field"><span>旁通量 *</span><select id="lbDripperBypass" class="control">${options(BYPASS, bypass)}</select></label>
      <label class="field"><span>价格</span><input id="dripperPrice" class="control" type="number" min="0" step="0.01" value="${Number(existing.price || 0)}"></label>
    </div>
    <div class="row end">${existingId ? '<button id="deleteDripperBtn" class="button danger" type="button">删除</button>' : ''}<button id="saveDripperBtn" class="button primary" type="button">确定</button></div>`,
    'dripper-editor'
  );
  if (!overlay) return;

  $('#saveDripperBtn', overlay)?.addEventListener('click', async () => {
    const name = $('#dripperName', overlay).value.trim();
    const angleDeg = Number($('#lbDripperAngle', overlay).value);
    if (!name) return showInlineStatus(overlay, '滤杯名称为必填项');
    if (!Number.isFinite(angleDeg) || angleDeg < 25 || angleDeg > 95) return showInlineStatus(overlay, '滤杯角度必须为 25–95°');
    const id = String(existing.id || uid('dripper'));
    const now = new Date().toISOString();
    const record = {
      ...existing,
      id,
      name,
      type: $('#dripperType', overlay).value,
      material: normalizeMaterial($('#dripperMaterial', overlay).value),
      price: Math.max(0, Number($('#dripperPrice', overlay).value) || 0),
      createdAt: existing.createdAt || now,
      updatedAt: now
    };
    const index = settings.gear.drippers.findIndex(item => String(item?.id || '') === id);
    if (index >= 0) settings.gear.drippers[index] = record;
    else settings.gear.drippers.push(record);
    settings.matchingGear.drippers[id] = {
      angleDeg,
      bypass: normalizeBypass($('#lbDripperBypass', overlay).value),
      material: record.material,
      updatedAt: now
    };
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
  const settings = await loadSettings({ fresh: true });
  const existing = settings.gear.filters.find(item => String(item?.id || '') === String(existingId)) || {};
  const match = paperMatch(settings, existingId);
  const speed = normalizeSpeed(match.speed ?? existing.speed);
  const overlay = dialog(existingId ? '编辑滤纸' : '添加滤纸',
    '过滤速度与滤纸本身绑定；小酌选择滤纸后自动作为匹配修正参数。',
    `<div class="grid-2">
      <label class="field"><span>品牌</span><input id="filterBrand" class="control" value="${esc(existing.brand || '')}"></label>
      <label class="field"><span>类型 *</span><input id="filterType" class="control" value="${esc(existing.type || '')}"></label>
      <label class="field"><span>过滤速度 *</span><select id="lbFilterSpeed" class="control">${options(PAPER_SPEED, speed)}</select></label>
      <label class="field"><span>张数 *</span><input id="filterQuantity" class="control" type="number" min="0" step="1" value="${Number(existing.quantity ?? 0)}"></label>
      <label class="field"><span>价格</span><input id="filterPrice" class="control" type="number" min="0" step="0.01" value="${Number(existing.price || 0)}"></label>
    </div>
    <div class="row end">${existingId ? '<button id="deleteFilterBtn" class="button danger" type="button">删除</button>' : ''}<button id="saveFilterBtn" class="button primary" type="button">确定</button></div>`,
    'filter-editor'
  );
  if (!overlay) return;

  $('#saveFilterBtn', overlay)?.addEventListener('click', async () => {
    const type = $('#filterType', overlay).value.trim();
    const quantity = Math.floor(Number($('#filterQuantity', overlay).value));
    if (!type) return showInlineStatus(overlay, '滤纸类型为必填项');
    if (!Number.isFinite(quantity) || quantity < 0) return showInlineStatus(overlay, '滤纸张数必须为 0 或正整数');
    const id = String(existing.id || uid('filter'));
    const now = new Date().toISOString();
    const record = {
      ...existing,
      id,
      brand: $('#filterBrand', overlay).value.trim(),
      type,
      quantity,
      price: Math.max(0, Number($('#filterPrice', overlay).value) || 0),
      createdAt: existing.createdAt || now,
      updatedAt: now
    };
    const index = settings.gear.filters.findIndex(item => String(item?.id || '') === id);
    if (index >= 0) settings.gear.filters[index] = record;
    else settings.gear.filters.push(record);
    settings.matchingGear.papers[id] = {
      speed: normalizeSpeed($('#lbFilterSpeed', overlay).value),
      updatedAt: now
    };
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

function showInlineStatus(overlay, message) {
  let node = $('[data-lb-gear-status]', overlay);
  if (!node) {
    node = document.createElement('p');
    node.className = 'status-bad small';
    node.dataset.lbGearStatus = '1';
    $('.row.end', overlay)?.before(node);
  }
  node.textContent = message;
}

function bypassLabel(value) {
  return BYPASS.find(([id]) => id === normalizeBypass(value))?.[1] || '中';
}

function speedLabel(value) {
  return PAPER_SPEED.find(([id]) => id === normalizeSpeed(value))?.[1] || '中';
}

async function decorateRenderedGear() {
  const settings = await loadSettings();
  for (const button of $$('[data-dripper-item]')) {
    const id = button.dataset.dripperItem;
    const match = dripperMatch(settings, id);
    const info = $('small', button);
    if (!info || info.dataset.lbMatchDecorated === '1') continue;
    const angle = Number.isFinite(Number(match.angleDeg)) ? `${Number(match.angleDeg)}°` : '角度未设';
    info.textContent = `${info.textContent} · ${angle} · 旁通${bypassLabel(match.bypass)}`;
    info.dataset.lbMatchDecorated = '1';
  }
  for (const button of $$('[data-filter-item]')) {
    const id = button.dataset.filterItem;
    const match = paperMatch(settings, id);
    const info = $('small', button);
    if (!info || info.dataset.lbMatchDecorated === '1') continue;
    info.textContent = `${info.textContent} · 流速${speedLabel(match.speed)}`;
    info.dataset.lbMatchDecorated = '1';
  }
}

async function decorateBrewGear() {
  const dripperSelect = $('#brewDripper');
  const materialSelect = $('#brewDripperMaterial');
  if (!dripperSelect || !materialSelect) return;
  const settings = await loadSettings();
  const dripper = settings.gear.drippers.find(item => String(item?.id || '') === String(dripperSelect.value))
    || settings.gear.drippers.find(item => [item?.name, item?.type].includes(dripperSelect.value))
    || settings.gear.drippers[0];
  if (!dripper) return;
  const match = dripperMatch(settings, dripper.id);
  materialSelect.value = normalizeMaterial(dripper.material);
  materialSelect.disabled = true;
  materialSelect.setAttribute('aria-readonly', 'true');
  let note = $('[data-lb-brew-dripper-properties]');
  if (!note) {
    note = document.createElement('small');
    note.className = 'muted lb-brew-dripper-properties';
    note.dataset.lbBrewDripperProperties = '1';
    materialSelect.insertAdjacentElement('afterend', note);
  }
  const angle = Number.isFinite(Number(match.angleDeg)) ? `${Number(match.angleDeg)}°` : '角度未设';
  note.textContent = `${angle} · 旁通${bypassLabel(match.bypass)} · 参数来自器设`;
  if (dripperSelect.dataset.lbGearBound !== '1') {
    dripperSelect.dataset.lbGearBound = '1';
    dripperSelect.addEventListener('change', () => {
      cachedAt = 0;
      setTimeout(decorateBrewGear, 0);
    });
  }
}

function repair() {
  if (repairQueued) return;
  repairQueued = true;
  requestAnimationFrame(() => {
    repairQueued = false;
    decorateRenderedGear().catch(() => {});
    decorateBrewGear().catch(() => {});
  });
}

document.addEventListener('click', event => {
  const dripperAdd = event.target.closest?.('[data-add-gear="dripper"]');
  const dripperItem = event.target.closest?.('[data-dripper-item]');
  const filterAdd = event.target.closest?.('[data-add-gear="filter"]');
  const filterItem = event.target.closest?.('[data-filter-item]');
  if (!dripperAdd && !dripperItem && !filterAdd && !filterItem) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (dripperAdd) openDripperEditor().catch(console.error);
  else if (dripperItem) openDripperEditor(dripperItem.dataset.dripperItem).catch(console.error);
  else if (filterAdd) openFilterEditor().catch(console.error);
  else if (filterItem) openFilterEditor(filterItem.dataset.filterItem).catch(console.error);
}, true);

document.addEventListener('luckybean:app-refreshed', () => { cachedAt = 0; repair(); });
document.addEventListener('luckybean:local-app-ready', repair);
new MutationObserver(repair).observe(document.body, { childList: true, subtree: true });
repair();

globalThis.LuckyBeanGearMatching = { openDripperEditor, openFilterEditor, normalizeBypass, normalizeSpeed };
