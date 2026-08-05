import { getSetting, setSetting, get, put } from '../db.js';

const DEVICE_RECORD_ID = 'cloud.device.id.v3';
const SPLASH_READY_TIMEOUT_MS = 12000;
let enterRequested = false;
let shellReady = false;

const splash = () => document.querySelector('#splashScreen');
const statusNode = () => document.querySelector('#splashStatus');

function setStatus(message) {
  const node = statusNode();
  if (node) node.textContent = message;
}

async function deviceId() {
  const existing = await get('syncMetadata', DEVICE_RECORD_ID).catch(() => null);
  if (existing?.value) return existing.value;
  const value = crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  await put('syncMetadata', { id: DEVICE_RECORD_ID, value, createdAt: new Date().toISOString() });
  return value;
}

async function ensureLocalIdentity() {
  const settings = await getSetting('app.settings', {});
  const identity = settings?.identity || {};
  if (identity.publicId) return identity;
  const device = await deviceId();
  const publicId = `LB-LOCAL-${device.replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const next = {
    ...(settings || {}),
    identity: {
      ...identity,
      mode: identity.mode === 'email' ? 'email' : 'local',
      nickname: identity.nickname && identity.nickname !== '访客' ? identity.nickname : '本地用户',
      publicId,
      verified: Boolean(identity.verified)
    }
  };
  await setSetting('app.settings', next);
  return next.identity;
}

function dismissSplash() {
  const node = splash();
  if (!node || node.classList.contains('hidden')) return;
  if (!shellReady) {
    enterRequested = true;
    setStatus('正在准备本地数据…');
    return;
  }
  node.classList.add('splash-leave');
  setTimeout(() => node.classList.add('hidden'), 520);
}

function bindEarlyEntry() {
  const node = splash();
  if (!node || node.dataset.startupBound === '1') return;
  node.dataset.startupBound = '1';
  node.tabIndex = 0;
  node.setAttribute('role', 'button');
  node.setAttribute('aria-label', '点击进入富贵盒子');
  node.addEventListener('click', dismissSplash);
  node.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      dismissSplash();
    }
  });
}

function watchForShell() {
  const startedAt = performance.now();
  const check = () => {
    const shell = document.querySelector('#appShell');
    shellReady = Boolean(shell && !shell.classList.contains('hidden'));
    if (shellReady) {
      document.documentElement.dataset.startup = 'ready';
      setStatus('点击进入');
      document.dispatchEvent(new CustomEvent('luckybean:local-app-ready'));
      if (enterRequested) dismissSplash();
      return;
    }
    if (performance.now() - startedAt < SPLASH_READY_TIMEOUT_MS) requestAnimationFrame(check);
    else setStatus('本地初始化未完成，请重新打开应用');
  };
  requestAnimationFrame(check);
}

function bindStatusEvents() {
  document.addEventListener('luckybean:cloud-auth-state', event => {
    if (shellReady) return;
    const state = event.detail?.state;
    if (state === 'connecting') setStatus('正在连接云端…');
    if (state === 'authenticated') setStatus('云端已连接，正在准备本地数据…');
    if (['offline', 'signed-out', 'expired', 'reauth-required'].includes(state)) setStatus('正在准备本地数据…');
  });
  document.addEventListener('luckybean:cloud-data-restored', () => {
    const node = splash();
    if (node && !node.classList.contains('hidden')) {
      setStatus('云端数据已更新，正在重新载入…');
      setTimeout(() => location.reload(), 120);
    }
  });
}

document.documentElement.dataset.startup = 'booting';
bindEarlyEntry();
bindStatusEvents();
setStatus('正在准备本地数据…');
await ensureLocalIdentity();
document.dispatchEvent(new CustomEvent('luckybean:local-bootstrap-ready'));
watchForShell();
