import { loadCodebook, makeIndex } from '../codebook.js';

const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const $$ = (selector, root = document) => root?.querySelectorAll ? [...root.querySelectorAll(selector)] : [];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const GUIDE_INTRO = '请先在器设页面中注册或登录账户，以便同步数据到云端。添加滤纸滤杯和磨豆机信息，添丁（增加咖啡豆）-小酌（进行冲煮）-品鉴（三种品鉴方式可选），更多功能请参考使用说明。';
const FLAVOR_GROUPS = ['花香','果香','茶感','香料','其他'];
let codebookIndex = null;
let overlayObserver = null;

function classifyFlavor(name = '', category = '') {
  const value = String(name).normalize('NFKC');
  const categoryValue = String(category || '').normalize('NFKC');
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
  codebookIndex = makeIndex(loaded?.data || loaded);
  return codebookIndex;
}
function flavorCategory(index, code) {
  const row = index?.flavors?.get(String(code || ''))?.row;
  return Array.isArray(row) && row.length >= 9 ? String(row[1] || '') : '';
}

async function organizeFlavorPicker(overlay) {
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
    const liveButtons = $$('.flavor-button[data-flavor-code]', liveHost);
    if (!liveHost || !liveButtons.length) return;
    const buckets = new Map(FLAVOR_GROUPS.map(label => [label, []]));
    liveButtons.forEach(button => buckets.get(classifyFlavor(button.textContent, flavorCategory(index, button.dataset.flavorCode))).push(button));
    liveHost.replaceChildren();
    FLAVOR_GROUPS.forEach(label => {
      const section = document.createElement('details');
      section.className = 'flavor-group';
      const title = document.createElement('summary'); title.textContent = label;
      const grid = document.createElement('div'); grid.className = 'flavor-grid';
      buckets.get(label).forEach(button => grid.append(button));
      section.append(title, grid); liveHost.append(section);
    });
    overlay.dataset.lbFlavorTaxonomy = '1';
    const dialog = $('.dialog', overlay);
    if (dialog) dialog.scrollTop = 0;
  } finally {
    delete overlay.dataset.lbFlavorTaxonomyPending;
  }
}

function guideHtml() {
  return `<div class="lb-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="lbGuideTitle"><header><h2 id="lbGuideTitle">使用说明</h2><p>${esc(GUIDE_INTRO)}</p></header><div class="lb-guide-scroll" tabindex="0"><section><h3>一、豆藏</h3><p><strong>添丁</strong>用于增加咖啡豆。可手工录入，也可使用咖啡豆包装图片识别或 BrewIon 二维码。建议完善国家、产区、庄园/处理站、豆种、处理法、烘焙度、烘焙日期、重量、海拔、烘焙商、风味等信息。</p><p>豆卡采用单行显示，下方时间轴表示养豆与赏味进度；颜色和长度根据烘焙度、豆种、处理法、日期及冷藏状态计算。可搜索、筛选、分组、按赏味期查看，也可编辑豆卡、管理库存和查看历史豆卡。</p></section><section><h3>二、小酌</h3><p>先选择豆卡，再设定粉量与粉水比、滤杯、滤纸、冲煮方式、调水方案、微调和目标风味，以及首段/尾段温度。滤杯材质、角度和旁通量由器设中选定的滤杯自动带入，滤纸流速由选定滤纸自动带入，不在小酌中重复设置。</p><p>计算结果包含分段注水、温度、时间、方案倾向和三维冲煮轨迹。开始冲煮后可使用计时、分段提示和语音提示；完成后可记录实际豆量与滤纸消耗，并进入品鉴。</p></section><section><h3>三、品鉴</h3><p>可选择三种方式：<strong>杯测品鉴</strong>、<strong>玩家互动品鉴</strong>和<strong>札记</strong>。杯测品鉴可按干湿香、高温、中温、低温、余韵、酸质、甜感和口感记录标签与强度，并结合雷达图、缺陷和主观分差形成记录。</p></section><section><h3>四、器设</h3><p><strong>账户：</strong>建议先注册或登录，以便自动同步豆卡、冲煮、品鉴和设置数据。</p><p><strong>私器：</strong>登记常用滤杯、滤纸和磨豆机。滤杯角度、旁通量、材质和滤纸速度与器具本身绑定。</p><p><strong>数藏：</strong>查看偏好、健康提醒、数据源状态及数据管理。</p><p><strong>本物：</strong>查看版本与开发信息，并可再次打开本使用说明。</p></section><section><h3>数据与使用建议</h3><p>首次使用建议按“器设登录和登记器具 → 添丁建立豆卡 → 小酌计算并冲煮 → 品鉴记录结果”的顺序进行。</p></section></div><footer><button type="button" class="button primary" data-lb-guide-close>关闭</button></footer></div>`;
}
function openGuide() {
  const root = $('#overlayRoot');
  if (!root) return;
  root.innerHTML = `<div class="overlay lb-guide-overlay" data-overlay="user-guide">${guideHtml()}</div>`;
  const overlay = root.firstElementChild;
  const close = () => { if (root.firstElementChild === overlay) root.replaceChildren(); };
  $('[data-lb-guide-close]', overlay)?.addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  requestAnimationFrame(() => $('.lb-guide-scroll', overlay)?.focus({ preventScroll:true }));
}
function renderAboutGuideEntry() {
  const body = $('#settingsContent .settings-category-body.about-content');
  if (!body) return;
  const section = body.closest('.settings-category');
  if (section) { section.dataset.settingsKey = 'about'; section.id ||= 'aboutCategory'; }
  const intro = [...body.children].find(node => node.tagName === 'P');
  if (intro && intro.textContent !== GUIDE_INTRO) intro.textContent = GUIDE_INTRO;
  if (!$('[data-lb-open-guide]', body)) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'button lb-open-guide'; button.dataset.lbOpenGuide = '1'; button.textContent = '使用说明';
    body.append(button);
  }
  document.dispatchEvent(new CustomEvent('luckybean:about-ready', { detail:{ section } }));
}
function currentProfileLabel(profileId) {
  const profiles = globalThis.LuckyBeanBrewProfiles?.list?.() || [];
  return profiles.find(profile => profile.id === profileId)?.label || profileId;
}
function renderAutoRecommendation(plan) {
  const matching = plan?.matching || {};
  const selectedId = String(matching.selectedProfileId || plan?.profile?.id || '').trim();
  if (!selectedId || selectedId === 'recommended') return;
  const host = $('#generatedPlan') || $('#planResult'); if (!host) return;
  const existing = $('[data-lb-auto-profile]', host); const score = Number(matching.score); const signature = `${selectedId}:${Number.isFinite(score) ? score.toFixed(2) : ''}`;
  if (existing?.dataset.lbAutoProfile === signature) return;
  existing?.remove();
  const node = document.createElement('div'); node.className = 'lb-auto-profile'; node.dataset.lbAutoProfile = signature;
  node.innerHTML = `<strong>自动</strong><span>${esc(currentProfileLabel(selectedId))}</span>${Number.isFinite(score) ? `<small>匹配 ${score.toFixed(1)}</small>` : '<small>由豆卡、器具与风味目标综合匹配</small>'}`;
  host.prepend(node);
}
function bindOverlayObserver() {
  const root = $('#overlayRoot');
  if (!root || overlayObserver) return;
  overlayObserver = new MutationObserver(() => { const overlay = $('[data-overlay="flavors"]', root); if (overlay) organizeFlavorPicker(overlay); });
  overlayObserver.observe(root, { childList:true, subtree:false });
}
function renderSettingsEnhancements() { renderAboutGuideEntry(); }

document.addEventListener('click', event => { if (event.target.closest?.('[data-lb-open-guide]')) { event.preventDefault(); openGuide(); } });
document.addEventListener('luckybean:app-refreshed', renderSettingsEnhancements);
document.addEventListener('luckybean:settings-rendered', renderSettingsEnhancements);
document.addEventListener('luckybean:codebook-provider-activated', () => { codebookIndex = null; const overlay = $('[data-overlay="flavors"]'); if (overlay) delete overlay.dataset.lbFlavorTaxonomy; });
document.addEventListener('luckybean:plan-ready', event => requestAnimationFrame(() => renderAutoRecommendation(event.detail?.plan)));
document.addEventListener('luckybean:local-app-ready', () => { bindOverlayObserver(); renderSettingsEnhancements(); }, { once:true });
bindOverlayObserver();
renderSettingsEnhancements();

globalThis.LuckyBeanFlavorGuide = { classifyFlavor, openGuide, organizeFlavorPicker, renderAboutGuideEntry, renderAutoRecommendation };
