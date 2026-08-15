import { all } from '../db.js';
import { loadCodebook, makeIndex, displayName } from '../codebook.js';

const VERSION = 'full-integration/1.4';
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

let index = null;
let beanMap = new Map();
let latestPlan = null;
let wakeLock = null;
let nativeExecutionActive = false;
let renderQueued = false;
let beanObserver = null;

const code = (table, id, fallback = '') => index ? displayName(index, table, id, fallback) : fallback;
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
  const text = String(value || '').trim();
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
  const primary = [value.country, value.station, value.variety].filter(Boolean).join('/');
  const secondary = [value.roast, value.process, value.remaining].join('/');
  const signature = `${primary}/${secondary}`;
  if (card.dataset.lbSignature === signature && card.classList.contains('lb-one-line-bean')) return;
  card.dataset.lbSignature = signature;
  card.classList.add('lb-one-line-bean');
  card.innerHTML = `<div class="lb-bean-line" aria-label="${esc(signature)}"><span class="lb-bean-primary">${esc(primary)}</span><span class="lb-bean-secondary">/${esc(secondary)}</span></div><button class="cup-action compact-pick lb-brew-circle" type="button" data-brew-bean="${esc(bean.id)}" aria-label="用这只豆小酌">酌</button>`;
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
  beanMap = new Map((await all('beans').catch(() => [])).map(bean => [String(bean.id), bean]));
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
async function acquireWake() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch { wakeLock = null; }
}
async function releaseWake() {
  try { await wakeLock?.release?.(); } catch {}
  wakeLock = null;
}
function stagesOf(plan) {
  let cursor = 0;
  return (Array.isArray(plan?.stages) ? plan.stages : []).map((stage, index) => {
    let start = Number(stage.startSec ?? stage.start);
    let end = Number(stage.end);
    if (!Number.isFinite(start)) start = cursor;
    let duration = Number(stage.durationSec);
    if (!Number.isFinite(duration) || duration <= 0) duration = Number.isFinite(end) && end > start ? end - start : .1;
    if (!Number.isFinite(end) || end <= start) end = start + duration;
    cursor = end;
    return {
      index, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), name: String(stage.name || `第${index + 1}段`),
      waterG: Number(stage.stageWaterG ?? stage.pour ?? 0), cumulativeWaterG: Number(stage.cumulativeWaterG ?? stage.cumulative ?? 0),
      temperatureC: Number(stage.temperatureC ?? stage.pourTemperature ?? 90), method: String(stage.method || '')
    };
  });
}
function speechOf(plan) {
  const stages = stagesOf(plan);
  const events = [];
  stages.forEach((stage, index) => {
    if (index > 0) {
      events.push({ id:`stage-${index + 1}-prepare`, atMs:Math.max(0, stage.startMs - 8000), text:`准备第${index + 1}段，${Math.round(stage.waterG)}克，${Math.round(stage.temperatureC)}度`, priority:'high', validWindowMs:3000 });
      events.push({ id:`stage-${index + 1}-countdown`, atMs:Math.max(0, stage.startMs - 3200), text:'三，二，一', priority:'critical', validWindowMs:1200, fixedKey:'countdown_321' });
    }
    events.push({ id:`stage-${index + 1}-start`, atMs:stage.startMs, text:`第${index + 1}段，${stage.name}，注水${Math.round(stage.waterG)}克，累计${Math.round(stage.cumulativeWaterG)}克，水温${Math.round(stage.temperatureC)}度，${stage.method}`, priority:'critical', validWindowMs:4500 });
  });
  (plan?.executionActions || []).filter(action => action.phase === 'timed' && action.type !== 'hot-pour' && Number.isFinite(Number(action.atSec))).forEach((action,index) => {
    const atMs = Math.max(0, Math.round(Number(action.atSec) * 1000));
    const amount = Number(action.amountG || 0);
    const text = String(action.speech || `${action.type === 'add-ice' ? '加入冰块' : '执行下一步'}${amount > 0 ? `${Math.round(amount)}克` : ''}`);
    events.push({ id:`action-${index + 1}-prepare`, atMs:Math.max(0,atMs-8000), text:`准备：${text}`, priority:'high', validWindowMs:3000 });
    events.push({ id:`action-${index + 1}-start`, atMs, text, priority:'critical', validWindowMs:5000 });
  });
  events.sort((a,b)=>a.atMs-b.atMs || a.id.localeCompare(b.id));
  const totalMs = stages.at(-1)?.endMs || 0;
  const finish = (plan?.executionActions || []).filter(action => action.phase === 'after-brew' && action.speech).map(action => action.speech).join('');
  events.push({ id:'brew-complete', atMs:totalMs, text:finish || '冲煮完成', priority:'critical', validWindowMs:8000, fixedKey:finish ? '' : 'brew_complete' });
  return { contract:'luckybean-speech-timeline/1.0', voicePack:'zh_CN_v1', totalMs, events };
}
function nativePayload(plan) {
  return JSON.stringify({ contract:'luckybean-brew-execution/1.0', version:1, stages:stagesOf(plan), speech:speechOf(plan) });
}
function prepareNative(plan) {
  if (!globalThis.__LUCKYBEAN_ANDROID__ || typeof globalThis.LuckyBeanNative?.prepareBrewExecution !== 'function') return;
  try { globalThis.LuckyBeanNative.prepareBrewExecution(nativePayload(plan)); } catch (error) { console.warn('Android语音预载失败', error); }
}
function startNativeExecution(plan) {
  requestFullscreenForBrew();
  acquireWake();
  if (!globalThis.__LUCKYBEAN_ANDROID__) return;
  nativeExecutionActive = true;
  try {
    globalThis.LuckyBeanNative?.setBrewScreenAwake?.(true);
    globalThis.LuckyBeanNative?.startBrewExecution?.(nativePayload(plan));
  } catch (error) {
    console.warn('Android原生执行启动失败', error);
  }
}
function pauseNativeExecution() {
  if (!nativeExecutionActive) return;
  try { globalThis.LuckyBeanNative?.pauseBrewExecution?.(); } catch {}
}
function resumeNativeExecution() {
  if (!nativeExecutionActive) return;
  try { globalThis.LuckyBeanNative?.resumeBrewExecution?.(); } catch {}
}
function stopNativeExecution(cancel = true) {
  releaseWake();
  if (!globalThis.__LUCKYBEAN_ANDROID__) return;
  try {
    globalThis.LuckyBeanNative?.setBrewScreenAwake?.(false);
    if (cancel && nativeExecutionActive) globalThis.LuckyBeanNative?.cancelBrewExecution?.();
  } catch {}
  nativeExecutionActive = false;
}

function bindNativeExecutionBridge() {
  document.addEventListener('click', event => {
    if (event.target.closest('#confirmBrewPreparedBtn') && latestPlan) { startNativeExecution(latestPlan); return; }
    if (event.target.closest('#timerPauseBtn')) {
      const button = event.target.closest('#timerPauseBtn');
      requestAnimationFrame(() => button?.textContent?.includes('继续') ? pauseNativeExecution() : resumeNativeExecution());
      return;
    }
    if (event.target.closest('#timerEndBtn')) stopNativeExecution(true);
  }, true);
  document.addEventListener('luckybean:brew-preparation', event => {
    const speech = String(event.detail?.speech || '').trim();
    if (!speech || !globalThis.__LUCKYBEAN_ANDROID__) return;
    try { globalThis.LuckyBeanNative?.announceBrewPreparation?.(speech); } catch (error) { console.warn('Android准备提示播报失败', error); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && nativeExecutionActive) acquireWake();
  });
  window.addEventListener('pagehide', () => stopNativeExecution(true));
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
    prepareNative(latestPlan);
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
    const loaded = await loadCodebook();
    index = makeIndex(loaded?.data || loaded);
  } catch (error) {
    console.warn('简称库加载失败', error);
  }
  await refreshBeans();
  bindBeanContainerObserver();
  bindNativeExecutionBridge();
  bindEvents();
  queueCardRender();
  document.documentElement.dataset.fullIntegration = VERSION;
}

if (document.documentElement.dataset.startup === 'ready') init();
else document.addEventListener('luckybean:local-app-ready', init, { once:true });
