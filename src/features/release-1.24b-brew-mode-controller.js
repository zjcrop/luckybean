import { getSetting, setSetting, openDb } from '../db.js';
import { LOCAL_BREW_RECIPES_124B, LOCAL_BEVERAGE_RECIPES_124B } from '../data/local-brew-recipes-1.24b.js';

const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

const ADDITIONS = Object.freeze({
  americano:'热水', long_black:'热水', latte:'蒸汽牛奶', cappuccino:'蒸汽牛奶 / 奶泡',
  flat_white:'微泡牛奶', cortado:'少量蒸汽牛奶', macchiato:'少量奶泡 / 牛奶', piccolo:'少量微泡牛奶',
  iced_americano:'冷水 / 冰', iced_latte:'冷牛奶 / 冰', shakerato:'冰', espresso_tonic:'汤力水 / 冰',
  custom:'自定义添加'
});

let rendering = false;
let queued = false;
let observer = null;

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB请求失败'));
  });
}
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('库存事务失败'));
    tx.onabort = () => reject(tx.error || new Error('库存事务已回滚'));
  });
}
function notice(message, kind = 'status-good') {
  document.dispatchEvent(new CustomEvent('luckybean:user-notice', { detail: { message, kind } }));
}

function injectStyle() {
  if ($('#lbBrewModeStyle')) return;
  const style = document.createElement('style');
  style.id = 'lbBrewModeStyle';
  style.textContent = `
    .lb-brew-mode-switch{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;margin:0 0 12px;padding:0 2px;font-size:13px;font-weight:700}
    .lb-brew-mode-switch .lb-mode-left{text-align:right}.lb-brew-mode-switch .lb-mode-right{text-align:left}
    .lb-brew-switch{width:48px;height:26px;border:1px solid rgba(160,160,160,.55);border-radius:999px;padding:2px;background:rgba(120,120,120,.18);position:relative}
    .lb-brew-switch span{display:block;width:20px;height:20px;border-radius:50%;background:currentColor;transition:transform .16s ease}
    .lb-brew-switch[aria-checked="true"] span{transform:translateX(20px)}
    #brewContent.lb-brew-other-active > :not([data-lb-brew-mode-switch]):not([data-lb-other-brew-panel]){display:none!important}
    [data-lb-local-method-row]{display:none!important}
    .lb-other-brew-panel{display:grid;gap:14px;padding:14px;border:1px solid rgba(190,151,80,.28);border-radius:14px;background:rgba(255,255,255,.025)}
    .lb-other-brew-panel[hidden]{display:none!important}
    .lb-other-brew-panel .lb-other-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .lb-other-brew-panel .lb-other-field{display:grid;gap:5px;min-width:0}.lb-other-brew-panel .lb-other-field>span{font-size:11px;opacity:.65}
    .lb-other-tutorial{display:grid;gap:12px}.lb-other-tutorial section{display:grid;gap:6px}.lb-other-tutorial h4{margin:0;font-size:13px}.lb-other-tutorial ul,.lb-other-tutorial ol{margin:0;padding-left:20px;display:grid;gap:6px;line-height:1.62}
    .lb-other-brew-panel .lb-other-note{margin:0;font-size:11px;opacity:.68;line-height:1.6}
    .lb-other-actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:4px}.lb-other-actions .button{width:100%}
    .lb-other-dose-wrap{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}.lb-other-dose-wrap small{font-size:11px;opacity:.62;padding-bottom:10px}
    @media(max-width:420px){.lb-other-brew-panel .lb-other-grid{grid-template-columns:1fr}.lb-other-dose-wrap{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

async function readState() {
  const settings = await getSetting('app.settings', {}) || {};
  settings.brew ||= {};
  let mode = settings.brew.lbMode === 'other' ? 'other' : 'pourover';
  let coffeeType = String(settings.brew.otherCoffeeType || '');
  let changed = false;
  if (!coffeeType && settings.brew.extMethod && settings.brew.extMethod !== 'pourover') {
    coffeeType = `method:${settings.brew.extMethod}`;
    if (!settings.brew.lbMode) mode = 'other';
    changed = true;
  } else if (!coffeeType && settings.brew.beverageRecipe) {
    coffeeType = `drink:${settings.brew.beverageRecipe}`;
    if (!settings.brew.lbMode) mode = 'other';
    changed = true;
  }
  if (!coffeeType) coffeeType = 'method:espresso';
  if (settings.brew.extMethod !== 'pourover') { settings.brew.extMethod = 'pourover'; changed = true; }
  if (settings.brew.beverageRecipe !== '') { settings.brew.beverageRecipe = ''; changed = true; }
  if (settings.brew.lbMode !== mode) { settings.brew.lbMode = mode; changed = true; }
  if (settings.brew.otherCoffeeType !== coffeeType) { settings.brew.otherCoffeeType = coffeeType; changed = true; }
  if (changed) await setSetting('app.settings', settings);
  return { mode, coffeeType, otherDoseG:Number(settings.brew.otherDoseG || 0) };
}

async function saveState(mode, coffeeType, otherDoseG) {
  const settings = await getSetting('app.settings', {}) || {};
  settings.brew ||= {};
  settings.brew.lbMode = mode === 'other' ? 'other' : 'pourover';
  if (coffeeType) settings.brew.otherCoffeeType = coffeeType;
  if (Number.isFinite(Number(otherDoseG)) && Number(otherDoseG) > 0) settings.brew.otherDoseG = Number(otherDoseG);
  settings.brew.extMethod = 'pourover';
  settings.brew.beverageRecipe = '';
  await setSetting('app.settings', settings);
}

function optionsHtml(selected) {
  const extraction = Object.entries(LOCAL_BREW_RECIPES_124B).map(([id, recipe]) => ({ id:`method:${id}`, name:recipe.name }));
  const drinks = Object.entries(LOCAL_BEVERAGE_RECIPES_124B).map(([id, recipe]) => ({ id:`drink:${id}`, name:recipe.name }));
  return [...extraction, ...drinks].map(item => `<option value="${esc(item.id)}"${item.id === selected ? ' selected' : ''}>${esc(item.name)}</option>`).join('');
}

function resolveCoffeeType(value) {
  const [kind, id] = String(value || '').split(':');
  if (kind === 'drink') {
    const drink = LOCAL_BEVERAGE_RECIPES_124B[id];
    if (!drink) return null;
    const base = drink.base === 'espresso' ? LOCAL_BREW_RECIPES_124B.espresso : null;
    return {
      key:`drink:${id}`, id, kind, name:drink.name, base:base?.name || (drink.base === 'custom' ? '自定义原液' : drink.base || '咖啡原液'),
      additions:ADDITIONS[id] || '按配方添加', defaultDoseG:Number(drink.defaultDoseG || base?.defaultDoseG || 15),
      dose:base?.dose || '', water:base?.water || '', temperature:base?.temperature || '', grind:base?.grind || '',
      prep:drink.prep || [], steps:drink.steps || [], finish:drink.finish || '', adjust:drink.adjust || []
    };
  }
  const recipe = LOCAL_BREW_RECIPES_124B[id] || LOCAL_BREW_RECIPES_124B.espresso;
  const resolvedId = LOCAL_BREW_RECIPES_124B[id] ? id : 'espresso';
  return {
    key:`method:${resolvedId}`, id:resolvedId, kind:'method', name:recipe.name, base:recipe.name,
    additions:resolvedId === 'cold_brew' ? '水 / 冰（按饮用方式）' : resolvedId === 'south_indian_filter' ? '牛奶 / 水 / 糖（可选）' : '无固定添加',
    defaultDoseG:Number(recipe.defaultDoseG || 15), dose:recipe.dose || '', water:recipe.water || '', temperature:recipe.temperature || '', grind:recipe.grind || '',
    prep:recipe.prep || [], steps:recipe.steps || [], finish:recipe.finish || '', adjust:recipe.adjust || []
  };
}

function listHtml(items, ordered = false) {
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${(items || []).map(item => `<li>${esc(item)}</li>`).join('')}</${tag}>`;
}
function tutorialHtml(type) {
  return `<div class="lb-other-tutorial">
    <section><h4>关键参数</h4><p class="lb-other-note">${esc([type.dose && `粉量 ${type.dose}`, type.water && `液量/水量 ${type.water}`, type.temperature && `温度 ${type.temperature}`, type.grind && `研磨 ${type.grind}`].filter(Boolean).join(' · '))}</p></section>
    ${type.prep.length ? `<section><h4>准备</h4>${listHtml(type.prep)}</section>` : ''}
    <section><h4>制作步骤</h4>${listHtml(type.steps, true)}</section>
    ${type.finish ? `<section><h4>完成判断</h4><p class="lb-other-note">${esc(type.finish)}</p></section>` : ''}
    ${type.adjust.length ? `<section><h4>常见偏差与调整</h4>${listHtml(type.adjust)}</section>` : ''}
  </div>`;
}

function panelHtml(type, doseG) {
  return `<label class="lb-other-field"><span>咖啡种类</span><select class="control" data-lb-other-coffee aria-label="咖啡种类">${optionsHtml(type.key)}</select></label>
    <div class="lb-other-grid">
      <div class="lb-other-field"><span>原液</span><strong data-lb-other-base>${esc(type.base)}</strong></div>
      <div class="lb-other-field"><span>添加</span><strong data-lb-other-additions>${esc(type.additions)}</strong></div>
    </div>
    <div class="lb-other-dose-wrap"><label class="lb-other-field"><span>实际咖啡粉克重</span><input class="control" type="number" min="0.1" step="0.1" inputmode="decimal" data-lb-other-dose value="${esc(Number(doseG || type.defaultDoseG).toFixed(1))}" aria-label="实际咖啡粉克重"></label><small>完成时按此数值自动扣除豆卡余量</small></div>
    <div data-lb-other-tutorial>${tutorialHtml(type)}</div>
    <p class="lb-other-note">参数为可靠起始参考，不替代具体设备说明。其他模式不调用 BrewProfiles 手冲计算，也不启动手冲倒计时。</p>
    <div class="lb-other-actions"><button class="button" type="button" data-lb-other-back>返回</button><button class="button primary" type="button" data-lb-other-complete>完成</button></div>`;
}

function updatePanel(panel, value, { resetDose = false } = {}) {
  const type = resolveCoffeeType(value);
  if (!type) return;
  const select = $('[data-lb-other-coffee]', panel);
  if (select && select.value !== type.key) select.value = type.key;
  if (panel.dataset.lbRenderedType === type.key && !resetDose) return;
  panel.dataset.lbRenderedType = type.key;
  $('[data-lb-other-base]', panel).textContent = type.base;
  $('[data-lb-other-additions]', panel).textContent = type.additions;
  $('[data-lb-other-tutorial]', panel).innerHTML = tutorialHtml(type);
  if (resetDose) $('[data-lb-other-dose]', panel).value = type.defaultDoseG.toFixed(1);
}

function clearLegacyDisabledState(root) {
  root.querySelectorAll('.lb-disabled-for-method').forEach(node => node.classList.remove('lb-disabled-for-method'));
  root.querySelector('[data-lb-local-recipe]')?.remove();
}

async function deductOtherBrew({ beanId, doseG, coffeeType }) {
  const amount = Number(doseG);
  if (!beanId) throw new Error('请先选择咖啡豆');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('实际咖啡粉克重必须大于 0');
  const resolved = resolveCoffeeType(coffeeType);
  if (!resolved) throw new Error('咖啡种类无效');
  const db = await openDb();
  const tx = db.transaction(['beans', 'inventoryEvents'], 'readwrite');
  const beans = tx.objectStore('beans');
  const inventory = tx.objectStore('inventoryEvents');
  const bean = await requestValue(beans.get(beanId));
  if (!bean) { tx.abort(); throw new Error('豆卡不存在，无法扣除克重'); }
  const before = Number(bean.remainingWeight || 0);
  if (!Number.isFinite(before) || before < 0) { tx.abort(); throw new Error('豆卡剩余克重数据无效'); }
  const after = Math.max(0, Number((before - amount).toFixed(3)));
  const shortfall = Math.max(0, Number((amount - before).toFixed(3)));
  const at = new Date().toISOString();
  const id = `other-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const autoArchived = after < 5;
  beans.put({ ...bean, remainingWeight:after, ...(autoArchived ? { archived:true, archivedAt:bean.archivedAt || at } : {}), updatedAt:at });
  inventory.put({
    id:`${id}:consume`, beanId, sessionId:id, type:'brew-consume', amountG:-amount, resultingWeightG:after,
    note:`其他制作 · ${resolved.name} · 自动扣除 ${amount.toFixed(1)}g${shortfall > 0 ? `；原余量不足 ${shortfall.toFixed(1)}g，剩余按 0g 结算` : ''}`,
    metadata:{ mode:'other', coffeeType:resolved.key, coffeeName:resolved.name }, createdAt:at
  });
  await transactionDone(tx);
  document.dispatchEvent(new CustomEvent('luckybean:data-changed', { detail:{ store:'inventoryEvents', operation:'other-brew-consume', beanId, amountG:amount, at } }));
  document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail:{ source:'other-brew-completed' } }));
  return { amount, after, shortfall, autoArchived, coffeeName:resolved.name };
}

async function completeOther(panel) {
  const button = $('[data-lb-other-complete]', panel);
  if (!button || button.disabled) return;
  const beanId = $('#brewBean')?.value || '';
  const coffeeType = $('[data-lb-other-coffee]', panel)?.value || '';
  const doseG = Number($('[data-lb-other-dose]', panel)?.value || 0);
  button.disabled = true;
  button.textContent = '保存中…';
  try {
    await saveState('other', coffeeType, doseG);
    const result = await deductOtherBrew({ beanId, doseG, coffeeType });
    notice(`已自动扣除 ${result.amount.toFixed(1)}g 咖啡豆，进入品鉴记录`, result.shortfall > 0 ? 'status-warn' : 'status-good');
    setTimeout(() => document.querySelector('[data-page-target="sensory"]')?.click(), 0);
  } catch (error) {
    button.disabled = false;
    button.textContent = '完成';
    notice(error.message || '完成制作失败', 'status-bad');
  }
}

async function render() {
  if (rendering) return;
  const root = $('#brewContent');
  if (!root) return;
  rendering = true;
  try {
    injectStyle();
    const { mode, coffeeType, otherDoseG } = await readState();
    clearLegacyDisabledState(root);
    root.querySelectorAll('[data-lb-local-method-row]').forEach(node => { node.hidden = true; node.setAttribute('aria-hidden', 'true'); });
    let switchRow = $('[data-lb-brew-mode-switch]', root);
    if (!switchRow) {
      switchRow = document.createElement('div');
      switchRow.className = 'lb-brew-mode-switch';
      switchRow.dataset.lbBrewModeSwitch = '1';
      switchRow.innerHTML = `<span class="lb-mode-left">手冲</span><button class="lb-brew-switch" type="button" role="switch" aria-label="手冲与其他制作切换"><span></span></button><span class="lb-mode-right">其他</span>`;
      root.prepend(switchRow);
    }
    const resolved = resolveCoffeeType(coffeeType) || resolveCoffeeType('method:espresso');
    let panel = $('[data-lb-other-brew-panel]', root);
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'lb-other-brew-panel';
      panel.dataset.lbOtherBrewPanel = '1';
      panel.innerHTML = panelHtml(resolved, otherDoseG || resolved.defaultDoseG);
      panel.dataset.lbRenderedType = resolved.key;
      switchRow.after(panel);
    }
    const toggle = $('.lb-brew-switch', switchRow);
    toggle.setAttribute('aria-checked', mode === 'other' ? 'true' : 'false');
    root.classList.toggle('lb-brew-other-active', mode === 'other');
    panel.hidden = mode !== 'other';
    updatePanel(panel, resolved.key);

    if (switchRow.dataset.lbBound !== '1') {
      switchRow.dataset.lbBound = '1';
      toggle.addEventListener('click', async () => {
        const next = toggle.getAttribute('aria-checked') === 'true' ? 'pourover' : 'other';
        const selected = $('[data-lb-other-coffee]', panel)?.value || resolved.key;
        const dose = Number($('[data-lb-other-dose]', panel)?.value || resolved.defaultDoseG);
        await saveState(next, selected, dose);
        await render();
      });
    }
    const select = $('[data-lb-other-coffee]', panel);
    if (select && select.dataset.lbBound !== '1') {
      select.dataset.lbBound = '1';
      select.addEventListener('change', async () => {
        updatePanel(panel, select.value, { resetDose:true });
        await saveState('other', select.value, Number($('[data-lb-other-dose]', panel)?.value || 0));
      });
    }
    const dose = $('[data-lb-other-dose]', panel);
    if (dose && dose.dataset.lbBound !== '1') {
      dose.dataset.lbBound = '1';
      dose.addEventListener('change', () => saveState('other', select?.value || resolved.key, Number(dose.value || 0)).catch(() => {}));
    }
    const back = $('[data-lb-other-back]', panel);
    if (back && back.dataset.lbBound !== '1') {
      back.dataset.lbBound = '1';
      back.addEventListener('click', async () => {
        await saveState('pourover', select?.value || resolved.key, Number(dose?.value || resolved.defaultDoseG));
        await render();
      });
    }
    const complete = $('[data-lb-other-complete]', panel);
    if (complete && complete.dataset.lbBound !== '1') {
      complete.dataset.lbBound = '1';
      complete.addEventListener('click', () => completeOther(panel));
    }
  } finally {
    rendering = false;
  }
}

function queueRender() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    render().catch(() => {});
  });
}

const brewRoot = $('#brewContent');
if (brewRoot) {
  observer = new MutationObserver(queueRender);
  observer.observe(brewRoot, { childList:true, subtree:true });
}
document.addEventListener('luckybean:app-refreshed', queueRender);
document.addEventListener('luckybean:brew-rendered', queueRender);
document.addEventListener('click', event => { if (event.target.closest?.('[data-page-target="brew"]')) queueRender(); }, true);
queueRender();

globalThis.LuckyBeanBrewMode124B = { render, resolveCoffeeType, deductOtherBrew };
