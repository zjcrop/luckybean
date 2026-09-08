import { brewSpatialView } from '../renderers/brew-spatial-view.js';

const stylesheetUrl = new URL('./p3-ux-flow.css', import.meta.url).href;
if (!document.querySelector('link[data-p3-ux-flow]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = stylesheetUrl;
  link.dataset.p3UxFlow = '1';
  document.head.append(link);
}

const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const $$ = (selector, root = document) => root?.querySelectorAll ? [...root.querySelectorAll(selector)] : [];

let autoBrewToken = 0;
let normalizeQueued = false;
let autoHandoffQueued = false;
let pendingRecognitionEvidence = null;

function normalizeConsumptionSummary() {
  const node = $('.bean-consumption-summary p');
  if (!node || node.dataset.p3Compact === '1') return;
  const original = String(node.textContent || '').trim();
  if (!original) return;
  const compact = original
    .replace(/(\d+(?:\.\d+)?)g豆/g, '$1g')
    .replace(/\s*\/\s*/g, '\u00a0/\u00a0')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (compact !== original || node.querySelector('span')) node.textContent = compact;
  node.dataset.p3Compact = '1';
}

function removeGroupExplanations() {
  $$('.v099f-freshness-note, .v099i-freshness-note').forEach(node => node.remove());
  $$('.active-group-title small').forEach(node => {
    const text = String(node.textContent || '');
    if (/烘焙日期由新到旧|余量由少到多/.test(text)) node.remove();
  });
}

function normalizeBrewPlan() {
  const planHost = $('#planResult');
  const generated = $('#generatedPlan', planHost || document);
  if (generated) {
    const heading = $('h2', generated);
    if (heading) heading.textContent = String(heading.textContent || '').replace(/^(热冲|冰冲)方案/, '冲煮方案');
    const tendency = $('.brew-strategy-options', generated) || $('.brew-strategy-options', planHost);
    if (tendency && planHost && tendency.nextElementSibling !== generated) planHost.insertBefore(tendency, generated);
  }
}

function captureRecognitionEvidence(result) {
  const raw = $('#bagOcrText', result)?.value?.trim?.() || '';
  if (!raw) return null;
  const fields = $$('.bag-semantic-row', result).map(row => ({
    label: $('.bag-semantic-label strong', row)?.textContent?.trim?.() || '',
    value: $('.bag-semantic-value b', row)?.textContent?.trim?.() || '',
    state: $('.bag-semantic-label span', row)?.textContent?.trim?.() || ''
  })).filter(item => item.label || item.value);
  return { raw, fields, capturedAt:new Date().toISOString() };
}

function injectBeanFormEvidence() {
  const form = $('#beanForm');
  if (!form || !pendingRecognitionEvidence || $('.p3-recognition-evidence', form)) return;
  const details = document.createElement('details');
  details.className = 'p3-recognition-evidence';
  const summary = document.createElement('summary');
  summary.textContent = '查看识别信息';
  const pre = document.createElement('pre');
  pre.className = 'p3-recognition-raw';
  pre.textContent = pendingRecognitionEvidence.raw;
  details.append(summary, pre);
  if (pendingRecognitionEvidence.fields.length) {
    const list = document.createElement('div');
    list.className = 'p3-recognition-fields';
    for (const item of pendingRecognitionEvidence.fields) {
      const row = document.createElement('div');
      const label = document.createElement('b');
      const value = document.createElement('span');
      label.textContent = item.label;
      value.textContent = item.value;
      row.append(label, value);
      list.append(row);
    }
    details.append(list);
  }
  const actionRow = [...form.children].reverse().find(node => node.classList?.contains('row')) || null;
  form.insertBefore(details, actionRow);
  pendingRecognitionEvidence = null;
}

function normalizeCaptureUi() {
  const overlay = $('[data-overlay="bag-capture"]');
  if (!overlay) { autoHandoffQueued = false; return; }

  const status = $('.bag-capture-status', overlay);
  const engine = $('.bag-engine-status', overlay);
  if (status && engine) {
    const count = $('strong', status)?.textContent?.trim() || '';
    const guide = $('span', status)?.textContent?.trim() || '';
    const channel = $('b', engine)?.textContent?.trim() || '';
    status.classList.add('bag-capture-hint');
    status.innerHTML = `<small>${[count, guide, channel].filter(Boolean).join(' · ')}</small>`;
    engine.remove();
  }

  const camera = $('#bagCameraBtn', overlay);
  const gallery = $('#bagGalleryBtn', overlay);
  const recognize = $('#bagRecognizeBtn', overlay);
  const handoff = $('#bagHandoffBtn', overlay);
  if (camera) camera.textContent = '拍摄';
  if (gallery) gallery.textContent = '上传';
  if (recognize) recognize.textContent = '识别';
  if (handoff) handoff.textContent = '确认';

  const actions = $('.bag-capture-actions', overlay);
  const manualRow = $('.bag-manual-entry', overlay);
  if (actions && handoff && handoff.parentElement !== actions) actions.append(handoff);
  $('#bagManualBtn', overlay)?.remove();
  if (manualRow && !manualRow.children.length) manualRow.remove();
  else if (manualRow && handoff?.parentElement === actions) manualRow.remove();

  const result = $('.bag-recognition-result', overlay);
  const rawEditor = result && $('#bagOcrText', result);
  // OCR failure used to synthesize a blank manual-edit panel. The capture route now
  // stays image-only; users can return to the dedicated text-entry route instead.
  if (result && rawEditor && !rawEditor.value.trim()) {
    result.remove();
    return;
  }
  if (result && handoff && !handoff.disabled && !autoHandoffQueued && overlay.dataset.autoHandoff !== '1') {
    pendingRecognitionEvidence = captureRecognitionEvidence(result);
    overlay.dataset.autoHandoff = '1';
    autoHandoffQueued = true;
    queueMicrotask(() => {
      const current = $('[data-overlay="bag-capture"]');
      const button = current && $('#bagHandoffBtn', current);
      if (button && !button.disabled) button.click();
      autoHandoffQueued = false;
    });
  }
}

function scheduleNormalize() {
  if (normalizeQueued) return;
  normalizeQueued = true;
  requestAnimationFrame(() => {
    normalizeQueued = false;
    normalizeConsumptionSummary();
    removeGroupExplanations();
    normalizeBrewPlan();
    normalizeCaptureUi();
    injectBeanFormEvidence();
  });
}

function triggerAutomaticPlan(beanId) {
  const token = ++autoBrewToken;
  let attempts = 0;
  const tryGenerate = () => {
    if (token !== autoBrewToken) return;
    attempts += 1;
    const page = $('#pageBrew.active');
    const select = $('#brewBean');
    const button = $('#generatePlanBtn');
    if (page && select && String(select.value) === String(beanId) && button && !button.disabled) {
      if (button.dataset.lbAutoGenerated !== String(beanId)) {
        button.dataset.lbAutoGenerated = String(beanId);
        button.click();
      }
      return;
    }
    if (attempts < 90) requestAnimationFrame(tryGenerate);
  };
  requestAnimationFrame(tryGenerate);
}

document.addEventListener('click', event => {
  const brew = event.target.closest?.('[data-brew-bean]');
  if (brew?.dataset?.brewBean) triggerAutomaticPlan(brew.dataset.brewBean);
}, true);

function projectedSceneBounds(view) {
  if (!view?.canvas || !view?.ctx) return null;
  const points = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-0.58, 0.58]) points.push(view.project({ x, y, z }));
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return { minX:Math.min(...xs), maxX:Math.max(...xs), minY:Math.min(...ys), maxY:Math.max(...ys) };
}

function fitSpatialScene(view = brewSpatialView) {
  if (!view?.opened || !view.canvas || !view.ctx) return;
  view.rotationX = -0.42;
  view.rotationY = 0.70;
  view.zoom = 1;
  view.panX = 0;
  view.panY = 0;
  const initial = projectedSceneBounds(view);
  if (!initial) return;
  const width = Math.max(1, initial.maxX - initial.minX);
  const height = Math.max(1, initial.maxY - initial.minY);
  const targetWidth = view.canvas.width * 0.88;
  const targetHeight = view.canvas.height * 0.76;
  view.zoom = Math.max(1, Math.min(4.2, Math.min(targetWidth / width, targetHeight / height)));
  const fitted = projectedSceneBounds(view);
  if (fitted) {
    const centerX = (fitted.minX + fitted.maxX) / 2;
    const centerY = (fitted.minY + fitted.maxY) / 2;
    const desiredY = view.canvas.height * 0.53;
    view.panX += (view.canvas.width / 2 - centerX) / Math.max(1, view.dpr || 1);
    view.panY += (desiredY - centerY) / Math.max(1, view.dpr || 1);
  }
  view.schedule();
}

function teardownSpatialOverlay(view = brewSpatialView) {
  document.body.classList.remove('spatial-fullscreen-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('pointer-events');
  $$('.spatial-fullscreen-overlay').forEach(node => node.remove());
  view.opened = false;
  view.pointers?.clear?.();
  view.lastPinch = 0;
  view.lastCenter = null;
  view.selection = null;
  view.overlay = null;
  view.canvas = null;
  view.ctx = null;
  view.pointInfo = null;
}

if (!brewSpatialView.__p3LifecyclePatched) {
  brewSpatialView.__p3LifecyclePatched = true;
  const originalOpen = brewSpatialView.open.bind(brewSpatialView);
  const originalClose = brewSpatialView.close.bind(brewSpatialView);
  brewSpatialView.open = function p3Open() {
    if (!this.opened) teardownSpatialOverlay(this);
    originalOpen();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!this.opened) return;
      this.resize();
      fitSpatialScene(this);
    }));
  };
  brewSpatialView.close = function p3Close() {
    try { originalClose(); } finally { teardownSpatialOverlay(this); }
  };
  brewSpatialView.reset = function p3Reset() {
    if (!this.opened) return;
    this.resize();
    fitSpatialScene(this);
  };
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && !brewSpatialView.opened) teardownSpatialOverlay(brewSpatialView);
});
window.addEventListener('pagehide', () => teardownSpatialOverlay(brewSpatialView));
document.addEventListener('click', event => {
  if (brewSpatialView.opened && event.target.closest?.('[data-page-target]')) brewSpatialView.close();
}, true);

// App content and modal/capture overlays are separate DOM ownership roots. Observing only
// #appShell left OCR result renders invisible to the P3 normalizer, so the automatic
// Foundation handoff never fired after a successful scan. Observe both roots explicitly.
const mutationRoots = [$('#appShell'), $('#overlayRoot')].filter(Boolean);
if (!mutationRoots.length) mutationRoots.push(document.documentElement);
for (const mutationRoot of mutationRoots) {
  new MutationObserver(scheduleNormalize).observe(mutationRoot, { childList:true, subtree:true, characterData:true });
}
scheduleNormalize();

console.info('[LuckyBean] P3 UX flow controller active');
