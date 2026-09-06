const OVERLAY_KINDS = Object.freeze({
  TRANSIENT: 'transient',
  DIALOG: 'dialog',
  MODAL: 'modal',
  SHEET: 'sheet',
  PAGE: 'page'
});

const DEFAULT_EXIT_WINDOW_MS = 2000;

function callable(value) { return typeof value === 'function'; }
function elementVisible(element) {
  if (!element || element.hidden) return false;
  if (element.getAttribute?.('aria-hidden') === 'true') return false;
  const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
  return !style || (style.display !== 'none' && style.visibility !== 'hidden');
}
function inferOverlayKind(element) {
  const explicit = String(element?.dataset?.interactionKind || '').trim();
  if (Object.values(OVERLAY_KINDS).includes(explicit)) return explicit;
  if (element?.classList?.contains('full')) return OVERLAY_KINDS.PAGE;
  const signature = `${element?.id || ''} ${element?.className || ''} ${element?.dataset?.overlay || ''}`.toLowerCase();
  if (/picker|popover|menu|palette/.test(signature)) return OVERLAY_KINDS.TRANSIENT;
  if (/dialog|confirm|alert/.test(signature)) return OVERLAY_KINDS.DIALOG;
  if (/sheet|drawer/.test(signature)) return OVERLAY_KINDS.SHEET;
  return OVERLAY_KINDS.MODAL;
}

export class DraftGuard {
  constructor({ windowTarget = globalThis.window } = {}) {
    this.windowTarget = windowTarget;
    this.dirtyScopes = new Set();
    this.boundBeforeUnload = event => {
      if (!this.isDirty()) return undefined;
      event.preventDefault?.();
      event.returnValue = '';
      return '';
    };
    this.beforeUnloadAttached = false;
  }
  setDirty(scope = 'default', dirty = true) {
    const key = String(scope || 'default');
    if (dirty) this.dirtyScopes.add(key); else this.dirtyScopes.delete(key);
    this.syncBeforeUnload();
    return this.isDirty(key);
  }
  clear(scope = 'default') { return this.setDirty(scope, false); }
  isDirty(scope) { return scope == null ? this.dirtyScopes.size > 0 : this.dirtyScopes.has(String(scope)); }
  decision(scope) { return this.isDirty(scope) || (scope == null && this.isDirty()) ? 'confirm' : 'allow'; }
  snapshot() { return Object.freeze({ dirty: this.isDirty(), scopes: [...this.dirtyScopes] }); }
  syncBeforeUnload() {
    const shouldAttach = this.isDirty();
    if (shouldAttach === this.beforeUnloadAttached || !this.windowTarget?.addEventListener) return;
    if (shouldAttach) this.windowTarget.addEventListener('beforeunload', this.boundBeforeUnload);
    else this.windowTarget.removeEventListener?.('beforeunload', this.boundBeforeUnload);
    this.beforeUnloadAttached = shouldAttach;
  }
  dispose() {
    if (this.beforeUnloadAttached) this.windowTarget?.removeEventListener?.('beforeunload', this.boundBeforeUnload);
    this.beforeUnloadAttached = false;
    this.dirtyScopes.clear();
  }
}

export class FlowNavigation {
  constructor() { this.entries = []; this.sequence = 0; }
  register({ id, back, canBack = () => true, priority = 0, scope = null, leavesContext = false } = {}) {
    if (!callable(back)) throw new TypeError('FlowNavigation requires a back handler');
    const sequence = ++this.sequence;
    const entry = { id: String(id || `flow-${sequence}`), back, canBack, priority: Number(priority) || 0, scope, leavesContext, sequence };
    this.entries.push(entry);
    return () => { this.entries = this.entries.filter(candidate => candidate !== entry); };
  }
  peek() {
    return this.entries
      .filter(entry => !callable(entry.canBack) || entry.canBack())
      .sort((a, b) => b.priority - a.priority || b.sequence - a.sequence)[0] || null;
  }
  canBack() { return Boolean(this.peek()); }
  snapshot() { return this.entries.map(({ id, priority, scope, leavesContext }) => ({ id, priority, scope, leavesContext })); }
}

export class OverlayManager {
  constructor({ documentTarget = globalThis.document, rootSelector = '#overlayRoot', scrimId = 'interactionScrim' } = {}) {
    this.documentTarget = documentTarget;
    this.rootSelector = rootSelector;
    this.scrimId = scrimId;
    this.entries = [];
    this.sequence = 0;
    this.observers = [];
  }
  start() {
    if (!this.documentTarget) return this;
    this.ensureScrim();
    const Observer = this.documentTarget.defaultView?.MutationObserver || globalThis.MutationObserver;
    if (Observer) {
      const root = this.root();
      if (root) {
        const observer = new Observer(() => this.syncScrim());
        observer.observe(root, { childList: true });
        this.observers.push(observer);
      }
      if (this.documentTarget.body) {
        const observer = new Observer(() => this.syncScrim());
        observer.observe(this.documentTarget.body, { childList: true });
        this.observers.push(observer);
      }
    }
    this.syncScrim();
    return this;
  }
  stop() { this.observers.splice(0).forEach(observer => observer.disconnect?.()); }
  root() { return this.documentTarget?.querySelector?.(this.rootSelector) || null; }
  ensureScrim() {
    if (!this.documentTarget?.body) return null;
    let scrim = this.documentTarget.getElementById?.(this.scrimId);
    if (!scrim) {
      scrim = this.documentTarget.createElement('div');
      scrim.id = this.scrimId;
      scrim.className = 'interaction-scrim';
      scrim.hidden = true;
      scrim.setAttribute('aria-hidden', 'true');
      const root = this.root();
      if (root?.parentNode) root.parentNode.insertBefore(scrim, root); else this.documentTarget.body.append(scrim);
    }
    return scrim;
  }
  register({ id, element, kind = OVERLAY_KINDS.MODAL, dismiss, scrim = true, priority = 0 } = {}) {
    if (!element) throw new TypeError('OverlayManager requires an element');
    const sequence = ++this.sequence;
    const entry = { id: String(id || `overlay-${sequence}`), element, kind, dismiss, scrim: scrim !== false, priority: Number(priority) || 0, sequence };
    this.entries.push(entry);
    this.normalizeElement(element, kind);
    this.syncScrim();
    return () => { this.entries = this.entries.filter(candidate => candidate !== entry); this.syncScrim(); };
  }
  normalizeElement(element, kind = inferOverlayKind(element)) {
    if (!element?.style || kind === OVERLAY_KINDS.PAGE) return;
    element.dataset.interactionManaged = 'true';
    element.style.setProperty('background', 'transparent', 'important');
    element.style.setProperty('backdrop-filter', 'none', 'important');
    element.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
  }
  canonicalEntry() {
    const root = this.root();
    const element = root?.firstElementChild;
    if (!element || !elementVisible(element)) return null;
    const kind = inferOverlayKind(element);
    this.normalizeElement(element, kind);
    return { id: String(element.dataset?.overlay || 'canonical-overlay'), element, kind, scrim: kind !== OVERLAY_KINDS.PAGE, priority: 0, sequence: Number.MAX_SAFE_INTEGER - 1, dismiss: () => this.dismissElement(element, root) };
  }
  externalEntries() {
    const body = this.documentTarget?.body;
    if (!body) return [];
    const scrim = this.ensureScrim();
    return [...body.children]
      .filter(element => element !== scrim && element !== this.root() && elementVisible(element))
      .filter(element => {
        if (element.dataset?.interactionSystemOverlay === 'true') return true;
        const signature = `${element.id || ''} ${element.className || ''}`.toLowerCase();
        return /(^|\s|[-_])overlay($|\s|[-_])/.test(signature) || /professional-overlay/.test(signature);
      })
      .map((element, index) => {
        const kind = inferOverlayKind(element);
        this.normalizeElement(element, kind);
        return { id: String(element.id || `external-${index}`), element, kind, scrim: kind !== OVERLAY_KINDS.PAGE, priority: Number(element.dataset?.interactionPriority || 0), sequence: Number.MAX_SAFE_INTEGER - index - 10, dismiss: () => this.dismissElement(element) };
      });
  }
  liveEntries() {
    const explicit = this.entries.filter(entry => elementVisible(entry.element));
    const canonical = this.canonicalEntry();
    const external = this.externalEntries().filter(entry => entry.element !== canonical?.element && !explicit.some(candidate => candidate.element === entry.element));
    return [...explicit, ...(canonical ? [canonical] : []), ...external];
  }
  top(kinds) {
    const wanted = kinds ? new Set(Array.isArray(kinds) ? kinds : [kinds]) : null;
    return this.liveEntries()
      .filter(entry => !wanted || wanted.has(entry.kind))
      .sort((a, b) => b.priority - a.priority || b.sequence - a.sequence)[0] || null;
  }
  canDismiss(kinds) { return Boolean(this.top(kinds)); }
  dismissTop(kinds) {
    const entry = this.top(kinds);
    if (!entry) return false;
    if (callable(entry.dismiss)) entry.dismiss(); else this.dismissElement(entry.element);
    this.syncScrim();
    return true;
  }
  dismissElement(element, canonicalRoot = null) {
    if (!element) return false;
    const control = element.querySelector?.('[data-close-overlay],[data-v095-cancel],[data-dismiss-overlay],.close-button,[aria-label="关闭"],[aria-label="Close"]');
    if (control?.click) { control.click(); return true; }
    if (canonicalRoot && canonicalRoot.contains(element)) canonicalRoot.replaceChildren();
    else element.remove?.();
    return true;
  }
  syncScrim() {
    const scrim = this.ensureScrim();
    if (!scrim) return;
    const visible = this.liveEntries().some(entry => entry.scrim && entry.kind !== OVERLAY_KINDS.PAGE);
    scrim.hidden = !visible;
    scrim.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }
  openSystemDialog({ id = 'interaction-dialog', title = '', message = '', confirmLabel = '', cancelLabel = '取消', onConfirm, onCancel, danger = false } = {}) {
    if (!this.documentTarget?.body) return () => {};
    const overlay = this.documentTarget.createElement('div');
    overlay.className = 'interaction-system-overlay';
    overlay.dataset.interactionSystemOverlay = 'true';
    overlay.dataset.interactionKind = OVERLAY_KINDS.DIALOG;
    overlay.id = id;
    const panel = this.documentTarget.createElement('section');
    panel.className = 'interaction-system-dialog';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    if (title) { const heading = this.documentTarget.createElement('h2'); heading.textContent = title; panel.append(heading); }
    if (message) { const copy = this.documentTarget.createElement('p'); copy.textContent = message; panel.append(copy); }
    const actions = this.documentTarget.createElement('div');
    actions.className = 'interaction-system-dialog__actions';
    const cancel = this.documentTarget.createElement('button');
    cancel.type = 'button'; cancel.textContent = cancelLabel;
    const confirm = this.documentTarget.createElement('button');
    confirm.type = 'button'; confirm.textContent = confirmLabel || '确认';
    if (danger) confirm.dataset.danger = 'true';
    actions.append(cancel, confirm); panel.append(actions); overlay.append(panel); this.documentTarget.body.append(overlay);
    let unregister = () => {};
    const close = () => { unregister(); overlay.remove(); this.syncScrim(); onCancel?.(); };
    unregister = this.register({ id, element: overlay, kind: OVERLAY_KINDS.DIALOG, priority: 1000, dismiss: close });
    cancel.addEventListener('click', close);
    confirm.addEventListener('click', () => { unregister(); overlay.remove(); this.syncScrim(); onConfirm?.(); });
    return close;
  }
  snapshot() { return this.liveEntries().map(({ id, kind, scrim, priority }) => ({ id, kind, scrim, priority })); }
}

export class RootExitGuard {
  constructor({ draftGuard, notify = () => {}, openConfirmation = () => {}, exit = () => {}, isNative = () => false, clock = () => Date.now(), windowMs = DEFAULT_EXIT_WINDOW_MS } = {}) {
    this.draftGuard = draftGuard;
    this.notify = notify;
    this.openConfirmation = openConfirmation;
    this.exit = exit;
    this.isNative = isNative;
    this.clock = clock;
    this.windowMs = windowMs;
    this.armedUntil = 0;
    this.confirmOpen = false;
  }
  canHandle() { return Boolean(this.isNative?.()); }
  back() {
    if (!this.canHandle()) return false;
    if (this.confirmOpen) return true;
    const now = this.clock();
    if (!this.armedUntil || now > this.armedUntil) {
      this.armedUntil = now + this.windowMs;
      this.notify('再按一次返回以打开退出确认');
      return true;
    }
    this.armedUntil = 0;
    const dirty = this.draftGuard?.decision?.() === 'confirm';
    this.confirmOpen = true;
    this.openConfirmation({
      dirty,
      onConfirm: () => { this.confirmOpen = false; this.exit(); },
      onCancel: () => { this.confirmOpen = false; }
    });
    return true;
  }
  reset() { this.armedUntil = 0; this.confirmOpen = false; }
  snapshot() { return { native: this.canHandle(), armed: Boolean(this.armedUntil && this.clock() <= this.armedUntil), confirmOpen: this.confirmOpen }; }
}

export class NavigationManager {
  constructor({ overlayManager, flowNavigation, draftGuard, rootExitGuard, legacyBack = () => false, confirmDraftLeave = () => false, documentTarget = globalThis.document } = {}) {
    this.overlayManager = overlayManager;
    this.flowNavigation = flowNavigation;
    this.draftGuard = draftGuard;
    this.rootExitGuard = rootExitGuard;
    this.legacyBack = legacyBack;
    this.confirmDraftLeave = confirmDraftLeave;
    this.documentTarget = documentTarget;
    this.childEntries = [];
    this.childSequence = 0;
    this.activePage = 'beans';
  }
  setActivePage(page) { if (page) this.activePage = String(page); }
  registerChildBack({ id, back, canBack = () => true, priority = 0, scope = null, leavesContext = false } = {}) {
    if (!callable(back)) throw new TypeError('NavigationManager child route requires a back handler');
    const sequence = ++this.childSequence;
    const entry = { id: String(id || `child-${sequence}`), back, canBack, priority: Number(priority) || 0, scope, leavesContext, sequence };
    this.childEntries.push(entry);
    return () => { this.childEntries = this.childEntries.filter(candidate => candidate !== entry); };
  }
  topChild() {
    return this.childEntries.filter(entry => !callable(entry.canBack) || entry.canBack()).sort((a, b) => b.priority - a.priority || b.sequence - a.sequence)[0] || null;
  }
  handleKeyboard() {
    const active = this.documentTarget?.activeElement;
    if (!active || active === this.documentTarget?.body) return false;
    const tag = String(active.tagName || '').toLowerCase();
    if (!['input', 'textarea', 'select'].includes(tag) && active.isContentEditable !== true) return false;
    active.blur?.();
    return true;
  }
  runEntry(entry) {
    if (!entry) return false;
    if (entry.leavesContext && this.draftGuard?.decision?.(entry.scope) === 'confirm') {
      this.confirmDraftLeave({ scope: entry.scope, onConfirm: () => entry.back() });
      return true;
    }
    entry.back();
    return true;
  }
  canGoBack() {
    if (this.overlayManager?.canDismiss?.([OVERLAY_KINDS.TRANSIENT, OVERLAY_KINDS.DIALOG, OVERLAY_KINDS.MODAL, OVERLAY_KINDS.SHEET])) return true;
    if (this.flowNavigation?.canBack?.()) return true;
    if (this.topChild()) return true;
    if (this.rootExitGuard?.canHandle?.()) return true;
    return false;
  }
  back({ source = 'app' } = {}) {
    if (this.handleKeyboard()) return true;
    for (const kinds of [[OVERLAY_KINDS.TRANSIENT], [OVERLAY_KINDS.DIALOG], [OVERLAY_KINDS.MODAL, OVERLAY_KINDS.SHEET]]) {
      if (this.overlayManager?.dismissTop?.(kinds)) return true;
    }
    const flow = this.flowNavigation?.peek?.();
    if (flow) return this.runEntry(flow);
    const child = this.topChild();
    if (child) return this.runEntry(child);
    if (this.legacyBack?.({ source })) return true;
    return Boolean(this.rootExitGuard?.back?.());
  }
  snapshot() {
    return {
      page: this.activePage,
      overlays: this.overlayManager?.snapshot?.() || [],
      flows: this.flowNavigation?.snapshot?.() || [],
      children: this.childEntries.map(({ id, scope, leavesContext }) => ({ id, scope, leavesContext })),
      draft: this.draftGuard?.snapshot?.() || { dirty: false, scopes: [] },
      rootExit: this.rootExitGuard?.snapshot?.() || { native: false, armed: false, confirmOpen: false }
    };
  }
}

export class BackGestureAdapter {
  constructor(navigationManager) { this.navigationManager = navigationManager; }
  back(source = 'system') { return Boolean(this.navigationManager?.back?.({ source })); }
}

export { OVERLAY_KINDS, DEFAULT_EXIT_WINDOW_MS, inferOverlayKind };
