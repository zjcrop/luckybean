import { getSetting, setSetting } from '../db.js';

let queued = false;
const $ = (selector, root = document) => root.querySelector(selector);

async function settings() {
  return await getSetting('app.settings', {}) || {};
}

async function saveCooling(which, rawValue) {
  const first = which === 'first';
  const min = first ? 70 : 50;
  const numeric = Math.min(97, Math.max(min, Number(rawValue)));
  if (!Number.isFinite(numeric)) return;
  const current = await settings();
  current.brew ||= {};
  current.brew[first ? 'firstCoolingMode' : 'tailCoolingMode'] = 'custom';
  current.brew[first ? 'firstTemperatureC' : 'tailTemperatureC'] = Math.round(numeric * 2) / 2;
  await setSetting('app.settings', current);
  document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail: { source: 'custom-cooling-editor' } }));
}

async function ensureCoolingEditor(selectId, which) {
  const select = $(`#${selectId}`);
  if (!select) return;
  const field = select.closest('.field') || select.parentElement;
  const existing = field?.querySelector(`[data-lb-cooling-editor="${which}"]`);
  if (select.value !== 'custom') {
    existing?.remove();
    return;
  }
  if (existing) return;
  const current = await settings();
  const first = which === 'first';
  const value = Number(current.brew?.[first ? 'firstTemperatureC' : 'tailTemperatureC'] ?? (first ? 87 : 86));
  const min = first ? 70 : 50;
  const wrap = document.createElement('label');
  wrap.className = 'lb-inline-cooling-editor';
  wrap.dataset.lbCoolingEditor = which;
  wrap.innerHTML = `<small>自定义目标</small><input class="control" type="number" min="${min}" max="97" step="0.5" value="${value}" aria-label="${first ? '首段' : '尾段'}自定义目标温度"><span>°C</span>`;
  const input = wrap.querySelector('input');
  input.addEventListener('change', () => saveCooling(which, input.value));
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    }
  });
  field.appendChild(wrap);
}

function ensureGuestHint() {
  const panel = $('[data-cloud-account-panel]');
  if (!panel || panel.querySelector('[data-cloud-logout]') || panel.querySelector('[data-lb-guest-cloud-hint]')) return;
  const login = panel.querySelector('[data-cloud-login]');
  if (!login) return;
  const hint = document.createElement('p');
  hint.className = 'muted small lb-guest-cloud-hint';
  hint.dataset.lbGuestCloudHint = '1';
  hint.textContent = '当前处于本地使用模式。登录后可使用多设备同步和云端数据保护；不登录不影响本地豆卡、冲煮、品鉴和历史记录。';
  login.closest('.text-actions')?.before(hint);
}

async function reconcile() {
  queued = false;
  await ensureCoolingEditor('firstCoolingMode', 'first');
  await ensureCoolingEditor('tailCoolingMode', 'tail');
  ensureGuestHint();
}

function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => reconcile().catch(error => console.warn('体验修复控制器更新失败', error)));
}

new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
document.addEventListener('luckybean:app-refreshed', queue);
document.addEventListener('luckybean:cloud-auth-state', queue);
queue();
