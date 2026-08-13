import { all } from '../db.js';

const KEY = 'luckybean.onboarding.v2';
const LEGACY_KEY = 'luckybean.onboarding.v1';
const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const TERMINAL_SYNC_STATES = new Set(['synced', 'synced-preserved', 'downloaded', 'idle']);
let routeAfterSync = false;
let syncSucceededAfterRegistration = false;

function readState() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
  catch { return null; }
}
function writeState(stage, detail = {}) {
  const value = { stage, updatedAt:new Date().toISOString(), ...detail };
  localStorage.setItem(KEY, JSON.stringify(value));
  return value;
}
function currentStage() { return readState()?.stage || ''; }
function cloudSession() { return globalThis.LuckyBeanCloudAuth?.getSession?.() || null; }

async function hasMeaningfulLocalHistory() {
  const [beans, brews, sensory] = await Promise.all([
    all('beans').catch(() => []), all('brewSessions').catch(() => []), all('sensoryRecords').catch(() => [])
  ]);
  return beans.length > 0 || brews.length > 0 || sensory.length > 0;
}
function removePrompt() { $('[data-lb-onboarding]')?.remove(); }
function showPrompt() {
  if ($('[data-lb-onboarding]') || cloudSession()?.user?.id) return;
  const stage = currentStage();
  if (['guide-completed','existing-user','dismissed'].includes(stage)) return;
  const node = document.createElement('div');
  node.className = 'lb-onboarding'; node.dataset.lbOnboarding = '1';
  node.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="lbOnboardTitle"><strong id="lbOnboardTitle">欢迎使用 Lucky Bean</strong><p>建议先建立服务器同步账户，用于多设备同步和数据保护。完成注册后会自动定位到“本物”的使用说明。</p><footer><button class="button primary" type="button" data-lb-onboard-account>前往账户</button><button class="button subtle" type="button" data-lb-onboard-later>稍后</button></footer></div>`;
  document.body.append(node);
}
function openSettingsSection(key) {
  $('[data-page-target="settings"]')?.click();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const section = $(`#settingsContent .settings-category[data-settings-key="${key}"]`);
    if (!section) return;
    $('#settingsContent .settings-category[open]')?.removeAttribute('open');
    section.open = true;
    section.scrollIntoView({ behavior:'smooth', block:'start' });
  }));
}
function routeToAccount() {
  writeState('account-pending');
  removePrompt();
  openSettingsSection('account');
}
function routeToGuide() {
  routeAfterSync = false;
  openSettingsSection('about');
  const attempt = retries => requestAnimationFrame(() => {
    const section = $('#settingsContent .settings-category[data-settings-key="about"]');
    const button = section?.querySelector?.('[data-lb-open-guide]');
    if ((!section || !button) && retries > 0) { setTimeout(() => attempt(retries - 1), 60); return; }
    if (!section || !button) return;
    section.open = true;
    button.scrollIntoView({ behavior:'smooth', block:'center' });
    button.classList.add('onboarding-highlight');
    setTimeout(() => button.classList.remove('onboarding-highlight'), 2500);
    writeState('guide-completed');
  });
  attempt(20);
}
function maybeRouteAfterRegistration(state) {
  if (!routeAfterSync) return;
  if (state === 'error' || state === 'legacy-encrypted' || state === 'deletion-confirmation-required') return;
  if (TERMINAL_SYNC_STATES.has(state)) {
    syncSucceededAfterRegistration = true;
    routeToGuide();
  }
}
async function initialize() {
  const state = readState();
  const session = cloudSession();
  if (!state && localStorage.getItem(LEGACY_KEY)) {
    writeState(session?.user?.id ? 'existing-user' : 'dismissed', { migratedFrom:'v1' });
    return;
  }
  if (state?.stage === 'account-completed') {
    routeAfterSync = true;
    if (document.documentElement.dataset.cloudSync && TERMINAL_SYNC_STATES.has(document.documentElement.dataset.cloudSync)) routeToGuide();
    return;
  }
  if (session?.user?.id) {
    if (!state || !['guide-completed','account-pending-verification'].includes(state.stage)) writeState('existing-user');
    return;
  }
  if (await hasMeaningfulLocalHistory()) {
    if (!state) writeState('existing-user', { reason:'local-history' });
    return;
  }
  if (!state || ['new','account-pending','account-pending-verification'].includes(state.stage)) {
    if (!state) writeState('new');
    showPrompt();
  }
}

document.addEventListener('click', event => {
  if (event.target.closest?.('[data-lb-onboard-account]')) { event.preventDefault(); routeToAccount(); return; }
  if (event.target.closest?.('[data-lb-onboard-later]')) { event.preventDefault(); removePrompt(); }
});
document.addEventListener('luckybean:cloud-registration-pending', event => {
  writeState('account-pending-verification', { email:event.detail?.email || '' });
  removePrompt();
});
document.addEventListener('luckybean:cloud-register-success', event => {
  writeState('account-completed', { email:event.detail?.email || '', verificationCompleted:Boolean(event.detail?.verificationCompleted) });
  removePrompt();
  routeAfterSync = true;
  syncSucceededAfterRegistration = false;
  globalThis.LuckyBeanCloudSync?.ensureAutomatic?.('onboarding-registration');
});
document.addEventListener('luckybean:cloud-login-success', event => {
  const action = event.detail?.authAction || 'login';
  if (action !== 'login') return;
  const stage = currentStage();
  if (['new','account-pending','account-pending-verification',''].includes(stage)) writeState('existing-user', { reason:'existing-account-login' });
  removePrompt();
});
document.addEventListener('luckybean:cloud-sync-state', event => maybeRouteAfterRegistration(event.detail?.state || ''));
document.addEventListener('luckybean:about-ready', () => { if (currentStage() === 'account-completed' && (syncSucceededAfterRegistration || TERMINAL_SYNC_STATES.has(document.documentElement.dataset.cloudSync))) routeToGuide(); });
document.addEventListener('luckybean:local-app-ready', () => initialize().catch(console.error), { once:true });
if (document.documentElement.dataset.startup === 'ready') initialize().catch(console.error);

globalThis.LuckyBeanOnboarding = { state:readState, start:routeToAccount, guide:routeToGuide };
