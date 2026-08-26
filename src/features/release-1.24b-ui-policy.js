// LuckyBean 1.24B main.4 — canonical UI policy shared by Web and Android WebView.
const UI_POLICY_REVISION = '1.24B-main.6';

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

      /* Small Brew row values are one visual level: centered like the dripper/filter/water values. */
      #brewContent [data-brew-row="actions"] > .brew-menu-button,
      #brewContent [data-brew-row="cooling"] > .brew-menu-button,
      #brewContent .brew-generate-row > .button {
        min-width: 0 !important;
        min-height: 34px !important;
        padding: 5px 0 !important;
        font-size: 13px !important;
        font-weight: 450 !important;
        line-height: 1.45 !important;
        text-align: center !important;
        text-align-last: center !important;
        text-decoration: none !important;
      }
      #brewContent .brew-generate-row > .button {
        flex: 1 1 0 !important;
        width: auto !important;
        color: var(--clickable, var(--text)) !important;
      }
      #brewContent .brew-generate-row > .button.primary {
        color: var(--clickable, var(--text)) !important;
        font-weight: 450 !important;
        text-decoration: none !important;
      }

      #brewContent .lb-other-brew-panel {
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        padding-inline: 0 !important;
      }
      #brewContent .lb-other-actions {
        border-top: 1px solid color-mix(in srgb, var(--border, currentColor) 45%, transparent);
        padding-top: 10px;
      }
      #brewContent .lb-other-actions [data-lb-other-back] { text-align: left !important; }
      #brewContent .lb-other-actions [data-lb-other-complete] { text-align: right !important; }

      /* Professional cupping score: the adjustment axis is a full-row horizontal control below the score values. */
      .v095-score-stage .score-value-row {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        align-items: start !important;
      }
      .v095-score-stage .subjective-delta-control {
        display: contents !important;
        width: auto !important;
        max-width: none !important;
      }
      .v095-score-stage .subjective-delta-control > strong {
        grid-column: 2 !important;
        grid-row: 1 !important;
        align-self: start !important;
        justify-self: stretch !important;
        text-align: center !important;
      }
      .v095-score-stage [data-v095-score-delta-input] {
        grid-column: 1 / -1 !important;
        grid-row: 2 !important;
        width: 100% !important;
        max-width: none !important;
        height: 32px !important;
        margin: 8px 0 0 !important;
        writing-mode: horizontal-tb !important;
        direction: ltr !important;
        cursor: ew-resize !important;
      }

      /* Settings: remove obsolete top spacer under Interface and Data Archive headings. */
      #settingsContent .settings-category[data-settings-key="appearance"] > .settings-category-body,
      #settingsContent .settings-category.data-category > .settings-category-body {
        padding-top: 0 !important;
      }
      #settingsContent .settings-category[data-settings-key="appearance"] .v095-setting-line {
        margin-top: 0 !important;
      }
      #settingsContent .settings-category.data-category [data-v099p-data-analysis] {
        margin-top: 0 !important;
        padding-top: 0 !important;
        border-top: 0 !important;
      }

      @media (max-width: 720px) {
        .bean-consumption-summary > p {
          display: grid !important;
          gap: .28rem !important;
          margin: 0 !important;
        }
        .bean-consumption-summary .lb-stock-total {
          display: block !important;
          font-size: .94rem !important;
          line-height: 1.38 !important;
          font-weight: 600 !important;
          letter-spacing: .01em !important;
        }
        .bean-consumption-summary .lb-today-consumption {
          display: block !important;
          font-size: .9rem !important;
          line-height: 1.45 !important;
        }
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

  function formatMobileBeanSummary(root = document) {
    root.querySelectorAll('.bean-consumption-summary > p').forEach(node => {
      if (node.dataset.lbSummaryLayout === '2') return;
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      const stockMatch = text.match(/现有咖啡豆\s*([\d.]+)\s*(kg|g)/i);
      const consumedMatch = text.match(/今日已饮用\s*([\d.]+)g豆/);
      if (!stockMatch || !consumedMatch) return;

      const stockValue = Number(stockMatch[1]);
      const stockKg = stockMatch[2].toLowerCase() === 'kg' ? stockValue : stockValue / 1000;
      const stockText = `${stockKg.toFixed(stockKg >= 10 ? 1 : 2)}kg`;
      const consumedText = `${Number(consumedMatch[1]).toFixed(1)}g豆`;
      const allowanceMatch = text.match(/参考上限还可使用约\s*([\d.]+)g豆/);
      const exceededMatch = text.match(/参考上限已超过约\s*([\d.]+)mg咖啡因/);

      let secondLine = `今日已饮用 ${consumedText}`;
      if (allowanceMatch) secondLine += `，还可饮用 ${Number(allowanceMatch[1]).toFixed(1)}g豆（非罗布斯塔）`;
      else if (exceededMatch) secondLine += `，参考上限已超过约${Number(exceededMatch[1]).toFixed(0)}mg咖啡因`;

      node.innerHTML = `<span class="lb-stock-total">现有咖啡豆共计 ${stockText}</span><span class="lb-today-consumption">${secondLine}</span>`;
      node.dataset.lbSummaryLayout = '2';
    });
  }

  function simplifyBeanSummary(root = document) {
    root.querySelectorAll('.bean-consumption-summary > small').forEach(node => {
      if (node.textContent.includes('咖啡因按阿拉比卡约12mg/g豆保守估算')) node.remove();
    });
    formatMobileBeanSummary(root);
  }

  function applyPolicy(root = document) {
    ensurePolicyStyle();
    simplifyAccountSync(root);
    simplifyCollectionSettings(root);
    simplifyBeanSummary(root);
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
    observe('brewContent');
  }

  ['luckybean:settings-rendered', 'luckybean:account-panel-rendered', 'luckybean:app-refreshed', 'luckybean:local-app-ready']
    .forEach(type => document.addEventListener(type, () => queueMicrotask(boot)));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  globalThis.LuckyBeanUiPolicy124B = { revision: UI_POLICY_REVISION, apply: applyPolicy };
}
