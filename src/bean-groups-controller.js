import { all, getSetting } from './db.js';
import { loadCodebook, makeIndex, displayName } from './codebook.js';
import { freshnessProfile, clamp } from './utils.js';
import { normalizeRecommendationScore } from './preference-model.js';
import { beanGroupState, openBeanGroupState, closeBeanGroupState } from './domain/beans/bean-group-state.js';
import { loadBeanGroupMode, saveBeanGroupMode } from './domain/beans/bean-group-settings.js';

if (!globalThis.__LuckyBeanV099tBeanGroupsLoaded) {
  globalThis.__LuckyBeanV099tBeanGroupsLoaded = true;

  const MODE_NATIVE = 'native';
  const MODE_FRESHNESS = 'freshness-ratio';
  const MODE_REMAINING = 'remaining-50';
  const SELECTED_KEY = 'luckybean.selected.bean.v098';
  const RECOMMENDATION_PROMPTS = Object.freeze({
    leaderboard: [
      '直取榜首，不问其余。', '依榜索魁，必得佳味。', '榜单在前，今朝且试头筹。',
      '榜魁已定，此只风味精绝，不负众望。', '一举摘魁，恰逢此豆风味正酣。',
      '众里寻它，终得榜首，宜细细品之。', '照榜点将，专挑那个第一名！'
    ],
    freshness: [
      '此只风味精绝，君既选中，甚是妥当。', '正逢此只风味最盛，您这一选，再好不过。',
      '此只正值风味精妙处，既已选定，便是良配。', '此只正得意时，恰被君眼相中，眼光不差。'
    ],
    price: [
      '此只价冠诸豆，足见君之慧眼独钟。', '此只乃众豆之魁，承君青睐，身价自高。',
      '此只位列首席，价亦昂，唯君堪配此味。', '既择此只风骨，当知众豆之中，以此最为矜贵。'
    ],
    remaining: [
      '余粒无多，宜趁兴饮尽，为此豆作结。', '所剩几何，当及时啜饮，不负此豆风华。',
      '残豆将尽，速饮之，好与此只从容作别。', '此豆见底啦，趁风味未散，快快饮尽收场！'
    ],
    random: [
      '闭目拈签，任其自然。', '信手拈签，以定今日之选。', '且凭一签，决此豆归谁。',
      '一签落地，此只当归于君。', '签指此只，风味正酣，君可安心享之。',
      '得此签，恰逢余粒无几，缘分也。', '伸手拈一签，看天意选哪只！'
    ]
  });
  const recommendationPromptMemory = Object.create(null);

  function recommendationPrompt(mode) {
    const pool = RECOMMENDATION_PROMPTS[mode] || [];
    if (!pool.length) return '';
    const previous = recommendationPromptMemory[mode] || '';
    const choices = pool.filter(value => value !== previous);
    const selected = choices[Math.floor(Math.random() * choices.length)] || pool[0];
    recommendationPromptMemory[mode] = selected;
    return selected;
  }
  const CACHE_TTL = 30000;
  const ROAST_LABELS = Object.freeze({
    'RL-L0': '极浅烘', 'RL-L1': '浅烘', 'RL-L2': '浅中烘', 'RL-L3': '中烘',
    'RL-L4': '中深烘', 'RL-L5': '深烘', 'RL-L6': '极深烘'
  });
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  const measuredRatios = new Map();
  let codebookPromise = null;
  let dataCache = null;
  let dataPromise = null;
  let currentMode = '';
  let recommendationBusy = false;
  let selectedId = localStorage.getItem(SELECTED_KEY) || '';
  let boardHtmlCache = '';

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const nextFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  function toast(message, kind = '') {
    const text = String(message || '').trim();
    if (!text) return;
    document.dispatchEvent(new CustomEvent('luckybean:user-notice', {
      detail: { message: text, kind: kind || 'status-neutral' }
    }));
  }

  async function codebookContext() {
    if (!codebookPromise) codebookPromise = loadCodebook().then(result => ({ index: makeIndex(result.data) }));
    return codebookPromise;
  }

  function labelFor(index, table, code, fallback) {
    return code ? displayName(index, table, code, fallback) : fallback;
  }

  function captureBoard(container = $('#beanGroups')) {
    const board = container?.querySelector('.bean-summary-block');
    if (board) boardHtmlCache = board.outerHTML;
    return boardHtmlCache;
  }

  function captureRenderedRatios() {
    $$('#beanGroups .bean-card[data-bean-id]').forEach(card => {
      const track = $('.bean-freshness-progress', card);
      const solid = $('.bean-freshness-solid', card);
      if (!track || !solid) return;
      const trackWidth = track.getBoundingClientRect().width;
      const solidWidth = solid.getBoundingClientRect().width;
      if (trackWidth > 2 && Number.isFinite(solidWidth)) measuredRatios.set(card.dataset.beanId, clamp(solidWidth / trackWidth, 0, 1));
    });
  }

  function ratioFor(bean) {
    return clamp(Number(freshnessProfile(bean).progress || 0), 0, 1);
  }

  function freshnessStage(bean) {
    const ratio = ratioFor(bean);
    if (ratio < 1 / 3) return '养豆中';
    if (ratio < 2 / 3) return '味正盛';
    return '味将尽';
  }

  function buildScoreMap(records) {
    const aggregate = new Map();
    for (const record of records) {
      if (!record?.beanId) continue;
      const score = normalizeRecommendationScore(record);
      if (!Number.isFinite(score)) continue;
      const row = aggregate.get(record.beanId) || { total: 0, count: 0 };
      row.total += score;
      row.count += 1;
      aggregate.set(record.beanId, row);
    }
    return new Map([...aggregate].map(([beanId, row]) => [beanId, row.count ? row.total / row.count : 0]));
  }

  async function loadData({ force = false } = {}) {
    const now = Date.now();
    if (!force && dataCache && now - dataCache.at < CACHE_TTL) return dataCache;
    if (dataPromise) return dataPromise;
    dataPromise = Promise.all([codebookContext(), all('beans'), all('sensoryRecords')]).then(([{ index }, beans, records]) => {
      const active = beans.filter(bean => !bean.archived && Number(bean.remainingWeight) > 0).sort((a, b) => String(b.roastDate || '').localeCompare(String(a.roastDate || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      dataCache = { at: Date.now(), index, active, scoreMap: buildScoreMap(records) };
      return dataCache;
    }).finally(() => { dataPromise = null; });
    return dataPromise;
  }

  function invalidateData() { dataCache = null; }

  async function getMode() {
    currentMode = await loadBeanGroupMode();
    return currentMode;
  }

  async function saveMode(mode) {
    currentMode = mode;
    await saveBeanGroupMode(mode);
  }

  async function nativeGroupMethod() {
    const settings = await getSetting('app.settings', {});
    const method = String(settings?.groupMethod || 'country');
    return ['country', 'variety', 'roast', 'process'].includes(method) ? method : 'country';
  }

  function nativeGroupKey(bean, index, method) {
    if (method === 'variety') return labelFor(index, 'varieties', bean.varietyCode, '未记录豆种');
    if (method === 'roast') return ROAST_LABELS[bean.roastCode] || '未记录烘焙度';
    if (method === 'process') return labelFor(index, 'processes', bean.processCode, '未记录处理法');
    return labelFor(index, 'countries', bean.countryCode, '未记录国家');
  }

  function groupData(active, mode) {
    if (mode === MODE_FRESHNESS) {
      const order = ['养豆中', '味正盛', '味将尽'];
      const groups = new Map(order.map((label, index) => [label, { key: label, label, order: index, items: [] }]));
      for (const bean of active) groups.get(freshnessStage(bean)).items.push(bean);
      return [...groups.values()];
    }
    const groups = new Map();
    for (const bean of active) {
      const weight = Math.max(0, Number(bean.remainingWeight || 0));
      const start = Math.floor(weight / 50) * 50;
      const key = String(start);
      if (!groups.has(key)) groups.set(key, { key, label: `${start}–${start + 49}g`, order: start, items: [] });
      groups.get(key).items.push(bean);
    }
    return [...groups.values()].sort((a, b) => a.order - b.order);
  }

  function sortedItems(items, mode) {
    const copy = [...items];
    if (mode === MODE_FRESHNESS) return copy.sort((a, b) => String(b.roastDate || '').localeCompare(String(a.roastDate || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return copy.sort((a, b) => Number(a.remainingWeight || 0) - Number(b.remainingWeight || 0) || String(b.roastDate || '').localeCompare(String(a.roastDate || '')));
  }

  function beanCardHtml(bean, index, scoreMap) {
    const process = labelFor(index, 'processes', bean.processCode, '处理法未记');
    const country = labelFor(index, 'countries', bean.countryCode, '未定国家');
    const variety = labelFor(index, 'varieties', bean.varietyCode, '未定豆种');
    const fresh = freshnessProfile(bean);
    const score = scoreMap.get(bean.id) || 0;
    const progress = Math.round(ratioFor(bean) * 1000) / 10;
    const selected = bean.id === selectedId;
    return `<article class="bean-card compact lb-one-line-bean${selected ? ' recommended v099l-selected' : ''}" data-bean-id="${esc(bean.id)}" tabindex="0"><div class="compact-bean-copy"><h3>${esc(country)} · ${esc(variety)}</h3><small>${esc(process)}</small><div class="compact-bean-row"><strong>${Number(bean.remainingWeight || 0).toFixed(1)}g${bean.refrigerated ? '<small class="frozen-mark">❄️</small>' : ''}</strong><span class="compact-score">${score ? `${score.toFixed(1)}分` : '未评分'}${selected ? '<em>选</em>' : ''}</span></div></div><button class="cup-action compact-pick" type="button" data-brew-bean="${esc(bean.id)}">酌</button><div class="bean-freshness-progress" data-lb-freshness-timeline aria-label="时间轴已填充${progress}%"><span class="bean-freshness-solid" style="width:${progress}%;background:${fresh.color}"></span><span class="bean-freshness-dashed" style="left:${progress}%"></span></div></article>`;
  }

  function modeNote(mode) {
    return mode === MODE_FRESHNESS ? '按时间轴有色长度÷整行宽度分为三组：不足1/3为“养豆中”，达到1/3且不足2/3为“味正盛”，达到2/3为“味将尽”。组内按烘焙日期由新到旧。' : '按当前余量每50g划分一组；组内按剩余克重由少到多排列。';
  }

  async function render({ force = false, refreshData = false } = {}) {
    await getMode();
    if (refreshData) invalidateData();
    // The app owns the list for every mode, including background refreshes.
    globalThis.LuckyBeanBeanListView?.render();
    globalThis.LuckyBeanFreshnessTimeline?.refresh?.();
  }

  async function closeActiveGroup({ refreshData = false } = {}) {
    if (!beanGroupState.groupKey) return false;
    closeBeanGroupState();
    const container = $('#beanGroups');
    if (container) delete container.dataset.v099tGroupKey;
    await render({ force: true, refreshData });
    document.dispatchEvent(new CustomEvent('luckybean:bean-group-closed', { detail: { mode: currentMode || MODE_NATIVE, source: 'special' } }));
    return true;
  }

  function pickBean(mode, beans, scoreMap) {
    if (mode === 'leaderboard') return [...beans].sort((a, b) => (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0))[0];
    if (mode === 'freshness') return [...beans].sort((a, b) => Number(freshnessProfile(b).flavorScore || 0) - Number(freshnessProfile(a).flavorScore || 0))[0];
    if (mode === 'price') return [...beans].sort((a, b) => Number(b.price || 0) - Number(a.price || 0))[0];
    if (mode === 'remaining') return [...beans].sort((a, b) => Number(a.remainingWeight || 0) - Number(b.remainingWeight || 0))[0];
    return beans[Math.floor(Math.random() * beans.length)];
  }

  async function openRecommendationTarget(bean, index) {
    const mode = await getMode();
    if (mode === MODE_NATIVE) {
      const method = await nativeGroupMethod();
      const key = nativeGroupKey(bean, index, method);
      const api = globalThis.LuckyBeanBeanGroupState;
      if (!api?.open?.(key)) throw new Error('原生分组状态接口不可用');
      return;
    }
    const key = mode === MODE_FRESHNESS
      ? freshnessStage(bean)
      : String(Math.floor(Math.max(0, Number(bean.remainingWeight || 0)) / 50) * 50);
    openBeanGroupState(key);
    const container = $('#beanGroups');
    if (container) delete container.dataset.v099tGroupKey;
    await render({ force: true });
  }

  async function animateBean(bean, index, { persist = false, duration = 720 } = {}) {
    if (persist) { selectedId = bean.id; localStorage.setItem(SELECTED_KEY, selectedId); }
    await openRecommendationTarget(bean, index);
    await nextFrames();
    const card = $(`#beanGroups [data-bean-id="${CSS.escape(bean.id)}"]`);
    if (!card) return wait(duration);
    card.classList.remove('recommend-step');
    void card.offsetWidth;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('recommend-step');
    await wait(duration);
    card.classList.remove('recommend-step');
    if (persist) card.classList.add('recommended', 'v099l-selected');
  }

  async function runRecommendation(mode) {
    if (recommendationBusy) return;
    recommendationBusy = true;
    $$('.recommend-menu,.popup-menu').forEach(node => node.remove());
    try {
      const { index, active, scoreMap } = await loadData();
      if (!active.length) return toast('没有可推荐的豆卡');
      selectedId = '';
      let selected;
      if (mode === 'random') {
        const rounds = Math.floor(Math.random() * 5) + 4;
        let previous = '';
        for (let step = 0; step < rounds; step += 1) {
          const pool = active.length > 1 ? active.filter(bean => bean.id !== previous) : active;
          selected = pool[Math.floor(Math.random() * pool.length)];
          previous = selected.id;
          await animateBean(selected, index, { persist: step === rounds - 1, duration: step === rounds - 1 ? 820 : 420 });
        }
      } else {
        selected = pickBean(mode, active, scoreMap);
        await animateBean(selected, index, { persist: true, duration: 820 });
      }
      const prompt = recommendationPrompt(mode);
      document.dispatchEvent(new CustomEvent('luckybean:recommendation-prompt', { detail: { mode, prompt, beanId: selected?.id || '' } }));
      toast(prompt, 'recommendation');
    } finally { recommendationBusy = false; }
  }

  async function handleClick(event) {
    const mode = beanGroupState.mode;
    const dismiss = event.target.closest?.('[data-close-bean-group]');
    if (dismiss && [MODE_FRESHNESS, MODE_REMAINING].includes(mode) && beanGroupState.groupKey) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      await closeActiveGroup({ refreshData: true });
      return;
    }
    const recommendation = event.target.closest?.('[data-recommend-mode]');
    if (recommendation) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      runRecommendation(recommendation.dataset.recommendMode).catch(error => toast(error.message, 'status-bad'));
      return;
    }
    const freshness = event.target.closest?.('[data-v099f-group-freshness],[data-v099i-group-freshness]');
    if (freshness) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      captureBoard(); captureRenderedRatios(); await saveMode(MODE_FRESHNESS); $$('.popup-menu').forEach(node => node.remove());
      const container = $('#beanGroups'); if (container) delete container.dataset.v099tGroupKey;
      await render({ force: true }); return;
    }
    const remaining = event.target.closest?.('[data-v098-group-method="remaining-50"]');
    if (remaining) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      captureBoard(); captureRenderedRatios(); await saveMode(MODE_REMAINING); $$('.popup-menu').forEach(node => node.remove());
      const container = $('#beanGroups'); if (container) delete container.dataset.v099tGroupKey;
      await render({ force: true }); return;
    }
    const group = event.target.closest?.('[data-v099t-open-group]');
    if (group) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); openBeanGroupState(group.dataset.v099tOpenGroup);
      const container = $('#beanGroups'); if (container) delete container.dataset.v099tGroupKey;
      await render({ force: true }); return;
    }
    if (event.target.closest?.('[data-group-method]')) { await saveMode(MODE_NATIVE); invalidateData(); return; }
    if (event.target.closest?.('[data-page-target="beans"]') && [MODE_FRESHNESS, MODE_REMAINING].includes(mode)) {
      if (beanGroupState.groupKey) closeActiveGroup({ refreshData: true }).catch(() => {});
      else setTimeout(() => { captureBoard(); const container = $('#beanGroups'); if (container) delete container.dataset.v099tGroupKey; render({ force: true, refreshData: true }).catch(() => {}); }, 60);
    }
  }

  window.addEventListener('click', event => { handleClick(event).catch(error => console.error('豆藏分组处理失败', error)); }, true);
  window.addEventListener('pageshow', invalidateData);
  document.addEventListener('luckybean:app-refreshed', invalidateData);
  document.addEventListener('luckybean:data-changed', () => { invalidateData(); });
  document.addEventListener('luckybean:close-bean-group', event => {
    if (!beanGroupState.groupKey) return;
    event.preventDefault?.();
    closeActiveGroup().catch(error => console.warn('豆藏分组关闭失败', error));
  });

  document.addEventListener('luckybean:bean-group-closed', event => {
    if (event.detail?.source === 'special') return;
    const mode = beanGroupState.mode;
    if (![MODE_FRESHNESS, MODE_REMAINING].includes(mode)) return;
    const container = $('#beanGroups');
    if (container) delete container.dataset.v099tGroupKey;
    render({ force: true, refreshData: true }).catch(error => console.warn('特殊分组关闭后重绘失败', error));
  });

  const prewarm = () => loadData().catch(() => {});
  if ('requestIdleCallback' in globalThis) requestIdleCallback(prewarm, { timeout: 1600 }); else setTimeout(prewarm, 600);
  const settingsReady = globalThis.__LuckyBeanAppSettingsReady
    ? Promise.resolve()
    : new Promise(resolve => document.addEventListener('luckybean:app-settings-ready', resolve, { once: true }));
  settingsReady
    .then(() => getMode())
    .catch(() => {});

  globalThis.LuckyBeanV099tBeanGroups = {
    render,
    captureRenderedRatios,
    ratioFor,
    runRecommendation,
    invalidateData,
    closeActiveGroup,
    hasActiveGroup: () => Boolean(beanGroupState.groupKey),
    activeGroup: () => beanGroupState.groupKey
  };
}
