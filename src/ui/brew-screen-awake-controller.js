export const BREW_SCREEN_AWAKE_REVISION = 'p2-brew-screen-awake/1.0';

let wakeSentinel = null;
let wakeRequestPending = false;
let nativeAwakeState = null;
let syncFrame = 0;

function timerIsActive() {
  return Boolean(document.querySelector('#overlayRoot [data-overlay="timer"]'));
}

function setNativeAwake(enabled) {
  const bridge = globalThis.LuckyBeanNative;
  if (typeof bridge?.setBrewScreenAwake !== 'function') return;
  if (nativeAwakeState === enabled) return;
  try {
    bridge.setBrewScreenAwake(Boolean(enabled));
    nativeAwakeState = Boolean(enabled);
  } catch (error) {
    console.warn('Android 冲煮防息屏切换失败', error);
  }
}

async function releaseWebWakeLock() {
  const sentinel = wakeSentinel;
  wakeSentinel = null;
  if (!sentinel) return;
  try {
    await sentinel.release?.();
  } catch (error) {
    console.warn('Web 冲煮防息屏释放失败', error);
  }
}

async function requestWebWakeLock() {
  if (wakeSentinel || wakeRequestPending || document.visibilityState !== 'visible') return;
  if (typeof navigator.wakeLock?.request !== 'function') return;
  wakeRequestPending = true;
  try {
    const sentinel = await navigator.wakeLock.request('screen');
    wakeSentinel = sentinel;
    sentinel?.addEventListener?.('release', () => {
      if (wakeSentinel === sentinel) wakeSentinel = null;
      if (timerIsActive() && document.visibilityState === 'visible') scheduleSync();
    });
  } catch (error) {
    console.warn('Web 冲煮防息屏申请失败', error);
  } finally {
    wakeRequestPending = false;
  }
}

export async function syncBrewScreenAwake() {
  const active = timerIsActive();
  setNativeAwake(active);
  if (!active || document.visibilityState !== 'visible') {
    await releaseWebWakeLock();
    return active;
  }
  await requestWebWakeLock();
  return active;
}

function scheduleSync() {
  if (syncFrame) return;
  syncFrame = requestAnimationFrame(() => {
    syncFrame = 0;
    void syncBrewScreenAwake();
  });
}

const overlayRoot = document.querySelector('#overlayRoot');
const overlayObserver = new MutationObserver(() => scheduleSync());
if (overlayRoot) overlayObserver.observe(overlayRoot, { childList: true, subtree: true });

document.addEventListener('visibilitychange', scheduleSync);
window.addEventListener('pagehide', () => {
  setNativeAwake(false);
  void releaseWebWakeLock();
});

scheduleSync();

globalThis.LuckyBeanBrewScreenAwake = Object.freeze({
  revision: BREW_SCREEN_AWAKE_REVISION,
  sync: syncBrewScreenAwake,
  active: timerIsActive
});
