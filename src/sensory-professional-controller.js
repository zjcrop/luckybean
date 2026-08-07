import { get } from './db.js';
import { loadCodebook, makeIndex, displayName } from './codebook.js';

const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const $$ = (selector, root = document) => root?.querySelectorAll ? [...root.querySelectorAll(selector)] : [];
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

const DESCRIPTORS = [
  '花香', '茉莉', '玫瑰', '橙花', '洋甘菊', '柑橘', '柠檬', '莓果', '桃子', '苹果', '葡萄', '热带水果',
  '干果', '茶感', '红茶', '乌龙茶', '香料', '坚果', '可可', '巧克力', '蜂蜜', '蔗糖', '红糖', '焦糖',
  '酒香', '发酵感', '草本', '谷物', '烘烤', '烟熏', '木质', '纸味', '土味', '霉味', '药感', '橡胶'
];
const AFTERTASTE = ['干净', '持久', '短促', '甜感延续', '果香延续', '茶感延续', '可可', '香料', '苦感', '涩感', '干燥', '杂味'];
const ACIDITY = ['明亮', '活泼', '圆润', '柔和', '柑橘酸', '苹果酸', '酒石酸', '醋酸感', '尖锐', '发酵酸'];
const SWEETNESS = ['蜂蜜', '蔗糖', '红糖', '焦糖', '糖浆', '果糖感', '成熟水果', '甜感清晰', '甜感弱', '无明显甜感'];
const MOUTHFEEL = ['轻盈', '丝滑', '顺滑', '圆润', '奶油感', '饱满', '厚重', '多汁', '茶汤感', '粗糙', '干涩', '收敛'];
const AROMA_AXES = ['花香', '果香', '茶感', '坚果', '酵感'];
const STYLE_AXES = ['风味', '余韵', '酸质', '甜感', '醇厚', '干净度', '一致性', '平衡度'];
const DEFECT_GROUPS = Object.freeze({ major: { label: '明缺陷', note: '霉腐，坏发酵', tags: ['霉腐', '坏发酵'], multiplier: 2 }, minor: { label: '暗缺陷', note: '轻微涩', tags: ['轻微涩'], multiplier: 1 } });
const AFFECTIVE = ['香气 / 干湿香', '风味 / 余韵', '酸质', '甜感', '口感'];

const STEPS = [
  { id: 'dry', title: '干香 / 湿香', subtitle: '勾选香气描述，并记录整体强度。', tags: DESCRIPTORS, intensity: true },
  { id: 'high', title: '高温', subtitle: '破渣后高温阶段的主要风味描述。', tags: DESCRIPTORS, intensity: true },
  { id: 'mid', title: '中温', subtitle: '降温后更清晰的风味、酸甜与香气描述。', tags: DESCRIPTORS, intensity: true },
  { id: 'low', title: '低温', subtitle: '低温阶段仍然存在或新出现的风味描述。', tags: DESCRIPTORS, intensity: true },
  { id: 'aftertaste', title: '余韵', subtitle: '勾选余韵性质与持续感。', tags: AFTERTASTE, intensity: true },
  { id: 'acidity', title: '酸质', subtitle: '勾选酸质性质，并记录酸质强度。', tags: ACIDITY, intensity: true },
  { id: 'sweetness', title: '甜感', subtitle: '勾选甜感性质，并记录甜感强度。', tags: SWEETNESS, intensity: true },
  { id: 'mouthfeel', title: '口感', subtitle: '勾选触感和醇厚度描述。', tags: MOUTHFEEL, intensity: true }
];
const RADAR_STEP = STEPS.length;
const NOTE_STEP = STEPS.length + 1;
const SUMMARY_STEP = STEPS.length + 2;
const TOTAL_STEPS = STEPS.length + 3;

let wizard = null;
let codebookPromise = null;
let transferBusy = false;

async function codebookContext() {
  if (!codebookPromise) {
    codebookPromise = loadCodebook().then(result => ({ book: result.data, index: makeIndex(result.data) }));
  }
  return codebookPromise;
}

async function beanContext(beanId) {
  const [{ index }, bean] = await Promise.all([codebookContext(), get('beans', beanId)]);
  const original = (bean?.flavorCodes || []).map(code => displayName(index, 'flavors', code, code)).filter(Boolean);
  return { bean, original: [...new Set(original)] };
}

function modePanel() {
  return `<div class="v095-sensory-modes v095-sensory-modes-v2" data-mode-version="professional-v2" aria-label="品鉴模式">
    <button type="button" data-v095-mode="professional"><strong>杯测品鉴</strong><small>专业杯测 / 雷达图 / 札记</small></button>
    <button type="button" data-v095-mode="player"><strong>玩家互动品鉴</strong><small>风味互动 / 札记</small></button>
    <button type="button" data-v095-mode="note"><strong>札记</strong><small>自然语言记录，评分</small></button>
  </div>`;
}

function replaceModePanel() {
  const host = $('#sensoryContent [data-sensory-mode-host]');
  if (!host) return;
  const current = $('.v095-sensory-modes', host);
  if (current?.dataset.modeVersion === 'professional-v2') return;
  host.replaceChildren();
  host.insertAdjacentHTML('beforeend', modePanel());
  $$('[data-v095-mode]', host).forEach(button => button.addEventListener('click', () => startMode(button.dataset.v095Mode)));
}

async function selectedBeanId() {
  return $('#sensoryBeanSelect')?.value || '';
}

async function startMode(mode) {
  if (transferBusy) return;
  const beanId = await selectedBeanId();
  if (!beanId) return;
  const brewSessionId = $('#sensoryContent')?.dataset.brewSessionId || '';
  if (mode === 'player' || mode === 'note') {
    document.dispatchEvent(new CustomEvent('luckybean:start-sensory-mode', { detail: { mode, beanId, brewSessionId } }));
    return;
  }
  const context = await beanContext(beanId);
  wizard = {
    beanId,
    brewSessionId,
    bean: context.bean,
    original: context.original,
    step: 0,
    selections: Object.fromEntries(STEPS.map(step => [step.id, []])),
    intensities: Object.fromEntries(STEPS.map(step => [step.id, 7.5])),
    radar: { aroma: [5, 5, 5, 5, 5], style: [5, 5, 5, 5, 5, 5, 5, 5] },
    defects: { major: [], minor: [] },
    selectedRadar: null,
    naturalNote: '',
    score: 0
  };
  renderWizard();
}

function closeWizard() {
  $('#v095ProfessionalOverlay')?.remove();
  wizard = null;
}

function toggleTag(stepId, tag) {
  const selected = wizard.selections[stepId];
  const index = selected.indexOf(tag);
  if (index >= 0) selected.splice(index, 1);
  else selected.push(tag);
  renderWizard();
}

function setIntensity(stepId, value) {
  wizard.intensities[stepId] = clamp(value, 0, 10);
  const output = $(`[data-v095-intensity-output="${stepId}"]`);
  if (output) output.textContent = Number(wizard.intensities[stepId]).toFixed(1);
}

function axisButtons(group, labels, values) {
  return labels.map((label, index) => `<button type="button" class="v095-radar-axis${wizard.selectedRadar?.group === group && wizard.selectedRadar?.index === index ? ' active' : ''}" data-v095-radar-group="${group}" data-v095-radar-index="${index}"><span>${esc(label)}</span><strong>${Number(values[index] || 0).toFixed(1)}</strong></button>`).join('');
}

function radarPoint(values, index, value = values[index], size = 260) {
  const center = size / 2;
  const radius = size * .34;
  const angle = -Math.PI / 2 + index * (Math.PI * 2 / values.length);
  const r = radius * clamp(value, 0, 10) / 10;
  return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r, angle, center, radius };
}

function radarSvg(group, values, labels, size = 260) {
  const center = size / 2;
  const radius = size * .34;
  const points = values.map((value, index) => {
    const point = radarPoint(values, index, value, size);
    return `${point.x},${point.y}`;
  }).join(' ');
  const grid = [2.5, 5, 7.5, 10].map(level => {
    const ring = values.map((_, index) => {
      const point = radarPoint(values, index, level, size);
      return `${point.x},${point.y}`;
    }).join(' ');
    return `<polygon points="${ring}" fill="none" stroke="rgba(190,151,80,.22)"/>`;
  }).join('');
  const axes = values.map((_, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / values.length);
    return `<line x1="${center}" y1="${center}" x2="${center + Math.cos(angle) * radius}" y2="${center + Math.sin(angle) * radius}" stroke="rgba(190,151,80,.22)"/>`;
  }).join('');
  const text = labels.map((label, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / labels.length);
    const r = radius + 22;
    return `<text x="${center + Math.cos(angle) * r}" y="${center + Math.sin(angle) * r}" fill="currentColor" text-anchor="middle" dominant-baseline="middle" font-size="11">${esc(label)}</text>`;
  }).join('');
  const nodes = values.map((value, index) => {
    const point = radarPoint(values, index, value, size);
    const active = wizard.selectedRadar?.group === group && wizard.selectedRadar?.index === index;
    return `<circle class="v120-radar-node${active ? ' active' : ''}" cx="${point.x}" cy="${point.y}" r="7" data-v120-radar-node data-v095-radar-group="${group}" data-v095-radar-index="${index}" role="slider" tabindex="0" aria-label="${esc(labels[index])}" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${Number(value).toFixed(1)}"></circle>`;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" aria-label="感官雷达图" data-v120-radar-chart="${group}">${grid}${axes}<polygon data-v120-radar-polygon="${group}" points="${points}" fill="rgba(190,151,80,.3)" stroke="rgba(190,151,80,.9)" stroke-width="2"/>${nodes}${text}</svg>`;
}

function selectRadarAxis(root, group, index) {
  wizard.selectedRadar = { group, index };
  $$('[data-v095-radar-group]', root).forEach(node => node.classList.toggle('active', node.dataset.v095RadarGroup === group && Number(node.dataset.v095RadarIndex) === index));
  const range = $('[data-v095-radar-value]', root);
  const value = Number(wizard.radar[group][index] || 0);
  if (range) { range.disabled = false; range.value = String(value); }
  const output = $('[data-v095-radar-output]', root);
  if (output) output.textContent = value.toFixed(1);
}

function updateRadarChart(root, group) {
  const values = wizard.radar[group];
  const svg = $(`[data-v120-radar-chart="${group}"]`, root);
  if (!svg) return;
  const polygon = $(`[data-v120-radar-polygon="${group}"]`, svg);
  if (polygon) polygon.setAttribute('points', values.map((value, index) => {
    const point = radarPoint(values, index, value);
    return `${point.x},${point.y}`;
  }).join(' '));
  $$(`[data-v120-radar-node][data-v095-radar-group="${group}"]`, svg).forEach(node => {
    const index = Number(node.dataset.v095RadarIndex);
    const point = radarPoint(values, index, values[index]);
    node.setAttribute('cx', String(point.x));
    node.setAttribute('cy', String(point.y));
    node.setAttribute('aria-valuenow', Number(values[index]).toFixed(1));
  });
  $$(`.v095-radar-axis[data-v095-radar-group="${group}"]`, root).forEach(button => {
    const index = Number(button.dataset.v095RadarIndex);
    const output = $('strong', button);
    if (output) output.textContent = Number(values[index]).toFixed(1);
  });
}

function bindRadarInteractions(root) {
  $$('.v095-radar-axis[data-v095-radar-group]', root).forEach(button => button.addEventListener('click', () => {
    selectRadarAxis(root, button.dataset.v095RadarGroup, Number(button.dataset.v095RadarIndex));
  }));
  $$('[data-v120-radar-node]', root).forEach(node => {
    let activePointer = null;
    const group = node.dataset.v095RadarGroup;
    const index = Number(node.dataset.v095RadarIndex);
    const updateFromPointer = event => {
      const svg = node.closest('svg');
      const rect = svg.getBoundingClientRect();
      const x = (event.clientX - rect.left) * 260 / Math.max(1, rect.width);
      const y = (event.clientY - rect.top) * 260 / Math.max(1, rect.height);
      const geometry = radarPoint(wizard.radar[group], index, 10);
      const dx = Math.cos(geometry.angle), dy = Math.sin(geometry.angle);
      const projection = (x - geometry.center) * dx + (y - geometry.center) * dy;
      const value = clamp(projection / geometry.radius * 10, 0, 10);
      wizard.radar[group][index] = Math.round(value * 10) / 10;
      updateRadarChart(root, group);
      selectRadarAxis(root, group, index);
    };
    node.addEventListener('pointerdown', event => {
      event.preventDefault();
      activePointer = event.pointerId;
      node.setPointerCapture?.(event.pointerId);
      selectRadarAxis(root, group, index);
      updateFromPointer(event);
    });
    node.addEventListener('pointermove', event => {
      if (activePointer !== event.pointerId) return;
      event.preventDefault();
      updateFromPointer(event);
    });
    const release = event => { if (activePointer === event.pointerId) activePointer = null; };
    node.addEventListener('pointerup', release);
    node.addEventListener('pointercancel', release);
    node.addEventListener('keydown', event => {
      if (!['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(event.key)) return;
      event.preventDefault();
      const delta = ['ArrowUp','ArrowRight'].includes(event.key) ? .1 : -.1;
      wizard.radar[group][index] = clamp(Number(wizard.radar[group][index]) + delta, 0, 10);
      updateRadarChart(root, group);
      selectRadarAxis(root, group, index);
    });
  });
}

function bindSelectedTagSorting(root, stepId) {
  if (!stepId) return;
  const list = $(`[data-v120-selected-list="${stepId}"]`, root);
  if (!list) return;
  let drag = null;
  const persist = () => { wizard.selections[stepId] = $$('[data-v120-selected-tag]', list).map(node => node.dataset.v120SelectedTag); };
  $$('[data-v120-selected-tag]', list).forEach(chip => {
    chip.addEventListener('pointerdown', event => {
      event.preventDefault();
      drag = { id: event.pointerId, chip, x: event.clientX, y: event.clientY, moved: false };
      chip.setPointerCapture?.(event.pointerId);
      chip.classList.add('dragging');
    });
    chip.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) drag.moved = true;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-v120-selected-tag]');
      if (!target || target === chip || target.parentElement !== list) return;
      const rect = target.getBoundingClientRect();
      list.insertBefore(chip, event.clientX < rect.left + rect.width / 2 ? target : target.nextSibling);
    });
    const release = event => {
      if (!drag || drag.id !== event.pointerId) return;
      chip.classList.remove('dragging');
      const moved = drag.moved;
      drag = null;
      if (moved) persist();
      else toggleTag(stepId, chip.dataset.v120SelectedTag);
    };
    chip.addEventListener('pointerup', release);
    chip.addEventListener('pointercancel', release);
  });
}


function defectPanel() {
  return Object.entries(DEFECT_GROUPS).map(([key, group]) => `<section class="v095-defect-group"><header><strong>${group.label}</strong><small>${group.note}</small></header>${group.tags.map(tag => `<button type="button" data-v095-defect-group="${key}" data-v095-defect-tag="${esc(tag)}" class="${wizard.defects[key].includes(tag) ? 'active' : ''}">${esc(tag)}</button>`).join('')}</section>`).join('');
}

function renderWizard() {
  if (!wizard) return;
  $('#v095ProfessionalOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'v095ProfessionalOverlay';
  overlay.className = 'overlay full v095-professional-overlay';
  const step = STEPS[wizard.step];
  const sensoryStep = wizard.step < STEPS.length;
  const radarStep = wizard.step === RADAR_STEP;
  const noteStep = wizard.step === NOTE_STEP;
  const summaryStep = wizard.step === SUMMARY_STEP;
  const progressTitle = sensoryStep
    ? `${wizard.step + 1}/${TOTAL_STEPS} · ${step.title}`
    : radarStep
      ? `${RADAR_STEP + 1}/${TOTAL_STEPS} · 雷达与缺陷`
      : noteStep
        ? `${NOTE_STEP + 1}/${TOTAL_STEPS} · 札记`
        : `${SUMMARY_STEP + 1}/${TOTAL_STEPS} · 确认结果`;
  const body = sensoryStep
    ? `<section class="v095-wizard-step"><p>${esc(step.subtitle)}</p><div class="v120-selected-tag-list" data-v120-selected-list="${step.id}">${wizard.selections[step.id].length ? wizard.selections[step.id].map(tag => `<button type="button" class="v120-selected-tag" data-v120-selected-tag="${esc(tag)}">${esc(tag)}</button>`).join('') : '<span class="muted small">已选便签会显示在这里，可长按拖动排序。</span>'}</div><div class="v095-tag-grid">${step.tags.map(tag => `<button type="button" data-v095-tag="${esc(tag)}" class="${wizard.selections[step.id].includes(tag) ? 'active' : ''}">${esc(tag)}</button>`).join('')}</div>${step.intensity ? `<label class="v095-intensity"><span>强度 <output data-v095-intensity-output="${step.id}">${Number(wizard.intensities[step.id]).toFixed(1)}</output></span><input type="range" min="0" max="10" step="0.1" value="${wizard.intensities[step.id]}" data-v095-intensity="${step.id}"></label>` : ''}</section>`
    : radarStep
      ? `<section class="v095-radar-stage"><div class="v095-radar-stack"><div>${radarSvg('aroma', wizard.radar.aroma, AROMA_AXES)}<div class="v095-radar-buttons">${axisButtons('aroma', AROMA_AXES, wizard.radar.aroma)}</div></div><div>${radarSvg('style', wizard.radar.style, STYLE_AXES)}<div class="v095-radar-buttons">${axisButtons('style', STYLE_AXES, wizard.radar.style)}</div></div></div><label class="v095-intensity"><span>当前轴值 <output data-v095-radar-output>${wizard.selectedRadar ? Number(wizard.radar[wizard.selectedRadar.group][wizard.selectedRadar.index]).toFixed(1) : '选择轴'}</output></span><input type="range" min="0" max="10" step="0.1" value="${wizard.selectedRadar ? wizard.radar[wizard.selectedRadar.group][wizard.selectedRadar.index] : 5}" data-v095-radar-value ${wizard.selectedRadar ? '' : 'disabled'}></label><div class="v095-defects">${defectPanel()}</div></section>`
      : noteStep
        ? `<section class="v095-note-stage"><h3>札记</h3><p class="muted small">记录香气、酸甜、口感、缺陷判断及下一次调整方向。</p><textarea class="control natural-note" data-v095-professional-note maxlength="1600" placeholder="填写本次专业杯测札记……">${esc(wizard.naturalNote)}</textarea></section>`
        : `<section class="v095-summary-stage"><h3>${esc(wizard.bean?.name || '未命名咖啡')}</h3><pre>${esc(professionalSummary())}</pre><p>映射评分：${affectiveMappedScore().toFixed(1)}</p><div class="v095-professional-note-preview"><strong>札记</strong><p>${wizard.naturalNote ? esc(wizard.naturalNote) : '未填写札记'}</p></div></section>`;
  overlay.innerHTML = `<div class="dialog v095-professional-dialog">
    <div class="dialog-header"><div><h2>杯测品鉴</h2><p>${progressTitle}</p></div><button class="close-button" type="button" data-v095-close>×</button></div>
    ${body}
    <div class="v095-wizard-actions"><button type="button" class="button" data-v095-prev ${wizard.step <= 0 ? 'disabled' : ''}>上一步</button><button type="button" class="button primary" data-v095-next>${summaryStep ? '写入品鉴' : '下一步'}</button></div>
  </div>`;
  document.body.append(overlay);
  $('[data-v095-close]', overlay)?.addEventListener('click', closeWizard);
  $$('[data-v095-tag]', overlay).forEach(button => button.addEventListener('click', () => toggleTag(step.id, button.dataset.v095Tag)));
  $$('[data-v095-intensity]', overlay).forEach(input => input.addEventListener('input', () => setIntensity(input.dataset.v095Intensity, input.value)));
  $('[data-v095-professional-note]', overlay)?.addEventListener('input', event => { wizard.naturalNote = event.target.value; });
  $('[data-v095-radar-value]', overlay)?.addEventListener('input', event => {
    if (!wizard.selectedRadar) return;
    wizard.radar[wizard.selectedRadar.group][wizard.selectedRadar.index] = Number(event.target.value);
    $('[data-v095-radar-output]', overlay).textContent = Number(event.target.value).toFixed(1);
    updateRadarChart(overlay, wizard.selectedRadar.group);
  });
  $$('[data-v095-defect-group]', overlay).forEach(button => button.addEventListener('click', () => {
    const list = wizard.defects[button.dataset.v095DefectGroup];
    const tag = button.dataset.v095DefectTag;
    const index = list.indexOf(tag);
    if (index >= 0) list.splice(index, 1); else list.push(tag);
    renderWizard();
  }));
  bindSelectedTagSorting(overlay, sensoryStep ? step.id : '');
  bindRadarInteractions(overlay);
  $('[data-v095-prev]', overlay)?.addEventListener('click', () => { wizard.step = Math.max(0, wizard.step - 1); renderWizard(); });
  $('[data-v095-next]', overlay)?.addEventListener('click', async () => {
    if (wizard.step < SUMMARY_STEP) { wizard.step += 1; renderWizard(); }
    else await finishProfessional();
  });
}

function professionalSummary() {
  const lines = [];
  for (const step of STEPS) {
    const tags = wizard.selections[step.id];
    if (tags.length) lines.push(`${step.title}：${tags.join('、')}；强度 ${Number(wizard.intensities[step.id]).toFixed(1)}`);
  }
  lines.push(`香气雷达：${AROMA_AXES.map((label, index) => `${label}${Number(wizard.radar.aroma[index]).toFixed(1)}`).join('、')}`);
  lines.push(`风格雷达：${STYLE_AXES.map((label, index) => `${label}${Number(wizard.radar.style[index]).toFixed(1)}`).join('、')}`);
  const defects = Object.entries(wizard.defects).flatMap(([key, tags]) => tags.map(tag => `${DEFECT_GROUPS[key].label}-${tag}`));
  if (defects.length) lines.push(`缺陷：${defects.join('、')}`);
  return lines.join('\n');
}

function affectiveMappedScore() {
  const selected = AFFECTIVE.map((_, index) => wizard.radar.style[index] || 0);
  const average = selected.reduce((sum, value) => sum + value, 0) / selected.length;
  const defectPenalty = Object.entries(wizard.defects).reduce((sum, [key, tags]) => sum + tags.length * DEFECT_GROUPS[key].multiplier, 0);
  return clamp(70 + average * 3 - defectPenalty, 0, 100);
}

async function finishProfessional() {
  if (!wizard || transferBusy) return;
  transferBusy = true;
  const detail = {
    beanId: wizard.beanId,
    brewSessionId: wizard.brewSessionId,
    score: affectiveMappedScore(),
    summary: professionalSummary().split('\n').filter(Boolean),
    naturalNote: wizard.naturalNote.trim(),
    professionalData: {
      selections: structuredClone(wizard.selections),
      intensities: structuredClone(wizard.intensities),
      radar: structuredClone(wizard.radar),
      defects: structuredClone(wizard.defects)
    }
  };
  closeWizard();
  document.dispatchEvent(new CustomEvent('luckybean:professional-sensory-complete', { detail }));
  transferBusy = false;
}

export function syncSensoryModePanel() { replaceModePanel(); }

document.addEventListener('luckybean:sensory-rendered', replaceModePanel);
document.addEventListener('DOMContentLoaded', replaceModePanel, { once: true });
replaceModePanel();
