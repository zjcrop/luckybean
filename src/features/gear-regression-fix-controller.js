import { getSetting, setSetting } from '../db.js';

const BLOCK_SELECTOR = '[data-lb-matching-gear]';
const CANONICAL = 'angle-v1';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

let queued = false;

function scheduleRender() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    renderGear().catch(error => console.error('器具矫正控件更新失败', error));
  });
}

async function readSettings() {
  const settings = await getSetting('app.settings', {});
  settings.matchingGear ||= {
    drippers: {},
    papers: {},
    defaultDripper: { angleDeg: null, bypass: 'medium' },
    defaultPaper: { speed: 'medium' }
  };
  settings.matchingGear.drippers ||= {};
  settings.matchingGear.papers ||= {};
  settings.matchingGear.defaultDripper ||= { angleDeg: null, bypass: 'medium' };
  settings.matchingGear.defaultPaper ||= { speed: 'medium' };
  return settings;
}

function selectedIds() {
  return {
    dripperId: $('#brewDripper')?.value || 'default',
    paperId: $('#brewFilterPaper')?.value || 'default'
  };
}

function option(value, current, label) {
  return `<option value="${esc(value)}"${current === value ? ' selected' : ''}>${esc(label)}</option>`;
}

async function renderGear() {
  const host = $('#brewContent');
  if (!host) return;
  const anchor = $('[data-brew-row="filter-gear"]', host);
  if (!anchor) return;

  const { dripperId, paperId } = selectedIds();
  const key = `${dripperId}|${paperId}`;
  const blocks = $$(BLOCK_SELECTOR, host);
  const canonical = blocks.find(node => node.dataset.lbGearCanonical === CANONICAL);

  // Always remove stale/duplicate injected blocks. One physical control block owns this state.
  if (canonical?.dataset.lbGearKey === key && blocks.length === 1) return;

  const settings = await readSettings();
  const savedDripper = settings.matchingGear.drippers[dripperId] || {};
  const fallbackDripper = settings.matchingGear.defaultDripper || {};
  const savedPaper = settings.matchingGear.papers[paperId] || {};
  const fallbackPaper = settings.matchingGear.defaultPaper || {};
  const angleValue = Number(savedDripper.angleDeg ?? fallbackDripper.angleDeg);
  const angle = Number.isFinite(angleValue) && angleValue >= 25 && angleValue <= 95 ? angleValue : '';
  const bypass = String(savedDripper.bypass || fallbackDripper.bypass || 'medium');
  const speed = String(savedPaper.speed || fallbackPaper.speed || 'medium');

  $$(BLOCK_SELECTOR, host).forEach(node => node.remove());
  anchor.insertAdjacentHTML('afterend', `
    <div class="lb-matching-gear" data-lb-matching-gear data-lb-gear-canonical="${CANONICAL}" data-lb-gear-key="${esc(key)}">
      <label>
        <span>滤杯角度</span>
        <input id="lbDripperAngle" class="control" type="number" inputmode="decimal" min="25" max="95" step="1" placeholder="未设" value="${esc(angle)}" aria-label="滤杯角度，25到95度">
      </label>
      <label>
        <span>旁通</span>
        <select id="lbDripperBypass" class="control">
          ${option('none', bypass, '无')}${option('low', bypass, '少')}${option('medium', bypass, '中')}${option('high', bypass, '多')}
        </select>
      </label>
      <label>
        <span>滤纸流速</span>
        <select id="lbPaperSpeed" class="control">
          ${option('low', speed, '低')}${option('medium', speed, '中')}${option('high', speed, '高')}
        </select>
      </label>
    </div>`);

  const save = async () => {
    const next = await readSettings();
    const currentDripper = next.matchingGear.drippers[dripperId] || {};
    const currentPaper = next.matchingGear.papers[paperId] || {};
    const rawAngle = String($('#lbDripperAngle')?.value || '').trim();
    const numericAngle = Number(rawAngle);
    next.matchingGear.drippers[dripperId] = {
      ...currentDripper,
      angleDeg: rawAngle && Number.isFinite(numericAngle) ? Math.max(25, Math.min(95, numericAngle)) : null,
      bypass: $('#lbDripperBypass')?.value || 'medium'
    };
    next.matchingGear.papers[paperId] = {
      ...currentPaper,
      speed: $('#lbPaperSpeed')?.value || 'medium'
    };
    await setSetting('app.settings', next);
  };

  ['lbDripperAngle', 'lbDripperBypass', 'lbPaperSpeed'].forEach(id => {
    $(`#${id}`)?.addEventListener('change', save);
  });
}

document.addEventListener('change', event => {
  if (event.target?.matches?.('#brewDripper,#brewFilterPaper')) scheduleRender();
}, true);

const observer = new MutationObserver(records => {
  if (records.some(record => {
    const target = record.target instanceof Element ? record.target : record.target?.parentElement;
    return target?.closest?.('#brewContent') || [...record.addedNodes].some(node => node instanceof Element && (node.id === 'brewContent' || node.querySelector?.('#brewContent')));
  })) scheduleRender();
});

function init() {
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleRender();
}

if (document.documentElement.dataset.startup === 'ready') init();
else document.addEventListener('luckybean:local-app-ready', init, { once: true });
