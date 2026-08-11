import { all, getSetting, setSetting } from '../db.js';
import { loadCodebook, makeIndex, displayName } from '../codebook.js';

let queued = false;
let reconciling = false;
let rerun = false;
let codebookIndexPromise = null;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const COUNTRY = new Map([
  ['埃塞俄比亚', '埃塞'], ['Ethiopia', '埃塞'], ['巴拿马', '巴拿马'], ['Panama', '巴拿马'],
  ['肯尼亚', '肯尼亚'], ['Kenya', '肯尼亚'], ['哥斯达黎加', '哥达'], ['Costa Rica', '哥达'],
  ['哥伦比亚', '哥伦'], ['Colombia', '哥伦'], ['危地马拉', '危地'], ['Guatemala', '危地'],
  ['印度尼西亚', '印尼'], ['Indonesia', '印尼']
]);
const VARIETY = new Map([
  ['Geisha', '瑰夏'], ['Gesha', '瑰夏'], ['瑰夏', '瑰夏'], ['Bourbon', '波旁'], ['波旁', '波旁'],
  ['Typica', '铁皮'], ['铁皮卡', '铁皮'], ['铁皮', '铁皮']
]);
const ROAST = { 'RL-L0': '极浅', 'RL-L1': '浅', 'RL-L2': '中浅', 'RL-L3': '中', 'RL-L4': '中深', 'RL-L5': '深', 'RL-L6': '深' };
const PROCESS = [[/dark\s*room\s*washed|暗房水洗/i, '暗水'], [/washed|水洗/i, '水洗'], [/natural|日晒/i, '日晒'], [/anaerobic|厌氧/i, '厌氧'], [/honey|蜜/i, '蜜处']];

async function settings() {
  return await getSetting('app.settings', {}) || {};
}

async function getCodebookIndex() {
  if (!codebookIndexPromise) {
    codebookIndexPromise = loadCodebook()
      .then(result => makeIndex(result.data))
      .catch(error => {
        console.warn('豆卡显示编码表加载失败，改用豆卡自身字段', error);
        return null;
      });
  }
  return await codebookIndexPromise;
}

async function saveCooling(which, rawValue) {
  const first = which === 'first';
  const min = first ? 70 : 50;
  const numeric = Math.min(97, Math.max(min, Number(rawValue)));
  if (!Number.isFinite(numeric)) return;
  const current = await settings();
  current.brew ||= {};
  current.brew[first ? 'firstCoolingMode' : 'tailCoolingMode'] = 'custom';
  current.brew[first ? 'firstTemperatureC' : 'tailTemperatureC'] = Math.round(numeric * 2) / 2;
  await setSetting('app.settings', current);
  document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail: { source: 'custom-cooling-editor' } }));
}

function ensureCoolingEditor(selectId, which, current) {
  const select = $(`#${selectId}`);
  if (!select) return;
  const field = select.closest('.field') || select.parentElement;
  if (!field) return;
  const selector = `[data-lb-cooling-editor="${which}"]`;
  const editors = $$(selector, field);

  if (select.value !== 'custom') {
    editors.forEach(editor => editor.remove());
    return;
  }

  editors.slice(1).forEach(editor => editor.remove());
  const first = which === 'first';
  const value = Number(current.brew?.[first ? 'firstTemperatureC' : 'tailTemperatureC'] ?? (first ? 87 : 86));
  const min = first ? 70 : 50;
  let wrap = editors[0] || null;

  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'lb-inline-cooling-editor';
    wrap.dataset.lbCoolingEditor = which;
    wrap.innerHTML = `<small>自定义目标</small><input class="control" type="number" min="${min}" max="97" step="0.5" value="${value}" aria-label="${first ? '首段' : '尾段'}自定义目标温度"><span>°C</span>`;
    const input = wrap.querySelector('input');
    input.addEventListener('change', () => saveCooling(which, input.value));
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
    });
    field.appendChild(wrap);
    return;
  }

  const input = wrap.querySelector('input');
  if (input && document.activeElement !== input && Number(input.value) !== value) input.value = String(value);
}

function firstReadable(...values) {
  return values.map(value => String(value || '').trim()).find(value => value && value !== '—' && value !== '未定' && value !== '未定国家' && value !== '未定豆种') || '';
}

function nameParts(bean = {}) {
  const text = String(bean.name || '').trim();
  if (!text) return [];
  return text.split(/\s*[·•｜|]\s*/).map(value => value.trim()).filter(Boolean);
}

function decode(index, table, code, ...fallbacks) {
  const decoded = code && index ? displayName(index, table, code, '') : '';
  return firstReadable(decoded, ...fallbacks);
}

function shortCountry(value) {
  const v = String(value || '').trim();
  if (!v) return '未定';
  if (COUNTRY.has(v)) return COUNTRY.get(v);
  const mapped = [...COUNTRY.entries()].find(([key]) => key.toLocaleLowerCase('zh-CN') === v.toLocaleLowerCase('zh-CN'))?.[1];
  if (mapped) return mapped;
  if (/^[A-Za-z .'-]+$/.test(v)) return v.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  return [...v].length <= 3 ? v : `${[...v].slice(0, 2).join('')}…`;
}

function shortStation(value) {
  const v = String(value || '').trim();
  if (!v || v === '—') return '';
  const latin = v.normalize('NFKD').replace(/[^A-Za-z]/g, '').toUpperCase();
  return latin.length >= 3 ? latin.slice(0, 3) : [...v].slice(0, 3).join('');
}

function shortVariety(value) {
  const v = String(value || '').trim();
  if (!v) return '未定';
  if (/^\d{3,}$/.test(v) || /^SL\s*\d+$/i.test(v)) return v.replace(/\s+/g, '').toUpperCase();
  const mapped = [...VARIETY.entries()].find(([key]) => key.toLocaleLowerCase('zh-CN') === v.toLocaleLowerCase('zh-CN'))?.[1];
  return mapped || ([...v].length <= 4 ? v : [...v].slice(0, 4).join(''));
}

function shortProcess(value) {
  const v = String(value || '').trim();
  if (!v) return '未定';
  for (const [regex, label] of PROCESS) if (regex.test(v)) return label;
  return [...v].length <= 3 ? v : [...v].slice(0, 2).join('');
}

function shortRoast(bean, index) {
  const code = String(bean.roastCode || '').toUpperCase();
  if (ROAST[code]) return ROAST[code];
  const label = decode(index, 'roasts', bean.roastCode, bean.roastName, bean.roast, '中');
  return String(label || '中').replace(/烘焙|烘/g, '').slice(0, 2);
}

async function repairBeanCards(index) {
  const cards = $$('.bean-card[data-bean-id].lb-one-line-bean');
  if (!cards.length) return;
  const beans = await all('beans').catch(() => []);
  const map = new Map(beans.map(bean => [String(bean.id), bean]));

  for (const card of cards) {
    const bean = map.get(String(card.dataset.beanId || ''));
    if (!bean) continue;
    const named = nameParts(bean);
    const countryRaw = decode(index, 'countries', bean.countryCode, bean.countryName, bean.country, named[0]);
    const varietyRaw = decode(index, 'varieties', bean.varietyCode, bean.varietyName, bean.variety, named[1]);
    const stationRaw = decode(index, 'entities', bean.entityCode, bean.entityName, bean.entity, bean.processingStation);
    const processRaw = decode(index, 'processes', bean.processCode, bean.processName, bean.process);

    const country = shortCountry(countryRaw);
    const station = shortStation(stationRaw);
    const variety = shortVariety(varietyRaw);
    const roast = shortRoast(bean, index);
    const process = shortProcess(processRaw);
    const remaining = `${Math.max(0, Number(bean.remainingWeight || 0)).toFixed(Number(bean.remainingWeight || 0) % 1 ? 1 : 0)}g`;
    const primary = [country, station, variety].filter(Boolean).join('/');
    const secondary = [roast, process, remaining].join('/');
    const primaryNode = $('.lb-bean-primary', card);
    const secondaryNode = $('.lb-bean-secondary', card);
    if (primaryNode && primaryNode.textContent !== primary) primaryNode.textContent = primary;
    if (secondaryNode && secondaryNode.textContent !== `/${secondary}`) secondaryNode.textContent = `/${secondary}`;
  }
}

function ensureGuestHint() {
  const panel = $('[data-cloud-account-panel]');
  if (!panel || panel.querySelector('[data-cloud-logout]') || panel.querySelector('[data-lb-guest-cloud-hint]')) return;
  const login = panel.querySelector('[data-cloud-login]');
  if (!login) return;
  const hint = document.createElement('p');
  hint.className = 'muted small lb-guest-cloud-hint';
  hint.dataset.lbGuestCloudHint = '1';
  hint.textContent = '当前处于本地使用模式。登录后可使用多设备同步和云端数据保护；不登录不影响本地豆卡、冲煮、品鉴和历史记录。';
  login.closest('.text-actions')?.before(hint);
}

function scopeOnboardingToBeanHome() {
  const guide = $('[data-lb-onboarding]');
  if (!guide) return;
  const activePage = $('.page.active')?.dataset.page || '';
  if (activePage !== 'beans') guide.remove();
}

async function reconcile() {
  if (reconciling) {
    rerun = true;
    return;
  }
  reconciling = true;
  queued = false;
  try {
    const [current, index] = await Promise.all([settings(), getCodebookIndex()]);
    ensureCoolingEditor('firstCoolingMode', 'first', current);
    ensureCoolingEditor('tailCoolingMode', 'tail', current);
    await repairBeanCards(index);
    ensureGuestHint();
    scopeOnboardingToBeanHome();
  } finally {
    reconciling = false;
    if (rerun) {
      rerun = false;
      queue();
    }
  }
}

function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => reconcile().catch(error => {
    reconciling = false;
    queued = false;
    console.warn('体验修复控制器更新失败', error);
  }));
}

new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
document.addEventListener('luckybean:app-refreshed', queue);
document.addEventListener('luckybean:cloud-auth-state', queue);
document.addEventListener('luckybean:codebook-provider-activated', () => {
  codebookIndexPromise = null;
  queue();
});
document.addEventListener('click', event => {
  if (event.target.closest('[data-page-target]')) setTimeout(queue, 0);
}, true);
queue();
