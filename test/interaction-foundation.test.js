import test from 'node:test';
import assert from 'node:assert/strict';
import { DraftGuard, FlowNavigation, RootExitGuard, NavigationManager } from '../src/ui/interaction-foundation.js';

test('DraftGuard installs beforeunload only while dirty', () => {
  const events = [];
  const win = {
    addEventListener: name => events.push(['add', name]),
    removeEventListener: name => events.push(['remove', name])
  };
  const guard = new DraftGuard({ windowTarget: win });
  assert.equal(guard.decision(), 'allow');
  guard.setDirty('bean-editor', true);
  assert.equal(guard.decision('bean-editor'), 'confirm');
  guard.clear('bean-editor');
  assert.equal(guard.decision(), 'allow');
  assert.deepEqual(events, [['add', 'beforeunload'], ['remove', 'beforeunload']]);
});

test('FlowNavigation prefers the latest highest-priority active handler', () => {
  const flow = new FlowNavigation();
  const calls = [];
  flow.register({ id: 'first', priority: 1, back: () => calls.push('first') });
  flow.register({ id: 'second', priority: 2, back: () => calls.push('second') });
  assert.equal(flow.peek().id, 'second');
  flow.peek().back();
  assert.deepEqual(calls, ['second']);
});

test('RootExitGuard requires hint, confirmation and explicit exit', () => {
  let now = 1000;
  const notices = [];
  const confirmations = [];
  let exits = 0;
  const guard = new RootExitGuard({
    isNative: () => true,
    clock: () => now,
    notify: message => notices.push(message),
    draftGuard: { decision: () => 'allow' },
    openConfirmation: options => confirmations.push(options),
    exit: () => exits += 1
  });
  assert.equal(guard.back(), true);
  assert.equal(confirmations.length, 0);
  assert.equal(notices.length, 1);
  now += 500;
  assert.equal(guard.back(), true);
  assert.equal(confirmations.length, 1);
  assert.equal(exits, 0);
  confirmations[0].onConfirm();
  assert.equal(exits, 1);
});

test('ordinary web root is not trapped by application history hacks', () => {
  const root = new RootExitGuard({ isNative: () => false });
  const nav = new NavigationManager({
    overlayManager: { canDismiss: () => false, dismissTop: () => false, snapshot: () => [] },
    flowNavigation: new FlowNavigation(),
    draftGuard: new DraftGuard({ windowTarget: null }),
    rootExitGuard: root,
    documentTarget: null
  });
  assert.equal(nav.back(), false);
  assert.equal(nav.canGoBack(), false);
});

test('navigation priority is overlay then flow then child then root', () => {
  const calls = [];
  let overlay = true;
  let flowActive = true;
  let childActive = true;
  const overlayManager = {
    canDismiss: () => overlay,
    dismissTop: () => {
      if (!overlay) return false;
      overlay = false;
      calls.push('overlay');
      return true;
    },
    snapshot: () => []
  };
  const flow = new FlowNavigation();
  flow.register({ id: 'flow', canBack: () => flowActive, back: () => { flowActive = false; calls.push('flow'); } });
  const root = { canHandle: () => true, back: () => { calls.push('root'); return true; }, snapshot: () => ({ native: true }) };
  const nav = new NavigationManager({
    overlayManager,
    flowNavigation: flow,
    draftGuard: new DraftGuard({ windowTarget: null }),
    rootExitGuard: root,
    documentTarget: null
  });
  nav.registerChildBack({ id: 'child', canBack: () => childActive, back: () => { childActive = false; calls.push('child'); } });
  nav.back();
  nav.back();
  nav.back();
  nav.back();
  assert.deepEqual(calls, ['overlay', 'flow', 'child', 'root']);
});

test('dirty context asks NavigationManager for confirmation without DraftGuard navigating', () => {
  const calls = [];
  const flow = new FlowNavigation();
  flow.register({ id: 'editor', scope: 'bean-editor', leavesContext: true, back: () => calls.push('back') });
  const guard = new DraftGuard({ windowTarget: null });
  guard.setDirty('bean-editor', true);
  let pending;
  const nav = new NavigationManager({
    overlayManager: { canDismiss: () => false, dismissTop: () => false, snapshot: () => [] },
    flowNavigation: flow,
    draftGuard: guard,
    rootExitGuard: { canHandle: () => false, back: () => false, snapshot: () => ({ native: false }) },
    confirmDraftLeave: options => { pending = options; },
    documentTarget: null
  });
  assert.equal(nav.back(), true);
  assert.deepEqual(calls, []);
  pending.onConfirm();
  assert.deepEqual(calls, ['back']);
});
