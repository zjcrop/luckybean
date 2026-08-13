const STORAGE_KEY = 'luckybean.fab.position.v2';
const LEGACY_KEY = 'luckybean.fab.position.v1';
const wrap = document.querySelector('#fabWrap');

if (wrap && !globalThis.__LuckyBeanFabControllerLoaded) {
  globalThis.__LuckyBeanFabControllerLoaded = true;
  wrap.dataset.fabController = 'v2';

  const handle = document.createElement('span');
  handle.className = 'v097-fab-drag-handle';
  handle.setAttribute('aria-label', '拖动快捷菜单');
  handle.setAttribute('title', '拖动移动');
  Object.assign(handle.style, {
    position:'absolute', left:'50%', top:'50%', width:'42px', height:'42px', transform:'translate(-50%, -50%)',
    borderRadius:'50%', background:'rgba(255,255,255,.18)', border:'2px solid rgba(255,255,255,.48)',
    boxShadow:'0 0 0 5px rgba(255,255,255,.08), 0 2px 7px rgba(0,0,0,.5)', cursor:'grab', touchAction:'none', zIndex:'5'
  });
  wrap.append(handle);
  wrap.querySelectorAll('.fab').forEach(button => button.addEventListener('pointerdown', event => event.stopPropagation()));

  function viewportBounds() {
    const viewport = globalThis.visualViewport;
    const left = viewport?.offsetLeft || 0;
    const top = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth;
    const height = viewport?.height || innerHeight;
    const nav = document.querySelector('#bottomNav')?.getBoundingClientRect();
    const bottomLimit = nav && nav.top > top ? nav.top - 8 : top + height - 8;
    const rect = wrap.getBoundingClientRect();
    return {
      minX:left + 8,
      maxX:Math.max(left + 8, left + width - rect.width - 8),
      minY:top + 8,
      maxY:Math.max(top + 8, bottomLimit - rect.height)
    };
  }
  function clampPosition(x, y) {
    const bounds = viewportBounds();
    return { x:Math.min(Math.max(bounds.minX, x), bounds.maxX), y:Math.min(Math.max(bounds.minY, y), bounds.maxY), bounds };
  }
  function savePosition(x, y, bounds) {
    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanY = Math.max(1, bounds.maxY - bounds.minY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rx:(x - bounds.minX) / spanX, ry:(y - bounds.minY) / spanY }));
  }
  function apply(x, y, save = false) {
    const next = clampPosition(x, y);
    wrap.style.left = `${next.x}px`; wrap.style.top = `${next.y}px`; wrap.style.right = 'auto'; wrap.style.bottom = 'auto'; wrap.style.transform = 'none';
    if (save) savePosition(next.x, next.y, next.bounds);
  }
  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      const bounds = viewportBounds();
      if (Number.isFinite(saved?.rx) && Number.isFinite(saved?.ry)) {
        apply(bounds.minX + Math.min(1, Math.max(0, saved.rx)) * Math.max(1, bounds.maxX - bounds.minX), bounds.minY + Math.min(1, Math.max(0, saved.ry)) * Math.max(1, bounds.maxY - bounds.minY));
        return;
      }
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      if (Number.isFinite(legacy?.x) && Number.isFinite(legacy?.y)) { apply(legacy.x, legacy.y, true); localStorage.removeItem(LEGACY_KEY); }
    } catch { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(LEGACY_KEY); }
  }
  function repair() {
    if (wrap.classList.contains('hidden')) return;
    const rect = wrap.getBoundingClientRect();
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top) || rect.width < 20 || rect.height < 20) return;
    apply(rect.left, rect.top, true);
  }

  let drag = null;
  handle.addEventListener('pointerdown', event => {
    const rect = wrap.getBoundingClientRect();
    drag = { pointerId:event.pointerId, offsetX:event.clientX - rect.left, offsetY:event.clientY - rect.top };
    handle.setPointerCapture(event.pointerId); handle.style.cursor = 'grabbing'; event.preventDefault();
  });
  handle.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault(); apply(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  });
  const finish = event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = wrap.getBoundingClientRect(); apply(rect.left, rect.top, true); drag = null; handle.style.cursor = 'grab';
  };
  handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', finish);
  document.addEventListener('luckybean:viewport-changed', () => requestAnimationFrame(repair));
  globalThis.addEventListener('pageshow', () => requestAnimationFrame(repair));
  restore();

  globalThis.LuckyBeanFabController = {
    repair,
    reset:() => { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(LEGACY_KEY); wrap.style.removeProperty('left'); wrap.style.removeProperty('top'); wrap.style.removeProperty('right'); wrap.style.removeProperty('bottom'); wrap.style.removeProperty('transform'); requestAnimationFrame(repair); }
  };
}
