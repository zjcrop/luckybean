import { all, bulkPut, getSetting, setSetting, remove } from '../db.js';
import { loadCodebook, makeIndex, displayName } from '../codebook.js';

const INTEGRATION_VERSION = 'full-integration/1.0';
const COUNTRY_ALIASES = new Map([
  ['埃塞俄比亚','埃塞'],['Ethiopia','埃塞'],['巴拿马','巴拿马'],['Panama','巴拿马'],
  ['肯尼亚','肯尼亚'],['Kenya','肯尼亚'],['哥斯达黎加','哥达'],['Costa Rica','哥达'],
  ['哥伦比亚','哥伦'],['Colombia','哥伦'],['危地马拉','危地'],['Guatemala','危地'],
  ['印度尼西亚','印尼'],['Indonesia','印尼'],['萨尔瓦多','萨国'],['El Salvador','萨国'],
  ['卢旺达','卢旺达'],['Rwanda','卢旺达'],['布隆迪','布隆迪'],['Burundi','布隆迪']
]);
const STATION_ALIASES = new Map([
  ['Chelbesa Washing Station','CHL'],['Chelbesa','CHL'],['Janson','JAN'],['Janson Coffee Farm','JAN'],
  ['Hambela','HAM'],['Konga','KON']
]);
const VARIETY_ALIASES = new Map([
  ['Geisha','瑰夏'],['Gesha','瑰夏'],['瑰夏','瑰夏'],['Bourbon','波旁'],['波旁','波旁'],
  ['Typica','铁皮'],['铁皮卡','铁皮'],['Caturra','卡杜拉'],['Catuai','卡杜艾']
]);
const ROAST_ALIASES = Object.freeze({ 'RL-L0':'极浅','RL-L1':'浅','RL-L2':'中浅','RL-L3':'中','RL-L4':'中深','RL-L5':'深','RL-L6':'深' });
const PROCESS_ALIASES = new Map([
  ['Washed','水洗'],['水洗','水洗'],['Natural','日晒'],['日晒','日晒'],['Anaerobic','厌氧'],['厌氧','厌氧'],
  ['Honey','蜜处'],['蜜处理','蜜处'],['Dark Room Washed','暗水'],['暗房水洗','暗水']
]);

let codebookIndex = null;
let beans = new Map();
let latestPlan = null;
let wakeLock = null;
let absoluteExecution = null;
let syncClick = false;
let transformQueued = false;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const codeName = (table, code, fallback = '') => codebookIndex ? displayName(codebookIndex, table, code, fallback) : fallback;

function countryAlias(name) {
  const value = String(name || '').trim();
  if (!value) return '未定';
  if (COUNTRY_ALIASES.has(value)) return COUNTRY_ALIASES.get(value);
  if (/^[A-Za-z ]+$/.test(value)) return value.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || '—';
  return [...value].length <= 3 ? value : `${[...value].slice(0, 2).join('')}…`;
}

function stationAlias(name) {
  const value = String(name || '').trim();
  if (!value || value === '—') return '';
  if (STATION_ALIASES.has(value)) return STATION_ALIASES.get(value);
  const latin = value.normalize('NFKD').replace(/[^A-Za-z]/g, '').toUpperCase();
  if (latin.length >= 3) return latin.slice(0, 3);
  return [...value].slice(0, 3).join('');
}

function varietyAlias(name) {
  const value = String(name || '').trim();
  if (!value) return '未定';
  if (/^\d{3,}$/i.test(value) || /^SL\s*\d+$/i.test(value)) return value.replace(/\s+/g, '').toUpperCase();
  return VARIETY_ALIASES.get(value) || ([...value].length <= 4 ? value : [...value].slice(0, 4).join(''));
}

function processAlias(name) {
  const value = String(name || '').trim();
  if (!value) return '未定';
  for (const [source, alias] of PROCESS_ALIASES) if (value.toLocaleLowerCase('zh-CN').includes(source.toLocaleLowerCase('zh-CN'))) return alias;
  return [...value].length <= 3 ? value : [...value].slice(0, 2).join('');
}

function displayParts(bean) {
  const country = countryAlias(codeName('countries', bean.countryCode, bean.country || ''));
  const station = stationAlias(codeName('entities', bean.entityCode, bean.entity || bean.processingStation || ''));
  const variety = varietyAlias(codeName('varieties', bean.varietyCode, bean.variety || ''));
  const roast = ROAST_ALIASES[String(bean.roastCode || '').toUpperCase()] || String(codeName('roasts', bean.roastCode, bean.roast || '中')).replace(/烘焙|烘/g, '').slice(0, 2);
  const process = processAlias(codeName('processes', bean.processCode, bean.process || ''));
  const remaining = `${Math.max(0, Number(bean.remainingWeight || 0)).toFixed(Number(bean.remainingWeight || 0) % 1 ? 1 : 0)}g`;
  return { country, station, variety, roast, process, remaining };
}

function transformBeanCard(card) {
  if (!card?.dataset.beanId) return;
  const bean = beans.get(card.dataset.beanId);
  if (!bean) return;
  const p = displayParts(bean);
  const primary = [p.country, p.station, p.variety].filter(Boolean).join('/');
  const secondary = [p.roast, p.process, p.remaining].filter(Boolean).join('/');
  card.classList.add('lb-one-line-bean');
  card.innerHTML = `<div class="lb-bean-line" aria-label="${esc(`${primary}/${secondary}`)}"><span class="lb-bean-primary">${esc(primary)}</span><span class="lb-bean-secondary">/${esc(secondary)}</span></div><button class="cup-action compact-pick lb-brew-circle" type="button" data-brew-bean="${esc(bean.id)}" aria-label="用这只豆小酌">酌</button>`;
}

function transformBeanCards() {
  transformQueued = false;
  $$('[data-bean-id].bean-card').forEach(transformBeanCard);
}

function queueTransform() {
  if (transformQueued) return;
  transformQueued = true;
  requestAnimationFrame(transformBeanCards);
}

async function refreshBeans() {
  const rows = await all('beans').catch(() => []);
  beans = new Map(rows.map(bean => [bean.id, bean]));
  queueTransform();
}

function planEffectPanel(plan) {
  const matching = plan?.matching;
  const add = matching?.profileEffect?.add;
  if (!Array.isArray(add) || add.length !== 8) return '';
  const labels = ['酸','甜','香','体','苦','净','酵','余'];
  const cells = add.map((value, index) => {
    const number = Number(value || 0);
    const arrow = number > 1 ? '↑' : number < -1 ? '↓' : '→';
    return `<span><b>${labels[index]}</b>${arrow}<small>${number > 0 ? '+' : ''}${number}</small></span>`;
  }).join('');
  return `<div class="lb-profile-effect" data-lb-profile-effect><strong>方案倾向</strong><div>${cells}</div><small>匹配 ${Number(matching.score || 0).toFixed(1)} · ${esc(matching.selectedProfileId || '')}</small></div>`;
}

function renderPlanEffect(plan) {
  $$('[data-lb-profile-effect]').forEach(node => node.remove());
  const generated = $('#generatedPlan');
  const html = planEffectPanel(plan);
  if (generated && html) generated.insertAdjacentHTML('afterbegin', html);
}

async function currentGearSettings() {
  const settings = await getSetting('app.settings', {});
  settings.matchingGear ||= { drippers:{}, papers:{}, defaultDripper:{ shape:'standard_cone', bypass:'medium' }, defaultPaper:{ speed:'medium' } };
  settings.matchingGear.drippers ||= {};
  settings.matchingGear.papers ||= {};
  return settings;
}

async function injectMatchingGear() {
  const brewForm = $('#brewContent');
  if (!brewForm || $('[data-lb-matching-gear]', brewForm)) return;
  const anchor = $('[data-brew-row="filter-gear"]', brewForm);
  if (!anchor) return;
  const settings = await currentGearSettings();
  const dripperId = $('#brewDripper')?.value || 'default';
  const paperId = $('#brewFilterPaper')?.value || 'default';
  const dripper = settings.matchingGear.drippers[dripperId] || settings.matchingGear.defaultDripper || {};
  const paper = settings.matchingGear.papers[paperId] || settings.matchingGear.defaultPaper || {};
  anchor.insertAdjacentHTML('afterend', `<div class="lb-matching-gear" data-lb-matching-gear><label><span>滤杯结构</span><select id="lbDripperShape" class="control"><option value="narrow_cone"${dripper.shape==='narrow_cone'?' selected':''}>窄锥</option><option value="standard_cone"${!dripper.shape||dripper.shape==='standard_cone'?' selected':''}>标准锥</option><option value="wide_cone"${dripper.shape==='wide_cone'?' selected':''}>宽锥</option><option value="flat_bottom"${dripper.shape==='flat_bottom'?' selected':''}>平底</option></select></label><label><span>旁通</span><select id="lbDripperBypass" class="control"><option value="none"${dripper.bypass==='none'?' selected':''}>无</option><option value="low"${dripper.bypass==='low'?' selected':''}>少</option><option value="medium"${!dripper.bypass||dripper.bypass==='medium'?' selected':''}>中</option><option value="high"${dripper.bypass==='high'?' selected':''}>多</option></select></label><label><span>滤纸流速</span><select id="lbPaperSpeed" class="control"><option value="low"${paper.speed==='low'?' selected':''}>低</option><option value="medium"${!paper.speed||paper.speed==='medium'?' selected':''}>中</option><option value="high"${paper.speed==='high'?' selected':''}>高</option></select></label></div>`);
  const save = async () => {
    const next = await currentGearSettings();
    next.matchingGear.drippers[dripperId] = { shape:$('#lbDripperShape')?.value || 'standard_cone', bypass:$('#lbDripperBypass')?.value || 'medium' };
    next.matchingGear.papers[paperId] = { speed:$('#lbPaperSpeed')?.value || 'medium' };
    await setSetting('app.settings', next);
  };
  ['lbDripperShape','lbDripperBypass','lbPaperSpeed'].forEach(id => $(`#${id}`)?.addEventListener('change', save));
}

function isMobileBrowser() {
  if (globalThis.__LUCKYBEAN_ANDROID__) return false;
  return navigator.maxTouchPoints > 0 && globalThis.matchMedia?.('(pointer: coarse)')?.matches && (/Android|iPhone|iPad|Mobile|HarmonyOS/i.test(navigator.userAgent) || innerWidth <= 1024);
}

function requestMobileFullscreen() {
  if (!isMobileBrowser() || document.fullscreenElement) return;
  const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
  try { request?.call(document.documentElement, { navigationUI:'hide' })?.catch?.(() => {}); } catch { /* degrade */ }
}

async function acquireWakeLock() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch { wakeLock = null; }
}
async function releaseWakeLock() { try { await wakeLock?.release?.(); } catch {} wakeLock = null; }

function normalizeStages(plan) {
  const stages = Array.isArray(plan?.stages) ? plan.stages : [];
  let cursor = 0;
  return stages.map((stage, index) => {
    const start = Number.isFinite(Number(stage.startSec ?? stage.start)) ? Number(stage.startSec ?? stage.start) : cursor;
    const duration = Math.max(.1, Number(stage.durationSec ?? (Number(stage.end) - start) ?? 0));
    const end = Number.isFinite(Number(stage.end)) ? Number(stage.end) : start + duration;
    cursor = Math.max(cursor, end);
    return { index, startMs:Math.round(start*1000), endMs:Math.round(end*1000), name:String(stage.name || `第${index+1}段`), waterG:Number(stage.stageWaterG ?? stage.pour ?? 0), cumulativeWaterG:Number(stage.cumulativeWaterG ?? stage.cumulative ?? 0), temperatureC:Number(stage.temperatureC ?? stage.pourTemperature ?? 90), method:String(stage.method || '') };
  });
}

function speechTimeline(plan) {
  const stages = normalizeStages(plan);
  const events = [];
  stages.forEach((stage, index) => {
    if (index > 0) {
      events.push({ id:`stage-${index+1}-prepare`, atMs:Math.max(0,stage.startMs-8000), text:`准备第${index+1}段，${Math.round(stage.waterG)}克，${Math.round(stage.temperatureC)}度`, priority:'high', validWindowMs:3000 });
      events.push({ id:`stage-${index+1}-countdown`, atMs:Math.max(0,stage.startMs-3200), text:'三，二，一', priority:'critical', validWindowMs:1200, fixedKey:'countdown_321' });
    }
    events.push({ id:`stage-${index+1}-start`, atMs:stage.startMs, text:`第${index+1}段，${stage.name}，注水${Math.round(stage.waterG)}克，累计${Math.round(stage.cumulativeWaterG)}克，水温${Math.round(stage.temperatureC)}度`, priority:'critical', validWindowMs:4500 });
  });
  const totalMs = stages.at(-1)?.endMs || 0;
  events.push({ id:'brew-complete', atMs:totalMs, text:'冲煮完成', priority:'critical', validWindowMs:5000, fixedKey:'brew_complete' });
  return { contract:'luckybean-speech-timeline/1.0', voicePack:'zh_CN_v1', totalMs, events };
}

function nativeExecutionPayload(plan) {
  return JSON.stringify({ contract:'luckybean-brew-execution/1.0', version:1, stages:normalizeStages(plan), speech:speechTimeline(plan) });
}

function prepareNativeExecution(plan) {
  const native = globalThis.LuckyBeanNative;
  if (!globalThis.__LUCKYBEAN_ANDROID__ || typeof native?.prepareBrewExecution !== 'function') return;
  try { native.prepareBrewExecution(nativeExecutionPayload(plan)); } catch (error) { console.warn('Android冲煮语音预载失败', error); }
}

function parseStageIndex() {
  const text = $('#timerStageCounter')?.textContent || '';
  const value = Number(text.split('/')[0]);
  return Number.isFinite(value) && value > 0 ? value - 1 : 0;
}

function formatSecondsValue(seconds) {
  const value = Math.max(0, Math.ceil(Number(seconds) || 0));
  return `${Math.floor(value/60).toString().padStart(2,'0')}:${(value%60).toString().padStart(2,'0')}`;
}

function executionElapsedMs(exec = absoluteExecution) {
  if (!exec) return 0;
  const now = exec.paused ? exec.pauseStarted : performance.now();
  return Math.max(0, now - exec.startedPerf - exec.pausedTotalMs);
}

function desiredStageIndex(stages, elapsed) {
  let index = 0;
  for (let i = 0; i < stages.length; i++) if (elapsed >= stages[i].startMs) index = i;
  return Math.min(index, Math.max(0, stages.length - 1));
}

function syncAppStage(targetIndex) {
  let current = parseStageIndex();
  if (current === targetIndex) return;
  syncClick = true;
  let guard = 20;
  while (current < targetIndex && guard-- > 0) { $('#timerNextBtn')?.click(); current += 1; }
  while (current > targetIndex && guard-- > 0) { $('#timerPrevBtn')?.click(); current -= 1; }
  syncClick = false;
}

function renderAbsoluteClock() {
  const exec = absoluteExecution;
  if (!exec || exec.ended || exec.paused) return;
  const elapsed = executionElapsedMs(exec);
  const stages = exec.stages;
  if (!stages.length) return;
  if (elapsed >= exec.totalMs) {
    syncAppStage(stages.length - 1);
    const current = parseStageIndex();
    if (current === stages.length - 1 && $('#timerNextBtn')) { syncClick = true; $('#timerNextBtn').click(); syncClick = false; }
    stopAbsoluteExecution('complete');
    return;
  }
  const index = desiredStageIndex(stages, elapsed);
  syncAppStage(index);
  const stage = stages[index];
  const remaining = Math.max(0,(stage.endMs-elapsed)/1000);
  const totalRemaining = Math.max(0,(exec.totalMs-elapsed)/1000);
  const clock = $('#timerClock'); if (clock) clock.textContent = formatSecondsValue(remaining);
  const elapsedNode = $('#timerElapsed'); if (elapsedNode) elapsedNode.textContent = formatSecondsValue(elapsed/1000);
  const totalNode = $('#timerTotalRemaining'); if (totalNode) totalNode.textContent = formatSecondsValue(totalRemaining);
  exec.frame = setTimeout(renderAbsoluteClock, 100);
}

function startAbsoluteExecution(plan) {
  const stages = normalizeStages(plan);
  if (!stages.length) return;
  absoluteExecution = { stages, totalMs:Math.max(Number(plan?.totals?.targetTimeSec || 0)*1000, stages.at(-1).endMs), startedPerf:performance.now(), pausedTotalMs:0, paused:false, pauseStarted:0, frame:null, ended:false };
  acquireWakeLock();
  requestMobileFullscreen();
  if (globalThis.__LUCKYBEAN_ANDROID__) {
    try { globalThis.LuckyBeanNative?.setBrewScreenAwake?.(true); globalThis.LuckyBeanNative?.startBrewExecution?.(nativeExecutionPayload(plan)); } catch (error) { console.warn('Android原生执行启动失败', error); }
  }
  setTimeout(renderAbsoluteClock, 30);
}

function pauseAbsoluteExecution() {
  const exec = absoluteExecution; if (!exec || exec.paused) return;
  exec.paused = true; exec.pauseStarted = performance.now(); clearTimeout(exec.frame);
  try { globalThis.LuckyBeanNative?.pauseBrewExecution?.(); } catch {}
}
function resumeAbsoluteExecution() {
  const exec = absoluteExecution; if (!exec || !exec.paused) return;
  exec.pausedTotalMs += performance.now() - exec.pauseStarted; exec.paused = false; exec.pauseStarted = 0;
  try { globalThis.LuckyBeanNative?.resumeBrewExecution?.(); } catch {}
  renderAbsoluteClock();
}
function stopAbsoluteExecution(reason = 'cancel') {
  const exec = absoluteExecution; if (!exec) return;
  exec.ended = true; clearTimeout(exec.frame); absoluteExecution = null; releaseWakeLock();
  if (globalThis.__LUCKYBEAN_ANDROID__) {
    try { globalThis.LuckyBeanNative?.setBrewScreenAwake?.(false); if (reason !== 'complete') globalThis.LuckyBeanNative?.cancelBrewExecution?.(); } catch {}
  }
}

function bindExecutionClicks() {
  document.addEventListener('click', event => {
    const start = event.target.closest('#startBrewBtn');
    if (start && latestPlan) {
      requestMobileFullscreen(); acquireWakeLock();
      setTimeout(() => startAbsoluteExecution(latestPlan), 0);
      return;
    }
    if (event.target.closest('#timerPauseBtn')) {
      if (absoluteExecution?.paused) resumeAbsoluteExecution(); else pauseAbsoluteExecution();
      return;
    }
    if (event.target.closest('#timerEndBtn')) { stopAbsoluteExecution('cancel'); return; }
    if (!syncClick && event.target.closest('#timerNextBtn,#timerPrevBtn') && absoluteExecution) {
      setTimeout(() => {
        const index = parseStageIndex(); const stage = absoluteExecution?.stages?.[index]; if (!stage || !absoluteExecution) return;
        absoluteExecution.startedPerf = performance.now() - stage.startMs - absoluteExecution.pausedTotalMs;
      }, 0);
    }
  }, true);
}

function injectBatchManageButton() {
  $$('.popup-menu').forEach(popup => {
    if ($('[data-lb-batch-open]', popup) || !$('[data-manage-action="export"]', popup)) return;
    popup.insertAdjacentHTML('afterbegin','<button type="button" data-lb-batch-open>批量管理豆卡</button>');
  });
}

function batchOverlayHtml(rows) {
  const active = rows.filter(bean => !bean.archived);
  const archived = rows.filter(bean => bean.archived);
  const row = bean => { const p=displayParts(bean); return `<label class="lb-batch-row"><input type="checkbox" value="${esc(bean.id)}"><span>${esc([p.country,p.station,p.variety,p.roast,p.process,p.remaining].filter(Boolean).join('/'))}</span></label>`; };
  return `<div class="lb-batch-overlay" data-lb-batch-overlay><div class="lb-batch-dialog"><header><strong>豆卡批量管理</strong><button type="button" data-lb-batch-close>×</button></header><div class="lb-batch-tabs"><details open><summary>豆藏 · ${active.length}</summary>${active.map(row).join('')||'<p>暂无</p>'}</details><details><summary>溯旧 · ${archived.length}</summary>${archived.map(row).join('')||'<p>暂无</p>'}</details></div><div class="lb-batch-group"><input id="lbBatchGroup" class="control" maxlength="30" placeholder="批量分组名称"><button type="button" data-lb-batch-group>设定分组</button></div><footer><button type="button" data-lb-batch-all>全选</button><button type="button" data-lb-batch-archive>移至溯旧</button><button type="button" data-lb-batch-restore>恢复豆藏</button><button type="button" class="danger" data-lb-batch-delete>删除</button></footer></div></div>`;
}

function selectedBatchIds(root) { return $$('input[type="checkbox"]:checked',root).map(input=>input.value); }
async function openBatchManager() {
  const rows = await all('beans');
  document.body.insertAdjacentHTML('beforeend',batchOverlayHtml(rows));
}
async function applyBatch(action, ids, group = '') {
  if (!ids.length) return;
  const rows = await all('beans'); const selected = rows.filter(bean=>ids.includes(bean.id));
  if (action === 'archive' || action === 'restore') {
    const archived = action === 'archive';
    await bulkPut('beans', selected.map(bean=>({ ...bean, archived, ...(archived?{archivedAt:bean.archivedAt||new Date().toISOString()}:{archivedAt:null}), updatedAt:new Date().toISOString() })));
  } else if (action === 'group') {
    await bulkPut('beans', selected.map(bean=>({ ...bean, customGroup:group, updatedAt:new Date().toISOString() })));
  } else if (action === 'delete') {
    const sessions = await all('brewSessions'); const sensory = await all('sensoryRecords');
    const blocked = new Set([...sessions.map(item=>item.beanId),...sensory.map(item=>item.beanId)]);
    for (const bean of selected) if (!blocked.has(bean.id)) await remove('beans',bean.id);
    const blockedCount = selected.filter(bean=>blocked.has(bean.id)).length;
    if (blockedCount) alert(`${blockedCount}张豆卡存在冲煮/品鉴历史，已保留并建议移至“溯旧”。`);
  }
  document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh',{detail:{source:'batch-beans'}}));
  await refreshBeans();
}

function bindBatchClicks() {
  document.addEventListener('click', async event => {
    if (event.target.closest('[data-lb-batch-open]')) { event.preventDefault(); $('.popup-menu')?.remove(); await openBatchManager(); return; }
    const root = $('[data-lb-batch-overlay]'); if (!root) return;
    if (event.target.closest('[data-lb-batch-close]')) { root.remove(); return; }
    if (event.target.closest('[data-lb-batch-all]')) { $$('input[type="checkbox"]',root).forEach(input=>input.checked=true); return; }
    const ids = selectedBatchIds(root);
    if (event.target.closest('[data-lb-batch-archive]')) { await applyBatch('archive',ids); root.remove(); return; }
    if (event.target.closest('[data-lb-batch-restore]')) { await applyBatch('restore',ids); root.remove(); return; }
    if (event.target.closest('[data-lb-batch-group]')) { await applyBatch('group',ids,$('#lbBatchGroup',root)?.value.trim()||''); root.remove(); return; }
    if (event.target.closest('[data-lb-batch-delete]')) { if (ids.length && confirm(`确认删除选中的${ids.length}张无历史豆卡？有历史记录的豆卡会被自动保留。`)) { await applyBatch('delete',ids); root.remove(); } }
  });
}

function showOnboardingOnce() {
  if (localStorage.getItem('luckybean.onboarding.v1') || beans.size) return;
  const html = `<div class="lb-onboarding" data-lb-onboarding><div><strong>欢迎使用 LuckyBean</strong><p>建立豆卡 → 选择咖啡豆 → 匹配方案 → 冲煮 → 记录结果</p><footer><button data-lb-onboard-start>开始使用</button><button data-lb-onboard-later>以后再说</button><button data-lb-onboard-never>不再显示</button></footer></div></div>`;
  document.body.insertAdjacentHTML('beforeend',html);
}

function bindOnboarding() {
  document.addEventListener('click',event=>{
    const root=$('[data-lb-onboarding]'); if(!root)return;
    if(event.target.closest('[data-lb-onboard-start]')){localStorage.setItem('luckybean.onboarding.v1','done');root.remove();$('#fabAddBtn')?.click();}
    if(event.target.closest('[data-lb-onboard-later]'))root.remove();
    if(event.target.closest('[data-lb-onboard-never]')){localStorage.setItem('luckybean.onboarding.v1','never');root.remove();}
  });
}

function bindDataEvents() {
  document.addEventListener('luckybean:data-changed', async event => {
    await refreshBeans();
    if (event.detail?.autoArchived) setTimeout(()=>alert('这支咖啡豆剩余不足5g，已自动移至“溯旧”。'),0);
  });
  document.addEventListener('luckybean:app-refreshed', refreshBeans);
  document.addEventListener('luckybean:plan-ready', event => {
    latestPlan = event.detail?.plan || null;
    if (latestPlan) { renderPlanEffect(latestPlan); prepareNativeExecution(latestPlan); }
  });
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&absoluteExecution&&!absoluteExecution.ended)acquireWakeLock(); });
}

async function init() {
  try { codebookIndex = makeIndex(await loadCodebook()); } catch (error) { console.warn('紧凑豆卡简称库加载失败，使用原始代码',error); }
  await refreshBeans();
  bindExecutionClicks(); bindBatchClicks(); bindOnboarding(); bindDataEvents();
  const observer = new MutationObserver(() => { queueTransform(); injectMatchingGear(); injectBatchManageButton(); if (latestPlan) renderPlanEffect(latestPlan); });
  observer.observe(document.body,{childList:true,subtree:true});
  queueTransform(); injectMatchingGear(); setTimeout(showOnboardingOnce,800);
  document.documentElement.dataset.fullIntegration = INTEGRATION_VERSION;
}

if (document.documentElement.dataset.startup === 'ready') init();
else document.addEventListener('luckybean:local-app-ready',init,{once:true});
