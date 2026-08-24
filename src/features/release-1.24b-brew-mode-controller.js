import { getSetting, setSetting } from '../db.js';
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
    .lb-other-brew-panel{display:grid;gap:12px;padding:14px;border:1px solid rgba(190,151,80,.28);border-radius:14px;background:rgba(255,255,255,.025)}
    .lb-other-brew-panel[hidden]{display:none!important}
    .lb-other-brew-panel .lb-other-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .lb-other-brew-panel .lb-other-field{display:grid;gap:5px;min-width:0}.lb-other-brew-panel .lb-other-field>span{font-size:11px;opacity:.65}
    .lb-other-brew-panel .lb-other-steps{margin:0;padding-left:20px;display:grid;gap:6px;line-height:1.55}
    .lb-other-brew-panel .lb-other-note{margin:0;font-size:11px;opacity:.62;line-height:1.55}
    @media(max-width:420px){.lb-other-brew-panel .lb-other-grid{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

async function readState() {
  const settings = await getSetting('app.settings', {}) || {};
  settings.brew ||= {};
  let mode = settings.brew.lbMode === 'other' ? 'other' : 'pourover';
  let coffeeType = String(settings.brew.otherCoffeeType || '');
  let changed = false;
  // Migrate the previous 1.24B two-select state once, then neutralize it so the
  // legacy enhancer can no longer disable hand-pour controls behind the new switch.
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
  return { mode, coffeeType };
}

async function saveState(mode, coffeeType) {
  const settings = await getSetting('app.settings', {}) || {};
  settings.brew ||= {};
  settings.brew.lbMode = mode === 'other' ? 'other' : 'pourover';
  if (coffeeType) settings.brew.otherCoffeeType = coffeeType;
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
      key:`drink:${id}`, name:drink.name, base:base?.name || (drink.base === 'custom' ? '自定义原液' : drink.base || '咖啡原液'),
      additions:ADDITIONS[id] || '按配方添加', steps:drink.steps || [],
      detail:base ? `${base.dose} · ${base.temperature} · 研磨 ${base.grind}` : ''
    };
  }
  const recipe = LOCAL_BREW_RECIPES_124B[id] || LOCAL_BREW_RECIPES_124B.espresso;
  const resolvedId = LOCAL_BREW_RECIPES_124B[id] ? id : 'espresso';
  return {
    key:`method:${resolvedId}`, name:recipe.name, base:recipe.name,
    additions:resolvedId === 'cold_brew' ? '水 / 冰（按饮用方式）' : resolvedId === 'south_indian_filter' ? '牛奶 / 水 / 糖（可选）' : '无固定添加',
    steps:recipe.steps || [], detail:[recipe.dose, recipe.water, recipe.temperature, `研磨 ${recipe.grind}`].filter(Boolean).join(' · ')
  };
}

function panelHtml(type) {
  return `<label class="lb-other-field"><span>咖啡种类</span><select class="control" data-lb-other-coffee aria-label="咖啡种类">${optionsHtml(type.key)}</select></label>
    <div class="lb-other-grid">
      <div class="lb-other-field"><span>原液</span><strong data-lb-other-base>${esc(type.base)}</strong></div>
      <div class="lb-other-field"><span>添加</span><strong data-lb-other-additions>${esc(type.additions)}</strong></div>
    </div>
    <p class="lb-other-note" data-lb-other-detail>${esc(type.detail || '')}</p>
    <ol class="lb-other-steps" data-lb-other-steps>${type.steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol>
    <p class="lb-other-note">“其他”只使用本地咖啡种类与制作步骤，不显示手冲参数，不调用 BrewProfiles 手冲计算，也不启动手冲倒计时。</p>`;
}

function updatePanel(panel, value) {
  const type = resolveCoffeeType(value);
  if (!type) return;
  const select = $('[data-lb-other-coffee]', panel);
  if (select && select.value !== type.key) select.value = type.key;
  if (panel.dataset.lbRenderedType === type.key) return;
  panel.dataset.lbRenderedType = type.key;
  $('[data-lb-other-base]', panel).textContent = type.base;
  $('[data-lb-other-additions]', panel).textContent = type.additions;
  $('[data-lb-other-detail]', panel).textContent = type.detail || '';
  $('[data-lb-other-steps]', panel).innerHTML = type.steps.map(step => `<li>${esc(step)}</li>`).join('');
}

function clearLegacyDisabledState(root) {
  root.querySelectorAll('.lb-disabled-for-method').forEach(node => node.classList.remove('lb-disabled-for-method'));
  root.querySelector('[data-lb-local-recipe]')?.remove();
}

async function render() {
  if (rendering) return;
  const root = $('#brewContent');
  if (!root) return;
  rendering = true;
  try {
    injectStyle();
    const { mode, coffeeType } = await readState();
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
      panel.innerHTML = panelHtml(resolved);
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
        await saveState(next, selected);
        await render();
      });
    }
    const select = $('[data-lb-other-coffee]', panel);
    if (select && select.dataset.lbBound !== '1') {
      select.dataset.lbBound = '1';
      select.addEventListener('change', async () => {
        updatePanel(panel, select.value);
        await saveState('other', select.value);
      });
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

globalThis.LuckyBeanBrewMode124B = { render, resolveCoffeeType };
