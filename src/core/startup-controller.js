import { get, put } from '../db.js';

const DEVICE_RECORD_ID = 'cloud.device.id.v3';
const SPLASH_READY_TIMEOUT_MS = 12000;
const RELEASE_REVISION = document.body?.dataset.releaseRevision || document.querySelector('meta[name="release-revision"]')?.content || '1.24B-main.3';
// Keep the app module cache key independent until the recommendation prompt recovery is verified on persistent clients.
const APP_MODULE_REVISION = '1.24B-main.8-prompt';
let enterRequested = false;
let shellReady = false;

const splash = () => document.querySelector('#splashScreen');
const statusNode = () => document.querySelector('#splashStatus');

function setStatus(message) {
  const node = statusNode();
  if (node) node.textContent = message;
}

function isMobileBrowser() {
  if (globalThis.__LUCKYBEAN_ANDROID__) return false;
  const ua = navigator.userAgent || '';
  const touch = Number(navigator.maxTouchPoints || 0) > 0;
  const coarse = globalThis.matchMedia?.('(pointer: coarse)')?.matches === true;
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua);
  const compactViewport = Math.min(globalThis.innerWidth || 9999, globalThis.screen?.width || 9999) <= 1024;
  return touch && coarse && (mobileUa || compactViewport);
}

function requestMobileFullscreenFromGesture() {
  if (!isMobileBrowser() || document.fullscreenElement) return;
  const target = document.documentElement;
  const request = target.requestFullscreen || target.webkitRequestFullscreen;
  try {
    const result = request?.call(target, { navigationUI: 'hide' });
    result?.catch?.(() => {});
  } catch { /* 浏览器不支持时正常降级 */ }
}

async function deviceId() {
  const existing = await get('syncMetadata', DEVICE_RECORD_ID).catch(() => null);
  if (existing?.value) return existing.value;
  const value = crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  await put('syncMetadata', { id: DEVICE_RECORD_ID, value, createdAt: new Date().toISOString() });
  return value;
}

async function ensureLocalDevice() { return deviceId(); }

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

function enterFromUserGesture() {
  requestMobileFullscreenFromGesture();
  dismissSplash();
}

function bindEarlyEntry() {
  const node = splash();
  if (!node || node.dataset.startupBound === '1') return;
  node.dataset.startupBound = '1';
  node.tabIndex = 0;
  node.setAttribute('role', 'button');
  node.setAttribute('aria-label', '点击进入富贵盒子');
  node.addEventListener('click', enterFromUserGesture);
  node.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      enterFromUserGesture();
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
    document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail: { source: 'cloud-data-restored' } }));
    if (node && !node.classList.contains('hidden')) {
      setStatus('云端数据已更新，正在刷新本地视图…');
      document.addEventListener('luckybean:app-refreshed', () => { setStatus('点击进入'); if (enterRequested) dismissSplash(); }, { once: true });
    }
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(RELEASE_REVISION)}`, { updateViaCache: 'none' }).catch(() => {});
}

document.documentElement.dataset.startup = 'booting';
bindEarlyEntry();
bindStatusEvents();
setStatus('正在准备本地数据…');

try {
  await ensureLocalDevice();
  document.dispatchEvent(new CustomEvent('luckybean:local-bootstrap-ready'));
  await import(`../app.js?v=${encodeURIComponent(APP_MODULE_REVISION)}`);
  document.dispatchEvent(new CustomEvent('luckybean:app-module-loaded', { detail: { appModuleRevision: APP_MODULE_REVISION } }));
  watchForShell();
} catch (error) {
  console.error('本地应用启动失败', error);
  document.documentElement.dataset.startup = 'failed';
  setStatus(`本地程序加载失败：${error?.message || '未知错误'}`);
}
