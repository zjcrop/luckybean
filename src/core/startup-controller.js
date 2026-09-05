import { get, put } from '../db.js';

const DEVICE_RECORD_ID = 'cloud.device.id.v3';
const DEVICE_FALLBACK_KEY = 'luckybean.local.device.fallback.v1';
const SPLASH_READY_TIMEOUT_MS = 12000;
const LOCAL_DEVICE_TIMEOUT_MS = 2500;
const RELEASE_REVISION = document.body?.dataset.releaseRevision || document.querySelector('meta[name="release-revision"]')?.content || '1.24P-main.2';
const APP_MODULE_REVISION = RELEASE_REVISION;
let enterRequested = false;
let shellReady = false;

const splash = () => document.querySelector('#splashScreen');
const statusNode = () => document.querySelector('#splashStatus');

function setStatus(message) {
  const node = statusNode();
  if (node) node.textContent = message;
}

function cloneFallback(value, seen = new Map()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);
  if (typeof File !== 'undefined' && value instanceof File) return new File([value], value.name, { type:value.type, lastModified:value.lastModified });
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value.slice(0, value.size, value.type);
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return value.slice(0);
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView?.(value)) {
    if (typeof DataView !== 'undefined' && value instanceof DataView) {
      const copied = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      return new DataView(copied);
    }
    return new value.constructor(value);
  }
  if (typeof Map !== 'undefined' && value instanceof Map) {
    const result = new Map();
    seen.set(value, result);
    value.forEach((mapValue, mapKey) => result.set(cloneFallback(mapKey, seen), cloneFallback(mapValue, seen)));
    return result;
  }
  if (typeof Set !== 'undefined' && value instanceof Set) {
    const result = new Set();
    seen.set(value, result);
    value.forEach(setValue => result.add(cloneFallback(setValue, seen)));
    return result;
  }
  if (Array.isArray(value)) {
    const result = [];
    seen.set(value, result);
    for (const item of value) result.push(cloneFallback(item, seen));
    return result;
  }
  const result = Object.create(Object.getPrototypeOf(value) === null ? null : Object.prototype);
  seen.set(value, result);
  for (const key of Object.keys(value)) result[key] = cloneFallback(value[key], seen);
  return result;
}

function installCompatibility() {
  if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = cloneFallback;
    document.documentElement.dataset.cloneCompatibility = 'fallback';
  } else {
    document.documentElement.dataset.cloneCompatibility = 'native';
  }
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

function fallbackDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_FALLBACK_KEY);
    if (existing) return existing;
  } catch { /* localStorage 不可用时继续生成临时 ID */ }
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  try { localStorage.setItem(DEVICE_FALLBACK_KEY, value); } catch { /* 临时 ID 仍可用于本次会话 */ }
  return value;
}

async function deviceId() {
  const existing = await get('syncMetadata', DEVICE_RECORD_ID).catch(() => null);
  if (existing?.value) return existing.value;
  const value = fallbackDeviceId();
  try {
    await put('syncMetadata', { id: DEVICE_RECORD_ID, value, createdAt: new Date().toISOString() });
    document.documentElement.dataset.localDeviceStorage = 'indexeddb';
  } catch (error) {
    console.warn('本机设备标识写入 IndexedDB 失败，已降级为本地兼容标识', error);
    document.documentElement.dataset.localDeviceStorage = 'fallback';
  }
  return value;
}

async function ensureLocalDevice() {
  const fallback = fallbackDeviceId();
  let timer = 0;
  const timeout = new Promise(resolve => {
    timer = globalThis.setTimeout(() => {
      document.documentElement.dataset.localDeviceStorage = 'fallback-timeout';
      console.warn(`IndexedDB 本机标识初始化超过 ${LOCAL_DEVICE_TIMEOUT_MS}ms，启动流程已继续使用兼容标识`);
      resolve(fallback);
    }, LOCAL_DEVICE_TIMEOUT_MS);
  });
  const storageTask = deviceId().catch(error => {
    console.warn('本机设备标识初始化失败，启动流程已继续使用兼容标识', error);
    document.documentElement.dataset.localDeviceStorage = 'fallback';
    return fallback;
  });
  try { return await Promise.race([storageTask, timeout]); }
  finally { globalThis.clearTimeout(timer); }
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

installCompatibility();

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
