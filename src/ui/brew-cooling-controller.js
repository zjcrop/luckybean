import { getSetting, setSetting } from '../db.js';

const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
const $$ = (selector, root = document) => root?.querySelectorAll ? [...root.querySelectorAll(selector)] : [];
let queued = false;

async function settings() { return await getSetting('app.settings', {}) || {}; }
async function saveCooling(which, rawValue) {
  const first = which === 'first';
  const min = first ? 70 : 50;
  const numeric = Math.min(100, Math.max(min, Number(rawValue)));
  if (!Number.isFinite(numeric)) return;
  const current = await settings();
  current.brew ||= {};
  current.brew[first ? 'firstCoolingMode' : 'tailCoolingMode'] = 'custom';
  current.brew[first ? 'firstTemperatureC' : 'tailTemperatureC'] = Math.round(numeric * 2) / 2;
  await setSetting('app.settings', current);
  document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail:{ source:'custom-cooling-editor' } }));
}
function ensureCoolingEditor(selectId, which, current) {
  const select = $(`#${selectId}`);
  if (!select) return;
  const field = select.closest('.field') || select.parentElement;
  if (!field) return;
  const selector = `[data-lb-cooling-editor="${which}"]`;
  const editors = $$(selector, field);
  if (select.value !== 'custom') { editors.forEach(editor => editor.remove()); return; }
  editors.slice(1).forEach(editor => editor.remove());
  const first = which === 'first';
  const value = Number(current.brew?.[first ? 'firstTemperatureC' : 'tailTemperatureC'] ?? (first ? 87 : 86));
  const min = first ? 70 : 50;
  let wrap = editors[0] || null;
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'lb-inline-cooling-editor'; wrap.dataset.lbCoolingEditor = which;
    wrap.innerHTML = `<small>自定义目标</small><input class="control" type="number" min="${min}" max="100" step="0.5" value="${value}" aria-label="${first ? '首段' : '尾段'}自定义目标温度"><span>°C</span>`;
    const input = $('input', wrap);
    input.addEventListener('change', () => saveCooling(which, input.value));
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); input.blur(); } });
    field.append(wrap);
    return;
  }
  const input = $('input', wrap);
  if (input && document.activeElement !== input && Number(input.value) !== value) input.value = String(value);
}
async function render() {
  queued = false;
  const current = await settings();
  ensureCoolingEditor('firstCoolingMode', 'first', current);
  ensureCoolingEditor('tailCoolingMode', 'tail', current);
}
function queue() { if (queued) return; queued = true; requestAnimationFrame(() => render().catch(error => { queued = false; console.warn('降温自定义编辑器更新失败', error); })); }
document.addEventListener('luckybean:app-refreshed', queue);
document.addEventListener('luckybean:brew-rendered', queue);
document.addEventListener('luckybean:local-app-ready', queue, { once:true });
document.addEventListener('change', event => { if (event.target?.matches?.('#firstCoolingMode,#tailCoolingMode')) queue(); });
queue();

globalThis.LuckyBeanBrewCooling = { refresh:queue };
