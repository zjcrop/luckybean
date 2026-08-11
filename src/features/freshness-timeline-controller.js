import { all, getSetting, setSetting } from '../db.js';
import { clamp, freshnessProfile } from '../utils.js';

const MODE_KEY = 'v099i.group.mode';
const MODE_RATIO = 'freshness-ratio';
const STAGES = ['养豆中', '味正盛', '味将尽'];
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

let currentMode = '';
let activeStage = '';
let queued = false;
let rendering = false;
let beanMap = new Map();

function injectStyle() {
  if ($('#lbFreshnessTimelineStyle')) return;
  const style = document.createElement('style');
  style.id = 'lbFreshnessTimelineStyle';
  style.textContent = `
    .bean-card.compact.lb-one-line-bean{position:relative!important;min-height:46px!important;height:46px!important;padding:5px 7px 9px 10px!important}
    .bean-card.compact.lb-one-line-bean .bean-freshness-progress{display:block!important;position:absolute!important;left:10px!important;right:7px!important;bottom:2px!important;height:4px!important;pointer-events:none!important}
    .bean-card.compact.lb-one-line-bean .bean-freshness-solid{display:block!important;position:absolute!important;left:0!important;top:0!important;bottom:0!important;border-radius:999px!important;min-width:0!important}
    .bean-card.compact.lb-one-line-bean .bean-freshness-dashed{display:block!important;position:absolute!important;right:0!important;top:1px!important;height:2px!important;border-top:2px dashed #343434!important}
    html[data-theme="light"] .bean-card.compact.lb-one-line-bean .bean-freshness-dashed{border-top-color:#c9c6bd!important}
    .lb-freshness-note{margin:0 0 12px;color:var(--muted);font-size:11px;line-height:1.6}
    #beanGroups[data-lb-freshness-group="1"] .group-card{min-height:58px!important}
  `;
  document.head.append(style);
}

function ratioFor(bean) {
  return clamp(Number(freshnessProfile(bean).progress || 0), 0, 1);
}

function stageFor(bean) {
  const ratio = ratioFor(bean);
  if (ratio < 1 / 3) return STAGES[0];
  if (ratio < 2 / 3) return STAGES[1];
  return STAGES[2];
}

function timelineHtml(bean) {
  const profile = freshnessProfile(bean);
  const ratio = ratioFor(bean);
  const progress = Math.round(ratio * 1000) / 10;
  return `<div class="bean-freshness-progress" data-lb-freshness-timeline aria-label="${esc(profile.label)}，风味${esc(profile.trend)}，时间轴${progress}%"><span class="bean-freshness-solid" style="width:${progress}%;background:${profile.color}"></span><span class="bean-freshness-dashed" style="left:${progress}%"></span></div>`;
}

async function refreshBeanMap() {
  const beans = await all('beans').catch(() => []);
  beanMap = new Map(beans.map(bean => [String(bean.id), bean]));
  return beans;
}

async function decorateCards() {
  if (!beanMap.size) await refreshBeanMap();
  $$('.bean-card.lb-one-line-bean[data-bean-id]').forEach(card => {
    const bean = beanMap.get(String(card.dataset.beanId || ''));
    if (!bean) return;
    const profile = freshnessProfile(bean);
    const ratio = ratioFor(bean);
    const progress = Math.round(ratio * 1000) / 10;
    const existing = $('[data-lb-freshness-timeline]', card);
    const signature = `${progress}:${profile.color}:${profile.label}:${profile.trend}`;
    if (existing?.dataset.lbFreshnessSignature === signature) return;
    existing?.remove();
    card.insertAdjacentHTML('beforeend', timelineHtml(bean));
    const inserted = $('[data-lb-freshness-timeline]', card);
    if (inserted) inserted.dataset.lbFreshnessSignature = signature;
  });
}

async function mode() {
  if (!currentMode) currentMode = await getSetting(MODE_KEY, 'native');
  return currentMode;
}

function injectGroupOption() {
  $$('.popup-menu').forEach(menu => {
    if (!menu.querySelector('[data-group-method]')) return;
    let button = menu.querySelector('[data-lb-freshness-group-option]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.lbFreshnessGroupOption = '1';
      menu.append(button);
    }
    button.textContent = `按赏味期阶段${currentMode === MODE_RATIO ? ' ✓' : ''}`;
  });
}

function placeholderCard(bean) {
  return `<article class="bean-card compact" data-bean-id="${esc(bean.id)}" tabindex="0"></article>`;
}

async function renderFreshnessGroups() {
  if (rendering || await mode() !== MODE_RATIO) return;
  const page = $('#pageBeans.active');
  const container = $('#beanGroups');
  if (!page || !container) return;
  rendering = true;
  try {
    const beans = await refreshBeanMap();
    const active = beans
      .filter(bean => !bean.archived && Number(bean.remainingWeight) > 0)
      .sort((a, b) => String(b.roastDate || '').localeCompare(String(a.roastDate || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const groups = new Map(STAGES.map(stage => [stage, []]));
    active.forEach(bean => groups.get(stageFor(bean)).push(bean));
    container.dataset.lbFreshnessGroup = '1';

    if (!active.length) {
      container.innerHTML = '<div data-lb-freshness-root class="empty-state"><strong>没有可分组的豆卡</strong></div>';
      return;
    }

    if (!activeStage) {
      container.innerHTML = `<section data-lb-freshness-root><div class="lb-freshness-note">按豆卡下方赏味时间轴的填充长度分组：不足 1/3 为“养豆中”，1/3 至不足 2/3 为“味正盛”，达到 2/3 为“味将尽”。颜色与长度继续使用原 freshnessProfile 数据。</div><div class="bean-grid compact-grid group-grid">${STAGES.map(stage => {
        const items = groups.get(stage) || [];
        const total = items.reduce((sum, bean) => sum + Number(bean.remainingWeight || 0), 0);
        return `<button class="group-card" type="button" data-lb-freshness-stage="${esc(stage)}"><span>${esc(stage)}</span><small>${items.length}只 · ${total.toFixed(1)}g</small></button>`;
      }).join('')}</div></section>`;
      return;
    }

    const items = groups.get(activeStage) || [];
    container.innerHTML = `<section data-lb-freshness-root class="active-group-panel"><div class="active-group-title"><span>${esc(activeStage)}</span><small>${items.length}只 · 烘焙日期由新到旧</small></div><div class="bean-grid compact-grid">${items.map(placeholderCard).join('') || '<p class="muted">该阶段没有豆卡</p>'}</div><div class="group-collapse-zone"><button class="group-collapse" type="button" data-lb-freshness-back>收</button></div></section>`;
  } finally {
    rendering = false;
    queue();
  }
}

async function selectFreshnessMode() {
  currentMode = MODE_RATIO;
  activeStage = '';
  await setSetting(MODE_KEY, MODE_RATIO);
  $$('.popup-menu').forEach(node => node.remove());
  await renderFreshnessGroups();
}

async function selectNativeMode() {
  if (currentMode === 'native') return;
  currentMode = 'native';
  activeStage = '';
  await setSetting(MODE_KEY, 'native');
  const container = $('#beanGroups');
  if (container) delete container.dataset.lbFreshnessGroup;
}

function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => requestAnimationFrame(async () => {
    queued = false;
    injectStyle();
    await decorateCards();
    injectGroupOption();
    if (currentMode === MODE_RATIO && !$('#beanGroups [data-lb-freshness-root]')) await renderFreshnessGroups();
  }));
}

document.addEventListener('click', event => {
  const freshness = event.target.closest?.('[data-lb-freshness-group-option]');
  if (freshness) {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    selectFreshnessMode().catch(error => console.warn('赏味期分组切换失败', error));
    return;
  }

  const stage = event.target.closest?.('[data-lb-freshness-stage]');
  if (stage) {
    event.preventDefault();
    event.stopImmediatePropagation();
    activeStage = stage.dataset.lbFreshnessStage || '';
    renderFreshnessGroups().catch(error => console.warn('赏味期阶段展开失败', error));
    return;
  }

  const back = event.target.closest?.('[data-lb-freshness-back]');
  if (back) {
    event.preventDefault();
    event.stopImmediatePropagation();
    activeStage = '';
    renderFreshnessGroups().catch(error => console.warn('赏味期阶段收起失败', error));
    return;
  }

  if (event.target.closest?.('[data-group-method]')) selectNativeMode().catch(() => {});
  if (event.target.closest?.('#groupBtn,[data-page-target="beans"]')) setTimeout(queue, 20);
}, true);

new MutationObserver(records => {
  const relevant = records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (
    node.matches?.('.bean-card,.popup-menu,#beanGroups') || node.querySelector?.('.bean-card,.popup-menu,#beanGroups')
  )));
  if (relevant) queue();
}).observe(document.body, { childList: true, subtree: true });

document.addEventListener('luckybean:app-refreshed', async () => {
  await refreshBeanMap();
  if (await mode() === MODE_RATIO) await renderFreshnessGroups();
  queue();
});

document.addEventListener('luckybean:codebook-provider-activated', queue);

(async () => {
  injectStyle();
  await refreshBeanMap();
  await mode();
  if (currentMode === MODE_RATIO) await renderFreshnessGroups();
  queue();
})();

globalThis.LuckyBeanFreshnessTimeline = { ratioFor, stageFor, render: renderFreshnessGroups, refresh: queue };
