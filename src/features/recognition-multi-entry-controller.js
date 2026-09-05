import { splitRecognitionEntries, MULTI_ENTRY_SCHEMA } from '../domain/recognition/recognition-entry-splitter.js';

const queue = {
  active:false, documents:[], index:0, method:'none', options:{}, originalAccept:null,
  pendingAdvance:'', advancing:false, completed:0, skipped:0
};

function overlayRoot() { return document.querySelector('#overlayRoot'); }
function dispatch(name, detail = {}) { document.dispatchEvent(new CustomEvent(name, { detail })); }
function snapshot() {
  return { active:queue.active, index:queue.index, total:queue.documents.length, current:queue.active ? queue.index + 1 : 0, method:queue.method, completed:queue.completed, skipped:queue.skipped, schemaVersion:MULTI_ENTRY_SCHEMA };
}
function decorate() {
  if (!queue.active) return;
  const dialog = overlayRoot()?.querySelector('.dialog');
  if (!dialog || dialog.querySelector('[data-multi-entry-progress]')) return;
  const banner = document.createElement('div');
  banner.dataset.multiEntryProgress = 'true';
  banner.setAttribute('role', 'status');
  banner.style.cssText = 'margin:0 0 12px;padding:9px 12px;border:1px solid rgba(127,127,127,.25);border-radius:10px;font-size:13px;line-height:1.5';
  banner.textContent = `多豆识别 · 第 ${queue.index + 1}/${queue.documents.length} 条 · 每条独立确认后依次建立豆卡`;
  dialog.prepend(banner);
}
function clearQueue(reason = 'completed') {
  const detail = { ...snapshot(), reason };
  queue.active=false; queue.documents=[]; queue.index=0; queue.method='none'; queue.options={}; queue.pendingAdvance=''; queue.advancing=false;
  dispatch('luckybean:recognition-multi-entry-complete', detail);
}
async function openCurrent() {
  if (!queue.active || queue.advancing) return;
  if (queue.index >= queue.documents.length) { clearQueue('completed'); return; }
  queue.advancing = true; queue.pendingAdvance = '';
  const document = queue.documents[queue.index];
  try {
    await queue.originalAccept(document, queue.options);
    decorate();
    dispatch('luckybean:recognition-multi-entry-current', snapshot());
  } catch (error) {
    queue.pendingAdvance = '';
    dispatch('luckybean:recognition-multi-entry-error', { ...snapshot(), message:error?.message || String(error) });
    throw error;
  } finally { queue.advancing = false; }
}
function advance(reason) {
  if (!queue.active || queue.advancing) return;
  if (reason === 'skip') queue.skipped += 1; else queue.completed += 1;
  queue.index += 1; queue.pendingAdvance = '';
  if (queue.index >= queue.documents.length) { clearQueue('completed'); return; }
  globalThis.setTimeout(() => { void openCurrent(); }, 0);
}
function maybeAdvanceAfterOverlayChange() {
  if (!queue.active) return;
  decorate();
  if (!queue.pendingAdvance) return;
  const root = overlayRoot();
  if (root && root.children.length) return;
  advance(queue.pendingAdvance);
}
function installFlowWrapper() {
  const flow = globalThis.LuckyBeanRecognitionFlow;
  if (!flow || typeof flow.acceptDocument !== 'function' || flow.__multiEntryWrapped) return false;
  const originalAccept = flow.acceptDocument.bind(flow);
  flow.acceptDocument = async (recognitionDocument, options = {}) => {
    if (queue.active) return originalAccept(recognitionDocument, options);
    const split = splitRecognitionEntries(recognitionDocument);
    if (!split.split || split.documents.length < 2) return originalAccept(recognitionDocument, options);
    queue.active=true; queue.documents=split.documents; queue.index=0; queue.method=split.method; queue.options={ ...options };
    queue.originalAccept=originalAccept; queue.completed=0; queue.skipped=0; queue.pendingAdvance=''; queue.advancing=false;
    dispatch('luckybean:recognition-multi-entry-start', snapshot());
    await openCurrent();
    return { multiEntry:true, count:split.documents.length, method:split.method, schemaVersion:MULTI_ENTRY_SCHEMA };
  };
  Object.defineProperty(flow, '__multiEntryWrapped', { value:true, enumerable:false });
  return true;
}

document.addEventListener('submit', event => {
  if (!queue.active || event.target?.id !== 'beanForm') return;
  queue.pendingAdvance = 'save';
}, true);

document.addEventListener('click', event => {
  if (!queue.active) return;
  const target = event.target?.closest?.('[data-close-overlay]');
  if (!target) return;
  const overlay = target.closest('[data-overlay]');
  if (!overlay) return;
  if (['bean-form','text-recognition','recognition-date-review'].includes(String(overlay.dataset.overlay || ''))) queue.pendingAdvance = 'skip';
}, true);

const observer = new MutationObserver(maybeAdvanceAfterOverlayChange);
if (overlayRoot()) observer.observe(overlayRoot(), { childList:true, subtree:true });
if (!installFlowWrapper()) {
  let attempts = 0;
  const timer = globalThis.setInterval(() => {
    attempts += 1;
    if (installFlowWrapper() || attempts >= 80) globalThis.clearInterval(timer);
  }, 100);
}

globalThis.LuckyBeanMultiEntryRecognition = Object.freeze({
  schemaVersion:MULTI_ENTRY_SCHEMA,
  state:snapshot,
  split:splitRecognitionEntries,
  cancel() { if (queue.active) clearQueue('cancelled'); }
});
