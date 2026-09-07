import { all, getSetting } from '../db.js';
import { loadCodebook, makeIndex, displayName } from '../codebook.js';
import { freshnessProfile } from '../utils.js';
import { moveBeansToRecycle } from '../domain/beans/bean-lifecycle-service.js';

const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const LONG_PRESS_MS = 550;
const CANCEL_DISTANCE = 9;
const ROAST_LABELS = Object.freeze({ 'RL-L0':'极浅烘', 'RL-L1':'浅烘', 'RL-L2':'浅中烘', 'RL-L3':'中烘', 'RL-L4':'中深烘', 'RL-L5':'深烘', 'RL-L6':'极深烘' });
let press = null;
let suppressUntil = 0;
let codebookPromise;

function notify(message, kind = 'status-good') {
  document.dispatchEvent(new CustomEvent('luckybean:user-notice', { detail:{ message, kind } }));
}
function refresh(source) {
  document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail:{ source } }));
}
async function index() {
  if (!codebookPromise) codebookPromise = loadCodebook().then(result => makeIndex(result.data));
  return codebookPromise;
}
function codeLabel(book, table, code, fallback) {
  return code ? displayName(book, table, code, fallback) : fallback;
}
function nativeGroupKey(bean, method, book) {
  if (method === 'variety') return codeLabel(book, 'varieties', bean.varietyCode, '未记录豆种');
  if (method === 'roast') return ROAST_LABELS[bean.roastCode] || '未记录烘焙度';
  if (method === 'process') return codeLabel(book, 'processes', bean.processCode, '未记录处理法');
  return codeLabel(book, 'countries', bean.countryCode, '未记录国家');
}
function freshnessKey(bean) {
  const ratio = Math.max(0, Math.min(1, Number(freshnessProfile(bean)?.progress || 0)));
  if (ratio < 1 / 3) return '养豆中';
  if (ratio < 2 / 3) return '味正盛';
  return '味将尽';
}
async function resolveGroup(button) {
  const beans = (await all('beans')).filter(bean => !bean.archived && Number(bean.remainingWeight) > 0);
  if (button.dataset.openGroup != null) {
    const settings = await getSetting('app.settings', {});
    const method = String(settings?.groupMethod || 'country');
    const book = await index();
    const key = String(button.dataset.openGroup || '');
    return { label:key, ids:beans.filter(bean => nativeGroupKey(bean, method, book) === key).map(bean => bean.id) };
  }
  const key = String(button.dataset.v099tOpenGroup || '');
  const mode = await getSetting('v099i.group.mode', 'native');
  if (mode === 'freshness-ratio') return { label:key, ids:beans.filter(bean => freshnessKey(bean) === key).map(bean => bean.id) };
  if (mode === 'remaining-50') return { label:button.textContent?.trim().split(/\d+只/)[0]?.trim() || key, ids:beans.filter(bean => String(Math.floor(Math.max(0, Number(bean.remainingWeight || 0)) / 50) * 50) === key).map(bean => bean.id) };
  return { label:key, ids:[] };
}
function closeActions() {
  const root = $('#overlayRoot');
  if (root?.querySelector('[data-overlay="bean-group-actions"]')) root.replaceChildren();
}
async function openActions(button) {
  const group = await resolveGroup(button);
  if (!group.ids.length) { notify('该分组没有可删除豆卡', 'status-bad'); return; }
  const root = $('#overlayRoot');
  if (!root || root.children.length) return;
  root.innerHTML = `<div class="overlay bean-quick-actions-overlay" data-overlay="bean-group-actions"><div class="dialog bottom-sheet bean-quick-actions"><div class="dialog-header"><div><h2>${String(group.label || '当前分组').replace(/[&<>"']/g, '')}</h2><p>${group.ids.length} 张豆卡</p></div><button class="close-button" type="button" data-group-action-cancel aria-label="关闭">×</button></div><div class="bean-quick-action-list"><button class="button danger" type="button" data-delete-bean-group>删除整组</button><button class="button subtle" type="button" data-group-action-cancel>取消</button></div></div></div>`;
  const overlay = root.firstElementChild;
  overlay.addEventListener('click', async event => {
    if (event.target === overlay || event.target.closest('[data-group-action-cancel]')) { closeActions(); return; }
    const remove = event.target.closest('[data-delete-bean-group]');
    if (!remove) return;
    if (!globalThis.confirm(`确认删除“${group.label}”分组中的 ${group.ids.length} 张豆卡？\n所有豆卡将进入回收站保留7天。`)) return;
    remove.disabled = true;
    try {
      const count = await moveBeansToRecycle(group.ids);
      closeActions(); refresh('p2-group-delete'); notify(`已删除该组 ${count} 张豆卡`);
    } catch (error) { remove.disabled = false; notify(error?.message || '整组删除失败', 'status-bad'); }
  });
}
function groupButton(target) {
  return target?.closest?.('.group-card[data-open-group],.group-card[data-v099t-open-group]') || null;
}
function cancelPress() {
  if (!press) return;
  clearTimeout(press.timer); press.button?.classList.remove('long-press-pending'); press = null;
}
document.addEventListener('pointerdown', event => {
  const button = groupButton(event.target);
  if (!button || (event.button != null && event.button !== 0)) return;
  cancelPress();
  press = { pointerId:event.pointerId, button, x:event.clientX, y:event.clientY, activated:false, timer:null };
  button.classList.add('long-press-pending');
  press.timer = setTimeout(() => {
    if (!press || press.pointerId !== event.pointerId) return;
    press.activated = true; suppressUntil = performance.now() + 900;
    button.classList.remove('long-press-pending');
    if (navigator.vibrate) navigator.vibrate(18);
    openActions(button).catch(error => notify(error?.message || '分组操作打开失败', 'status-bad'));
  }, LONG_PRESS_MS);
}, { capture:true, passive:true });
document.addEventListener('pointermove', event => {
  if (!press || press.pointerId !== event.pointerId || press.activated) return;
  if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > CANCEL_DISTANCE) cancelPress();
}, { capture:true, passive:true });
document.addEventListener('pointerup', event => {
  if (!press || press.pointerId !== event.pointerId) return;
  if (!press.activated) cancelPress(); else { clearTimeout(press.timer); press = null; }
}, { capture:true, passive:true });
document.addEventListener('pointercancel', cancelPress, { capture:true, passive:true });
document.addEventListener('click', event => {
  if (performance.now() > suppressUntil || !groupButton(event.target)) return;
  event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); suppressUntil = 0;
}, true);

globalThis.LuckyBeanBeanGroupActions = { open:openActions, close:closeActions, longPressMs:LONG_PRESS_MS };
