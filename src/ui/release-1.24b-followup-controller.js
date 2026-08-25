import { all, put } from '../db.js';

const ROAST_LABELS = Object.freeze({
  'RL-L0': '极浅烘',
  'RL-L1': '浅烘',
  'RL-L2': '浅中烘',
  'RL-L3': '中烘',
  'RL-L4': '中深烘',
  'RL-L5': '深烘',
  'RL-L6': '极深烘'
});
const FIELD_CONTROLS = Object.freeze({
  countryCode: 'beanCountry',
  regionCode: 'beanRegion',
  entityCode: 'beanEntity',
  varietyCode: 'beanVariety',
  processCode: 'beanProcess',
  roastCode: 'beanRoast',
  roastDate: 'beanRoastDate',
  roastColor: 'beanRoastColor',
  roasterName: 'beanRoaster',
  altitude: 'beanAltitude',
  initialWeight: 'beanInitialWeight',
  price: 'beanPrice'
});
const STYLE_ID = 'luckybean-124b-followup-style';
let normalizationBusy = false;
let observerQueued = false;

function normalizeRoastCode(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/[‐‑‒–—―−﹣－]/g, '-')
    .replace(/\s+/g, '');
}

function roastLabel(value) {
  return ROAST_LABELS[normalizeRoastCode(value)] || '';
}

function replaceRoastCodes(text) {
  return String(text || '').replace(/RL\s*[‐‑‒–—―−﹣－-]\s*L\s*([0-6])/gi, (_, level) => ROAST_LABELS[`RL-L${level}`] || _);
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* SVG text does not inherit CSS color as fill. Bind radar labels to the theme text token explicitly. */
    .v095-radar-stage svg text { fill: var(--text, #f5f3ed) !important; }

    /* Professional cupping uses the same viewport-bottom operation-zone model as the main bottom navigation. */
    .v095-professional-dialog { padding-bottom: calc(72px + var(--safe-bottom, 0px)) !important; }
    .v095-wizard-actions {
      position: fixed !important;
      z-index: 96 !important;
      left: 50% !important;
      right: auto !important;
      bottom: 0 !important;
      transform: translateX(-50%) !important;
      width: min(880px, 100%) !important;
      margin: 0 !important;
      padding: 8px 18px calc(8px + var(--safe-bottom, 0px)) !important;
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      background: var(--bg, #050505) !important;
      backdrop-filter: blur(8px);
    }
    .v095-wizard-actions [data-v095-cancel] { grid-column: 1 !important; grid-row: 1 !important; }
    .v095-wizard-actions [data-v095-prev] { grid-column: 2 !important; grid-row: 1 !important; }
    .v095-wizard-actions [data-v095-next] { grid-column: 3 !important; grid-row: 1 !important; }

    /* Pending OCR evidence is an editor launcher, not inert evidence copy. */
    [data-recognition-review="pending"] .evidence-row[data-evidence-field] {
      cursor: pointer;
      outline: none;
    }
    [data-recognition-review="pending"] .evidence-row[data-evidence-field]:focus-visible,
    [data-recognition-review="pending"] .evidence-row[data-evidence-field].recognition-review-editing {
      color: var(--text);
      border-bottom: 1px dashed var(--active);
    }
    [data-recognition-review="pending"] .evidence-row[data-evidence-field]::after {
      content: '编辑确认';
      color: var(--active);
      font-size: 11px;
      margin-left: auto;
    }
    .form-field.recognition-review-active { scroll-margin-top: 18vh; }
    .recognition-field-confirm {
      align-self: flex-end;
      margin-top: 5px;
      color: var(--active) !important;
      border-bottom: 1px dashed var(--active) !important;
    }
  `;
  document.head.append(style);
}

function stripObsoleteSensoryCopy(root = document) {
  root.querySelectorAll?.('#sensoryVoiceNoteBtn').forEach(node => node.remove());
  root.querySelectorAll?.('.sensory-note-actions').forEach(node => {
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    if (!node.querySelector('button') || text.includes('文字将写入品鉴记录和对应冲煮记录')) node.remove();
  });
  root.querySelectorAll?.('#sensoryContent p, #sensoryContent small, #overlayRoot p, #overlayRoot small').forEach(node => {
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    if (text.includes('专业标签') && text.includes('雷达图') && text.includes('结构化保存')) node.remove();
  });
}

function semanticizeVisibleRoastCodes(root = document) {
  const scopes = [
    root.querySelector?.('#beanGroups'),
    root.querySelector?.('[data-overlay="bean-detail"]'),
    root.querySelector?.('[data-recognition-review="pending"]')
  ].filter(Boolean);
  for (const scope of scopes) {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const next = replaceRoastCodes(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
    scope.querySelectorAll?.('[aria-label]').forEach(node => {
      const label = node.getAttribute('aria-label');
      const next = replaceRoastCodes(label);
      if (next !== label) node.setAttribute('aria-label', next);
    });
  }
}

function fieldDisplayValue(control, field) {
  if (!control) return '';
  if (field === 'roastCode') return roastLabel(control.value) || control.selectedOptions?.[0]?.textContent?.trim() || control.value;
  if (control instanceof HTMLSelectElement) return control.selectedOptions?.[0]?.textContent?.trim() || control.value;
  return String(control.value || '').trim();
}

function clearRecognitionEditor(form) {
  form?.querySelectorAll('.form-field.recognition-review-active').forEach(node => node.classList.remove('recognition-review-active'));
  form?.querySelectorAll('.recognition-field-confirm').forEach(node => node.remove());
  form?.querySelectorAll('[data-recognition-review="pending"] .evidence-row.recognition-review-editing').forEach(node => node.classList.remove('recognition-review-editing'));
}

function activateRecognitionEditor(row) {
  const form = row.closest('form#beanForm');
  if (!form) return;
  const field = String(row.dataset.evidenceField || '');
  const controlId = FIELD_CONTROLS[field];
  const control = controlId ? form.querySelector(`#${CSS.escape(controlId)}`) : null;
  if (!control) {
    document.dispatchEvent(new CustomEvent('luckybean:user-notice', { detail: { message: '该识别项需要在豆卡表单中手工确认', kind: 'status-warn' } }));
    return;
  }
  clearRecognitionEditor(form);
  row.classList.add('recognition-review-editing');
  const fieldRoot = control.closest('.form-field');
  fieldRoot?.classList.add('recognition-review-active');
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'button recognition-field-confirm';
  confirm.dataset.confirmRecognitionField = field;
  confirm.textContent = '确认此项';
  fieldRoot?.append(confirm);
  fieldRoot?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  requestAnimationFrame(() => control.focus({ preventScroll: true }));
}

function confirmRecognitionEditor(button) {
  const form = button.closest('form#beanForm');
  if (!form) return;
  const field = String(button.dataset.confirmRecognitionField || '');
  const controlId = FIELD_CONTROLS[field];
  const control = controlId ? form.querySelector(`#${CSS.escape(controlId)}`) : null;
  const row = form.querySelector(`[data-recognition-review="pending"] .evidence-row[data-evidence-field="${CSS.escape(field)}"]`);
  if (!control || !row) return;
  const value = fieldDisplayValue(control, field);
  if (!value) {
    document.dispatchEvent(new CustomEvent('luckybean:user-notice', { detail: { message: '请先填写该字段，再确认', kind: 'status-warn' } }));
    control.focus();
    return;
  }
  row.dataset.recognitionConfirmed = 'true';
  row.remove();
  clearRecognitionEditor(form);
  const section = form.querySelector('[data-recognition-review="pending"]');
  if (section && !section.querySelector('.evidence-row[data-evidence-field]')) section.remove();
  document.dispatchEvent(new CustomEvent('luckybean:recognition-field-confirmed', { detail: { field, value } }));
  document.dispatchEvent(new CustomEvent('luckybean:user-notice', { detail: { message: `${value} 已确认`, kind: 'status-good' } }));
}

function decorateRecognitionRows(root = document) {
  root.querySelectorAll?.('[data-recognition-review="pending"] .evidence-row[data-evidence-field]').forEach(row => {
    if (row.dataset.recognitionInteractive === '1') return;
    row.dataset.recognitionInteractive = '1';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    const field = String(row.dataset.evidenceField || '');
    const label = row.firstElementChild?.textContent?.trim() || field;
    row.setAttribute('aria-label', `编辑并确认${label}`);
  });
  semanticizeVisibleRoastCodes(root);
}

async function normalizeStoredRoastCodes() {
  if (normalizationBusy) return;
  normalizationBusy = true;
  try {
    const beans = await all('beans').catch(() => []);
    for (const bean of beans) {
      const normalized = normalizeRoastCode(bean?.roastCode);
      if (!ROAST_LABELS[normalized] || normalized === bean.roastCode) continue;
      await put('beans', { ...bean, roastCode: normalized, updatedAt: bean.updatedAt || new Date().toISOString() });
    }
  } finally {
    normalizationBusy = false;
  }
}

function apply(root = document) {
  ensureStyles();
  stripObsoleteSensoryCopy(root);
  decorateRecognitionRows(root);
  semanticizeVisibleRoastCodes(root);
}

function queueApply() {
  if (observerQueued) return;
  observerQueued = true;
  requestAnimationFrame(() => {
    observerQueued = false;
    apply(document);
  });
}

document.addEventListener('click', event => {
  const confirm = event.target.closest?.('[data-confirm-recognition-field]');
  if (confirm) {
    event.preventDefault();
    event.stopPropagation();
    confirmRecognitionEditor(confirm);
    return;
  }
  const row = event.target.closest?.('[data-recognition-review="pending"] .evidence-row[data-evidence-field]');
  if (!row) return;
  event.preventDefault();
  activateRecognitionEditor(row);
}, true);

document.addEventListener('keydown', event => {
  if (!['Enter', ' '].includes(event.key)) return;
  const row = event.target.closest?.('[data-recognition-review="pending"] .evidence-row[data-evidence-field]');
  if (!row) return;
  event.preventDefault();
  activateRecognitionEditor(row);
}, true);

for (const type of ['luckybean:app-refreshed', 'luckybean:local-app-ready']) {
  document.addEventListener(type, () => {
    queueApply();
    normalizeStoredRoastCodes().then(queueApply).catch(() => {});
  });
}

const observer = new MutationObserver(queueApply);
observer.observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => apply(document), { once: true });
else apply(document);

export const followupUiRevision = '1.24B-followup.1';
