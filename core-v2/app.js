import './native-bridge-loader.js';
import {
  openDb, all, put, remove, bulkPut
} from '../src/db.js';
import {
  loadCodebook, makeIndex, displayName
} from '../src/codebook.js';
import {
  computeFallbackPlan, listBrewProfiles
} from '../src/brew-engine.js';
import {
  computeInventory, makeInventoryEvent, INVENTORY_EVENT_TYPES
} from '../src/core-v2/domain/inventory.js';
import {
  CORE_STORES, CORE_VERSION, DATA_SCHEMA_VERSION
} from '../src/core-v2/contracts.js';
import {
  createBackupDocument, verifyBackupDocument
} from '../src/core-v2/backup/backup-core.js';
import {
  nativeStorageAvailable, nativeCapabilities, nativeExportBackup,
  nativeImportBackup, nativeExportText, nativeRecognizeImage
} from '../src/core-v2/platform/native-storage.js';
import { scanQrFile, decodeJsQrResult } from '../src/qr.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const now = () => new Date().toISOString();
const id = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, number(value)));
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const splitTags = value => [...new Set(String(value || '').split(/[、,，;；\n]/).map(item => item.trim()).filter(Boolean))];

const state = {
  beans: [],
  brewSessions: [],
  sensoryRecords: [],
  inventoryEvents: [],
  codebook: null,
  codebookIndex: null,
  plan: null,
  planInput: null,
  timer: null,
  capabilities: null,
  view: 'beans'
};

let toastTimer;
function toast(message, kind = '') {
  const node = $('#toast');
  node.textContent = String(message);
  node.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.className = 'toast'; }, 3300);
}

function beanName(bean) {
  return String(bean?.name || bean?.label || bean?.roaster || bean?.entityName || bean?.nickname || '未命名咖啡豆');
}
function beanRoastCode(bean) {
  return String(bean?.roastCode || bean?.roastLevelCode || 'RL-L2');
}
function beanProcess(bean) {
  const code = String(bean?.processCode || bean?.processCodes?.[0] || '');
  return displayName(state.codebookIndex, 'processes', code, code || '—');
}
function beanCountry(bean) {
  const code = String(bean?.countryCode || '');
  return displayName(state.codebookIndex, 'countries', code, bean?.country || code || '—');
}
function beanVariety(bean) {
  const code = String(bean?.varietyCode || bean?.varietyCodes?.[0] || '');
  return displayName(state.codebookIndex, 'varieties', code, bean?.variety || code || '—');
}
function eventsForBean(beanId) {
  return state.inventoryEvents.filter(event => event.beanId === beanId && !event.deletedAt);
}
function remainingForBean(bean) {
  const events = eventsForBean(bean.id);
  if (events.length) {
    try { return computeInventory(events, { beanId: bean.id }).remainingG; }
    catch (error) { console.warn('库存事件不兼容，使用豆卡缓存值', error); }
  }
  return Math.max(0, number(bean.remainingWeight, number(bean.initialWeight, 0)));
}
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('zh-CN');
}
function formatSeconds(value) {
  const seconds = Math.max(0, Math.round(number(value)));
  return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
}

async function refresh() {
  [state.beans, state.brewSessions, state.sensoryRecords, state.inventoryEvents] = await Promise.all([
    all('beans'), all('brewSessions'), all('sensoryRecords'), all('inventoryEvents')
  ]);
  state.beans = state.beans.filter(bean => !bean.deletedAt).sort((a,b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  state.brewSessions = state.brewSessions.filter(item => !item.deletedAt).sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  state.sensoryRecords = state.sensoryRecords.filter(item => !item.deletedAt).sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  state.inventoryEvents = state.inventoryEvents.filter(item => !item.deletedAt);
  renderAll();
}

function switchView(view) {
  if (!['beans','brew','sensory','history','tools'].includes(view)) return;
  state.view = view;
  $$('.view').forEach(node => node.classList.toggle('active', node.dataset.view === view));
  $$('[data-nav]').forEach(button => button.classList.toggle('active', button.dataset.nav === view));
  if (view === 'beans') renderBeans();
  if (view === 'brew') renderBrewInputs();
  if (view === 'sensory') renderSensory();
  if (view === 'history') renderHistory();
  if (view === 'tools') renderCapabilities();
  scrollTo({ top: 0, behavior: 'smooth' });
}

function beanOptions(selected = '') {
  const active = state.beans.filter(bean => !bean.archived && remainingForBean(bean) > 0);
  return [`<option value="">请选择</option>`, ...active.map(bean => `<option value="${escapeHtml(bean.id)}"${bean.id === selected ? ' selected' : ''}>${escapeHtml(beanName(bean))} · ${remainingForBean(bean).toFixed(1)}g</option>`)].join('');
}

function renderBeans() {
  const query = String($('#beanSearch')?.value || '').trim().toLocaleLowerCase('zh-CN');
  const sort = $('#beanSort')?.value || 'updated';
  let beans = state.beans.filter(bean => {
    if (bean.archived) return false;
    const text = [beanName(bean), beanCountry(bean), beanProcess(bean), beanVariety(bean), ...(bean.flavorTags || []), ...(bean.flavorCodes || [])].join(' ').toLocaleLowerCase('zh-CN');
    return !query || text.includes(query);
  });
  beans.sort((a,b) => {
    if (sort === 'remaining') return remainingForBean(a) - remainingForBean(b);
    if (sort === 'roastDate') return String(a.roastDate || '').localeCompare(String(b.roastDate || ''));
    if (sort === 'name') return beanName(a).localeCompare(beanName(b), 'zh-CN');
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });
  $('#beanList').innerHTML = beans.length ? beans.map(bean => `
    <article class="card" data-bean-card="${escapeHtml(bean.id)}">
      <div class="card-head"><div><h3>${escapeHtml(beanName(bean))}</h3><p>${escapeHtml(beanCountry(bean))} · ${escapeHtml(beanVariety(bean))} · ${escapeHtml(beanProcess(bean))}</p></div><span class="metric"><strong>${remainingForBean(bean).toFixed(1)}</strong>g</span></div>
      <p>烘焙：${escapeHtml(beanRoastCode(bean))} · ${escapeHtml(formatDate(bean.roastDate))}</p>
      ${bean.flavorTags?.length ? `<p>${bean.flavorTags.map(escapeHtml).join(' / ')}</p>` : ''}
      <div class="card-actions"><button type="button" data-action="bean-brew" data-id="${escapeHtml(bean.id)}">冲煮</button><button type="button" data-action="bean-edit" data-id="${escapeHtml(bean.id)}">编辑</button><button type="button" data-action="bean-detail" data-id="${escapeHtml(bean.id)}">详情</button></div>
    </article>`).join('') : '<div class="empty">没有符合条件的豆卡。核心版可在完全离线状态新增和使用。</div>';
}

function renderBrewInputs(selectedBeanId = $('#brewBean')?.value || '') {
  $('#brewBean').innerHTML = beanOptions(selectedBeanId);
  if (!$('#brewProfile').options.length) {
    $('#brewProfile').innerHTML = listBrewProfiles().map(profile => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.label)}</option>`).join('');
  }
}

function renderSensory(selectedBeanId = $('#sensoryBean')?.value || '') {
  $('#sensoryBean').innerHTML = beanOptions(selectedBeanId);
  const recent = state.sensoryRecords.slice(0, 10);
  $('#sensoryRecent').innerHTML = recent.length ? recent.map(record => {
    const bean = state.beans.find(item => item.id === record.beanId);
    return `<article class="card"><div class="card-head"><div><h3>${escapeHtml(beanName(bean))}</h3><p>${escapeHtml(formatDate(record.createdAt))}</p></div><span class="metric"><strong>${number(record.score).toFixed(1)}</strong></span></div><p>${(record.tags || []).map(escapeHtml).join(' / ') || '未记录标签'}</p>${record.note ? `<p>${escapeHtml(record.note)}</p>` : ''}</article>`;
  }).join('') : '<div class="empty">尚无品鉴记录。</div>';
}

function renderHistory() {
  const type = $('#historyType')?.value || 'all';
  const rows = [
    ...state.brewSessions.map(item => ({ ...item, _type: 'brew', _time: item.createdAt || item.updatedAt || '' })),
    ...state.sensoryRecords.map(item => ({ ...item, _type: 'sensory', _time: item.createdAt || item.updatedAt || '' }))
  ].filter(item => type === 'all' || item._type === type).sort((a,b) => String(b._time).localeCompare(String(a._time)));
  $('#historyList').innerHTML = rows.length ? rows.map(item => {
    const bean = state.beans.find(value => value.id === item.beanId);
    if (item._type === 'brew') {
      return `<article class="card"><div class="card-head"><div><h3>${escapeHtml(beanName(bean))}</h3><p>${escapeHtml(formatDate(item._time))} · ${escapeHtml(item.profileLabel || item.profileId || '本地方案')}</p></div><span class="metric"><strong>${number(item.doseG).toFixed(1)}</strong>g</span></div><div class="card-actions"><button type="button" data-action="brew-replicate" data-id="${escapeHtml(item.id)}">复刻</button></div></article>`;
    }
    return `<article class="card"><div class="card-head"><div><h3>${escapeHtml(beanName(bean))}</h3><p>${escapeHtml(formatDate(item._time))} · 品鉴</p></div><span class="metric"><strong>${number(item.score).toFixed(1)}</strong></span></div><p>${(item.tags || []).map(escapeHtml).join(' / ')}</p></article>`;
  }).join('') : '<div class="empty">尚无历史记录。</div>';
}

function renderCapabilities() {
  const capabilities = state.capabilities || {
    platform: 'web', engine: navigator.userAgent, storage: 'indexeddb', schemaVersion: DATA_SCHEMA_VERSION,
    files: true, archiveBackup: false, cameraX: false, ocr: { bundled: false }, backgroundSync: false, offlineCore: true
  };
  const rows = {
    平台: capabilities.platform,
    运行内核: capabilities.engine,
    主数据库: capabilities.storage,
    数据结构: `Schema ${capabilities.schemaVersion || DATA_SCHEMA_VERSION}`,
    完整归档: capabilities.archiveBackup ? '本地 .luckybean ZIP' : '浏览器 JSON 兼容备份',
    相机: capabilities.cameraX ? 'CameraX' : '浏览器能力',
    OCR: capabilities.ocr?.bundled ? `本地打包：${(capabilities.ocr.scripts || []).join(' / ')}` : '浏览器后备或手工录入',
    后台同步: capabilities.backgroundSync ? 'WorkManager 可选队列' : '仅前台在线扩展',
    核心离线: capabilities.offlineCore ? '是' : '否',
    Core版本: CORE_VERSION
  };
  $('#capabilityList').innerHTML = Object.entries(rows).map(([key,value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join('');
}

function renderAll() {
  renderBeans();
  renderBrewInputs();
  renderSensory();
  renderHistory();
  renderCapabilities();
}

function modal(title, body, bind = () => {}) {
  $('#modalContent').innerHTML = `<div class="modal-body"><div class="modal-head"><div><h2>${escapeHtml(title)}</h2></div><button type="button" data-modal-close>关闭</button></div>${body}</div>`;
  const dialog = $('#modal');
  dialog.showModal();
  $('[data-modal-close]', dialog).addEventListener('click', () => dialog.close());
  bind(dialog);
}

function beanForm(bean = null) {
  const current = bean || {};
  const countryOptions = (state.codebook?.countries || []).map(row => `<option value="${escapeHtml(row[0])}"${row[0] === current.countryCode ? ' selected' : ''}>${escapeHtml(row[1] || row[0])}</option>`).join('');
  const varietyOptions = (state.codebook?.varieties || []).map(row => `<option value="${escapeHtml(row[0])}"${row[0] === (current.varietyCode || current.varietyCodes?.[0]) ? ' selected' : ''}>${escapeHtml(row[1] || row[0])}</option>`).join('');
  const processOptions = (state.codebook?.processes || []).map(row => `<option value="${escapeHtml(row[0])}"${row[0] === (current.processCode || current.processCodes?.[0]) ? ' selected' : ''}>${escapeHtml(row[1] || row[0])}</option>`).join('');
  modal(bean ? '编辑豆卡' : '新增豆卡', `
    <form id="beanForm" class="form-grid">
      <label class="span-2">名称<input name="name" value="${escapeHtml(beanName(current) === '未命名咖啡豆' ? '' : beanName(current))}" required></label>
      <label>国家<select name="countryCode"><option value="">请选择</option>${countryOptions}</select></label>
      <label>豆种<select name="varietyCode"><option value="">请选择</option>${varietyOptions}</select></label>
      <label>处理法<select name="processCode"><option value="">请选择</option>${processOptions}</select></label>
      <label>烘焙度<select name="roastCode">${[0,1,2,3,4,5,6].map(level => `<option value="RL-L${level}"${beanRoastCode(current) === `RL-L${level}` ? ' selected' : ''}>RL-L${level}</option>`).join('')}</select></label>
      <label>烘焙日期<input name="roastDate" type="date" value="${escapeHtml(current.roastDate || '')}"></label>
      <label>初始质量 / g<input name="initialWeight" type="number" min="0" step="0.1" value="${number(current.initialWeight, number(current.remainingWeight, 0))}"></label>
      <label>当前质量 / g<input name="remainingWeight" type="number" min="0" step="0.1" value="${remainingForBean(current)}"></label>
      <label class="span-2">风味标签<input name="flavorTags" value="${escapeHtml((current.flavorTags || []).join('、'))}"></label>
      <label class="span-2">备注<textarea name="notes" rows="4">${escapeHtml(current.notes || '')}</textarea></label>
      <button class="primary span-2" type="submit">保存到本地</button>
    </form>`, dialog => {
      $('#beanForm', dialog).addEventListener('submit', async event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const createdAt = current.createdAt || now();
        const initialWeight = Math.max(0, number(data.get('initialWeight')));
        const remainingWeight = Math.max(0, number(data.get('remainingWeight'), initialWeight));
        const record = {
          ...current,
          id: current.id || id('bean'),
          schemaVersion: DATA_SCHEMA_VERSION,
          revision: Math.max(1, number(current.revision, 0) + 1),
          name: String(data.get('name') || '').trim(),
          countryCode: String(data.get('countryCode') || ''),
          varietyCode: String(data.get('varietyCode') || ''),
          varietyCodes: String(data.get('varietyCode') || '') ? [String(data.get('varietyCode'))] : [],
          processCode: String(data.get('processCode') || ''),
          processCodes: String(data.get('processCode') || '') ? [String(data.get('processCode'))] : [],
          roastCode: String(data.get('roastCode') || 'RL-L2'),
          roastDate: String(data.get('roastDate') || ''),
          initialWeight,
          remainingWeight,
          flavorTags: splitTags(data.get('flavorTags')),
          notes: String(data.get('notes') || ''),
          createdAt,
          updatedAt: now(),
          archived: false
        };
        await put('beans', record);
        if (!eventsForBean(record.id).length) {
          await put('inventoryEvents', makeInventoryEvent({
            id: id('inventory'), beanId: record.id, type: INVENTORY_EVENT_TYPES.INITIAL,
            deltaG: remainingWeight, reason: current.id ? 'Core v2 建立库存基线' : '豆卡初始质量', createdAt: now()
          }));
        } else if (Math.abs(remainingForBean(record) - remainingWeight) > 0.001) {
          await put('inventoryEvents', makeInventoryEvent({
            id: id('inventory'), beanId: record.id, type: INVENTORY_EVENT_TYPES.ADJUSTMENT,
            deltaG: remainingWeight - remainingForBean(record), reason: '手工称重修正', createdAt: now()
          }));
        }
        dialog.close();
        await refresh();
        toast('豆卡已保存到本地', 'good');
      });
    });
}

function beanDetail(bean) {
  modal(beanName(bean), `
    <div class="panel"><dl class="definition-list">
      <dt>国家</dt><dd>${escapeHtml(beanCountry(bean))}</dd><dt>豆种</dt><dd>${escapeHtml(beanVariety(bean))}</dd>
      <dt>处理法</dt><dd>${escapeHtml(beanProcess(bean))}</dd><dt>烘焙</dt><dd>${escapeHtml(beanRoastCode(bean))} · ${escapeHtml(formatDate(bean.roastDate))}</dd>
      <dt>剩余</dt><dd>${remainingForBean(bean).toFixed(1)}g</dd><dt>修订</dt><dd>${number(bean.revision,1)}</dd>
    </dl></div>
    ${bean.notes ? `<div class="panel"><p>${escapeHtml(bean.notes)}</p></div>` : ''}
    <div class="action-grid"><button type="button" data-detail-brew>进入冲煮</button><button type="button" data-detail-edit>编辑</button><button type="button" data-detail-archive>归档</button></div>`, dialog => {
      $('[data-detail-brew]', dialog).addEventListener('click', () => { dialog.close(); switchView('brew'); renderBrewInputs(bean.id); });
      $('[data-detail-edit]', dialog).addEventListener('click', () => { dialog.close(); beanForm(bean); });
      $('[data-detail-archive]', dialog).addEventListener('click', async () => {
        await put('beans', { ...bean, archived: true, revision: number(bean.revision,1) + 1, updatedAt: now() });
        dialog.close(); await refresh(); toast('豆卡已归档');
      });
    });
}

function buildBrewInput() {
  const bean = state.beans.find(item => item.id === $('#brewBean').value);
  if (!bean) throw new Error('请选择咖啡豆');
  return {
    bean: {
      id: bean.id,
      roastCode: beanRoastCode(bean),
      processCode: bean.processCode || bean.processCodes?.[0] || '',
      countryCode: bean.countryCode || '',
      varietyCode: bean.varietyCode || bean.varietyCodes?.[0] || ''
    },
    brew: {
      doseG: clamp($('#brewDose').value, 5, 40),
      ratio: clamp($('#brewRatio').value, 8, 25),
      profileId: $('#brewProfile').value || 'recommended',
      segmentMode: $('#brewProfile').value === 'recommended' ? 'auto' : '',
      dripper: $('#brewDripper').value.trim(),
      dripperCode: $('#brewDripper').value.trim(),
      grinder: $('#brewGrinder').value.trim(),
      lowTempFirst: $('#brewLowTemp').checked
    },
    targets: { floral: 2, acidity: 1.5, sweetness: 2, body: 1.2, bitterness: 1 }
  };
}

function planDuration(plan) {
  const stages = plan?.stages || [];
  return Math.max(number(plan?.totals?.durationSec), ...stages.map(stage => number(stage.startSec) + number(stage.durationSec)), 0);
}
function planLabel(plan) {
  return plan?.profile?.label || plan?.profileLabel || plan?.profileId || plan?.recommendation?.selected?.profile?.label || '本地模型';
}
function renderPlan(plan) {
  const stages = plan?.stages || [];
  $('#planPanel').innerHTML = `
    <section class="panel">
      <div class="card-head"><div><h2>${escapeHtml(planLabel(plan))}</h2><p>引擎 ${escapeHtml(plan.engineVersion || plan.modelVersion || 'LuckyBean local')}</p></div><span class="metric"><strong>${number(plan?.totals?.waterG, stages.at(-1)?.cumulativeWaterG).toFixed(0)}</strong>g</span></div>
      <div class="stage-list">${stages.map((stage,index) => `<div class="stage"><span class="stage-index">${index+1}</span><div><strong>${escapeHtml(stage.name || `第${index+1}段`)}</strong><small>${escapeHtml(stage.method || '')}</small></div><div><strong>${number(stage.stageWaterG).toFixed(0)}g</strong><small>${number(stage.temperatureC).toFixed(0)}℃ · ${formatSeconds(stage.durationSec)}</small></div></div>`).join('')}</div>
      <div class="action-grid"><button type="button" data-action="timer-start">开始计时</button><button type="button" data-action="brew-save">保存并扣除粉量</button></div>
    </section>`;
}

async function ensureInventoryBaseline(bean) {
  if (eventsForBean(bean.id).length) return;
  await put('inventoryEvents', makeInventoryEvent({
    id: id('inventory'), beanId: bean.id, type: INVENTORY_EVENT_TYPES.INITIAL,
    deltaG: remainingForBean(bean), reason: 'Core v2 首次写入前建立库存基线', createdAt: now()
  }));
  state.inventoryEvents = await all('inventoryEvents');
}

async function saveBrewSession() {
  if (!state.plan || !state.planInput) throw new Error('尚未生成方案');
  const bean = state.beans.find(item => item.id === state.planInput.bean.id);
  if (!bean) throw new Error('豆卡不存在');
  const doseG = number(state.planInput.brew.doseG);
  if (remainingForBean(bean) < doseG) throw new Error('剩余咖啡豆不足');
  await ensureInventoryBaseline(bean);
  const createdAt = now();
  const session = {
    id: id('brew'), schemaVersion: DATA_SCHEMA_VERSION, revision: 1,
    beanId: bean.id, doseG, ratio: number(state.planInput.brew.ratio),
    profileId: state.planInput.brew.profileId, profileLabel: planLabel(state.plan),
    plan: state.plan, input: state.planInput, createdAt, updatedAt: createdAt
  };
  await put('brewSessions', session);
  await put('inventoryEvents', makeInventoryEvent({
    id: id('inventory'), beanId: bean.id, type: INVENTORY_EVENT_TYPES.BREW,
    deltaG: -doseG, reason: '冲煮消耗', sourceId: session.id, createdAt
  }));
  const nextRemaining = Math.max(0, remainingForBean(bean) - doseG);
  await put('beans', { ...bean, remainingWeight: nextRemaining, revision: number(bean.revision,1) + 1, updatedAt: createdAt });
  await refresh();
  toast('冲煮记录已保存，库存已扣减', 'good');
}

function startTimer() {
  const plan = state.plan;
  if (!plan) return;
  const total = Math.max(1, planDuration(plan));
  state.timer = { startedAt: performance.now(), elapsed: 0, total, paused: false, pauseStartedAt: 0, pausedMs: 0, interval: null };
  modal('冲煮计时', `<div class="timer"><div id="timerClock" class="timer-clock">${formatSeconds(total)}</div><div id="timerStage" class="timer-stage">准备开始</div><div class="timer-actions"><button type="button" data-timer-pause>暂停</button><button type="button" data-timer-skip>+10秒</button><button type="button" data-timer-stop>结束</button></div></div>`, dialog => {
    const tick = () => {
      if (!state.timer || state.timer.paused) return;
      const elapsed = (performance.now() - state.timer.startedAt - state.timer.pausedMs) / 1000;
      state.timer.elapsed = Math.min(total, elapsed);
      const remaining = Math.max(0, total - state.timer.elapsed);
      $('#timerClock', dialog).textContent = formatSeconds(remaining);
      const stage = (plan.stages || []).findLast(item => state.timer.elapsed >= number(item.startSec)) || plan.stages?.[0];
      $('#timerStage', dialog).textContent = stage ? `${stage.name || '当前阶段'} · ${number(stage.cumulativeWaterG).toFixed(0)}g` : '冲煮中';
      if (remaining <= 0) {
        clearInterval(state.timer.interval);
        state.timer.interval = null;
        $('#timerStage', dialog).textContent = '计时完成';
      }
    };
    state.timer.interval = setInterval(tick, 250); tick();
    $('[data-timer-pause]', dialog).addEventListener('click', event => {
      if (!state.timer) return;
      if (!state.timer.paused) { state.timer.paused = true; state.timer.pauseStartedAt = performance.now(); event.currentTarget.textContent = '继续'; }
      else { state.timer.paused = false; state.timer.pausedMs += performance.now() - state.timer.pauseStartedAt; event.currentTarget.textContent = '暂停'; }
    });
    $('[data-timer-skip]', dialog).addEventListener('click', () => { if (state.timer) state.timer.startedAt -= 10_000; });
    $('[data-timer-stop]', dialog).addEventListener('click', () => { clearInterval(state.timer?.interval); state.timer = null; dialog.close(); });
    dialog.addEventListener('close', () => { clearInterval(state.timer?.interval); state.timer = null; }, { once: true });
  });
}

async function saveSensory(event) {
  event.preventDefault();
  const beanId = $('#sensoryBean').value;
  if (!beanId) return toast('请选择咖啡豆', 'bad');
  const createdAt = now();
  await put('sensoryRecords', {
    id: id('sensory'), schemaVersion: DATA_SCHEMA_VERSION, revision: 1, beanId,
    score: clamp($('#sensoryScore').value, 0, 100),
    tags: splitTags($('#sensoryTags').value), note: $('#sensoryNote').value.trim(),
    createdAt, updatedAt: createdAt
  });
  $('#sensoryTags').value = ''; $('#sensoryNote').value = '';
  await refresh(); toast('品鉴记录已保存到本地', 'good');
}

async function replicate(sessionId) {
  const session = state.brewSessions.find(item => item.id === sessionId);
  if (!session) return;
  switchView('brew');
  renderBrewInputs(session.beanId);
  $('#brewDose').value = number(session.doseG, 15);
  $('#brewRatio').value = number(session.ratio, 15.5);
  if ([...$('#brewProfile').options].some(option => option.value === session.profileId)) $('#brewProfile').value = session.profileId;
  state.plan = session.plan || null;
  state.planInput = session.input || null;
  if (state.plan) renderPlan(state.plan);
  toast('已载入历史方案');
}

function browserDownload(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function snapshot() {
  const stores = {};
  for (const store of CORE_STORES) stores[store] = await all(store).catch(() => []);
  return { source: { platform: nativeStorageAvailable() ? 'android-room' : 'web-indexeddb' }, stores };
}

async function exportBackup() {
  if (nativeStorageAvailable()) {
    const result = await nativeExportBackup({ name: `luckybean_backup_${new Date().toISOString().slice(0,10)}.luckybean` });
    toast(`完整备份已保存：${number(result.recordCount)} 条记录`, 'good'); return;
  }
  const document = await createBackupDocument(await snapshot(), { appVersion: '2.0.0-alpha.1', createdAt: now() });
  browserDownload(`luckybean_backup_${new Date().toISOString().slice(0,10)}.luckybean.json`, JSON.stringify(document, null, 2), 'application/json');
  toast('浏览器兼容备份已导出', 'good');
}

async function restoreBackup() {
  if (nativeStorageAvailable()) {
    const result = await nativeImportBackup();
    toast(`备份已恢复：${number(result.stagedRecords)} 条记录`, 'good');
    setTimeout(() => location.reload(), 800); return;
  }
  const file = await chooseFile('.json,.luckybean');
  if (!file) return;
  const document = JSON.parse(await file.text());
  const verification = await verifyBackupDocument(document);
  if (!verification.ok) throw new Error(verification.errors.join('；'));
  for (const store of CORE_STORES) {
    const values = document.stores?.[store] || [];
    if (values.length) await bulkPut(store, values);
  }
  await refresh(); toast('备份已校验并合并，现有记录未清空', 'good');
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
}
async function exportCsv() {
  const rows = [['ID','名称','国家','豆种','处理法','烘焙日期','剩余克重','风味']];
  for (const bean of state.beans) rows.push([bean.id,beanName(bean),beanCountry(bean),beanVariety(bean),beanProcess(bean),bean.roastDate || '',remainingForBean(bean).toFixed(2),(bean.flavorTags || []).join('|')]);
  const text = '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\n');
  const name = `luckybean_beans_${new Date().toISOString().slice(0,10)}.csv`;
  if (nativeStorageAvailable()) await nativeExportText({ name, mimeType: 'text/csv', text });
  else browserDownload(name, text, 'text/csv;charset=utf-8');
  toast('CSV 已导出', 'good');
}

function chooseFile(accept = '*/*') {
  return new Promise(resolve => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
    input.click();
  });
}

function applyOcrText(text) {
  const lines = String(text || '').split(/\n+/).map(line => line.trim()).filter(Boolean);
  const data = { name: lines[0] || '' };
  const date = text.match(/\b(20\d{2})[./-](0?[1-9]|1[0-2])[./-](0?[1-9]|[12]\d|3[01])\b/);
  if (date) data.roastDate = `${date[1]}-${String(date[2]).padStart(2,'0')}-${String(date[3]).padStart(2,'0')}`;
  const weight = text.match(/\b(\d{2,4}(?:\.\d+)?)\s*(?:g|克)\b/i);
  if (weight) data.weight = Number(weight[1]);
  const normalized = String(text).toLocaleLowerCase('zh-CN');
  for (const table of ['countries','varieties','processes']) {
    for (const row of state.codebook?.[table] || []) {
      const aliases = row.slice(1).filter(value => typeof value === 'string').flatMap(value => value.split(/[、,，/]/)).map(value => value.trim().toLocaleLowerCase('zh-CN')).filter(value => value.length >= 2);
      if (aliases.some(alias => normalized.includes(alias))) { data[table] = row[0]; break; }
    }
  }
  modal('OCR 识别结果', `<div class="panel"><pre>${escapeHtml(text)}</pre></div><div class="action-grid"><button type="button" data-ocr-create>创建豆卡草稿</button><button type="button" data-ocr-copy>复制文字</button></div>`, dialog => {
    $('[data-ocr-copy]', dialog).addEventListener('click', () => navigator.clipboard?.writeText(text));
    $('[data-ocr-create]', dialog).addEventListener('click', () => {
      dialog.close();
      beanForm({
        name: data.name, roastDate: data.roastDate || '', initialWeight: data.weight || 0, remainingWeight: data.weight || 0,
        countryCode: data.countries || '', varietyCode: data.varieties || '', processCode: data.processes || '', notes: `OCR原文：\n${text}`
      });
    });
  });
}

async function openOcr() {
  if (nativeStorageAvailable()) {
    const result = await nativeRecognizeImage(); applyOcrText(result.text || ''); return;
  }
  const file = await chooseFile('image/*');
  if (!file) return;
  modal('浏览器 OCR 后备', `<div class="panel"><p>浏览器核心版未内置大型 OCR 模型。可手工输入豆袋文字；Android 版使用随 APK 打包的中英文模型。</p><textarea id="manualOcrText" rows="10" placeholder="粘贴或输入豆袋文字"></textarea></div><button class="primary" type="button" data-manual-ocr>解析文字</button>`, dialog => {
    $('[data-manual-ocr]', dialog).addEventListener('click', () => { const text = $('#manualOcrText', dialog).value; dialog.close(); applyOcrText(text); });
  });
}

async function scanQr() {
  if (nativeStorageAvailable() && globalThis.LuckyBeanNative?.invoke) {
    const response = await globalThis.LuckyBeanNative.invoke('qr.pickImage');
    const result = response?.value ?? response;
    applyQrText(result?.text || '');
    return;
  }
  const file = await chooseFile('image/*');
  if (!file) return;
  const result = await scanQrFile(file);
  const decoded = decodeJsQrResult(result, state.codebook);
  await importDecodedBean(decoded);
}

function applyQrText(text) {
  try {
    const result = decodeJsQrResult({ data: text }, state.codebook);
    importDecodedBean(result);
  } catch (error) { toast(`二维码内容不受支持：${error.message}`, 'bad'); }
}
async function importDecodedBean(decoded) {
  const record = {
    ...decoded, id: id('bean'), schemaVersion: DATA_SCHEMA_VERSION, revision: 1,
    name: decoded.name || decoded.entityName || decoded.roaster || '二维码导入豆卡',
    initialWeight: number(decoded.initialWeight, 0), remainingWeight: number(decoded.remainingWeight, number(decoded.initialWeight,0)),
    createdAt: now(), updatedAt: now(), archived: false
  };
  await put('beans', record);
  if (record.remainingWeight > 0) await put('inventoryEvents', makeInventoryEvent({ id:id('inventory'),beanId:record.id,type:INVENTORY_EVENT_TYPES.INITIAL,deltaG:record.remainingWeight,reason:'二维码导入',createdAt:now() }));
  await refresh(); switchView('beans'); toast('二维码豆卡已导入本地', 'good');
}

async function diagnostics() {
  const storeCounts = {};
  for (const store of CORE_STORES) storeCounts[store] = (await all(store).catch(() => [])).length;
  const report = {
    generatedAt: now(), coreVersion: CORE_VERSION, schemaVersion: DATA_SCHEMA_VERSION,
    platform: state.capabilities || { platform: 'web', storage: 'indexeddb' },
    online: navigator.onLine, storeCounts,
    userAgent: navigator.userAgent
  };
  modal('本地诊断', `<pre>${escapeHtml(JSON.stringify(report,null,2))}</pre><button type="button" data-diagnostic-export>导出诊断 JSON</button>`, dialog => {
    $('[data-diagnostic-export]', dialog).addEventListener('click', async () => {
      const text = JSON.stringify(report,null,2); const name = `luckybean_diagnostics_${Date.now()}.json`;
      if (nativeStorageAvailable()) await nativeExportText({ name, mimeType:'application/json', text }); else browserDownload(name,text,'application/json');
    });
  });
}

function bindEvents() {
  $$('[data-nav]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.nav)));
  $('#beanSearch').addEventListener('input', renderBeans);
  $('#beanSort').addEventListener('change', renderBeans);
  $('#historyType').addEventListener('change', renderHistory);
  $('#brewForm').addEventListener('submit', async event => {
    event.preventDefault();
    try { state.planInput = buildBrewInput(); state.plan = await computeFallbackPlan(state.planInput); renderPlan(state.plan); toast('方案已在本地生成', 'good'); }
    catch (error) { toast(`方案生成失败：${error.message}`, 'bad'); }
  });
  $('#sensoryForm').addEventListener('submit', saveSensory);
  $('#themeButton').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next; localStorage.setItem('luckybean-core-theme', next);
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const bean = state.beans.find(item => item.id === button.dataset.id);
    try {
      if (action === 'bean-new') beanForm();
      else if (action === 'bean-edit' && bean) beanForm(bean);
      else if (action === 'bean-detail' && bean) beanDetail(bean);
      else if (action === 'bean-brew' && bean) { switchView('brew'); renderBrewInputs(bean.id); }
      else if (action === 'timer-start') startTimer();
      else if (action === 'brew-save') await saveBrewSession();
      else if (action === 'brew-replicate') await replicate(button.dataset.id);
      else if (action === 'backup-export') await exportBackup();
      else if (action === 'backup-import') await restoreBackup();
      else if (action === 'csv-export') await exportCsv();
      else if (action === 'ocr-open') await openOcr();
      else if (action === 'qr-scan') await scanQr();
      else if (action === 'diagnostics') await diagnostics();
    } catch (error) { toast(error.message || String(error), 'bad'); console.error(error); }
  });
  $('#modal').addEventListener('click', event => { if (event.target === $('#modal')) $('#modal').close(); });
  globalThis.addEventListener('online', updateNetworkBadge);
  globalThis.addEventListener('offline', updateNetworkBadge);
}

function updateNetworkBadge() {
  const badge = $('#offlineBadge');
  badge.textContent = navigator.onLine ? '本地就绪 · 可联网' : '离线模式';
  badge.className = `badge ${navigator.onLine ? 'online' : 'offline'}`;
}

async function init() {
  document.documentElement.dataset.theme = localStorage.getItem('luckybean-core-theme') || 'dark';
  bindEvents(); updateNetworkBadge();
  await openDb();
  try {
    const result = await loadCodebook(); state.codebook = result.data; state.codebookIndex = makeIndex(result.data);
  } catch (error) { console.error('内置编码表加载失败', error); state.codebook = { countries:[],regions:[],entities:[],varieties:[],processes:[],flavors:[] }; state.codebookIndex = makeIndex(state.codebook); }
  if (nativeStorageAvailable()) {
    try { state.capabilities = await nativeCapabilities(); $('#platformBadge').textContent = 'Android · GeckoView'; }
    catch (error) { console.warn('原生能力读取失败', error); }
  } else {
    $('#platformBadge').textContent = 'Web / PWA';
  }
  await refresh();
  switchView('beans');
}

init().catch(error => {
  console.error('LuckyBean Core v2 bootstrap failed', error);
  $('#app').innerHTML = `<section class="panel"><h1>Core v2 启动失败</h1><p>${escapeHtml(error.message || error)}</p><p>现有数据未被删除，可返回 Classic 页面继续使用。</p><a class="button-link" href="../index.html">打开 Classic 页面</a></section>`;
});
