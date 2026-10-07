import { all } from '../db.js';
import { compactVarietyLabel } from '../domain/beans/bean-display-projection.js';

const VERSION = 'full-integration/1.5';
const COUNTRY = new Map([
  ['埃塞俄比亚','埃塞'], ['Ethiopia','埃塞'], ['巴拿马','巴拿马'], ['Panama','巴拿马'],
  ['肯尼亚','肯尼亚'], ['Kenya','肯尼亚'], ['哥斯达黎加','哥达'], ['Costa Rica','哥达'],
  ['哥伦比亚','哥伦'], ['Colombia','哥伦'], ['危地马拉','危地'], ['Guatemala','危地'],
  ['印度尼西亚','印尼'], ['Indonesia','印尼']
]);
const STATION = new Map([
  ['Chelbesa Washing Station','CHL'], ['Chelbesa','CHL'], ['Janson','JAN'],
  ['Janson Coffee Farm','JAN'], ['Hambela','HAM'], ['Konga','KON']
]);
const VARIETY = new Map([
  ['Geisha','瑰夏'], ['Gesha','瑰夏'], ['瑰夏','瑰夏'], ['Bourbon','波旁'],
  ['波旁','波旁'], ['Typica','铁皮'], ['铁皮卡','铁皮']
]);
const ROAST = { 'RL-L0':'极浅', 'RL-L1':'浅', 'RL-L2':'中浅', 'RL-L3':'中', 'RL-L4':'中深', 'RL-L5':'深', 'RL-L6':'深' };
const PROCESS = [[/dark\s*room\s*washed|暗房水洗/i,'暗水'], [/washed|水洗/i,'水洗'], [/natural|日晒/i,'日晒'], [/anaerobic|厌氧/i,'厌氧'], [/honey|蜜/i,'蜜处']];
const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const $$ = (selector, root = document) => root?.querySelectorAll ? [...root.querySelectorAll(selector)] : [];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

let displayIndex = null;
let beanMap = new Map();
let latestPlan = null;
let renderQueued = false;
let beanObserver = null;

const code = (table, id, fallback = '') => displayIndex?.[table]?.[id] || fallback;
const notify = (message, kind = 'status-good') => document.dispatchEvent(new CustomEvent('luckybean:user-notice', { detail: { message, kind } }));

function shortCountry(value) {
  const text = String(value || '').trim();
  if (!text) return '未定';
  if (COUNTRY.has(text)) return COUNTRY.get(text);
  if (/^[A-Za-z .'-]+$/.test(text)) return text.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  return [...text].length <= 3 ? text : `${[...text].slice(0, 2).join('')}…`;
}
function shortStation(value) {
  const text = String(value || '').trim();
  if (!text || text === '—') return '';
  if (STATION.has(text)) return STATION.get(text);
  const latin = text.normalize('NFKD').replace(/[^A-Za-z]/g, '').toUpperCase();
  return latin.length >= 3 ? latin.slice(0, 3) : [...text].slice(0, 3).join('');
}
function shortVariety(value) {
  const text = compactVarietyLabel(value);
  if (!text) return '未定';
  if (/^\d{3,}$/.test(text) || /^SL\s*\d+$/i.test(text)) return text.replace(/\s+/g, '').toUpperCase();
  return VARIETY.get(text) || ([...text].length <= 4 ? text : [...text].slice(0, 4).join(''));
}
function shortProcess(value) {
  const text = String(value || '').trim();
  if (!text) return '未定';
  for (const [regex, label] of PROCESS) if (regex.test(text)) return label;
  return [...text].length <= 3 ? text : [...text].slice(0, 2).join('');
}
function readable(value) {
  const text = String(value || '').trim();
  return text && text !== '—' && !/^未定/.test(text) ? text : '';
}
function beanNameParts(bean) {
  return String(bean?.name || '').split(/\s*[·•｜|]\s*/).map(readable).filter(Boolean);
}
function parts(bean) {
  const named = beanNameParts(bean);
  const country = shortCountry(code('countries', bean.countryCode, readable(bean.countryName) || readable(bean.country) || named[0] || ''));
  const station = shortStation(code('entities', bean.entityCode, readable(bean.entityName) || readable(bean.entity) || readable(bean.processingStation) || ''));
  const variety = shortVariety(code('varieties', bean.varietyCode, readable(bean.varietyName) || readable(bean.variety) || named[1] || ''));
  const roast = ROAST[String(bean.roastCode || '').toUpperCase()] || String(code('roasts', bean.roastCode, readable(bean.roastName) || readable(bean.roast) || '中')).replace(/烘焙|烘/g, '').slice(0, 2);
  const process = shortProcess(code('processes', bean.processCode, readable(bean.processName) || readable(bean.process) || ''));
  const remaining = Math.max(0, Number(bean.remainingWeight || 0));
  return { country, station, variety, roast, process, remaining: `${remaining.toFixed(remaining % 1 ? 1 : 0)}g` };
}

function transformCard(card) {
  const bean = beanMap.get(String(card?.dataset?.beanId || ''));
  if (!bean) return;
  const value = parts(bean);
  const roaster = readable(bean.roasterName || bean.roaster);
  const brand = readable(bean.productName || bean.brand || bean.product || bean.commercialName);
  const primary = [roaster, value.country, value.station, value.variety].filter(Boolean).join('/');
  const secondary = [value.roast, value.process, value.remaining].join('/');
  const signature = `${primary}/${secondary}/${brand}`;
  if (card.dataset.lbSignature === signature && card.classList.contains('lb-one-line-bean')) return;
  card.dataset.lbSignature = signature;
  card.classList.add('lb-one-line-bean');
  card.innerHTML = `<span class="bean-thumbnail-shell"><img class="bean-thumbnail" data-bean-thumbnail="${esc(bean.id)}" alt="豆袋缩略图" loading="lazy" hidden><span class="bean-thumbnail-fallback" aria-hidden="true"></span></span><div class="lb-bean-line" title="${esc([roaster, brand].filter(Boolean).join(' · '))}" aria-label="${esc(signature)}"><span class="lb-bean-primary">${esc(primary)}</span><span class="lb-bean-secondary">/${esc(secondary)}</span></div><button class="cup-action compact-pick lb-brew-circle" type="button" data-brew-bean="${esc(bean.id)}" aria-label="用这只豆小酌">酌</button>`;
}

function transformCards() {
  renderQueued = false;
  $$('.bean-card[data-bean-id]', $('#beanGroups') || document).forEach(transformCard);
}
function queueCardRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(transformCards);
}
async function refreshBeans() {
  beanMap = new Map((await all('beanSummaries').catch(() => [])).map(bean => [String(bean.id), bean]));
  queueCardRender();
}

function effectHtml(plan) {
  const matching = plan?.matching;
  const add = matching?.profileEffect?.add;
  if (!Array.isArray(add) || add.length !== 8) return '';
  const labels = ['酸','甜','香','体','苦','净','酵','余'];
  const key = `${matching.selectedProfileId}:${matching.score}`;
  return `<div class="lb-profile-effect" data-lb-profile-effect data-match-key="${esc(key)}"><strong>方案倾向</strong><div>${add.map((value, index) => {
    const number = Number(value || 0);
    const arrow = number > 1 ? '↑' : number < -1 ? '↓' : '→';
    return `<span><b>${labels[index]}</b>${arrow}<small>${number > 0 ? '+' : ''}${number}</small></span>`;
  }).join('')}</div><small>匹配 ${Number(matching.score || 0).toFixed(1)} · ${esc(matching.selectedProfileId || '')}</small></div>`;
}
function ensurePlanEffect() {
  if (!latestPlan) return;
  const host = $('#generatedPlan');
  const html = effectHtml(latestPlan);
  if (!host || !html) return;
  const key = `${latestPlan.matching?.selectedProfileId}:${latestPlan.matching?.score}`;
  const existing = $('[data-lb-profile-effect]', host);
  if (existing?.dataset.matchKey === key) return;
  existing?.remove();
  host.insertAdjacentHTML('afterbegin', html);
}

function mobileWeb() {
  return !globalThis.__LUCKYBEAN_ANDROID__ && navigator.maxTouchPoints > 0 && globalThis.matchMedia?.('(pointer: coarse)')?.matches && (/Android|iPhone|iPad|Mobile|HarmonyOS/i.test(navigator.userAgent) || innerWidth <= 1024);
}
function requestFullscreenForBrew() {
  if (!mobileWeb() || document.fullscreenElement) return;
  const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
  try { request?.call(document.documentElement, { navigationUI: 'hide' })?.catch?.(() => {}); } catch {}
}
function bindFullscreen() {
  document.addEventListener('click', event => {
    if (event.target.closest?.('#confirmBrewPreparedBtn')) requestFullscreenForBrew();
  }, true);
}

function bindEvents() {
  document.addEventListener('luckybean:data-changed', async event => {
    await refreshBeans();
    if (event.detail?.autoArchived) notify('这支咖啡豆剩余不足5g，已自动移至“溯旧”。');
  });
  document.addEventListener('luckybean:app-refreshed', refreshBeans);
  document.addEventListener('luckybean:plan-ready', event => {
    latestPlan = event.detail?.plan || null;
    if (!latestPlan) return;
    requestAnimationFrame(ensurePlanEffect);
  });
}

function bindBeanContainerObserver() {
  const root = $('#beanGroups');
  if (!root || beanObserver) return;
  beanObserver = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches?.('.bean-card[data-bean-id]') || node.querySelector?.('.bean-card[data-bean-id]'))))) queueCardRender();
  });
  beanObserver.observe(root, { childList: true, subtree: true });
}

async function init() {
  try {
    const response = await fetch(new URL('../../public/bean-display-index.json', import.meta.url), { cache: 'force-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const candidate = await response.json();
    if (candidate?.format !== 'luckybean-bean-display-index-v1') throw new Error('轻量显示索引格式不兼容');
    displayIndex = candidate;
  } catch (error) {
    console.warn('轻量简称索引加载失败', error);
    displayIndex = {};
  }
  await refreshBeans();
  bindBeanContainerObserver();
  bindFullscreen();
  bindEvents();
  queueCardRender();
  document.documentElement.dataset.fullIntegration = VERSION;
}

if (document.documentElement.dataset.startup === 'ready') init();
else document.addEventListener('luckybean:local-app-ready', init, { once:true });
