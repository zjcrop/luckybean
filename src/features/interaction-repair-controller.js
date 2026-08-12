import { all, put } from '../db.js';
import { loadCodebook, makeIndex, displayName } from '../codebook.js';

const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const $$ = (selector, root = document) => root?.querySelectorAll ? [...root.querySelectorAll(selector)] : [];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const GUIDE_INTRO = '请先在器设页面中注册或登录账户，以便同步数据到云端。添加滤纸滤杯和磨豆机信息，添丁（增加咖啡豆）-小酌（进行冲煮）-品鉴（三种品鉴方式可选），更多功能请参考使用说明。';
const FLAVOR_GROUPS = ['花香', '果香', '茶感', '香料', '其他'];
let codebookIndex = null;
let enrichmentRunning = false;
let enrichmentQueued = false;

function classifyFlavor(name = '', category = '') {
  const value = String(name).normalize('NFKC');
  const categoryValue = String(category || '').normalize('NFKC');
  // Tea is separated first because SCA-style source tables may place Black Tea under Floral.
  if (/茶|乌龙|红茶|绿茶|伯爵|茶汤|\btea\b/i.test(value)) return '茶感';
  if (/^floral$/i.test(categoryValue) || /floral/i.test(categoryValue)) return '花香';
  if (/^fruity$/i.test(categoryValue) || /fruity/i.test(categoryValue)) return '果香';
  if (/^spices?$/i.test(categoryValue) || /spices?/i.test(categoryValue)) return '香料';
  if (/花|茉莉|玫瑰|紫罗兰|洋甘菊|橙花|桂花|薰衣草|栀子|白花/.test(value)) return '花香';
  if (/果|莓|柑|橘|柠檬|青柠|桃|苹果|梨|葡萄|芒果|菠萝|百香|李子|樱桃|杏|瓜|佛手柑/.test(value)) return '果香';
  if (/香料|肉桂|丁香|胡椒|姜|茴香|豆蔻|香草|肉豆蔻/.test(value)) return '香料';
  return '其他';
}

async function ensureCodebookIndex() {
  if (codebookIndex) return codebookIndex;
  const loaded = await loadCodebook();
  const book = loaded?.data || loaded;
  codebookIndex = makeIndex(book);
  return codebookIndex;
}

function named(index, table, code, fallback = '') {
  const value = String(displayName(index, table, code, fallback) || '').trim();
  return value === '—' ? '' : value;
}

function flavorCategory(index, code) {
  const row = index?.flavors?.get(String(code || ''))?.row;
  return Array.isArray(row) && row.length >= 9 ? String(row[1] || '') : '';
}

async function enrichBeansForMatching() {
  if (enrichmentRunning) return;
  enrichmentRunning = true;
  try {
    const index = await ensureCodebookIndex();
    const beans = await all('beans').catch(() => []);
    for (const bean of beans) {
      if (!bean?.id) continue;
      const flavorNames = [...new Set((bean.flavorCodes || []).map(code => named(index, 'flavors', code, '')).filter(Boolean))];
      const next = {
        ...bean,
        countryName: bean.countryName || named(index, 'countries', bean.countryCode, ''),
        regionName: bean.regionName || named(index, 'regions', bean.regionCode, ''),
        entityName: bean.entityName || named(index, 'entities', bean.entityCode, ''),
        varietyName: bean.varietyName || named(index, 'varieties', bean.varietyCode, ''),
        processName: bean.processName || named(index, 'processes', bean.processCode, ''),
        flavorText: flavorNames.join(' ')
      };
      const changed = ['countryName', 'regionName', 'entityName', 'varietyName', 'processName', 'flavorText']
        .some(key => String(next[key] || '') !== String(bean[key] || ''));
      if (changed) await put('beans', next);
    }
  } catch (error) {
    console.warn('豆卡匹配语义补全失败', error);
  } finally {
    enrichmentRunning = false;
  }
}

function queueEnrichment() {
  if (enrichmentQueued) return;
  enrichmentQueued = true;
  setTimeout(() => {
    enrichmentQueued = false;
    enrichBeansForMatching();
  }, 80);
}

async function repairFlavorPicker(overlay) {
  if (!overlay || overlay.dataset.lbFlavorTaxonomy === '1' || overlay.dataset.lbFlavorTaxonomyPending === '1') return;
  const host = $('.flavor-groups', overlay);
  if (!host) return;
  const buttons = $$('.flavor-button[data-flavor-code]', host);
  if (!buttons.length) return;
  overlay.dataset.lbFlavorTaxonomyPending = '1';
  try {
    const index = await ensureCodebookIndex().catch(() => null);
    if (!overlay.isConnected) return;
    const liveHost = $('.flavor-groups', overlay);
    if (!liveHost) return;
    const liveButtons = $$('.flavor-button[data-flavor-code]', liveHost);
    if (!liveButtons.length) return;
    const buckets = new Map(FLAVOR_GROUPS.map(label => [label, []]));
    liveButtons.forEach(button => {
      const category = flavorCategory(index, button.dataset.flavorCode);
      buckets.get(classifyFlavor(button.textContent, category)).push(button);
    });
    liveHost.replaceChildren();
    FLAVOR_GROUPS.forEach(label => {
      const section = document.createElement('section');
      section.className = 'flavor-group';
      const title = document.createElement('h3');
      title.textContent = label;
      const grid = document.createElement('div');
      grid.className = 'flavor-grid';
      buckets.get(label).forEach(button => grid.append(button));
      section.append(title, grid);
      liveHost.append(section);
    });
    overlay.dataset.lbFlavorTaxonomy = '1';
    const dialog = $('.dialog', overlay);
    if (dialog) dialog.scrollTop = 0;
    liveHost.scrollTop = 0;
    requestAnimationFrame(() => {
      if (dialog) dialog.scrollTop = 0;
      liveHost.scrollTop = 0;
    });
  } finally {
    delete overlay.dataset.lbFlavorTaxonomyPending;
  }
}

function currentProfileLabel(profileId) {
  const profiles = globalThis.LuckyBeanBrewProfiles?.list?.() || [];
  return profiles.find(profile => profile.id === profileId)?.label || profileId;
}

function renderAutoRecommendation(plan) {
  const matching = plan?.matching || {};
  const selectedId = String(matching.selectedProfileId || plan?.profile?.id || '').trim();
  if (!selectedId || selectedId === 'recommended') return;
  const host = $('#generatedPlan') || $('#planResult');
  if (!host) return;
  const existing = $('[data-lb-auto-profile]', host);
  const score = Number(matching.score);
  const label = currentProfileLabel(selectedId);
  const signature = `${selectedId}:${Number.isFinite(score) ? score.toFixed(2) : ''}`;
  if (existing?.dataset.lbAutoProfile === signature) return;
  existing?.remove();
  const node = document.createElement('div');
  node.className = 'lb-auto-profile';
  node.dataset.lbAutoProfile = signature;
  node.innerHTML = `<strong>豆卡自动推荐</strong><span>${esc(label)}</span>${Number.isFinite(score) ? `<small>匹配 ${score.toFixed(1)}</small>` : '<small>由豆卡、器具与风味目标综合匹配</small>'}`;
  host.prepend(node);
}

function guideHtml() {
  return `<div class="lb-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="lbGuideTitle">
    <header><h2 id="lbGuideTitle">使用说明</h2><p>${esc(GUIDE_INTRO)}</p></header>
    <div class="lb-guide-scroll" tabindex="0">
      <section><h3>一、豆藏</h3><p><strong>添丁</strong>用于增加咖啡豆。可手工录入，也可使用咖啡豆包装图片识别或 BrewIon 二维码。建议完善国家、产区、庄园/处理站、豆种、处理法、烘焙度、烘焙日期、重量、海拔、烘焙商、风味等信息。</p><p>豆卡采用单行显示，下方时间轴表示养豆与赏味进度；颜色和长度根据烘焙度、豆种、处理法、日期及冷藏状态计算。可搜索、筛选、分组、按赏味期查看，也可编辑豆卡、管理库存和查看历史豆卡。</p></section>
      <section><h3>二、小酌</h3><p>先选择豆卡，再设定粉量与粉水比、滤杯、滤纸、冲煮方式、调水方案、微调和目标风味，以及首段/尾段温度。滤杯材质、角度和旁通量由器设中选定的滤杯自动带入，滤纸流速由选定滤纸自动带入，不在小酌中重复设置。选择“模型推荐”时，系统会把豆卡的烘焙、处理法、豆种和风味特征，与器具修正及目标风味一起交给 BrewProfiles 选择更合适的方案。</p><p>计算结果包含分段注水、温度、时间、方案倾向和三维冲煮轨迹。开始冲煮后可使用计时、分段提示和语音提示；完成后可记录实际豆量与滤纸消耗，并进入品鉴。</p></section>
      <section><h3>三、品鉴</h3><p>可选择三种方式：<strong>杯测品鉴</strong>、<strong>玩家互动品鉴</strong>和<strong>札记</strong>。杯测品鉴可按干湿香、高温、中温、低温、余韵、酸质、甜感和口感记录标签与强度，并结合雷达图、缺陷和主观分差形成记录；玩家互动适合较快的风味反馈；札记适合直接记录自然语言感受与评分。</p><p>品鉴可以关联刚完成的冲煮方案，也可以独立记录。历史记录用于比较同一咖啡豆、不同方案和不同参数下的表现，并逐步形成个人风味偏好。</p></section>
      <section><h3>四、器设</h3><p><strong>账户：</strong>建议先注册或登录，以便自动同步豆卡、冲煮、品鉴和设置数据，并查看同步状态及恢复选项。</p><p><strong>私器：</strong>登记常用滤杯、滤纸和磨豆机。新增或编辑滤杯时设置材质、角度和旁通量；新增或编辑滤纸时设置过滤速度。这些属性与器具本身绑定，小酌选择器具后自动加载并作为方案匹配修正条件。</p><p><strong>数藏：</strong>可查看风味喜好数字测写、咖啡世界、健康提醒、数据源状态，并进行备份导出、导入和本地数据管理。</p><p><strong>本物：</strong>查看版本、数据结构、数据源与开发信息，并可再次打开本使用说明。网页端与 APP 使用同一套数据结构和主要交互。</p></section>
      <section><h3>数据与使用建议</h3><p>首次使用建议按“器设登录和登记器具 → 添丁建立豆卡 → 小酌计算并冲煮 → 品鉴记录结果”的顺序进行。豆卡信息越完整，尤其是烘焙、处理法、豆种和风味标签越准确，自动方案匹配的依据越充分。</p></section>
    </div>
    <footer><button type="button" class="button primary" data-lb-guide-close>关闭</button></footer>
  </div>`;
}

function openGuide() {
  const root = $('#overlayRoot');
  if (!root) return;
  root.innerHTML = `<div class="overlay lb-guide-overlay" data-overlay="user-guide">${guideHtml()}</div>`;
  const overlay = root.firstElementChild;
  const close = () => { if (root.firstElementChild === overlay) root.replaceChildren(); };
  $('[data-lb-guide-close]', overlay)?.addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  requestAnimationFrame(() => $('.lb-guide-scroll', overlay)?.focus({ preventScroll: true }));
}

function repairAboutSection() {
  const summaries = $$('.settings-category > summary');
  const summary = summaries.find(node => $('span', node)?.textContent?.trim() === '本物');
  const section = summary?.parentElement;
  const body = $('.settings-category-body.about-content', section);
  if (!body) return;
  const intro = [...body.children].find(node => node.tagName === 'P');
  if (intro && intro.textContent !== GUIDE_INTRO) intro.textContent = GUIDE_INTRO;
  if (!$('[data-lb-open-guide]', body)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button lb-open-guide';
    button.dataset.lbOpenGuide = '1';
    button.textContent = '使用说明';
    body.append(button);
  }
}

function repairDom() {
  void repairFlavorPicker(document.querySelector('[data-overlay="flavors"]'));
  repairAboutSection();
}

document.addEventListener('click', event => {
  if (event.target.closest?.('[data-lb-open-guide]')) {
    event.preventDefault();
    openGuide();
  }
});

document.addEventListener('luckybean:app-refreshed', () => {
  queueEnrichment();
  requestAnimationFrame(repairDom);
});
document.addEventListener('luckybean:codebook-provider-activated', () => {
  codebookIndex = null;
  const overlay = document.querySelector('[data-overlay="flavors"]');
  if (overlay) delete overlay.dataset.lbFlavorTaxonomy;
  queueEnrichment();
  requestAnimationFrame(repairDom);
});
document.addEventListener('luckybean:plan-ready', event => {
  requestAnimationFrame(() => renderAutoRecommendation(event.detail?.plan));
});

new MutationObserver(() => repairDom()).observe(document.body, { childList: true, subtree: true });

if (document.documentElement.dataset.startup === 'ready') {
  queueEnrichment();
  repairDom();
} else {
  document.addEventListener('luckybean:local-app-ready', () => {
    queueEnrichment();
    repairDom();
  }, { once: true });
}

globalThis.LuckyBeanInteractionRepair = { classifyFlavor, openGuide, enrichBeansForMatching, renderAutoRecommendation };
