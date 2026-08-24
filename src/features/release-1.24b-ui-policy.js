// LuckyBean 1.24B main.4 — canonical UI policy shared by Web and Android WebView.
const UI_POLICY_REVISION = '1.24B-main.4';

if (!globalThis.__LuckyBean124BUiPolicyLoaded) {
  globalThis.__LuckyBean124BUiPolicyLoaded = true;

  const STYLE_ID = 'luckybean-124b-ui-policy-style';
  const OBSERVED = Symbol('luckybean124bUiPolicyObserved');
  const GROUP_BOUND = Symbol('luckybean124bGroupOutsideBound');

  function ensurePolicyStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* Coffee World: the visible map frame is always 2:1 (width:height). */
      .v099g-world-map {
        width: 100% !important;
        aspect-ratio: 2 / 1 !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
      }
      .v099g-world-map .jvm-container {
        width: 100% !important;
        height: 100% !important;
        min-height: 0 !important;
      }

      /* Expanded bean groups end with the card content; blank page space is outside the group. */
      #beanGroups .active-group-panel {
        min-height: 0 !important;
        padding-bottom: 0 !important;
      }
      #beanGroups .active-group-panel > .group-collapse-zone {
        display: none !important;
      }
    `;
    document.head.append(style);
  }

  function simplifyAccountSync(root = document) {
    root.querySelectorAll('[data-cloud-pull]').forEach(button => {
      if (button.textContent !== '合并云端') button.textContent = '合并云端';
      button.setAttribute('aria-label', '合并云端数据到本地');
    });
  }

  function simplifyCollectionSettings(root = document) {
    root.querySelectorAll('[data-v099p-data-analysis]').forEach(section => {
      const heading = section.querySelector(':scope > h3');
      if (heading && heading.textContent.trim() === '数藏分析') heading.remove();
      const intro = [...section.querySelectorAll(':scope > p')].find(node =>
        node.textContent.includes('从豆卡、冲煮与品鉴记录生成个人咖啡图谱')
      );
      intro?.remove();
    });
  }

  function simplifyBeanSummary(root = document) {
    root.querySelectorAll('.preference-board-strip').forEach(node => node.remove());
    root.querySelectorAll('.bean-consumption-summary > small').forEach(node => {
      if (node.textContent.includes('咖啡因按阿拉比卡约12mg/g豆保守估算')) node.remove();
    });
  }

  function requestGroupClose(panel) {
    if (!panel?.isConnected) return;
    panel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }

  function bindOutsideGroupDismiss() {
    const root = document.getElementById('beanGroups');
    if (!root || root[GROUP_BOUND]) return;
    root[GROUP_BOUND] = true;
    root.addEventListener('click', event => {
      const panel = root.querySelector('[data-active-group-panel]');
      if (!panel) return;

      // Card/title interactions remain group interactions. Existing app logic handles blank space inside
      // the compact panel. This branch handles the page space outside that panel with the same one-click rule.
      if (event.target.closest('[data-bean-id],[data-brew-bean],.active-group-title,[data-open-group]')) return;
      if (panel.contains(event.target)) return;

      queueMicrotask(() => requestGroupClose(panel));
    });
  }

  function applyPolicy(root = document) {
    ensurePolicyStyle();
    simplifyAccountSync(root);
    simplifyCollectionSettings(root);
    simplifyBeanSummary(root);
    bindOutsideGroupDismiss();
    document.documentElement.dataset.uiPolicyRevision = UI_POLICY_REVISION;
  }

  function observe(id) {
    const node = document.getElementById(id);
    if (!node || node[OBSERVED]) return;
    node[OBSERVED] = true;
    new MutationObserver(() => applyPolicy(node)).observe(node, { childList: true, subtree: true });
  }

  function boot() {
    applyPolicy();
    observe('settingsContent');
    observe('beanGroups');
  }

  ['luckybean:settings-rendered', 'luckybean:account-panel-rendered', 'luckybean:app-refreshed', 'luckybean:local-app-ready']
    .forEach(type => document.addEventListener(type, () => queueMicrotask(boot)));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  globalThis.LuckyBeanUiPolicy124B = { revision: UI_POLICY_REVISION, apply: applyPolicy };
}
