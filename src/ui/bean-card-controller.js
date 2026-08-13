import { get } from '../db.js';
import { archiveBeans, moveBeansToRecycle } from '../domain/beans/bean-lifecycle-service.js';

const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const LONG_PRESS_MS = 500;
const CANCEL_DISTANCE = 8;
let press = null;
let suppressClickUntil = 0;
let suppressBeanId = '';

function beanName(bean) {
  return String(bean?.name || bean?.entityName || bean?.countryName || '这张豆卡').trim();
}
function notify(message, kind = 'status-good') {
  document.dispatchEvent(new CustomEvent('luckybean:user-notice', { detail:{ message, kind } }));
}
function refresh(source) {
  document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail:{ source } }));
}
function closeActions() {
  const root = $('#overlayRoot');
  if (root?.querySelector('[data-overlay="bean-quick-actions"]')) root.replaceChildren();
}
async function openActions(beanId) {
  const bean = await get('beans', beanId).catch(() => null);
  if (!bean) return;
  const root = $('#overlayRoot');
  if (!root || root.children.length) return;
  root.innerHTML = `<div class="overlay bean-quick-actions-overlay" data-overlay="bean-quick-actions"><div class="dialog bottom-sheet bean-quick-actions"><div class="dialog-header"><div><h2>${beanName(bean)}</h2><p>豆卡快捷管理</p></div><button class="close-button" type="button" data-bean-quick-cancel aria-label="关闭">×</button></div><div class="bean-quick-action-list"><button class="button" type="button" data-bean-quick-archive>${bean.archived ? '移出溯旧' : '移至溯旧'}</button><button class="button danger" type="button" data-bean-quick-delete>删除</button><button class="button subtle" type="button" data-bean-quick-cancel>取消</button></div></div></div>`;
  const overlay = root.firstElementChild;
  overlay.addEventListener('click', async event => {
    if (event.target === overlay || event.target.closest('[data-bean-quick-cancel]')) { closeActions(); return; }
    if (event.target.closest('[data-bean-quick-archive]')) {
      const archived = !Boolean(bean.archived);
      await archiveBeans([bean.id], archived);
      closeActions(); refresh('bean-quick-archive');
      notify(archived ? '已移至溯旧' : '已恢复到豆藏');
      return;
    }
    if (event.target.closest('[data-bean-quick-delete]')) {
      const confirmed = globalThis.confirm(`确认删除“${beanName(bean)}”？\n豆卡将进入回收站保留7天，并同步删除云端记录。`);
      if (!confirmed) return;
      const button = event.target.closest('[data-bean-quick-delete]'); button.disabled = true;
      try {
        await moveBeansToRecycle([bean.id]);
        closeActions(); refresh('bean-quick-delete'); notify('豆卡已删除至回收站，将保留7天');
      } catch (error) {
        button.disabled = false; notify(error?.message || '删除豆卡失败', 'status-bad');
      }
    }
  });
}
function cancelPress() {
  if (!press) return;
  clearTimeout(press.timer);
  press.card?.classList.remove('long-press-pending');
  press = null;
}
function startPress(event, card) {
  if (event.button != null && event.button !== 0) return;
  if (event.target.closest('[data-brew-bean],button,input,select,textarea,a')) return;
  cancelPress();
  const beanId = String(card.dataset.beanId || '');
  if (!beanId) return;
  press = { id:event.pointerId, beanId, card, x:event.clientX, y:event.clientY, activated:false, timer:null };
  card.classList.add('long-press-pending');
  press.timer = setTimeout(() => {
    if (!press || press.id !== event.pointerId) return;
    press.activated = true;
    suppressBeanId = beanId; suppressClickUntil = performance.now() + 900;
    if (navigator.vibrate) navigator.vibrate(18);
    card.classList.remove('long-press-pending');
    openActions(beanId).catch(error => notify(error?.message || '无法打开豆卡快捷菜单', 'status-bad'));
  }, LONG_PRESS_MS);
}

const beanRoot = () => $('#beanGroups');
document.addEventListener('pointerdown', event => {
  const root = beanRoot();
  const card = event.target.closest?.('.bean-card[data-bean-id]');
  if (!root || !card || !root.contains(card)) return;
  startPress(event, card);
}, { capture:true, passive:true });
document.addEventListener('pointermove', event => {
  if (!press || press.id !== event.pointerId || press.activated) return;
  if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > CANCEL_DISTANCE) cancelPress();
}, { capture:true, passive:true });
document.addEventListener('pointerup', event => {
  if (!press || press.id !== event.pointerId) return;
  if (!press.activated) cancelPress(); else { clearTimeout(press.timer); press = null; }
}, { capture:true, passive:true });
document.addEventListener('pointercancel', cancelPress, { capture:true, passive:true });
document.addEventListener('click', event => {
  if (performance.now() > suppressClickUntil) return;
  const card = event.target.closest?.('.bean-card[data-bean-id]');
  if (!card || String(card.dataset.beanId || '') !== suppressBeanId) return;
  event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
  suppressClickUntil = 0; suppressBeanId = '';
}, true);

globalThis.LuckyBeanBeanCards = { openActions, closeActions, longPressMs:LONG_PRESS_MS };
