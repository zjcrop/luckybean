import { all } from '../db.js';
import { loadCodebook, makeIndex, displayName } from '../codebook.js';
import { moveBeansToRecycle, restoreBeansFromRecycle } from '../domain/beans/bean-lifecycle-service.js';
import { beanFreshnessStage, queryBeansForSelection } from '../domain/beans/bean-selection-query.js';

const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const $$ = (selector, root = document) => [...(root?.querySelectorAll?.(selector) || [])];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
let codebookPromise;
let managerOpen = false;
let selected = new Set();

function notify(message, kind = 'status-good') {
  document.dispatchEvent(new CustomEvent('luckybean:user-notice', { detail:{ message, kind } }));
}
function refresh(source) {
  document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail:{ source } }));
}
async function codebookIndex() {
  if (!codebookPromise) codebookPromise = loadCodebook().then(result => makeIndex(result.data));
  return codebookPromise;
}
function codeLabel(index, table, code, fallback = '') {
  return code ? displayName(index, table, code, fallback || code) : fallback;
}
function beanFacts(bean, index) {
  return {
    country: codeLabel(index, 'countries', bean.countryCode, bean.countryName || bean.country || bean.countryCode || '未记录国家'),
    origin: codeLabel(index, 'regions', bean.regionCode, bean.regionName || bean.region || bean.entityName || bean.entity || bean.processingStation || bean.regionCode || bean.entityCode || '未记录产地')
  };
}
function beanName(bean, index) {
  const facts = beanFacts(bean, index);
  return String(bean.name || bean.productName || bean.entityName || `${facts.country} · ${bean.varietyName || bean.variety || bean.varietyCode || '咖啡'}`).trim();
}
function freshnessLabel(bean) {
  return ({ resting:'养豆中', peak:'味正盛', late:'味将尽' })[beanFreshnessStage(bean)] || '未定';
}
function uniqueOptions(rows, resolver) {
  return [...new Set(rows.map(resolver).map(value => String(value || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'zh-CN'));
}
function closeManager() {
  const root = $('#overlayRoot');
  if (root?.querySelector('[data-overlay="p2-batch-manager"]')) root.replaceChildren();
  managerOpen = false; selected.clear();
}
function filterCriteria(root) {
  return {
    addedFrom: $('[data-filter-added-from]', root)?.value || '',
    addedTo: $('[data-filter-added-to]', root)?.value || '',
    roastFrom: $('[data-filter-roast-from]', root)?.value || '',
    roastTo: $('[data-filter-roast-to]', root)?.value || '',
    remainingMin: $('[data-filter-remaining-min]', root)?.value || '',
    remainingMax: $('[data-filter-remaining-max]', root)?.value || '',
    country: $('[data-filter-country]', root)?.value || '',
    origin: $('[data-filter-origin]', root)?.value || '',
    freshnessStage: $('[data-filter-freshness]', root)?.value || ''
  };
}
function optionHtml(values, selectedValue = '') {
  return values.map(value => `<option value="${esc(value)}"${value === selectedValue ? ' selected' : ''}>${esc(value)}</option>`).join('');
}
function filterPanel(rows, index, criteria = {}) {
  const countries = uniqueOptions(rows, bean => beanFacts(bean, index).country);
  const origins = uniqueOptions(rows, bean => beanFacts(bean, index).origin);
  return `<section class="panel p2-batch-filters"><div class="panel-title"><div><h3>筛选</h3><p>筛选仅改变当前可选范围，不直接修改数据</p></div></div>
    <div class="form-grid compact-form-grid">
      <label>添加时间 从<input type="date" data-filter-added-from value="${esc(criteria.addedFrom || '')}"></label>
      <label>添加时间 至<input type="date" data-filter-added-to value="${esc(criteria.addedTo || '')}"></label>
      <label>烘焙时间 从<input type="date" data-filter-roast-from value="${esc(criteria.roastFrom || '')}"></label>
      <label>烘焙时间 至<input type="date" data-filter-roast-to value="${esc(criteria.roastTo || '')}"></label>
      <label>剩余量下限<input type="number" min="0" step="1" inputmode="decimal" data-filter-remaining-min value="${esc(criteria.remainingMin || '')}" placeholder="g"></label>
      <label>剩余量上限<input type="number" min="0" step="1" inputmode="decimal" data-filter-remaining-max value="${esc(criteria.remainingMax || '')}" placeholder="g"></label>
      <label>国家<select data-filter-country><option value="">全部</option>${optionHtml(countries, criteria.country)}</select></label>
      <label>产地<select data-filter-origin><option value="">全部</option>${optionHtml(origins, criteria.origin)}</select></label>
      <label>赏味期阶段<select data-filter-freshness><option value="">全部</option><option value="resting"${criteria.freshnessStage === 'resting' ? ' selected' : ''}>养豆中</option><option value="peak"${criteria.freshnessStage === 'peak' ? ' selected' : ''}>味正盛</option><option value="late"${criteria.freshnessStage === 'late' ? ' selected' : ''}>味将尽</option></select></label>
    </div><div class="row end"><button class="button subtle" type="button" data-clear-batch-filters>清除筛选</button></div></section>`;
}
function rowHtml(bean, index) {
  const facts = beanFacts(bean, index);
  return `<label class="batch-bean-row"><input type="checkbox" data-p2-batch-bean="${esc(bean.id)}"${selected.has(String(bean.id)) ? ' checked' : ''}><span><strong>${esc(beanName(bean, index))}</strong><small>${esc(facts.country)} · ${esc(facts.origin)} · ${Number(bean.remainingWeight || 0).toFixed(1)}g · ${esc(freshnessLabel(bean))}</small></span></label>`;
}
function recycleRowHtml(item, index) {
  const bean = item.payload || {};
  return `<label class="batch-bean-row"><input type="checkbox" data-p2-batch-recycle="${esc(item.id)}"${selected.has(String(item.id)) ? ' checked' : ''}><span><strong>${esc(beanName(bean, index))}</strong><small>${Number(bean.remainingWeight || 0).toFixed(1)}g · 删除于 ${esc(String(item.recycledAt || '').slice(0,10))}</small></span></label>`;
}
async function openManager({ recycle = false, criteria = {} } = {}) {
  const root = $('#overlayRoot');
  if (!root) return;
  managerOpen = true;
  const index = await codebookIndex();
  const [beans, recycleRows] = await Promise.all([all('beans'), all('recycleBin').catch(() => [])]);
  const active = beans.filter(bean => !bean.archived);
  const visible = recycle ? recycleRows.filter(item => item.entity === 'beans' && item.payload) : queryBeansForSelection(active, criteria, bean => beanFacts(bean, index));
  const validIds = new Set((recycle ? recycleRows.map(item => item.id) : active.map(bean => bean.id)).map(String));
  selected = new Set([...selected].filter(id => validIds.has(String(id))));
  root.innerHTML = `<div class="overlay full" data-overlay="p2-batch-manager"><div class="dialog"><div class="dialog-header centered"><div><h2>批量管理</h2><p>${recycle ? '回收站记录保留7天；恢复是撤销删除的唯一入口' : '删除立即在本地生效，云端同步在后台收敛'}</p></div><button class="close-button" type="button" data-p2-batch-close aria-label="关闭">×</button></div>
    <div class="batch-tabs"><button class="button${recycle ? '' : ' primary'}" type="button" data-p2-batch-tab="active">豆卡</button><button class="button${recycle ? ' primary' : ''}" type="button" data-p2-batch-tab="recycle">回收站</button></div>
    ${recycle ? '' : filterPanel(active, index, criteria)}
    <div class="batch-select-toolbar"><button class="button subtle" type="button" data-p2-select-visible>全选当前结果</button><span data-p2-batch-count>已选 ${selected.size} 项 · 当前 ${visible.length} 项</span></div>
    <div class="batch-bean-list">${visible.length ? visible.map(item => recycle ? recycleRowHtml(item, index) : rowHtml(item, index)).join('') : '<p class="empty-state">当前筛选没有记录</p>'}</div>
    <div class="row end"><button class="button subtle" type="button" data-p2-batch-close>返回</button>${recycle ? '<button class="button primary" type="button" data-p2-restore-selected>恢复所选</button>' : '<button class="button danger" type="button" data-p2-delete-selected>删除所选</button>'}</div></div></div>`;
  bindManager(root, { recycle, active, visible, index });
}
function updateCount(root, visibleCount) {
  const count = $('[data-p2-batch-count]', root);
  if (count) count.textContent = `已选 ${selected.size} 项 · 当前 ${visibleCount} 项`;
  const action = $('[data-p2-delete-selected],[data-p2-restore-selected]', root);
  if (action) action.disabled = selected.size === 0;
}
function bindManager(root, context) {
  const { recycle, visible } = context;
  $$('[data-p2-batch-close]', root).forEach(button => button.addEventListener('click', closeManager));
  $$('[data-p2-batch-tab]', root).forEach(button => button.addEventListener('click', () => { selected.clear(); openManager({ recycle:button.dataset.p2BatchTab === 'recycle' }).catch(handleError); }));
  $$('[data-p2-batch-bean],[data-p2-batch-recycle]', root).forEach(input => input.addEventListener('change', () => {
    const id = String(input.dataset.p2BatchBean || input.dataset.p2BatchRecycle || '');
    if (input.checked) selected.add(id); else selected.delete(id);
    updateCount(root, visible.length);
  }));
  $('[data-p2-select-visible]', root)?.addEventListener('click', () => {
    const ids = recycle ? visible.map(item => String(item.id)) : visible.map(bean => String(bean.id));
    ids.forEach(id => selected.add(id));
    $$('[data-p2-batch-bean],[data-p2-batch-recycle]', root).forEach(input => { input.checked = true; });
    updateCount(root, visible.length);
  });
  if (!recycle) {
    const rerender = () => openManager({ recycle:false, criteria:filterCriteria(root) }).catch(handleError);
    $$('[data-filter-added-from],[data-filter-added-to],[data-filter-roast-from],[data-filter-roast-to],[data-filter-remaining-min],[data-filter-remaining-max],[data-filter-country],[data-filter-origin],[data-filter-freshness]', root).forEach(control => control.addEventListener('change', rerender));
    $('[data-clear-batch-filters]', root)?.addEventListener('click', () => { selected.clear(); openManager({ recycle:false }).catch(handleError); });
    $('[data-p2-delete-selected]', root)?.addEventListener('click', async event => {
      const ids = [...selected]; if (!ids.length) return;
      if (!globalThis.confirm(`确认删除所选 ${ids.length} 张豆卡？\n豆卡将进入回收站保留7天；不会因云端旧数据自动恢复。`)) return;
      event.currentTarget.disabled = true;
      try {
        const count = await moveBeansToRecycle(ids);
        selected.clear(); refresh('p2-batch-delete'); notify(`已删除 ${count} 张豆卡`);
        await openManager({ recycle:false, criteria:filterCriteria(root) });
      } catch (error) { handleError(error); event.currentTarget.disabled = false; }
    });
  } else {
    $('[data-p2-restore-selected]', root)?.addEventListener('click', async event => {
      const ids = [...selected]; if (!ids.length) return;
      event.currentTarget.disabled = true;
      try {
        const count = await restoreBeansFromRecycle(ids);
        selected.clear(); refresh('p2-batch-restore'); notify(`已恢复 ${count} 张豆卡`);
        await openManager({ recycle:true });
      } catch (error) { handleError(error); event.currentTarget.disabled = false; }
    });
  }
  updateCount(root, visible.length);
}
function handleError(error) { notify(error?.message || '批量管理操作失败', 'status-bad'); }

// Capture the legacy batch entry before app.js opens its parallel manager. This leaves
// export/import menu actions untouched while making every batch delete/restore use the
// canonical BeanLifecycleService.
document.addEventListener('click', event => {
  const batch = event.target.closest?.('[data-manage-action="batch"]');
  if (!batch) return;
  event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
  document.querySelectorAll('.popup-menu,.recommend-menu').forEach(node => node.remove());
  selected.clear();
  openManager().catch(handleError);
}, true);

globalThis.LuckyBeanBatchManager = { open:openManager, close:closeManager, get open(){ return managerOpen; } };
