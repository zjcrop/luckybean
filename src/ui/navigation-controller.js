const PAGE_SELECTOR = '.page[data-page]';
const NAV_STATE_KEY = '__luckybeanNavigation';
const BACK_LABEL = /^(?:上一步|返回|返回文字|返回列表|返回小酌|不记录则返回小酌|取消)$/;

let currentPage = '';
let currentDepth = 0;
let suppressPageCapture = false;
let initialized = false;

function activePage() {
  return document.querySelector(`${PAGE_SELECTOR}.active`)?.dataset.page || '';
}

function visible(element) {
  if (!element || element.disabled) return false;
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function clickBackControl(root) {
  if (!root) return false;
  const controls = [...root.querySelectorAll('button,[role="button"]')].filter(visible);
  const explicit = controls.find(control => control.hasAttribute('data-navigation-back')
    || /BackBtn$/i.test(control.id || '')
    || /(?:^|-)prev$/i.test([...control.attributes].map(attribute => attribute.name).find(name => name.startsWith('data-')) || '')
    || BACK_LABEL.test(String(control.textContent || '').replace(/\s+/g, ' ').trim()));
  if (explicit) {
    explicit.click();
    return true;
  }
  const close = root.querySelector('[data-close-overlay],[data-v095-close],[data-v098-close],[data-v099-close],.close-button');
  if (visible(close)) {
    close.click();
    return true;
  }
  return false;
}

function externalWorkflowOverlay() {
  return [...document.body.children].find(node => {
    if (!(node instanceof HTMLElement) || node.id === 'overlayRoot' || node.id === 'splashScreen') return false;
    if (!/(?:overlay|dialog)/i.test(`${node.id} ${node.className}`)) return false;
    return visible(node);
  }) || null;
}

function backOverlay() {
  const external = externalWorkflowOverlay();
  if (external && clickBackControl(external)) return true;

  const root = document.querySelector('#overlayRoot');
  const overlay = root?.firstElementChild;
  if (!overlay) return false;
  if (clickBackControl(overlay)) return true;

  // Canonical fallback for overlays without an explicit close control. App overlays are
  // single-root surfaces, so removing the surface is safer than allowing Android to exit.
  root.replaceChildren();
  document.dispatchEvent(new CustomEvent('luckybean:navigation-overlay-dismissed', {
    detail: { source: 'system-back' }
  }));
  return true;
}

function goToPage(page) {
  if (!page || page === activePage()) return true;
  const button = document.querySelector(`[data-page-target="${CSS.escape(page)}"]`);
  if (!button) return false;
  suppressPageCapture = true;
  button.click();
  queueMicrotask(() => { suppressPageCapture = false; currentPage = activePage() || page; });
  return true;
}

function recordPageChange() {
  if (!initialized || suppressPageCapture) return;
  const nextPage = activePage();
  if (!nextPage || nextPage === currentPage) return;
  currentPage = nextPage;
  currentDepth += 1;
  history.pushState({ [NAV_STATE_KEY]: true, page: currentPage, depth: currentDepth }, '', location.href);
}

function initialize() {
  currentPage = activePage() || 'beans';
  currentDepth = 0;
  history.replaceState({ [NAV_STATE_KEY]: true, page: currentPage, depth: 0 }, '', location.href);

  const main = document.querySelector('#mainContent');
  if (main) {
    const observer = new MutationObserver(recordPageChange);
    observer.observe(main, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  window.addEventListener('popstate', event => {
    if (backOverlay()) {
      history.pushState({ [NAV_STATE_KEY]: true, page: currentPage, depth: currentDepth }, '', location.href);
      return;
    }
    const navigation = event.state;
    if (!navigation?.[NAV_STATE_KEY]) {
      currentDepth = 0;
      return;
    }
    currentDepth = Math.max(0, Number(navigation.depth) || 0);
    currentPage = String(navigation.page || currentPage || 'beans');
    goToPage(currentPage);
  });

  initialized = true;
  document.dispatchEvent(new CustomEvent('luckybean:navigation-ready', {
    detail: { page: currentPage, depth: currentDepth }
  }));
}

function canGoBack() {
  return Boolean(externalWorkflowOverlay() || document.querySelector('#overlayRoot')?.firstElementChild || currentDepth > 0);
}

function back() {
  if (backOverlay()) return true;
  if (currentDepth <= 0) return false;
  history.back();
  return true;
}

globalThis.LuckyBeanNavigation = Object.freeze({
  canGoBack,
  back,
  snapshot: () => ({ page: activePage() || currentPage, depth: currentDepth, overlay: Boolean(document.querySelector('#overlayRoot')?.firstElementChild || externalWorkflowOverlay()) })
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
