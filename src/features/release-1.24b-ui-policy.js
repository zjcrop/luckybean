// LuckyBean 1.24P main.3 — canonical UI policy shared by Web and Android WebView.
const UI_POLICY_REVISION = document.body?.dataset.releaseRevision || document.querySelector('meta[name="release-revision"]')?.content || '1.24P-main.3';

if (!globalThis.__LuckyBean124BUiPolicyLoaded) {
  globalThis.__LuckyBean124BUiPolicyLoaded = true;

  const STYLE_ID = 'luckybean-124b-ui-policy-style';
  const OBSERVED = Symbol('luckybean124bUiPolicyObserved');

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

      /* Retired preference leaderboard must never re-enter the bean page. */
      .preference-board-strip {
        display: none !important;
      }
      /* Only obsolete explanatory copy is removed from the compact digest. */
      .bean-consumption-summary > small {
        display: none !important;
      }

      /* Every group renderer ends with the same normal-flow blank close surface. */
      #beanGroups .active-group-panel { min-height: 0 !important; padding-bottom: 0 !important; }
      #beanGroups .bean-group-dismiss-surface {
        display: block !important; width: 100% !important; min-height: clamp(100px, 16vh, 160px) !important;
        padding: 0 !important; border: 0 !important; background: transparent !important; box-shadow: none !important;
      }

      .bean-consumption-summary .lb-stock-total,
      .bean-consumption-summary .lb-today-consumption {
        display: inline;
      }

      /* Small Brew: retain semantic buttons but remove button-shaped visual noise. */
      #brewContent button:not(.lb-brew-switch),
      #brewContent .button:not(.lb-brew-switch) {
        appearance: none !important;
        background: transparent !important;
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        min-height: 0 !important;
        padding: .22rem .08rem !important;
        color: var(--clickable, var(--text)) !important;
        text-align: inherit;
        line-height: 1.35;
      }
      #brewContent button:not(.lb-brew-switch):hover,
      #brewContent button:not(.lb-brew-switch):focus-visible {
        text-decoration: underline;
        text-underline-offset: .2em;
        outline: none;
      }
      #brewContent button[aria-pressed="true"]:not(.lb-brew-switch),
      #brewContent button.active:not(.lb-brew-switch),
      #brewContent .button.primary:not(.lb-brew-switch),
      #brewContent [data-lb-other-complete] {
        color: var(--active, var(--text)) !important;
        font-weight: 750 !important;
        text-decoration: underline;
        text-decoration-thickness: 1px;
        text-underline-offset: .24em;
      }

      .lb-other-brew-panel {
        display: grid;
        gap: .35rem;
      }

      @media (max-width: 720px) {
        .bean-consumption-summary .lb-stock-total { font-size: .94rem !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function rewriteCloudAction(root = document) {
    for (const button of root.querySelectorAll?.('button') || []) {
      if (button.textContent?.trim() === '下载云端合并本地') button.textContent = '合并云端';
    }
  }

  function rewriteDataCopy(root = document) {
    for (const node of root.querySelectorAll?.('[data-settings-key="data"], [data-v099f-data]') || []) {
      if (!node.textContent?.includes('数藏分析')) continue;
      for (const paragraph of node.querySelectorAll('p')) {
        if (/豆卡|冲煮|品鉴/.test(paragraph.textContent || '')) paragraph.textContent = '从豆卡、冲煮与品鉴记录生成个人咖啡图谱';
      }
    }
  }

  function rewriteConsumptionCopy(root = document) {
    for (const node of root.querySelectorAll?.('.bean-consumption-summary') || []) {
      const text = node.textContent || '';
      if (!text.includes('现有咖啡豆共计')) continue;
      const stock = node.querySelector('.lb-stock-total');
      const today = node.querySelector('.lb-today-consumption');
      if (stock && !/还可饮用/.test(stock.textContent || '')) stock.textContent = `${stock.textContent || ''} · 还可饮用`;
      if (today && !/非罗布斯塔/.test(today.textContent || '')) today.textContent = `${today.textContent || ''} · 非罗布斯塔`;
    }
  }

  function apply(root = document) {
    ensurePolicyStyle();
    rewriteCloudAction(root);
    rewriteDataCopy(root);
    rewriteConsumptionCopy(root);
  }

  function observe(id) {
    const target = document.getElementById(id);
    if (!target || target[OBSERVED]) return;
    target[OBSERVED] = true;
    const observer = new MutationObserver(() => apply(target));
    observer.observe(target, { childList:true, subtree:true, characterData:true });
  }

  apply();
  observe('settingsContent');
  observe('beanGroups');
  observe('brewContent');
  document.addEventListener('luckybean:render-complete', () => apply());
  document.addEventListener('luckybean:settings-rendered', () => apply());
  globalThis.LuckyBeanUiPolicy = { revision:UI_POLICY_REVISION, apply };
}
