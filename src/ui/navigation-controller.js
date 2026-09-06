import {
  BackGestureAdapter,
  DraftGuard,
  FlowNavigation,
  NavigationManager,
  OverlayManager,
  RootExitGuard
} from './interaction-foundation.js';

const PAGE_SELECTOR = '.page[data-page]';
const BACK_LABEL = /^(?:上一步|返回|取消|关闭|暂存退出|退出)$/u;

function pageName(node) {
  return String(node?.dataset?.page || '').trim();
}

function activePage() {
  return pageName(document.querySelector(`${PAGE_SELECTOR}.active`)) || 'beans';
}

function clickBackControl(scope = document) {
  const controls = [...scope.querySelectorAll('button:not([disabled]), [role="button"]')];
  const target = controls.find(node => {
    if (!(node instanceof HTMLElement) || node.offsetParent === null) return false;
    if (node.matches('[data-navigation-back], [id$="BackBtn"], [data-v095-prev], [data-cupping-prev]')) return true;
    if ([...node.attributes].some(attribute => /^data-.*(?:prev|back)$/i.test(attribute.name))) return true;
    return BACK_LABEL.test(String(node.textContent || '').trim());
  });
  if (!target) return false;
  target.click();
  return true;
}

function externalWorkflowOverlay() {
  return [...document.body.children].reverse().find(node => {
    if (!(node instanceof HTMLElement) || node.offsetParent === null) return false;
    if (node.id === 'interactionScrim' || node.id === 'overlayRoot') return false;
    const signature = `${node.id || ''} ${node.className || ''}`.toLowerCase();
    return /(^|\s|[-_])overlay($|\s|[-_])/.test(signature) || /professional-overlay/.test(signature);
  }) || null;
}

function legacyBack() {
  const external = externalWorkflowOverlay();
  if (external && clickBackControl(external)) return true;
  return clickBackControl(document.querySelector(`${PAGE_SELECTOR}.active`) || document);
}

function isNativeShell() {
  return typeof globalThis.LuckyBeanNative?.exitApp === 'function';
}

function notify(message) {
  document.dispatchEvent(new CustomEvent('luckybean:user-notice', { detail: { message, kind: 'status-good' } }));
}

const overlayManager = new OverlayManager({ documentTarget: document }).start();
const draftGuard = new DraftGuard({ windowTarget: globalThis });
const flowNavigation = new FlowNavigation();

function openDraftConfirmation({ scope, onConfirm }) {
  const label = scope ? `“${scope}”` : '当前编辑';
  overlayManager.openSystemDialog({
    id: 'interaction-draft-confirm',
    title: '存在未保存修改',
    message: `${label}尚未保存。继续返回会离开当前编辑内容。`,
    confirmLabel: '继续返回',
    cancelLabel: '留在这里',
    danger: true,
    onConfirm
  });
  return true;
}

const rootExitGuard = new RootExitGuard({
  draftGuard,
  isNative: isNativeShell,
  notify,
  openConfirmation: ({ dirty, onConfirm, onCancel }) => overlayManager.openSystemDialog({
    id: 'interaction-root-exit-confirm',
    title: '退出富贵盒子？',
    message: dirty ? '当前仍有未保存修改。退出应用可能丢失这些编辑内容。' : '确认退出应用。',
    confirmLabel: '退出',
    cancelLabel: '取消',
    danger: true,
    onConfirm,
    onCancel
  }),
  exit: () => globalThis.LuckyBeanNative?.exitApp?.()
});

const manager = new NavigationManager({
  overlayManager,
  flowNavigation,
  draftGuard,
  rootExitGuard,
  legacyBack,
  confirmDraftLeave: openDraftConfirmation,
  documentTarget: document
});
manager.setActivePage(activePage());
const backGesture = new BackGestureAdapter(manager);

function updateActivePage() {
  manager.setActivePage(activePage());
}

function initialize() {
  const mainContent = document.querySelector('#mainContent');
  if (mainContent && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes' && record.attributeName === 'class')) updateActivePage();
    });
    observer.observe(mainContent, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-page-target]') : null;
    if (target) queueMicrotask(updateActivePage);
  }, true);
}

initialize();

const api = Object.freeze({
  back: options => manager.back(typeof options === 'object' && options ? options : {}),
  canGoBack: () => manager.canGoBack(),
  snapshot: () => manager.snapshot(),
  registerOverlay: options => overlayManager.register(options),
  registerFlowBack: options => flowNavigation.register(options),
  registerChildBack: options => manager.registerChildBack(options),
  setDraftDirty: (scope, dirty = true) => draftGuard.setDirty(scope, dirty),
  clearDraft: scope => draftGuard.clear(scope),
  isDraftDirty: scope => draftGuard.isDirty(scope),
  systemBack: () => backGesture.back('android-system'),
  managers: Object.freeze({ overlay: overlayManager, flow: flowNavigation, draft: draftGuard, rootExit: rootExitGuard })
});

globalThis.LuckyBeanNavigation = api;
