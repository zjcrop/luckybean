import { preparePackageImage } from './image-quality.js';
import { getRecognitionCapabilities, recognizeCoffeeBag, RecognitionUnavailableError } from './recognition-bridge.js';
import { loadCodebook } from './codebook.js';
import { createRecognitionDocument, recognitionDocumentFromText } from './domain/recognition/recognition-document.js';
import { analyzeRecognitionDocument } from './domain/recognition/recognition-pipeline.js';

const MAX_IMAGES = 4;
const ROLE_OPTIONS = [
  ['front', '正面主体'],
  ['back', '背面参数'],
  ['side', '侧面补充'],
  ['date', '日期标签']
];

const captureState = {
  images: [],
  busy: false,
  ocrText: '',
  ocrEngine: '',
  blocks: [],
  recognitionDocument: null,
  analysis: null
};
let recognitionQueued = false;

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function roleLabel(role) {
  return ROLE_OPTIONS.find(([value]) => value === role)?.[1] || '豆袋照片';
}

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

function root() {
  return document.querySelector('#overlayRoot');
}

function releasePreview(image) {
  const url = String(image?.previewUrl || '');
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
}

function bindAndroidImageSource(imageId, includePreview) {
  if (!globalThis.__LUCKYBEAN_ANDROID__) return '';
  const native = globalThis.LuckyBeanNative;
  if (typeof native?.bindImageSource !== 'function') return '';
  try {
    return String(native.bindImageSource(String(imageId || ''), Boolean(includePreview)) || '');
  } catch {
    return '';
  }
}

function clearCapture({ keepOverlay = false } = {}) {
  for (const image of captureState.images) releasePreview(image);
  captureState.images = [];
  captureState.busy = false;
  captureState.ocrText = '';
  captureState.ocrEngine = '';
  captureState.blocks = [];
  captureState.recognitionDocument = null;
  captureState.analysis = null;
  recognitionQueued = false;
  if (!keepOverlay && root()) root().innerHTML = '';
}

function previewHtml(image) {
  if (image.previewAvailable && image.previewUrl) {
    return `<img src="${esc(image.previewUrl)}" alt="${esc(image.roleLabel)}预览">`;
  }
  return `<div class="bag-photo-native-preview" aria-label="Android 原图已绑定，缩略预览暂不可用" style="display:grid;place-items:center;min-height:132px;border-radius:14px;background:rgba(255,255,255,.04);color:#8f8b83;font-size:13px;letter-spacing:.06em;text-align:center;line-height:1.7">Android 原图<br>预览暂不可用</div>`;
}

function sourceInfo(image) {
  if (image.nativeSource) return image.previewAvailable
    ? 'Android 原图 · 原生缩略预览 · 本地 URI 识别'
    : 'Android 原图 · 本地 URI 识别';
  return `${image.processedWidth}×${image.processedHeight} px · ${Math.round(image.blob.size / 1024)} KB`;
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

function renderRecognitionPanel() {
  if (!captureState.ocrText && !captureState.blocks.length) return '';
  const analysis = captureState.analysis;
  const fieldRows = (analysis?.fields || []).map(item => {
    const percent = Math.round(Number(item.confidence || 0) * 100);
    const stateLabel = item.status === 'translated' ? '已翻译归一' : item.status === 'resolved' ? '已归类' : '待确认';
    return `<article class="bag-semantic-row ${esc(item.status)}" data-recognition-field="${esc(item.field)}">
      <div class="bag-semantic-label"><strong>${esc(item.label)}</strong><span>${esc(stateLabel)} · ${percent}%</span></div>
      <div class="bag-semantic-value"><b>${esc(item.standardValue || item.rawValue || '—')}</b>${item.rawValue && item.rawValue !== item.standardValue ? `<small>原文：${esc(item.rawValue)}</small>` : ''}</div>
    </article>`;
  }).join('');
  return `
    <section class="bag-recognition-result">
      <div class="bag-result-heading"><strong>翻译与字段整理</strong><span>${esc(captureState.ocrEngine || '手工输入')}</span></div>
      ${analysis ? `<div class="bag-semantic-summary"><span>已归类 ${analysis.resolvedCount} 项</span><span class="${analysis.reviewCount ? 'needs-review' : ''}">待确认 ${analysis.reviewCount} 项</span></div>` : '<p class="muted small">修改文字后点击“重新整理”。</p>'}
      <div class="bag-semantic-grid">${fieldRows || '<p class="muted small">尚未形成可靠字段；原始文字仍会保留，未确认内容不会强行写入豆卡。</p>'}</div>
      <details class="bag-raw-evidence"><summary>查看和修正 OCR 原文</summary><textarea id="bagOcrText" class="control" rows="8" placeholder="识别文字会显示在这里，可修正后重新整理。">${esc(captureState.ocrText)}</textarea></details>
      <div class="row end"><button id="bagReanalyzeBtn" class="button subtle" type="button">重新整理</button></div>
      <p class="muted small">标准中文值来自 Lucky Bean / BrewIon 离线咖啡词库；专有名称无可靠对应时保留原文并标记待确认，不使用不可追溯的猜测翻译。</p>
    </section>`;
}

function render() {
  const overlayRoot = root();
  if (!overlayRoot) return;
  const capabilities = getRecognitionCapabilities();
  overlayRoot.innerHTML = `
    <div class="overlay full bag-capture-overlay" data-overlay="bag-capture">
      <div class="dialog bag-capture-dialog">
        <div class="dialog-header"><div><h2>拍袋录入</h2><p>多视角采集，分别处理曲面、倾斜、反光和碎片化信息</p></div><button class="close-button" type="button" data-bag-close aria-label="关闭">×</button></div>
        <div class="bag-capture-status"><strong>${captureState.images.length}/${MAX_IMAGES}</strong><span>${esc(statusMessage())}</span></div>
        <div class="bag-engine-status">
          <span>识别通道</span>
          <b>${capabilities.native ? 'Android 本地中英文 OCR 可用' : capabilities.webPaddle ? '网页 PP-OCR 可用' : capabilities.textDetector ? '浏览器文字检测可用' : '等待安装 PP-OCR 引擎'}</b>
        </div>
        <div class="bag-photo-list">${renderImageCards()}</div>
        <div class="bag-capture-actions">
          <button id="bagCameraBtn" class="button primary" type="button"${captureState.images.length >= MAX_IMAGES || captureState.busy ? ' disabled' : ''}>拍摄一张</button>
          <button id="bagGalleryBtn" class="button" type="button"${captureState.images.length >= MAX_IMAGES || captureState.busy ? ' disabled' : ''}>从相册选择</button>
          <button id="bagRecognizeBtn" class="button" type="button"${!captureState.images.length || captureState.busy ? ' disabled' : ''}>${captureState.busy ? '处理中…' : '开始识别'}</button>
        </div>
        ${renderRecognitionPanel()}
        <div class="bag-manual-entry">
          <button id="bagManualBtn" class="button subtle" type="button">手工粘贴文字</button>
          <span class="grow"></span>
          <button id="bagHandoffBtn" class="button primary" type="button"${captureState.ocrText.trim() ? '' : ' disabled'}>确认并进入豆卡</button>
        </div>
        <input id="bagCameraInput" type="file" accept="image/*" capture="environment" hidden>
        <input id="bagGalleryInput" type="file" accept="image/*" multiple hidden>
      </div>
    </div>`;
  bindOverlay();
}

async function addFiles(fileList) {
  const files = [...(fileList || [])].filter(file => file.type.startsWith('image/')).slice(0, MAX_IMAGES - captureState.images.length);
  if (!files.length) return;
  captureState.busy = true;
  render();
  try {
    for (const file of files) {
      const prepared = await preparePackageImage(file);
      const role = nextRole();
      const id = `bag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const nativeSource = Boolean(prepared.nativeSource);
      const nativePreview = bindAndroidImageSource(id, nativeSource);
      const previewUrl = nativeSource ? nativePreview : URL.createObjectURL(prepared.blob);
      const warnings = [...(prepared.warnings || [])];
      if (nativeSource && !nativePreview) warnings.push('Android 原图已绑定；缩略预览生成失败，但本地 OCR 仍可直接读取原图。');
      captureState.images.push({
        id,
        role,
        roleLabel: roleLabel(role),
        blob: prepared.blob,
        previewUrl,
        previewAvailable: Boolean(previewUrl),
        nativeSource,
        score: prepared.score,
        status: prepared.status,
        warnings,
        processedWidth: prepared.processedWidth,
        processedHeight: prepared.processedHeight,
        metrics: prepared.metrics
      });
    }
  } catch (error) {
    captureState.ocrText = `图片处理失败：${error.message}`;
    captureState.ocrEngine = '错误';
  } finally {
    captureState.busy = false;
    render();
  }
}

async function runRecognition() {
  captureState.busy = true;
  captureState.ocrText = '';
  captureState.blocks = [];
  render();
  try {
    const result = await recognizeCoffeeBag(captureState.images, { locale: 'zh-CN' });
    captureState.ocrText = result.fullText || '';
    captureState.ocrEngine = result.engine || 'OCR';
    captureState.blocks = result.blocks || [];
    if (!captureState.ocrText) throw new Error('没有检测到可用文字，请补拍更清晰的局部照片');
    captureState.recognitionDocument = createRecognitionDocument({
      images: captureState.images.map(({ id, role, roleLabel }) => ({ id, role, roleLabel })),
      blocks: captureState.blocks,
      engine: captureState.ocrEngine,
      fullText: captureState.ocrText
    });
    const { data: book } = await loadCodebook();
    captureState.analysis = analyzeRecognitionDocument(captureState.recognitionDocument, book);
  } catch (error) {
    if (error instanceof RecognitionUnavailableError) {
      captureState.ocrEngine = '待安装';
      captureState.ocrText = '';
    } else {
      captureState.ocrEngine = '识别失败';
      captureState.ocrText = '';
      alert(error.message);
    }
  } finally {
    captureState.busy = false;
    render();
    if (!captureState.ocrText) openManualEntry(errorMessageForManual());
  }
}

async function reanalyzeEditedText() {
  const text = (document.querySelector('#bagOcrText')?.value || '').trim();
  if (!text) return;
  captureState.busy = true;
  try {
    const unchanged = captureState.recognitionDocument?.rawFullText?.trim() === text;
    captureState.ocrText = text;
    captureState.recognitionDocument = unchanged
      ? captureState.recognitionDocument
      : recognitionDocumentFromText(text);
    const { data: book } = await loadCodebook();
    captureState.analysis = analyzeRecognitionDocument(captureState.recognitionDocument, book);
  } catch (error) {
    alert(`文字整理失败：${error.message}`);
  } finally {
    captureState.busy = false;
    render();
  }
}

function errorMessageForManual() {
  const caps = getRecognitionCapabilities();
  if (!caps.native && !caps.webPaddle && !caps.textDetector) return '当前版本已完成拍摄与识别桥接，PP-OCR 模型尚未加入仓库。可先粘贴豆袋文字继续测试字段解析。';
  return '自动识别没有得到文字，可手工输入，或返回补拍更清晰的局部照片。';
}

function openManualEntry(message = '可粘贴包装上的文字，后续仍由同一套编码表解析。') {
  const existing = document.querySelector('#bagOcrText')?.value || captureState.ocrText;
  captureState.ocrText = existing || ' ';
  render();
  const target = document.querySelector('#bagOcrText');
  if (target) {
    target.value = existing.trim();
    target.placeholder = message;
    target.focus();
    const button = document.querySelector('#bagHandoffBtn');
    if (button) button.disabled = !target.value.trim();
  }
}

async function handoffToExistingParser() {
  const text = (document.querySelector('#bagOcrText')?.value || captureState.ocrText).trim();
  if (!text) return;
  const unchanged = captureState.recognitionDocument?.rawFullText?.trim() === text;
  const recognitionDocument = unchanged ? captureState.recognitionDocument : recognitionDocumentFromText(text);
  if (!recognitionDocument) return;
  const flow = globalThis.LuckyBeanRecognitionFlow;
  if (typeof flow?.acceptDocument !== 'function') {
    globalThis.LuckyBeanPendingRecognitionDocument = recognitionDocument;
    alert('豆卡识别流程尚未就绪，请稍后重试');
    return;
  }
  clearCapture();
  await flow.acceptDocument(recognitionDocument, { overwrite: true });
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
  document.querySelector('#bagOcrText')?.addEventListener('input', event => {
    captureState.ocrText = event.target.value;
    const button = document.querySelector('#bagHandoffBtn');
    if (button) button.disabled = !event.target.value.trim();
  });
  document.querySelectorAll('[data-bag-remove]').forEach(button => button.addEventListener('click', () => {
    const index = captureState.images.findIndex(image => image.id === button.dataset.bagRemove);
    if (index < 0) return;
    releasePreview(captureState.images[index]);
    captureState.images.splice(index, 1);
    render();
  }));
  document.querySelectorAll('[data-bag-role]').forEach(select => select.addEventListener('change', () => {
    const image = captureState.images.find(item => item.id === select.dataset.bagRole);
    if (!image) return;
    image.role = select.value;
    image.roleLabel = roleLabel(select.value);
    render();
  }));
}

export function openPackageCapture() {
  clearCapture({ keepOverlay: true });
  render();
}

function interceptPhotoMode(event) {
  const button = event.target.closest?.('[data-add-mode="photo"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  document.querySelectorAll('.popup-menu').forEach(node => node.remove());
  openPackageCapture();
}

function interceptRecognitionClick(event) {
  const button = event.target.closest?.('#bagRecognizeBtn');
  if (!button || button.disabled || captureState.busy || recognitionQueued) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  recognitionQueued = true;
  setTimeout(async () => {
    try { await runRecognition(); }
    finally { recognitionQueued = false; }
  }, 0);
}

document.addEventListener('click', interceptPhotoMode, true);
document.addEventListener('click', interceptRecognitionClick, true);

window.LuckyBeanPackageCapture = { open: openPackageCapture, capabilities: getRecognitionCapabilities };