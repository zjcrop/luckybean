import { all } from '../db.js';
import { loadCodebook, makeIndex, displayName } from '../codebook.js';
import { buildBeanCardProjection } from '../domain/beans/bean-display-projection.js';

const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const $$ = (selector, root = document) => [...(root?.querySelectorAll?.(selector) || [])];
const ROAST_LABELS = Object.freeze({ 'RL-L0':'极浅烘','RL-L1':'浅烘','RL-L2':'浅中烘','RL-L3':'中烘','RL-L4':'中深烘','RL-L5':'深烘','RL-L6':'极深烘' });
let codebookPromise;
let cache = null;
let scheduled = false;
let applying = false;

async function codebookIndex() {
  if (!codebookPromise) codebookPromise = loadCodebook().then(result => makeIndex(result.data));
  return codebookPromise;
}
function label(index, table, code, fallback = '') {
  return code ? displayName(index, table, code, fallback || code) : fallback;
}
function facts(bean, index) {
  return {
    country:label(index, 'countries', bean.countryCode, bean.countryName || bean.countryLabel || ''),
    region:label(index, 'regions', bean.regionCode, bean.regionName || ''),
    entity:label(index, 'entities', bean.entityCode, bean.entityName || ''),
    variety:label(index, 'varieties', bean.varietyCode, bean.varietyName || bean.varietyLabel || ''),
    process:label(index, 'processes', bean.processCode, bean.processName || ''),
    roast:ROAST_LABELS[bean.roastCode] || bean.roastName || ''
  };
}
async function summaries() {
  if (cache) return cache;
  const [rows, index] = await Promise.all([all('beanSummaries'), codebookIndex()]);
  cache = { index, map:new Map(rows.map(bean => [String(bean.id), bean])) };
  return cache;
}
function projectCard(card, bean, index) {
  const view = buildBeanCardProjection(bean, facts(bean, index));
  const copy = $('.compact-bean-copy', card);
  const title = $('h3', copy);
  if (!copy || !title || !view.left.length) return;
  title.classList.add('p2-bean-card-meta');
  title.innerHTML = `<span>${view.left.join(' / ')}</span><span>${view.right.join(' / ')}</span>`;
  const legacyProcess = $('small:not(.frozen-mark)', copy);
  if (legacyProcess) legacyProcess.hidden = true;
  const legacyWeight = $('.compact-bean-row > strong', copy);
  if (legacyWeight) legacyWeight.hidden = true;
  card.dataset.p2CardProjected = '1';
  card.setAttribute('aria-label', `${view.left.join('，')}；${view.right.join('，')}`);
}
async function apply() {
  if (applying) return;
  scheduled = false; applying = true;
  try {
    const root = $('#beanGroups');
    if (!root) return;
    const cards = $$('.bean-card[data-bean-id]', root);
    if (!cards.length) return;
    const { map, index } = await summaries();
    cards.forEach(card => {
      const bean = map.get(String(card.dataset.beanId || ''));
      if (bean) projectCard(card, bean, index);
    });
  } finally { applying = false; }
}
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => apply().catch(error => console.warn('豆卡展示投影失败', error)));
}
function installObserver() {
  const root = $('#beanGroups');
  if (!root) return;
  new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.type === 'childList')) schedule();
  }).observe(root, { childList:true, subtree:true });
  schedule();
}
document.addEventListener('luckybean:data-changed', () => { cache = null; schedule(); });
document.addEventListener('luckybean:request-app-refresh', () => { cache = null; schedule(); });
document.addEventListener('luckybean:bean-group-opened', schedule);
installObserver();
globalThis.LuckyBeanBeanCardPresentation = { refresh:schedule };
