// Sensory adapter for the shared LuckyBean sortable interaction engine.
// The shared controller owns pointer/click gestures; this adapter only maps sensory state to it.
const STEP_TITLES = Object.freeze({
  dry:'干香 / 湿香', high:'高温', mid:'中温', low:'低温', aftertaste:'余韵', acidity:'酸质', sweetness:'甜感', mouthfeel:'口感'
});

if (!globalThis.__LuckyBeanSensoryTagSortLoaded) {
  globalThis.__LuckyBeanSensoryTagSortLoaded = true;

  const orders = new Map();
  const bound = new WeakSet();
  let syncQueued = false;

  const escSelector = value => globalThis.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&');
  const stepIdFor = list => String(list?.dataset?.v120SelectedList || '');
  const chips = list => [...list.querySelectorAll('[data-v120-selected-tag]')];
  const tagsFrom = list => chips(list).map(node => String(node.dataset.v120SelectedTag || '')).filter(Boolean);

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

  function updateHint(list) {
    const hint = list.previousElementSibling?.matches?.('.v095-sort-hint') ? list.previousElementSibling : list.parentElement?.querySelector?.('.v095-sort-hint');
    if (hint) hint.textContent = '单击激活标签；双击移除；长按任一已选标签进入排序。拖动时会实时预览松手后的顺序。';
  }

  function activateTag(list, id, item) {
    chips(list).forEach(chip => chip.classList.toggle('lb-sort-active', chip === item));
    item.setAttribute('aria-current', 'true');
    for (const chip of chips(list)) if (chip !== item) chip.removeAttribute('aria-current');
  }

  function removeTag(list, id, item) {
    const overlay = list.closest('#v095ProfessionalOverlay') || document;
    const pool = overlay.querySelector(`[data-v095-tag="${escSelector(id)}"]`);
    if (pool) {
      // Let the canonical sensory controller mutate wizard.selections and rerender.
      pool.click();
      return;
    }
    item.remove();
    const stepId = stepIdFor(list);
    orders.set(stepId, tagsFrom(list));
  }

  function bindList(list) {
    if (!list || bound.has(list)) return;
    const sorter = globalThis.LuckyBeanSortable;
    if (!sorter?.register) return;
    updateHint(list);
    applyOrder(list);
    sorter.register(list, {
      itemSelector:'[data-v120-selected-tag]',
      getId:item => item.dataset.v120SelectedTag,
      longPressMs:360,
      doubleClickMs:250,
      onActivate:(id, item) => activateTag(list, id, item),
      onRemove:(id, item) => removeTag(list, id, item),
      onPreview:order => {
        list.dataset.lbSortPreview = order.join('|');
      },
      onSortStart:() => {
        list.dataset.lbSortState = 'sorting';
      },
      onCommit:order => {
        orders.set(stepIdFor(list), [...order]);
        list.dataset.lbSortCommitted = order.join('|');
      },
      onSortEnd:() => {
        delete list.dataset.lbSortState;
        delete list.dataset.lbSortPreview;
      }
    });
    bound.add(list);
  }

  function syncLists() {
    syncQueued = false;
    document.querySelectorAll('.v120-selected-tag-list[data-v120-selected-list]').forEach(list => {
      updateHint(list);
      applyOrder(list);
      bindList(list);
    });
  }

  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    queueMicrotask(syncLists);
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

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('.v120-selected-tag-list[data-v120-selected-list]') || node.querySelector?.('.v120-selected-tag-list[data-v120-selected-list]')) {
          queueSync();
          return;
        }
      }
    }
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });

  document.addEventListener('luckybean:sensory-rendered', queueSync);
  document.addEventListener('luckybean:edit-professional-sensory', () => { orders.clear(); queueSync(); }, true);
  document.addEventListener('click', event => {
    if (event.target.closest?.('[data-v095-mode="professional"]')) { orders.clear(); queueSync(); }
    if (event.target.closest?.('[data-v095-tag],[data-v095-next],[data-v095-prev]')) queueSync();
    if (event.target.closest?.('[data-v095-close],[data-v095-cancel]')) orders.clear();
  }, true);
  document.addEventListener('luckybean:professional-sensory-complete', event => {
    reorderCompletion(event.detail);
    orders.clear();
  }, true);

  queueSync();
  globalThis.LuckyBeanSensoryTagSort = { sync:queueSync, orders };
}
