// LuckyBean 1.24B main.4 — canonical UI policy shared by Web and Android WebView.
const UI_POLICY_REVISION = '1.24B-main.4';

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

      /* Removed summary modules must never flash before mutation cleanup. */
      .preference-board-strip,
      .bean-consumption-summary > small {
        display: none !important;
      }

      /* Expanded bean groups end with card content. Folder closing is state-driven, not a hidden button. */
      #beanGroups .active-group-panel {
        min-height: 0 !important;
        padding-bottom: 0 !important;
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

      @media (max-width: 720px) {
        .bean-consumption-summary > p {
          display: grid !important;
          gap: .28rem !important;
          margin: 0 !important;
        }
        .bean-consumption-summary .lb-stock-total {
          display: block !important;
          font-size: clamp(1.22rem, 5.2vw, 1.55rem) !important;
          line-height: 1.25 !important;
          font-weight: 700 !important;
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
    root.querySelectorAll('.preference-board-strip').forEach(node => node.remove());
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
