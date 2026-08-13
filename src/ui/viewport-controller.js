function applyViewport() {
  const viewport = globalThis.visualViewport;
  const height = Math.max(320, Math.round(viewport?.height || globalThis.innerHeight || document.documentElement.clientHeight || 0));
  const width = Math.max(240, Math.round(viewport?.width || globalThis.innerWidth || document.documentElement.clientWidth || 0));
  document.documentElement.style.setProperty('--viewport-height', `${height}px`);
  document.documentElement.style.setProperty('--viewport-width', `${width}px`);
  document.dispatchEvent(new CustomEvent('luckybean:viewport-changed', { detail: { width, height } }));
}
let queued = false;
function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; applyViewport(); });
}
applyViewport();
globalThis.visualViewport?.addEventListener('resize', queue, { passive:true });
globalThis.visualViewport?.addEventListener('scroll', queue, { passive:true });
globalThis.addEventListener('resize', queue, { passive:true });
globalThis.addEventListener('orientationchange', queue, { passive:true });
globalThis.addEventListener('pageshow', queue, { passive:true });

globalThis.LuckyBeanViewport = { refresh:applyViewport };
