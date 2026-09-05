import { preparePackageImage } from './image-quality.js';
import { getRecognitionCapabilities, recognizeCoffeeBag, RecognitionUnavailableError } from './recognition-bridge.js';
import { loadCodebook } from './codebook.js';
import { createRecognitionDocument, recognitionDocumentFromText } from './domain/recognition/recognition-document.js';
import { analyzeRecognitionDocument } from './domain/recognition/recognition-pipeline.js';
import { enrichRecognitionWithAi } from './services/recognition-ai-service.js';

const MAX_IMAGES = 4;
const ROLE_OPTIONS = [
  ['front', '正面主体'],
  ['back', '背面参数'],
  ['side', '侧面补充'],
  ['date', '日期标签']
];

const captureState = {
  images: [], busy: false, ocrText: '', ocrEngine: '', blocks: [], recognitionDocument: null, analysis: null,
  aiStatus: 'idle', aiDetail: ''
};
let recognitionQueued = false;
let operationGeneration = 0;

function esc(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function roleLabel(role) { return ROLE_OPTIONS.find(([value]) => value === role)?.[1] || '豆袋照片'; }
function nextRole() {
  const used = new Set(captureState.images.map(image => image.role));
  return ROLE_OPTIONS.find(([role]) => !used.has(role))?.[0] || 'side';
}
function qualityLabel(image) {
  if (image.status === 'good') return '质量良好';
  if (image.status === 'usable') return image.nativeSource ? 'Android 原图可读' : '可用，建议补拍';
  return '建议重拍';
}
function statusMessage() {
  if (!captureState.images.length) return '先拍摄包装正面。系统会检查清晰度、反光和曝光。';
  const roles = new Set(captureState.images.map(image => image.role));
  if (!roles.has('back')) return '正面已加入。建议补拍背面参数或烘焙标签。';
  if (!roles.has('date')) return '如烘焙日期不清楚，可单独拍摄日期标签。';
  return '已具备多视角照片，可以开始识别；低质量照片仍建议重拍。';
}
function root() { return document.querySelector('#overlayRoot'); }
function releasePreview(image) {
  const url = String(image?.previewUrl || '');
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  if (image && !image.nativeSource) { image.previewUrl = ''; image.previewAvailable = false; image.previewReleased = true; }
}
function releaseWebPreviewsForRecognition() {
  for (const image of captureState.images) if (!image.nativeSource) releasePreview(image);
}
function disposeBrowserOcr() {
  try { void globalThis.LuckyBeanPaddleOCR?.dispose?.(); } catch {}
}
function bindAndroidImageSource(imageId, includePreview) {
  if (!globalThis.__LUCKYBEAN_ANDROID__) return '';
  const native = globalThis.LuckyBeanNative;
  if (typeof native?.bindImageSource !== 'function') return '';
  try { return String(native.bindImageSource(String(imageId || ''), Boolean(includePreview)) || ''); } catch { return ''; }
}
function clearCapture({ keepOverlay = false } = {}) {
  operationGeneration += 1;
  for (const image of captureState.images) releasePreview(image);
  captureState.images = []; captureState.busy = false; captureState.ocrText = ''; captureState.ocrEngine = ''; captureState.blocks = [];
  captureState.recognitionDocument = null; captureState.analysis = null; captureState.aiStatus = 'idle'; captureState.aiDetail = '';
  recognitionQueued = false; disposeBrowserOcr();
  if (!keepOverlay && root()) root().innerHTML = '';
}
function previewHtml(image) {
  if (image.previewAvailable && image.previewUrl) return `<img src="${esc(image.previewUrl)}" alt="${esc(image.roleLabel)}预览">`;
  if (image.previewReleased) return `<div class="bag-photo-native-preview" aria-label="预览已释放以降低识别内存占用" style="display:grid;place-items:center;min-height:132px;border-radius:14px;background:rgba(255,255,255,.04);color:#8f8b83;font-size:13px;letter-spacing:.06em;text-align:center;line-height:1.7">识别中已释放预览<br>原压缩图仍用于 OCR</div>`;
  return `<div class="bag-photo-native-preview" aria-label="Android 原图已绑定，缩略预览暂不可用" style="display:grid;place-items:center;min-height:132px;border-radius:14px;background:rgba(255,255,255,.04);color:#8f8b83;font-size:13px;letter-spacing:.06em;text-align:center;line-height:1.7">Android 原图<br>预览暂不可用</div>`;
}
function sourceInfo(image) {
  if (image.nativeSource) return image.previewAvailable ? 'Android 原图 · 原生缩略预览 · 本地 URI 识别' : 'Android 原图 · 本地 URI 识别';
  return `${image.processedWidth}×${image.processedHeight} px · ${Math.round(image.blob.size / 1024)} KB${image.previewReleased ? ' · 预览内存已释放' : ''}`;
}
function renderImageCards() {
  if (!captureState.images.length) return '<div class="bag-empty">尚未添加照片</div>';
  return captureState.images.map(image => `
    <article class="bag-photo-card" data-bag-image-id="${esc(image.id)}">
      ${previewHtml(image)}
      <div class="bag-photo-main">
        <div class="bag-photo-heading"><strong>${esc(image.roleLabel)}</strong><span class="bag-quality ${esc(image.status)}">${qualityLabel(image)} · ${image.score}</span></div>
        <select class="control bag-role-select" data-bag-role="${esc(image.id)}" aria-label="照片类型">
          ${ROLE_OPTIONS.map(([value, label]) => `<option value="${value}"${image.role === value ? ' selected' : ''}>${label}</option>`).join('')}
        </select>
        <p>${esc(sourceInfo(image))}</p>
        ${image.warnings.length ? `<ul>${image.warnings.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p class="bag-good-copy">未发现明显模糊、过曝或大面积反光。</p>'}
      </div>
      <button class="bag-remove" type="button" data-bag-remove="${esc(image.id)}" aria-label="删除照片">×</button>
    </article>`).join('');
}
function aiStatusCopy() {
  if (captureState.aiStatus === 'running') return '本地识别已完成；AI 正在后台复核低置信度字段，不影响继续录入';
  if (captureState.aiStatus === 'applied') return `AI 辅助已提供候选${captureState.aiDetail ? ` · ${captureState.aiDetail}` : ''}`;
  if (captureState.aiStatus === 'skipped') return captureState.aiDetail || '本地识别置信度足够，AI 未触发';
  if (captureState.aiStatus === 'unavailable') return `AI 辅助未介入${captureState.aiDetail ? ` · ${captureState.aiDetail}` : ''}`;
  return '';
}
function renderRecognitionPanel() {
  if (!captureState.ocrText && !captureState.blocks.length) return '';
  const analysis = captureState.analysis;
  const fieldRows = (analysis?.fields || []).map(item => {
    const percent = Math.round(Number(item.confidence || 0) * 100);
    const stateLabel = item.status === 'translated' ? '已翻译归一' : item.status === 'resolved' ? '已归类' : '待确认';
    const aiCandidates = Array.isArray(item.aiCandidates) ? item.aiCandidates : [];
    const aiLine = aiCandidates.length ? `<small>AI 辅助候选：${esc(aiCandidates.slice(0, 2).map(candidate => `${candidate.value} (${Math.round(candidate.confidence * 100)}%)`).join(' / '))} · 仅供确认</small>` : '';
    return `<article class="bag-semantic-row ${esc(item.status)}" data-recognition-field="${esc(item.field)}">
      <div class="bag-semantic-label"><strong>${esc(item.label)}</strong><span>${esc(stateLabel)} · ${percent}%</span></div>
      <div class="bag-semantic-value"><b>${esc(item.standardValue || item.rawValue || '—')}</b>${item.rawValue && item.rawValue !== item.standardValue ? `<small>原文：${esc(item.rawValue)}</small>` : ''}${aiLine}</div>
    </article>`;
  }).join('');
  const aiCopy = aiStatusCopy();
  return `
    <section class="bag-recognition-result">
      <div class="bag-result-heading"><strong>翻译与字段整理</strong><span>${esc(captureState.ocrEngine || '手工输入')}</span></div>
      ${analysis ? `<div class="bag-semantic-summary"><span>已归类 ${analysis.resolvedCount} 项</span><span class="${analysis.reviewCount ? 'needs-review' : ''}">待确认 ${analysis.reviewCount} 项</span></div>` : '<p class="muted small">修改文字后点击“重新整理”。</p>'}
      ${aiCopy ? `<p class="muted small" data-recognition-ai-status>${esc(aiCopy)}</p>` : ''}
      <div class="bag-semantic-grid">${fieldRows || '<p class="muted small">尚未形成可靠字段；原始文字仍会保留，未确认内容不会强行写入豆卡。</p>'}</div>
      <details class="bag-raw-evidence"><summary>查看和修正 OCR 原文</summary><textarea id="bagOcrText" class="control" rows="8" placeholder="识别文字会显示在这里，可修正后重新整理。">${esc(captureState.ocrText)}</textarea></details>
      <div class="row end"><button id="bagReanalyzeBtn" class="button subtle" type="button">重新整理</button></div>
      <p class="muted small">本地 OCR、基座字典与 Knowledge 层拥有事实归一权；AI 只对低置信度/未解析字段提供可追溯候选，不覆盖已确认事实。</p>
    </section>`;
}
function render() {
  const overlayRoot = root(); if (!overlayRoot) return;
  const capabilities = getRecognitionCapabilities();
  overlayRoot.innerHTML = `
    <div class="overlay full bag-capture-overlay" data-overlay="bag-capture"><div class="dialog bag-capture-dialog">
      <div class="dialog-header"><div><h2>拍袋录入</h2><p>多视角采集，分别处理曲面、倾斜、反光和碎片化信息</p></div><button class="close-button" type="button" data-bag-close aria-label="关闭">×</button></div>
      <div class="bag-capture-status"><strong>${captureState.images.length}/${MAX_IMAGES}</strong><span>${esc(statusMessage())}</span></div>
      <div class="bag-engine-status"><span>识别通道</span><b>${capabilities.native ? 'Android 本地中英文 OCR 可用' : capabilities.webPaddle ? '网页 PP-OCR 可用（Safari 按需低内存模式）' : capabilities.textDetector ? '浏览器文字检测可用' : '网页 OCR 当前不可用，可改用文字录入'}</b></div>
      <div class="bag-photo-list">${renderImageCards()}</div>
      <div class="bag-capture-actions">
        <button id="bagCameraBtn" class="button primary" type="button"${captureState.images.length >= MAX_IMAGES || captureState.busy ? ' disabled' : ''}>拍摄一张</button>
        <button id="bagGalleryBtn" class="button" type="button"${captureState.images.length >= MAX_IMAGES || captureState.busy ? ' disabled' : ''}>从相册选择</button>
        <button id="bagRecognizeBtn" class="button" type="button"${!captureState.images.length || captureState.busy ? ' disabled' : ''}>${captureState.busy ? '本地识别中…' : '开始识别'}</button>
      </div>
      ${renderRecognitionPanel()}
      <div class="bag-manual-entry"><button id="bagManualBtn" class="button subtle" type="button">手工粘贴文字</button><span class="grow"></span><button id="bagHandoffBtn" class="button primary" type="button"${captureState.ocrText.trim() ? '' : ' disabled'}>确认并进入豆卡</button></div>
      <input id="bagCameraInput" type="file" accept="image/*" capture="environment" hidden><input id="bagGalleryInput" type="file" accept="image/*" multiple hidden>
    </div></div>`;
  bindOverlay();
}
async function addFiles(fileList) {
  const files = [...(fileList || [])].filter(file => file.type.startsWith('image/')).slice(0, MAX_IMAGES - captureState.images.length);
  if (!files.length) return;
  captureState.busy = true; render();
  try {
    for (const file of files) {
      const prepared = await preparePackageImage(file); const role = nextRole();
      const id = `bag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const nativeSource = Boolean(prepared.nativeSource); const nativePreview = bindAndroidImageSource(id, nativeSource);
      const previewUrl = nativeSource ? nativePreview : URL.createObjectURL(prepared.blob); const warnings = [...(prepared.warnings || [])];
      if (nativeSource && !nativePreview) warnings.push('Android 原图已绑定；缩略预览生成失败，但本地 OCR 仍可直接读取原图。');
      captureState.images.push({ id, role, roleLabel:roleLabel(role), blob:prepared.blob, previewUrl, previewAvailable:Boolean(previewUrl), previewReleased:false, nativeSource,
        score:prepared.score, status:prepared.status, warnings, processedWidth:prepared.processedWidth, processedHeight:prepared.processedHeight, metrics:prepared.metrics });
    }
  } catch (error) { captureState.ocrText = `图片处理失败：${error.message}`; captureState.ocrEngine = '错误'; }
  finally { captureState.busy = false; render(); }
}
async function applyAiAdvisory(book, generation, documentRef) {
  const analysisRef = captureState.analysis;
  if (!documentRef || !analysisRef || generation !== operationGeneration) return;
  const ai = await enrichRecognitionWithAi(documentRef, analysisRef, { timeoutMs:8000 });
  if (generation !== operationGeneration || captureState.recognitionDocument !== documentRef) return;
  if (ai.ok) {
    documentRef.extensions = { ...(documentRef.extensions || {}), aiEnrichment:{ ...ai.result, engine:ai.result.engine || 'zhipu', model:ai.result.model || ai.model || '' } };
    captureState.analysis = analyzeRecognitionDocument(documentRef, book);
    captureState.aiStatus = 'applied'; captureState.aiDetail = ai.model || '智谱';
  } else if (ai.skipped) {
    captureState.aiStatus = 'skipped'; captureState.aiDetail = ai.reason === 'local-high-confidence' ? '本地结果已达到高置信度' : '有效 OCR 证据不足，未调用 AI';
  } else {
    captureState.aiStatus = 'unavailable'; captureState.aiDetail = ai.reason || '服务暂不可用';
  }
  render();
}
async function runRecognition() {
  const generation = ++operationGeneration;
  captureState.busy = true; captureState.ocrText = ''; captureState.blocks = []; captureState.aiStatus = 'idle'; captureState.aiDetail = '';
  releaseWebPreviewsForRecognition(); render();
  let localSuccess = false; let book = null; let documentRef = null;
  try {
    const result = await recognizeCoffeeBag(captureState.images, { locale:'zh-CN' });
    if (generation !== operationGeneration) return;
    captureState.ocrText = result.fullText || ''; captureState.ocrEngine = result.engine || 'OCR'; captureState.blocks = result.blocks || [];
    if (!captureState.ocrText) throw new Error('没有检测到可用文字，请补拍更清晰的局部照片');
    documentRef = createRecognitionDocument({ images:captureState.images.map(({ id, role, roleLabel }) => ({ id, role, roleLabel })), blocks:captureState.blocks, engine:captureState.ocrEngine, fullText:captureState.ocrText });
    captureState.recognitionDocument = documentRef;
    ({ data:book } = await loadCodebook());
    if (generation !== operationGeneration) return;
    captureState.analysis = analyzeRecognitionDocument(documentRef, book);
    captureState.aiStatus = 'running'; localSuccess = true;
  } catch (error) {
    if (generation !== operationGeneration) return;
    if (error instanceof RecognitionUnavailableError) { captureState.ocrEngine = '网页 OCR 不可用'; captureState.ocrText = ''; }
    else { captureState.ocrEngine = '识别失败'; captureState.ocrText = ''; alert(error.message); }
  } finally {
    if (generation === operationGeneration) {
      captureState.busy = false; render();
      if (!localSuccess && !captureState.ocrText) openManualEntry(errorMessageForManual());
    }
  }
  if (localSuccess && generation === operationGeneration) void applyAiAdvisory(book, generation, documentRef);
}
async function reanalyzeEditedText() {
  const text = (document.querySelector('#bagOcrText')?.value || '').trim(); if (!text) return;
  const generation = ++operationGeneration;
  captureState.busy = true; captureState.aiStatus = 'idle'; captureState.aiDetail = ''; render();
  let book = null; let documentRef = null; let localSuccess = false;
  try {
    const unchanged = captureState.recognitionDocument?.rawFullText?.trim() === text;
    captureState.ocrText = text; documentRef = unchanged ? captureState.recognitionDocument : recognitionDocumentFromText(text); captureState.recognitionDocument = documentRef;
    ({ data:book } = await loadCodebook());
    if (generation !== operationGeneration) return;
    captureState.analysis = analyzeRecognitionDocument(documentRef, book); captureState.aiStatus = 'running'; localSuccess = true;
  } catch (error) { if (generation === operationGeneration) alert(`文字整理失败：${error.message}`); }
  finally { if (generation === operationGeneration) { captureState.busy = false; render(); } }
  if (localSuccess && generation === operationGeneration) void applyAiAdvisory(book, generation, documentRef);
}
function errorMessageForManual() {
  const caps = getRecognitionCapabilities();
  if (!caps.native && !caps.webPaddle && !caps.textDetector) return '当前浏览器无法安全启动网页 OCR。可粘贴豆袋文字继续，字段仍由同一套基座规则解析。';
  return '自动识别没有得到文字，可手工输入，或返回补拍更清晰的局部照片。';
}
function openManualEntry(message = '可粘贴包装上的文字，后续仍由同一套编码表解析。') {
  const existing = document.querySelector('#bagOcrText')?.value || captureState.ocrText; captureState.ocrText = existing || ' '; render();
  const target = document.querySelector('#bagOcrText');
  if (target) {
    const details = target.closest('details'); if (details) details.open = true;
    target.value = existing.trim(); target.placeholder = message; target.focus();
    const button = document.querySelector('#bagHandoffBtn'); if (button) button.disabled = !target.value.trim();
  }
}
async function handoffToExistingParser() {
  const text = (document.querySelector('#bagOcrText')?.value || captureState.ocrText).trim(); if (!text) return;
  const unchanged = captureState.recognitionDocument?.rawFullText?.trim() === text;
  const recognitionDocument = unchanged ? captureState.recognitionDocument : recognitionDocumentFromText(text); if (!recognitionDocument) return;
  const flow = globalThis.LuckyBeanRecognitionFlow;
  if (typeof flow?.acceptDocument !== 'function') { globalThis.LuckyBeanPendingRecognitionDocument = recognitionDocument; alert('豆卡识别流程尚未就绪，请稍后重试'); return; }
  clearCapture(); await flow.acceptDocument(recognitionDocument, { overwrite:true });
  document.dispatchEvent(new CustomEvent('luckybean:recognition-handoff-complete', { detail:{ source:'package-capture' } }));
}
function bindOverlay() {
  document.querySelector('[data-bag-close]')?.addEventListener('click', () => clearCapture());
  document.querySelector('#bagCameraBtn')?.addEventListener('click', () => document.querySelector('#bagCameraInput')?.click());
  document.querySelector('#bagGalleryBtn')?.addEventListener('click', () => document.querySelector('#bagGalleryInput')?.click());
  document.querySelector('#bagCameraInput')?.addEventListener('change', event => addFiles(event.target.files));
  document.querySelector('#bagGalleryInput')?.addEventListener('change', event => addFiles(event.target.files));
  document.querySelector('#bagManualBtn')?.addEventListener('click', () => openManualEntry());
  document.querySelector('#bagHandoffBtn')?.addEventListener('click', handoffToExistingParser);
  document.querySelector('#bagReanalyzeBtn')?.addEventListener('click', reanalyzeEditedText);
  document.querySelector('#bagOcrText')?.addEventListener('input', event => { captureState.ocrText = event.target.value; const button = document.querySelector('#bagHandoffBtn'); if (button) button.disabled = !event.target.value.trim(); });
  document.querySelectorAll('[data-bag-remove]').forEach(button => button.addEventListener('click', () => { const index = captureState.images.findIndex(image => image.id === button.dataset.bagRemove); if (index < 0) return; releasePreview(captureState.images[index]); captureState.images.splice(index, 1); render(); }));
  document.querySelectorAll('[data-bag-role]').forEach(select => select.addEventListener('change', () => { const image = captureState.images.find(item => item.id === select.dataset.bagRole); if (!image) return; image.role = select.value; image.roleLabel = roleLabel(select.value); render(); }));
}
export function openPackageCapture() { clearCapture({ keepOverlay:true }); render(); }
function interceptPhotoMode(event) {
  const button = event.target.closest?.('[data-add-mode="photo"]'); if (!button) return;
  event.preventDefault(); event.stopImmediatePropagation(); document.querySelectorAll('.popup-menu').forEach(node => node.remove()); openPackageCapture();
}
function interceptRecognitionClick(event) {
  const button = event.target.closest?.('#bagRecognizeBtn'); if (!button || button.disabled || captureState.busy || recognitionQueued) return;
  event.preventDefault(); event.stopImmediatePropagation(); recognitionQueued = true;
  setTimeout(async () => { try { await runRecognition(); } finally { recognitionQueued = false; } }, 0);
}
document.addEventListener('click', interceptPhotoMode, true);
document.addEventListener('click', interceptRecognitionClick, true);
window.LuckyBeanPackageCapture = { open:openPackageCapture, capabilities:getRecognitionCapabilities };
