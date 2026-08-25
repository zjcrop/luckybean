// LuckyBean shared sortable interaction engine.
// User-orderable collections use this controller; computed/automatic order must not register here.
const REGISTRY = new WeakMap();
const LONG_PRESS_MS = 360;
const DOUBLE_CLICK_MS = 250;
const MOVE_CANCEL_DISTANCE = 14;
const EDGE_SCROLL_PX = 56;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const raf = callback => requestAnimationFrame(callback);

function itemId(item, options) {
  return String(options.getId?.(item) ?? item.dataset.sortId ?? item.dataset.v120SelectedTag ?? '').trim();
}

function items(container, options) {
  return [...container.querySelectorAll(options.itemSelector)].filter(node => !node.classList.contains('lb-sort-placeholder'));
}

function animateFlip(container, options, beforeRects) {
  for (const item of items(container, options)) {
    const before = beforeRects.get(item);
    if (!before || item.classList.contains('lb-sort-source')) continue;
    const after = item.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5) continue;
    item.animate?.([
      { transform:`translate(${dx}px, ${dy}px)` },
      { transform:'translate(0, 0)' }
    ], { duration:150, easing:'cubic-bezier(.2,.8,.2,1)' });
  }
}

function captureRects(container, options) {
  return new Map(items(container, options).map(item => [item, item.getBoundingClientRect()]));
}

function makePlaceholder(source) {
  const rect = source.getBoundingClientRect();
  const placeholder = document.createElement(source.tagName === 'LI' ? 'li' : 'span');
  placeholder.className = 'lb-sort-placeholder';
  placeholder.setAttribute('aria-hidden', 'true');
  placeholder.style.width = `${rect.width}px`;
  placeholder.style.height = `${rect.height}px`;
  placeholder.style.flex = `0 0 ${rect.width}px`;
  return placeholder;
}

function makeGhost(source, rect, pointerX, pointerY) {
  const ghost = source.cloneNode(true);
  ghost.classList.add('lb-sort-ghost');
  ghost.removeAttribute('id');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    position:'fixed',
    left:'0px', top:'0px',
    width:`${rect.width}px`, height:`${rect.height}px`,
    margin:'0',
    zIndex:'2147483000',
    pointerEvents:'none',
    transform:`translate3d(${rect.left}px,${rect.top}px,0) scale(1.055)`,
    transformOrigin:'center center'
  });
  document.body.append(ghost);
  return {
    node:ghost,
    offsetX:pointerX - rect.left,
    offsetY:pointerY - rect.top,
    x:rect.left,
    y:rect.top,
    nextX:rect.left,
    nextY:rect.top,
    frame:0
  };
}

function updateGhost(state, x, y) {
  state.ghost.nextX = x - state.ghost.offsetX;
  state.ghost.nextY = y - state.ghost.offsetY;
  if (state.ghost.frame) return;
  state.ghost.frame = raf(() => {
    state.ghost.frame = 0;
    state.ghost.x = state.ghost.nextX;
    state.ghost.y = state.ghost.nextY;
    state.ghost.node.style.transform = `translate3d(${state.ghost.x}px,${state.ghost.y}px,0) scale(1.055)`;
  });
}

function insertionTarget(container, options, source, x, y) {
  const entries = items(container, options)
    .filter(item => item !== source && !item.classList.contains('lb-sort-source'))
    .map(node => ({ node, rect:node.getBoundingClientRect() }))
    .filter(entry => entry.rect.width > 0 && entry.rect.height > 0);
  if (!entries.length) return { node:null, before:false };

  // Resolve the nearest visual row first. This prevents placeholder reflow from
  // making a neighbouring chip's centre win purely by Euclidean distance.
  const rowDistance = entry => {
    const { rect } = entry;
    if (y >= rect.top && y <= rect.bottom) return 0;
    return y < rect.top ? rect.top - y : y - rect.bottom;
  };
  const nearestRowDistance = Math.min(...entries.map(rowDistance));
  const rowTolerance = Math.max(8, Math.min(...entries.map(entry => entry.rect.height)) * .45);
  const row = entries
    .filter(entry => rowDistance(entry) <= nearestRowDistance + rowTolerance)
    .sort((left, right) => left.rect.left - right.rect.left || left.rect.top - right.rect.top);

  if (row.length) {
    const first = row[0];
    const last = row[row.length - 1];
    if (x <= first.rect.left) return { node:first.node, before:true };
    if (x >= last.rect.right) return { node:last.node, before:false };

    // Treat chip centres as insertion boundaries. Once the pointer passes the
    // final centre, the source belongs after the final chip, even if reflow has
    // moved that chip closer to the pointer than its predecessor.
    for (const entry of row) {
      const centerX = entry.rect.left + entry.rect.width / 2;
      if (x < centerX) return { node:entry.node, before:true };
    }
    return { node:last.node, before:false };
  }

  const ordered = [...entries].sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left);
  for (const entry of ordered) {
    const centerY = entry.rect.top + entry.rect.height / 2;
    if (y < centerY) return { node:entry.node, before:true };
  }
  return { node:ordered[ordered.length - 1].node, before:false };
}

function movePlaceholder(state, x, y) {
  const { container, options, source, placeholder } = state;
  const target = insertionTarget(container, options, source, x, y);
  if (!target.node) return;
  const desired = target.before ? target.node : target.node.nextSibling;
  if (desired === placeholder || desired === placeholder.nextSibling) return;
  const beforeRects = captureRects(container, options);
  container.insertBefore(placeholder, desired);
  animateFlip(container, options, beforeRects);
  state.previewOrder = previewOrder(state);
  options.onPreview?.(state.previewOrder, { sourceId:state.sourceId });
}

function previewOrder(state) {
  const children = [...state.container.children];
  const result = [];
  for (const child of children) {
    if (child === state.placeholder) result.push(state.sourceId);
    else if (child.matches?.(state.options.itemSelector) && child !== state.source) {
      const id = itemId(child, state.options);
      if (id) result.push(id);
    }
  }
  return result;
}

function maybeAutoScroll(state, clientY) {
  const topDistance = clientY;
  const bottomDistance = innerHeight - clientY;
  let delta = 0;
  if (topDistance < EDGE_SCROLL_PX) delta = -clamp((EDGE_SCROLL_PX - topDistance) / EDGE_SCROLL_PX * 14, 3, 14);
  else if (bottomDistance < EDGE_SCROLL_PX) delta = clamp((EDGE_SCROLL_PX - bottomDistance) / EDGE_SCROLL_PX * 14, 3, 14);
  state.scrollDelta = delta;
  if (state.scrollFrame || !delta) return;
  const tick = () => {
    if (!state.active || !state.scrollDelta) { state.scrollFrame = 0; return; }
    window.scrollBy(0, state.scrollDelta);
    state.scrollFrame = raf(tick);
  };
  state.scrollFrame = raf(tick);
}

function activateDrag(state, eventLike) {
  if (!state || state.active) return;
  state.active = true;
  const rect = state.source.getBoundingClientRect();
  state.placeholder = makePlaceholder(state.source);
  state.source.before(state.placeholder);
  state.source.classList.add('lb-sort-source');
  state.source.style.visibility = 'hidden';
  state.container.classList.add('lb-sort-mode');
  document.body.classList.add('lb-sort-body-active');
  state.ghost = makeGhost(state.source, rect, state.lastX, state.lastY);
  state.previewOrder = previewOrder(state);
  try { state.source.setPointerCapture?.(state.pointerId); } catch {}
  navigator.vibrate?.(18);
  state.options.onSortStart?.(state.sourceId);
  updateGhost(state, state.lastX, state.lastY);
  if (eventLike?.preventDefault) eventLike.preventDefault();
}

function cleanupDrag(state, { restore = false } = {}) {
  if (!state) return;
  clearTimeout(state.timer);
  if (state.ghost?.frame) cancelAnimationFrame(state.ghost.frame);
  if (state.scrollFrame) cancelAnimationFrame(state.scrollFrame);
  state.ghost?.node?.remove();
  state.container.classList.remove('lb-sort-mode');
  document.body.classList.remove('lb-sort-body-active');
  if (state.source) {
    state.source.classList.remove('lb-sort-source');
    state.source.style.visibility = '';
    try {
      if (state.source.hasPointerCapture?.(state.pointerId)) state.source.releasePointerCapture?.(state.pointerId);
    } catch {}
  }
  if (state.placeholder) {
    if (!restore && state.source) state.placeholder.replaceWith(state.source);
    else state.placeholder.remove();
  }
}

function register(container, options = {}) {
  if (!container || REGISTRY.has(container)) return REGISTRY.get(container)?.api || null;
  const normalized = {
    itemSelector:options.itemSelector || '[data-sort-id]',
    getId:options.getId,
    onActivate:options.onActivate,
    onRemove:options.onRemove,
    onPreview:options.onPreview,
    onCommit:options.onCommit,
    onSortStart:options.onSortStart,
    onSortEnd:options.onSortEnd,
    longPressMs:Number(options.longPressMs || LONG_PRESS_MS),
    doubleClickMs:Number(options.doubleClickMs || DOUBLE_CLICK_MS)
  };
  let drag = null;
  let clickTimer = 0;
  let lastClick = { id:'', at:0 };

  const findItem = target => target?.closest?.(normalized.itemSelector)?.closest?.(normalized.itemSelector) || target?.closest?.(normalized.itemSelector);

  const onPointerDown = event => {
    if (event.button != null && event.button !== 0) return;
    const source = findItem(event.target);
    if (!source || !container.contains(source)) return;
    if (event.target.closest?.('input,select,textarea,a,[data-sort-ignore]')) return;
    if (drag) cleanupDrag(drag, { restore:true });
    drag = {
      container, options:normalized, source,
      sourceId:itemId(source, normalized),
      pointerId:event.pointerId,
      startX:event.clientX, startY:event.clientY,
      lastX:event.clientX, lastY:event.clientY,
      active:false, timer:0, placeholder:null, ghost:null,
      previewOrder:null, scrollDelta:0, scrollFrame:0
    };
    const state = drag;
    state.timer = setTimeout(() => {
      if (drag !== state) return;
      activateDrag(state);
    }, normalized.longPressMs);
    // Own the gesture before legacy element handlers can interpret the same press.
    event.stopImmediatePropagation();
  };

  const onPointerMove = event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > MOVE_CANCEL_DISTANCE) {
        clearTimeout(drag.timer);
        drag = null;
      }
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    updateGhost(drag, event.clientX, event.clientY);
    movePlaceholder(drag, event.clientX, event.clientY);
    maybeAutoScroll(drag, event.clientY);
  };

  const finishPointer = (event, cancelled = false) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const finished = drag;
    drag = null;
    clearTimeout(finished.timer);
    if (!finished.active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const order = finished.previewOrder || previewOrder(finished);
    cleanupDrag(finished, { restore:cancelled });
    if (!cancelled) normalized.onCommit?.(order, { sourceId:finished.sourceId });
    normalized.onSortEnd?.(order, { sourceId:finished.sourceId, cancelled });
    finished.source.dataset.lbSortSuppressClick = '1';
    setTimeout(() => { delete finished.source.dataset.lbSortSuppressClick; }, normalized.doubleClickMs + 80);
  };

  const onClick = event => {
    const item = findItem(event.target);
    if (!item || !container.contains(item)) return;
    if (item.dataset.lbSortSuppressClick === '1') {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    const id = itemId(item, normalized);
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const now = performance.now();
    if (lastClick.id === id && now - lastClick.at <= normalized.doubleClickMs) {
      clearTimeout(clickTimer);
      clickTimer = 0;
      lastClick = { id:'', at:0 };
      normalized.onRemove?.(id, item);
      return;
    }
    lastClick = { id, at:now };
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      clickTimer = 0;
      if (lastClick.id === id) {
        lastClick = { id:'', at:0 };
        normalized.onActivate?.(id, item);
      }
    }, normalized.doubleClickMs);
  };

  container.addEventListener('pointerdown', onPointerDown, true);
  container.addEventListener('pointermove', onPointerMove, { capture:true, passive:false });
  container.addEventListener('pointerup', event => finishPointer(event, false), true);
  container.addEventListener('pointercancel', event => finishPointer(event, true), true);
  container.addEventListener('click', onClick, true);

  const api = {
    destroy() {
      clearTimeout(clickTimer);
      if (drag) cleanupDrag(drag, { restore:true });
      drag = null;
      container.removeEventListener('pointerdown', onPointerDown, true);
      container.removeEventListener('pointermove', onPointerMove, true);
      container.removeEventListener('click', onClick, true);
      REGISTRY.delete(container);
    },
    isSorting:() => Boolean(drag?.active)
  };
  REGISTRY.set(container, { api });
  return api;
}

globalThis.LuckyBeanSortable = { register };
export { register };
