const PAGE_SELECTOR = '.page[data-page]';
const SCRIM_ID = 'appInteractionScrim';
const ROOT_EXIT_ID = 'root-exit-confirmation';
const APP_ROOT_PAGE = 'beans';
const ROOT_EXIT_WINDOW_MS = 2200;
const ROOT_EXIT_SOURCES = new Set(['android', 'native', 'pwa', 'programmatic']);
const LAYER_SELECTOR = [
  '#overlayRoot > *',
  '.popup-menu',
  '.recommend-menu',
  'body > [class*="overlay"]',
  'body > [class*="-layer"]',
  'body > [role="dialog"][aria-modal="true"]',
  '.spatial-fullscreen-overlay:not([hidden])',
  '[data-overlay-kind]'
].join(',');

let currentPage = '';
let layerSequence = 0;
let syncQueued = false;
const layerWatchers = new Map();

function activePage() {
  return document.querySelector(`${PAGE_SELECTOR}.active`)?.dataset.page || '';
}

function visible(element) {
  if (!(element instanceof HTMLElement) || element.hidden || !element.isConnected) return false;
  const style = getComputedStyle(element);
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && !(style.opacity === '0' && style.pointerEvents === 'none');
}

function ensureScrim() {
  let scrim = document.getElementById(SCRIM_ID);
  if (scrim) return scrim;
  scrim = document.createElement('div');
  scrim.id = SCRIM_ID;
  scrim.className = 'app-interaction-scrim';
  scrim.hidden = true;
  scrim.setAttribute('aria-hidden', 'true');
  document.body.append(scrim);
  return scrim;
}

function layerKind(element) {
  const declared = String(element.dataset.overlayKind || '').toLowerCase();
  if (['picker', 'popover', 'dialog', 'modal'].includes(declared)) return declared;
  if (element.matches('.popup-menu,.recommend-menu,[role="listbox"]')) return 'picker';
  if (element.matches('[data-popover],[popover]')) return 'popover';
  if (element.matches('.overlay.full,.v095-professional-overlay,.spatial-fullscreen-overlay')) return 'modal';
  if (element.querySelector('.bottom-sheet,[data-bottom-sheet]')) return 'modal';
  return 'dialog';
}

function isBackdropHost(element) {
  if (element.matches('.popup-menu,.recommend-menu,.spatial-fullscreen-overlay')) return false;
  return element.matches('.overlay,.v095-wizard-overlay,.lb-centered-help-layer,.lb-freshness-detail-layer,.bag-capture-overlay,.lb-direct-camera')
    || Boolean(element.querySelector(':scope > .dialog,:scope > [role="dialog"][aria-modal="true"]'));
}

function layerZIndex(element) {
  const value = Number.parseInt(getComputedStyle(element).zIndex, 10);
  return Number.isFinite(value) ? value : 90;
}

function collectLayers() {
  const seen = new Set();
  return [...document.querySelectorAll(LAYER_SELECTOR)].filter(element => {
    if (element.id === SCRIM_ID || element.id === 'splashScreen' || seen.has(element) || !visible(element)) return false;
    const parentLayer = element.parentElement?.closest?.(LAYER_SELECTOR);
    if (parentLayer && parentLayer !== document.querySelector('#overlayRoot')) return false;
    seen.add(element);
    if (!element.dataset.overlaySequence) element.dataset.overlaySequence = String(++layerSequence);
    element.dataset.overlayManaged = 'true';
    element.dataset.overlayKind = layerKind(element);
    if (isBackdropHost(element)) element.dataset.overlayBackdrop = 'true';
    else delete element.dataset.overlayBackdrop;
    return true;
  }).map(element => ({
    element,
    kind: element.dataset.overlayKind,
    sequence: Number(element.dataset.overlaySequence) || 0,
    zIndex: layerZIndex(element)
  })).sort((left, right) => left.zIndex - right.zIndex || left.sequence - right.sequence);
}

function unwatchLayer(element) {
  const observers = layerWatchers.get(element) || [];
  observers.forEach(observer => observer.disconnect());
  layerWatchers.delete(element);
}

function watchLayer(element) {
  if (layerWatchers.has(element) || !element.parentElement) return;
  const parent = element.parentElement;
  const attributes = new MutationObserver(queueLayerSync);
  attributes.observe(element, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
  const removal = new MutationObserver(() => {
    if (element.isConnected) return;
    unwatchLayer(element);
    queueLayerSync();
  });
  removal.observe(parent, { childList: true });
  layerWatchers.set(element, [attributes, removal]);
}

function synchronizeLayers() {
  syncQueued = false;
  const layers = collectLayers();
  layers.forEach(layer => watchLayer(layer.element));
  [...layerWatchers.keys()].filter(element => !element.isConnected).forEach(unwatchLayer);
  const scrim = ensureScrim();
  const scrimHidden = layers.length === 0;
  if (scrim.hidden !== scrimHidden) scrim.hidden = scrimHidden;
  document.documentElement.classList.toggle('interaction-layer-open', layers.length > 0);
  const minimumZ = layers.reduce((value, layer) => Math.min(value, layer.zIndex), 90);
  const scrimZ = String(Math.max(0, minimumZ - 1));
  if (scrim.style.getPropertyValue('--interaction-scrim-z') !== scrimZ) {
    scrim.style.setProperty('--interaction-scrim-z', scrimZ);
  }
  layers.forEach((layer, index) => {
    layer.element.dataset.overlayUnderlay = String(index < layers.length - 1);
  });
  return layers;
}

function queueLayerSync() {
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(synchronizeLayers);
}

function dismissControl(root) {
  if (!root) return null;
  const controls = [...root.querySelectorAll('button,[role="button"]')].filter(control => visible(control) && !control.disabled);
  return controls.find(control => control.hasAttribute('data-overlay-dismiss'))
    || controls.find(control => control.classList.contains('close-button') || control.getAttribute('aria-label') === '关闭')
    || controls.find(control => [...control.attributes].some(attribute => /^data-.*(?:close|cancel|back)$/i.test(attribute.name)))
    || controls.find(control => /^(?:关闭|取消|返回|退)$/.test(String(control.textContent || '').replace(/\s+/g, ' ').trim()))
    || null;
}

function removeLayer(layer, reason) {
  const request = new CustomEvent('luckybean:request-overlay-dismiss', {
    cancelable: true,
    detail: { id: layer.element.dataset.overlay || layer.element.id || '', kind: layer.kind, reason }
  });
  layer.element.dispatchEvent(request);
  if (request.defaultPrevented || !layer.element.isConnected) {
    queueLayerSync();
    return true;
  }
  const control = dismissControl(layer.element);
  if (control) {
    control.click();
  } else {
    layer.element.remove();
    document.dispatchEvent(new CustomEvent('luckybean:overlay-dismissed', {
      detail: { id: layer.element.dataset.overlay || layer.element.id || '', kind: layer.kind, reason }
    }));
  }
  queueLayerSync();
  return true;
}

function topLayer(kinds = null) {
  const allowed = kinds ? new Set(Array.isArray(kinds) ? kinds : [kinds]) : null;
  return synchronizeLayers().filter(layer => !allowed || allowed.has(layer.kind)).at(-1) || null;
}

function openManagedLayer({ id, kind = 'dialog', className = '', content = '' } = {}) {
  const root = document.querySelector('#overlayRoot') || document.body;
  const layer = document.createElement('div');
  layer.className = `overlay${className ? ` ${className}` : ''}`;
  layer.dataset.overlay = id || `managed-${Date.now()}`;
  layer.dataset.overlayKind = kind;
  layer.innerHTML = content;
  root.append(layer);
  synchronizeLayers();
  return layer;
}

function interactionConfirm({
  id = `confirmation-${Date.now()}`,
  title = '请确认',
  message = '',
  confirmLabel = '确定',
  cancelLabel = '取消',
  danger = false,
  hideCancel = false
} = {}) {
  return new Promise(resolve => {
    const layer = openManagedLayer({ id, kind: 'dialog', className: 'interaction-confirmation-layer' });
    const panel = document.createElement('section');
    panel.className = 'dialog interaction-confirmation-dialog';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    const heading = document.createElement('h2');
    heading.textContent = title;
    const copy = document.createElement('p');
    copy.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'row end interaction-confirmation-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'button';
    cancel.textContent = cancelLabel;
    cancel.dataset.overlayDismiss = 'true';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = `button${danger ? ' danger' : ' primary'}`;
    confirm.textContent = confirmLabel;
    confirm.dataset.interactionConfirm = 'true';
    if (id === ROOT_EXIT_ID) {
      cancel.dataset.rootExitCancel = 'true';
      confirm.dataset.rootExitConfirm = 'true';
    }
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      layer.remove();
      queueLayerSync();
      resolve(value);
    };
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    layer.addEventListener('pointerdown', event => { if (event.target === layer) finish(false); });
    layer.addEventListener('luckybean:request-overlay-dismiss', event => { event.preventDefault(); finish(false); });
    if (!hideCancel) actions.append(cancel);
    actions.append(confirm);
    panel.append(heading, copy, actions);
    layer.append(panel);
    synchronizeLayers();
    confirm.focus({ preventScroll: true });
  });
}

const OverlayManager = Object.freeze({
  open: openManagedLayer,
  manage: (element, kind) => {
    if (!(element instanceof HTMLElement)) throw new TypeError('managed layer must be an HTMLElement');
    if (kind) element.dataset.overlayKind = kind;
    element.dataset.overlayManaged = 'true';
    if (element.isConnected) {
      watchLayer(element);
      synchronizeLayers();
    } else {
      queueMicrotask(() => {
        if (!element.isConnected) return;
        watchLayer(element);
        synchronizeLayers();
      });
    }
    return element;
  },
  synchronize: synchronizeLayers,
  top: kind => topLayer(kind)?.element || null,
  dismiss: (kind, reason = 'back') => {
    const layer = topLayer(kind);
    return layer ? removeLayer(layer, reason) : false;
  },
  dismissTop: (reason = 'back') => {
    const layer = topLayer();
    return layer ? removeLayer(layer, reason) : false;
  },
  confirm: options => interactionConfirm(options),
  alert: (message, title = '提示') => interactionConfirm({ title, message, confirmLabel: '知道了', hideCancel: true }),
  snapshot: () => synchronizeLayers().map(layer => ({
    id: layer.element.dataset.overlay || layer.element.id || '', kind: layer.kind, zIndex: layer.zIndex
  }))
});

const flowEntries = [];
const childEntries = [];

function registerEntry(collection, entry = {}) {
  if (typeof entry.previous !== 'function') throw new TypeError('previous must be a function');
  const token = Symbol(entry.id || 'navigation-entry');
  collection.push({ ...entry, token });
  return () => {
    const index = collection.findIndex(item => item.token === token);
    if (index >= 0) collection.splice(index, 1);
  };
}

function invokeRegisteredPrevious(collection) {
  for (let index = collection.length - 1; index >= 0; index -= 1) {
    const entry = collection[index];
    if (entry.active && !entry.active()) continue;
    if (entry.canGoBack && !entry.canGoBack()) continue;
    return entry.previous() !== false;
  }
  return false;
}

function automaticFlowBack() {
  const selectors = '[data-navigation-back],[data-flow-back],#prevSensoryNodeBtn,[data-lb-other-back]';
  const control = [...document.querySelectorAll(selectors)].find(element => visible(element) && !element.disabled && !element.closest('[data-overlay-managed="true"]'));
  if (!control) return false;
  control.click();
  return true;
}

const FlowNavigation = Object.freeze({
  register: entry => registerEntry(flowEntries, entry),
  previous: () => invokeRegisteredPrevious(flowEntries) || automaticFlowBack(),
  canGoBack: () => flowEntries.some(entry => (!entry.active || entry.active()) && (!entry.canGoBack || entry.canGoBack())) || Boolean([...document.querySelectorAll('[data-navigation-back],[data-flow-back],#prevSensoryNodeBtn,[data-lb-other-back]')].find(element => visible(element) && !element.disabled)),
  snapshot: () => ({ depth: flowEntries.length })
});

function goToTopLevel(page) {
  if (!page || page === activePage()) return true;
  const button = document.querySelector(`[data-page-target="${CSS.escape(page)}"]`);
  if (!button) return false;
  button.click();
  queueMicrotask(() => { currentPage = activePage() || page; });
  return true;
}

function backFromChild() {
  if (invokeRegisteredPrevious(childEntries)) return true;
  const beanGroups = globalThis.LuckyBeanBeanGroupState;
  if (beanGroups?.hasActiveGroup?.()) return beanGroups.close?.() !== false;
  return false;
}

const NavigationManager = Object.freeze({
  registerChild: entry => registerEntry(childEntries, entry),
  backFromChild,
  backToAppRoot: () => {
    const page = activePage() || currentPage;
    if (!page || page === APP_ROOT_PAGE) return false;
    return goToTopLevel(APP_ROOT_PAGE);
  },
  isAtAppRoot: () => (activePage() || currentPage) === APP_ROOT_PAGE,
  goToTopLevel,
  currentTopLevel: () => activePage() || currentPage,
  snapshot: () => ({ page: activePage() || currentPage, topLevelHistoryDepth: 0, childDepth: childEntries.length })
});

function isEditable(element) {
  if (!(element instanceof HTMLElement) || !visible(element)) return false;
  if (element.isContentEditable) return true;
  if (element.matches('textarea,select')) return true;
  if (!element.matches('input')) return false;
  return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color'].includes(String(element.type || 'text').toLowerCase());
}

function dismissKeyboard() {
  const active = document.activeElement;
  if (!isEditable(active)) return false;
  active.blur();
  return true;
}

let lastRootBackAt = 0;

function rootNotice(message) {
  document.dispatchEvent(new CustomEvent('luckybean:user-notice', {
    detail: { message, kind: 'status-good' }
  }));
}

function requestNativeExit() {
  document.querySelector(`[data-overlay="${ROOT_EXIT_ID}"]`)?.remove();
  synchronizeLayers();
  document.dispatchEvent(new CustomEvent('luckybean:explicit-exit-requested'));
  const nativeBridge = globalThis.LuckyBeanNative;
  if (typeof nativeBridge?.exitApp === 'function') nativeBridge.exitApp();
}

function openExitConfirmation() {
  if (document.querySelector(`[data-overlay="${ROOT_EXIT_ID}"]`)) return true;
  void OverlayManager.confirm({
    id: ROOT_EXIT_ID,
    title: '退出富贵盒子？',
    message: '已保存的数据会保留在本机。',
    confirmLabel: '退出',
    danger: true
  }).then(confirmed => { if (confirmed) requestNativeExit(); });
  return true;
}

const RootExitGuard = Object.freeze({
  request: ({ source = 'programmatic', now = Date.now() } = {}) => {
    if (!ROOT_EXIT_SOURCES.has(source)) return false;
    if (lastRootBackAt > 0 && now - lastRootBackAt <= ROOT_EXIT_WINDOW_MS) {
      lastRootBackAt = 0;
      return openExitConfirmation();
    }
    lastRootBackAt = now;
    rootNotice('再次返回可选择退出');
    return true;
  },
  reset: () => { lastRootBackAt = 0; },
  snapshot: () => ({ armed: Date.now() - lastRootBackAt <= ROOT_EXIT_WINDOW_MS, windowMs: ROOT_EXIT_WINDOW_MS })
});

function handleBack({ source = 'programmatic' } = {}) {
  if (document.documentElement.dataset.startup !== 'ready' && ['android', 'native', 'pwa'].includes(source)) return false;
  if (dismissKeyboard()) { RootExitGuard.reset(); return true; }
  if (OverlayManager.dismiss(['picker', 'popover'], 'back')) { RootExitGuard.reset(); return true; }
  if (OverlayManager.dismiss('dialog', 'back')) { RootExitGuard.reset(); return true; }
  if (OverlayManager.dismiss('modal', 'back')) { RootExitGuard.reset(); return true; }
  if (FlowNavigation.previous()) { RootExitGuard.reset(); return true; }
  if (NavigationManager.backFromChild()) { RootExitGuard.reset(); return true; }
  if (NavigationManager.backToAppRoot()) { RootExitGuard.reset(); return true; }
  if (!NavigationManager.isAtAppRoot()) return false;
  return RootExitGuard.request({ source });
}

const BackGestureAdapter = Object.freeze({
  handle: handleBack,
  handleAndroidBack: () => handleBack({ source: 'android' }),
  handleBrowserBack: () => false
});

function initialize() {
  currentPage = activePage() || 'beans';
  const main = document.querySelector('#mainContent');
  if (main) {
    new MutationObserver(() => { currentPage = activePage() || currentPage; })
      .observe(main, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  const overlayRoot = document.querySelector('#overlayRoot');
  if (overlayRoot) {
    new MutationObserver(queueLayerSync)
      .observe(overlayRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
  }
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (handleBack({ source: 'keyboard' })) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('pointerdown', () => RootExitGuard.reset(), true);
  synchronizeLayers();
  document.dispatchEvent(new CustomEvent('luckybean:navigation-ready', {
    detail: { page: currentPage, topLevelHistoryDepth: 0 }
  }));
}

globalThis.OverlayManager = OverlayManager;
globalThis.NavigationManager = NavigationManager;
globalThis.FlowNavigation = FlowNavigation;
globalThis.BackGestureAdapter = BackGestureAdapter;
globalThis.RootExitGuard = RootExitGuard;
globalThis.LuckyBeanOverlayManager = OverlayManager;
globalThis.LuckyBeanNavigation = Object.freeze({
  canGoBack: () => Boolean(OverlayManager.snapshot().length || FlowNavigation.canGoBack() || childEntries.length || globalThis.LuckyBeanBeanGroupState?.hasActiveGroup?.()),
  back: options => handleBack(options),
  snapshot: () => ({
    page: activePage() || currentPage,
    depth: flowEntries.length + childEntries.length,
    topLevelHistoryDepth: 0,
    overlay: Boolean(OverlayManager.snapshot().length),
    overlays: OverlayManager.snapshot()
  })
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
