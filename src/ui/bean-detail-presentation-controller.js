import { get } from '../db.js';
import { loadCodebook, makeIndex, displayName } from '../codebook.js';
import { buildBeanDetailProjection } from '../domain/beans/bean-display-projection.js';

const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const $$ = (selector, root = document) => root?.querySelectorAll ? [...root.querySelectorAll(selector)] : [];
const ROAST_LABELS = Object.freeze({ 'RL-L0':'极浅烘','RL-L1':'浅烘','RL-L2':'浅中烘','RL-L3':'中烘','RL-L4':'中深烘','RL-L5':'深烘','RL-L6':'极深烘' });
const DUPLICATE_DETAIL_LABELS = new Set(['国家','产区','处理法','产季','烘焙日期','烘焙度','烘焙色值','色值']);
let lastBeanId = '';
let codebookPromise;
let decorating = false;

async function codebookIndex() {
  if (!codebookPromise) codebookPromise = loadCodebook().then(result => makeIndex(result.data));
  return codebookPromise;
}
function label(index, table, code, fallback = '') { return code ? displayName(index, table, code, fallback || code) : fallback; }
function facts(bean, index) {
  return {
    country:label(index, 'countries', bean.countryCode, bean.countryName || bean.country || ''),
    region:label(index, 'regions', bean.regionCode, bean.regionName || bean.region || ''),
    entity:label(index, 'entities', bean.entityCode, bean.entityName || bean.entity || bean.processingStation || ''),
    variety:label(index, 'varieties', bean.varietyCode, bean.varietyName || bean.variety || ''),
    process:label(index, 'processes', bean.processCode, bean.processName || bean.process || ''),
    roast:ROAST_LABELS[bean.roastCode] || bean.roastName || bean.roast || ''
  };
}
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char])); }
function valueRow(values = []) {
  const clean = values.map(value => String(value || '').trim()).filter(Boolean);
  return clean.length ? `<div class="p2-bean-detail-values">${esc(clean.join('\u00a0/\u00a0'))}</div>` : '';
}
function stripDuplicateLegacyFacts(overlay) {
  const factSheet = $('.p2-bean-fact-sheet', overlay);
  const flavorHost = $('.detail-tags', overlay);
  if (flavorHost) {
    flavorHost.dataset.p2FlavorOnly = '1';
    $$('h2,h3,h4,h5,label,dt,.detail-label,.meta-label', flavorHost).forEach(node => {
      if (String(node.textContent || '').trim() === '风味') node.remove();
    });
  }
  const labelCandidates = $$('label,dt,small,.detail-label,.meta-label,.bean-detail-label', overlay);
  for (const node of labelCandidates) {
    if (node.closest('.p2-bean-fact-sheet')) continue;
    const text = String(node.textContent || '').trim();
    if (!DUPLICATE_DETAIL_LABELS.has(text)) continue;
    const row = node.closest('.bean-detail-row,.detail-row,.metadata-row,.meta-row,.field-row,li') || node.parentElement;
    if (!row || row === factSheet || row === flavorHost || row.contains(flavorHost) || row.contains(factSheet)) continue;
    if (String(row.textContent || '').trim().length <= 120) row.remove();
  }
}
async function decorate() {
  if (decorating) return;
  const overlay = $('#overlayRoot [data-overlay="bean-detail"]');
  if (!overlay || overlay.dataset.p2DetailProjected === '1' || !lastBeanId) return;
  decorating = true;
  try {
    const [bean, index] = await Promise.all([get('beans', lastBeanId), codebookIndex()]);
    if (!bean || !overlay.isConnected) return;
    const view = buildBeanDetailProjection(bean, facts(bean, index));
    const header = $('.dialog-header', overlay);
    const heading = $('h2', header);
    const subtitle = $('p', header);
    if (heading && view.primary.length) heading.textContent = view.primary.join(' \\ ');
    if (subtitle) {
      subtitle.textContent = view.secondary.join('   ');
      subtitle.hidden = !view.secondary.length;
    }
    if (!overlay.querySelector('.p2-bean-fact-sheet')) {
      const sheet = document.createElement('section');
      sheet.className = 'p2-bean-fact-sheet';
      sheet.dataset.beanDetailFacts = 'content-only';
      sheet.innerHTML = `${valueRow(view.origin)}${valueRow(view.roast)}`;
      header?.insertAdjacentElement('afterend', sheet);
    }
    const management = $('.management-stack', overlay);
    const edit = $('#editBeanBtn', overlay);
    const storage = $('#toggleColdBtn', overlay);
    const archive = $('#archiveBeanBtn', overlay);
    const remove = $('#deleteBeanBtn', overlay);
    const correct = $('#correctWeightBtn', overlay);
    const secondary = $('.detail-actions', overlay);
    if (management && edit && storage && archive && remove) {
      edit.textContent = '编辑';
      storage.dataset.originalLabel = storage.textContent || '';
      storage.textContent = '储存';
      storage.title = bean.refrigerated ? '当前冷藏；点击切换储存状态' : '当前常温；点击切换储存状态';
      archive.textContent = bean.archived ? '恢复' : '溯旧';
      remove.textContent = '删除';
      management.replaceChildren(edit, storage, archive, remove);
      if (correct && secondary) { correct.textContent = '修正克重'; secondary.append(correct); }
    }
    stripDuplicateLegacyFacts(overlay);
    overlay.dataset.p2DetailProjected = '1';
  } finally { decorating = false; }
}
document.addEventListener('click', event => {
  if (event.target.closest?.('[data-brew-bean]')) return;
  const card = event.target.closest?.('.bean-card[data-bean-id],[data-bean-id]');
  if (!card) return;
  const id = String(card.dataset.beanId || '');
  if (id) { lastBeanId = id; globalThis.__lbLastBeanId = id; }
}, true);
const root = $('#overlayRoot');
if (root) new MutationObserver(() => { decorate().catch(error => console.warn('豆卡详情展示投影失败', error)); }).observe(root, { childList:true, subtree:true });
globalThis.LuckyBeanBeanDetailPresentation = { refresh:decorate, get beanId(){ return lastBeanId; } };
