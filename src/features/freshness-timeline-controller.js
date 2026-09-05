import { all } from '../db.js';
import { clamp, freshnessProfile } from '../utils.js';

const STAGES = ['养豆中', '味正盛', '味将尽'];
const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const $$ = (selector, root = document) => root?.querySelectorAll ? [...root.querySelectorAll(selector)] : [];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

let beanMap = new Map();
let beanObserver = null;
let refreshBusy = false;

function ratioFor(bean) { return clamp(Number(freshnessProfile(bean).progress || 0), 0, 1); }
function stageFor(bean) {
  const ratio = ratioFor(bean);
  if (ratio < 1 / 3) return STAGES[0];
  if (ratio < 2 / 3) return STAGES[1];
  return STAGES[2];
}
function timelineHtml(bean) {
  const profile = freshnessProfile(bean);
  const progress = Math.round(ratioFor(bean) * 1000) / 10;
  return `<div class="bean-freshness-progress" data-lb-freshness-timeline aria-label="${esc(profile.label)}，风味${esc(profile.trend)}，时间轴${progress}%"><span class="bean-freshness-solid" style="width:${progress}%;background:${profile.color}"></span><span class="bean-freshness-dashed" style="left:${progress}%"></span></div>`;
}
async function refreshBeanMap() {
  const beans = await all('beanSummaries').catch(() => []);
  beanMap = new Map(beans.map(bean => [String(bean.id), bean]));
}
function decorateCard(card) {
  if (!card?.matches?.('.bean-card.lb-one-line-bean[data-bean-id]')) return;
  const bean = beanMap.get(String(card.dataset.beanId || ''));
  if (!bean) return;
  const profile = freshnessProfile(bean);
  const progress = Math.round(ratioFor(bean) * 1000) / 10;
  const signature = `${progress}:${profile.color}:${profile.label}:${profile.trend}`;
  const existing = $('[data-lb-freshness-timeline]', card);
  if (existing?.dataset.lbFreshnessSignature === signature) return;
  existing?.remove();
  card.insertAdjacentHTML('beforeend', timelineHtml(bean));
  const inserted = $('[data-lb-freshness-timeline]', card);
  if (inserted) inserted.dataset.lbFreshnessSignature = signature;
}
function decorateCards() {
  const root = $('#beanGroups');
  if (!root) return;
  $$('.bean-card.lb-one-line-bean[data-bean-id]', root).forEach(decorateCard);
}
async function refreshTimelineCards() {
  // Use the already-cached bean map first so reopening 豆藏 never waits on IndexedDB.
  // Then refresh the cache and reconcile once more in case data changed.
  decorateCards();
  if (refreshBusy) return;
  refreshBusy = true;
  try {
    await refreshBeanMap();
    decorateCards();
  } finally {
    refreshBusy = false;
  }
}
function handleMutations(records) {
  for (const record of records) {
    const targetCard = record.target?.nodeType === 1 ? record.target.closest?.('.bean-card.lb-one-line-bean[data-bean-id]') : null;
    if (targetCard) decorateCard(targetCard);
    for (const node of record.addedNodes || []) {
      if (node.nodeType !== 1) continue;
      if (node.matches?.('.bean-card.lb-one-line-bean[data-bean-id]')) decorateCard(node);
      node.querySelectorAll?.('.bean-card.lb-one-line-bean[data-bean-id]').forEach(decorateCard);
    }
  }
}
function bindContainerObserver() {
  const root = $('#beanGroups');
  if (!root || beanObserver) return;
  beanObserver = new MutationObserver(handleMutations);
  beanObserver.observe(root, { childList:true, subtree:true });
}

document.addEventListener('click', event => {
  if (event.target.closest?.('#groupBtn,[data-page-target="beans"],[data-lb-freshness-stage],[data-group-back]')) decorateCards();
}, true);
document.addEventListener('luckybean:app-refreshed', refreshTimelineCards);
document.addEventListener('luckybean:data-changed', refreshTimelineCards);
document.addEventListener('luckybean:codebook-provider-activated', decorateCards);

(async () => {
  await refreshBeanMap();
  bindContainerObserver();
  decorateCards();
})();

globalThis.LuckyBeanFreshnessTimeline = { ratioFor, stageFor, render:refreshTimelineCards, refresh:decorateCards };
