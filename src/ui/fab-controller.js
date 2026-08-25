const STORAGE_KEY = 'luckybean.fab.position.v2';
const LEGACY_KEY = 'luckybean.fab.position.v1';
const wrap = document.querySelector('#fabWrap');

if (wrap && !globalThis.__LuckyBeanFabControllerLoaded) {
  globalThis.__LuckyBeanFabControllerLoaded = true;
  wrap.dataset.fabController = 'v2';
  wrap.dataset.fabPositionOwner = 'canonical';

  // ui-layout-controller.js still contains the historical v1 drag binder for compatibility
  // with old builds. Claim its guard before runtime-features loads so only this controller
  // can own #fabWrap position state in the current app.
  wrap.dataset.v097DragBound = '1';
  delete wrap.dataset.v097Floating;

  const clamp01 = value => Math.min(1, Math.max(0, Number(value) || 0));
  const shell = () => document.querySelector('#appShell');
  const beanPage = () => document.querySelector('#pageBeans.active');
  const currentViewport = () => {
    const viewport = globalThis.visualViewport;
    return {
      left: Number(viewport?.offsetLeft || 0),
      top: Number(viewport?.offsetTop || 0),
      width: Number(viewport?.width || innerWidth || 0),
      height: Number(viewport?.height || innerHeight || 0)
    };
  };

  function measurable() {
    const appShell = shell();
    if (!appShell || appShell.classList.contains('hidden')) return false;
    if (wrap.classList.contains('hidden') || !beanPage()) return false;
    const rect = wrap.getBoundingClientRect();
    return Number.isFinite(rect.left)
      && Number.isFinite(rect.top)
      && rect.width >= 20
      && rect.height >= 20
      && currentViewport().width > 40
      && currentViewport().height > 40;
  }

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
    const viewport = currentViewport();
    const nav = document.querySelector('#bottomNav')?.getBoundingClientRect();
    const rect = wrap.getBoundingClientRect();
    const margin = 8;
    const viewportRight = viewport.left + viewport.width;
    const viewportBottom = viewport.top + viewport.height;
    const navTop = nav && Number.isFinite(nav.top) && nav.top > viewport.top
      ? Math.min(nav.top, viewportBottom)
      : viewportBottom;
    return {
      minX: viewport.left + margin,
      maxX: Math.max(viewport.left + margin, viewportRight - rect.width - margin),
      minY: viewport.top + margin,
      maxY: Math.max(viewport.top + margin, navTop - rect.height - margin)
    };
  }

  function clampPosition(x, y) {
    const bounds = viewportBounds();
    return {
      x: Math.min(Math.max(bounds.minX, Number(x) || bounds.minX), bounds.maxX),
      y: Math.min(Math.max(bounds.minY, Number(y) || bounds.minY), bounds.maxY),
      bounds
    };
  }

  function savePosition(x, y, bounds = viewportBounds()) {
    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanY = Math.max(1, bounds.maxY - bounds.minY);
    const payload = {
      version: 2,
      rx: clamp01((x - bounds.minX) / spanX),
      ry: clamp01((y - bounds.minY) / spanY)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    localStorage.removeItem(LEGACY_KEY);
    return payload;
  }

  function apply(x, y, { save = false } = {}) {
    if (!measurable()) return false;
    const next = clampPosition(x, y);
    wrap.style.left = `${next.x}px`;
    wrap.style.top = `${next.y}px`;
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
    wrap.style.transform = 'none';
    if (save) savePosition(next.x, next.y, next.bounds);
    return true;
  }

  function readStoredPosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (Number.isFinite(saved?.rx) && Number.isFinite(saved?.ry)) {
        return { type:'relative', rx:clamp01(saved.rx), ry:clamp01(saved.ry) };
      }
      if (saved) localStorage.removeItem(STORAGE_KEY);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }

    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      if (Number.isFinite(legacy?.x) && Number.isFinite(legacy?.y)) {
        return { type:'legacy', x:Number(legacy.x), y:Number(legacy.y) };
      }
      if (legacy) localStorage.removeItem(LEGACY_KEY);
    } catch {
      localStorage.removeItem(LEGACY_KEY);
    }
    return null;
  }

  function restore() {
    if (!measurable()) return false;
    const stored = readStoredPosition();
    const bounds = viewportBounds();

    if (stored?.type === 'relative') {
      const x = bounds.minX + stored.rx * Math.max(1, bounds.maxX - bounds.minX);
      const y = bounds.minY + stored.ry * Math.max(1, bounds.maxY - bounds.minY);
      const applied = apply(x, y);
      if (applied) savePosition(clampPosition(x, y).x, clampPosition(x, y).y, bounds);
      return applied;
    }

    if (stored?.type === 'legacy') {
      const migrated = clampPosition(stored.x, stored.y);
      const applied = apply(migrated.x, migrated.y);
      if (applied) savePosition(migrated.x, migrated.y, migrated.bounds);
      return applied;
    }

    // No saved position: measure the real CSS position only after the app shell is visible,
    // then persist the clamped relative position as the canonical baseline.
    const rect = wrap.getBoundingClientRect();
    const initial = clampPosition(rect.left, rect.top);
    const applied = apply(initial.x, initial.y);
    if (applied) savePosition(initial.x, initial.y, initial.bounds);
    return applied;
  }

  function repair() {
    if (!measurable()) return false;
    const rect = wrap.getBoundingClientRect();
    const next = clampPosition(rect.left, rect.top);
    const moved = Math.abs(next.x - rect.left) > 0.5 || Math.abs(next.y - rect.top) > 0.5;
    if (moved) apply(next.x, next.y);
    savePosition(next.x, next.y, next.bounds);
    return true;
  }

  let scheduled = false;
  function scheduleRestore() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      restore();
    });
  }

  let drag = null;
  handle.addEventListener('pointerdown', event => {
    if (!measurable()) return;
    const rect = wrap.getBoundingClientRect();
    drag = { pointerId:event.pointerId, offsetX:event.clientX - rect.left, offsetY:event.clientY - rect.top };
    handle.setPointerCapture(event.pointerId);
    handle.style.cursor = 'grabbing';
    wrap.classList.add('is-dragging');
    event.preventDefault();
    event.stopPropagation();
  });
  handle.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    apply(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  });
  const finish = event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = wrap.getBoundingClientRect();
    const next = clampPosition(rect.left, rect.top);
    apply(next.x, next.y, { save:true });
    drag = null;
    handle.style.cursor = 'grab';
    wrap.classList.remove('is-dragging');
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);

  // The app itself owns page visibility. Whenever 豆藏 becomes visible again, restore
  // from canonical relative coordinates against the current viewport instead of reusing
  // stale absolute left/top values.
  new MutationObserver(() => {
    if (!wrap.classList.contains('hidden')) scheduleRestore();
  }).observe(wrap, { attributes:true, attributeFilter:['class'] });

  document.addEventListener('luckybean:local-app-ready', scheduleRestore);
  document.addEventListener('luckybean:viewport-changed', scheduleRestore);
  globalThis.addEventListener('pageshow', scheduleRestore);
  globalThis.addEventListener('resize', scheduleRestore);
  globalThis.addEventListener('orientationchange', scheduleRestore);
  globalThis.visualViewport?.addEventListener?.('resize', scheduleRestore);
  globalThis.visualViewport?.addEventListener?.('scroll', scheduleRestore);

  // If this module is evaluated after local-app-ready, this performs the same safe check.
  scheduleRestore();

  globalThis.LuckyBeanFabController = Object.freeze({
    repair,
    restore,
    reset:() => {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_KEY);
      wrap.style.removeProperty('left');
      wrap.style.removeProperty('top');
      wrap.style.removeProperty('right');
      wrap.style.removeProperty('bottom');
      wrap.style.removeProperty('transform');
      scheduleRestore();
    },
    snapshot:() => {
      const rect = wrap.getBoundingClientRect();
      const bounds = measurable() ? viewportBounds() : null;
      return {
        owner:wrap.dataset.fabPositionOwner || '',
        visible:!wrap.classList.contains('hidden'),
        measurable:measurable(),
        rect:{ left:rect.left, top:rect.top, right:rect.right, bottom:rect.bottom, width:rect.width, height:rect.height },
        bounds,
        storage:readStoredPosition(),
        legacyPresent:localStorage.getItem(LEGACY_KEY) !== null
      };
    }
  });
}
