const LONG_PRESS_MS = 320;
const MOVE_CANCEL_DISTANCE = 12;
const STEP_TITLES = Object.freeze({
  dry:'干香 / 湿香', high:'高温', mid:'中温', low:'低温', aftertaste:'余韵', acidity:'酸质', sweetness:'甜感', mouthfeel:'口感'
});

if (!globalThis.__LuckyBeanSensoryTagSortLoaded) {
  globalThis.__LuckyBeanSensoryTagSortLoaded = true;

  const orders = new Map();
  let drag = null;

  function ensureStyle() {
    if (document.getElementById('luckybean-sensory-sort-style')) return;
    const style = document.createElement('style');
    style.id = 'luckybean-sensory-sort-style';
    style.textContent = `
      .v120-selected-tag-list.lb-sort-mode { touch-action:none; user-select:none; -webkit-user-select:none; }
      .v120-selected-tag-list.lb-sort-mode .v120-selected-tag { transition:transform .12s ease, opacity .12s ease, box-shadow .12s ease; }
      .v120-selected-tag.lb-sort-dragging { z-index:3; transform:scale(1.06); opacity:.92; box-shadow:0 8px 22px rgba(0,0,0,.26); }
      .v120-selected-tag.lb-sort-target { outline:1px dashed var(--cup-tag-selected-border); outline-offset:3px; }
      .cupping-drag-handle { pointer-events:none; }
      .v095-sort-hint::after { content:' 长按任一已选标签即可进入排序。'; }
      body.lb-sensory-sorting { overscroll-behavior:contain; }
    `;
    document.head.append(style);
  }

  function stepIdFor(list) { return String(list?.dataset?.v120SelectedList || ''); }
  function chips(list) { return [...list.querySelectorAll('[data-v120-selected-tag]')]; }
  function tagsFrom(list) { return chips(list).map(node => String(node.dataset.v120SelectedTag || '')).filter(Boolean); }

  function normalizedOrder(stepId, current) {
    const saved = orders.get(stepId) || [];
    const currentSet = new Set(current);
    return [...saved.filter(tag => currentSet.has(tag)), ...current.filter(tag => !saved.includes(tag))];
  }

  function applyOrder(list) {
    const stepId = stepIdFor(list);
    if (!stepId) return;
    const current = tagsFrom(list);
    if (!current.length) return;
    const order = normalizedOrder(stepId, current);
    orders.set(stepId, order);
    const byTag = new Map(chips(list).map(node => [node.dataset.v120SelectedTag, node]));
    for (const tag of order) if (byTag.get(tag)) list.append(byTag.get(tag));
  }

  function syncLists() {
    document.querySelectorAll('.v120-selected-tag-list[data-v120-selected-list]').forEach(applyOrder);
  }

  function clearVisualState() {
    if (!drag) return;
    drag.list.classList.remove('lb-sort-mode');
    drag.chip.classList.remove('lb-sort-dragging');
    drag.list.querySelectorAll('.lb-sort-target').forEach(node => node.classList.remove('lb-sort-target'));
    document.body.classList.remove('lb-sensory-sorting');
  }

  function cancelPending() {
    if (!drag) return;
    clearTimeout(drag.timer);
    if (!drag.active) drag = null;
  }

  function activateDrag() {
    if (!drag || drag.active) return;
    drag.active = true;
    drag.list.classList.add('lb-sort-mode');
    drag.chip.classList.add('lb-sort-dragging');
    document.body.classList.add('lb-sensory-sorting');
    drag.chip.setPointerCapture?.(drag.id);
    navigator.vibrate?.(10);
  }

  function nearestTarget(list, chip, x, y) {
    const candidates = chips(list).filter(node => node !== chip);
    let best = null;
    let bestDistance = Infinity;
    for (const node of candidates) {
      const rect = node.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const distance = (x - cx) ** 2 + (y - cy) ** 2;
      if (distance < bestDistance) { bestDistance = distance; best = { node, rect, cx, cy }; }
    }
    return best;
  }

  function moveDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > MOVE_CANCEL_DISTANCE) cancelPending();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = nearestTarget(drag.list, drag.chip, event.clientX, event.clientY);
    if (!target) return;
    drag.list.querySelectorAll('.lb-sort-target').forEach(node => node.classList.remove('lb-sort-target'));
    target.node.classList.add('lb-sort-target');
    const sameRow = Math.abs(event.clientY - target.cy) < target.rect.height * .65;
    const before = sameRow ? event.clientX < target.cx : event.clientY < target.cy;
    const anchor = before ? target.node : target.node.nextSibling;
    if (anchor !== drag.chip && anchor !== drag.chip.nextSibling) drag.list.insertBefore(drag.chip, anchor);
  }

  function finishDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    clearTimeout(drag.timer);
    const finished = drag;
    if (finished.active) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const stepId = stepIdFor(finished.list);
      orders.set(stepId, tagsFrom(finished.list));
      finished.chip.dataset.lbSortSuppressClick = '1';
      setTimeout(() => { delete finished.chip.dataset.lbSortSuppressClick; }, 360);
      finished.chip.releasePointerCapture?.(event.pointerId);
    }
    clearVisualState();
    drag = null;
  }

  function beginDrag(event) {
    if (event.button != null && event.button !== 0) return;
    const chip = event.target.closest?.('[data-v120-selected-tag]');
    const list = chip?.closest?.('[data-v120-selected-list]');
    if (!chip || !list) return;
    if (drag) cancelPending();
    applyOrder(list);
    drag = {
      id:event.pointerId, chip, list,
      startX:event.clientX, startY:event.clientY,
      active:false, timer:null
    };
    // Prevent the legacy handle-only pointer state machine from seeing this pointerdown.
    event.stopPropagation();
    drag.timer = setTimeout(activateDrag, LONG_PRESS_MS);
  }

  function reorderCompletion(detail) {
    const selections = detail?.professionalData?.selections;
    if (!selections) return;
    for (const [stepId, current] of Object.entries(selections)) {
      if (!Array.isArray(current)) continue;
      const order = normalizedOrder(stepId, current.map(String));
      selections[stepId] = order;
      const title = STEP_TITLES[stepId];
      if (!title || !Array.isArray(detail.summary)) continue;
      const prefix = `${title}：`;
      const index = detail.summary.findIndex(line => String(line).startsWith(prefix));
      if (index < 0) continue;
      const intensity = detail.professionalData?.intensities?.[stepId];
      detail.summary[index] = `${title}：${order.join('、')}；强度 ${Number(intensity ?? 0).toFixed(1)}`;
    }
  }

  document.addEventListener('pointerdown', beginDrag, true);
  document.addEventListener('pointermove', moveDrag, { capture:true, passive:false });
  document.addEventListener('pointerup', finishDrag, true);
  document.addEventListener('pointercancel', finishDrag, true);
  document.addEventListener('click', event => {
    const chip = event.target.closest?.('[data-v120-selected-tag]');
    if (chip?.dataset.lbSortSuppressClick === '1') {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.target.closest?.('[data-v095-mode="professional"]')) orders.clear();
    if (event.target.closest?.('[data-v095-tag],[data-v095-next],[data-v095-prev]')) queueMicrotask(syncLists);
    if (event.target.closest?.('[data-v095-close],[data-v095-cancel]')) orders.clear();
  }, true);
  document.addEventListener('luckybean:edit-professional-sensory', () => orders.clear(), true);
  document.addEventListener('luckybean:professional-sensory-complete', event => {
    reorderCompletion(event.detail);
    orders.clear();
  }, true);

  ensureStyle();
  globalThis.LuckyBeanSensoryTagSort = { sync:syncLists, orders };
}
