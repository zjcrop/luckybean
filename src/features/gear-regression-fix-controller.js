// 1.23E compatibility guard for the former small-brew matching gear editor.
// 滤杯角度、旁通量和滤纸流速现在只允许在“器设 → 私器”中随器具保存；
// 小酌只选择器具，不再拥有第二套可编辑参数。
const BLOCK_SELECTOR = '[data-lb-matching-gear]';
const SENTINEL_SELECTOR = '[data-lb-matching-gear][data-lb-legacy-gear-disabled]';
const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const $$ = (selector, root = document) => root?.querySelectorAll ? [...root.querySelectorAll(selector)] : [];
let queued = false;

function disableLegacySmallBrewEditor() {
  const host = $('#brewContent');
  if (!host) return;
  // Keep one inert hidden sentinel so the legacy integration controller sees the old block as
  // already present and never recreates its editable angle/bypass/paper-speed controls.
  $$(BLOCK_SELECTOR, host).forEach(node => {
    if (!node.matches(SENTINEL_SELECTOR)) node.remove();
  });
  if (!$(SENTINEL_SELECTOR, host)) {
    const sentinel = document.createElement('span');
    sentinel.dataset.lbMatchingGear = '';
    sentinel.dataset.lbLegacyGearDisabled = '1';
    sentinel.hidden = true;
    sentinel.setAttribute('aria-hidden', 'true');
    host.append(sentinel);
  }
}

function scheduleCleanup() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    disableLegacySmallBrewEditor();
  });
}

const observer = new MutationObserver(records => {
  if (records.some(record => {
    const target = record.target instanceof Element ? record.target : record.target?.parentElement;
    return target?.closest?.('#brewContent')
      || [...record.addedNodes].some(node => node instanceof Element && (node.matches?.(BLOCK_SELECTOR) || node.querySelector?.(BLOCK_SELECTOR)));
  })) scheduleCleanup();
});

function init() {
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleCleanup();
}

if (document.documentElement.dataset.startup === 'ready') init();
else document.addEventListener('luckybean:local-app-ready', init, { once: true });

globalThis.LuckyBeanLegacyGearGuard = { disableLegacySmallBrewEditor };
