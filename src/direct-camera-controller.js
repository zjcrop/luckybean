let stream = null;
let facingMode = 'environment';
let cameraRoot = null;
let opening = false;

function ensureCameraStyles() {
  if (document.querySelector('#lb-direct-camera-runtime-style')) return;
  const style = document.createElement('style');
  style.id = 'lb-direct-camera-runtime-style';
  style.textContent = `
    .lb-direct-camera{
      display:flex!important;
      align-items:center!important;
      justify-content:center!important;
      overflow:auto!important;
      padding:max(10px,env(safe-area-inset-top)) 12px max(10px,env(safe-area-inset-bottom))!important;
      background:var(--bg,#050505)!important;
      color:var(--text,#f5f3ed)!important;
    }
    .lb-direct-camera .lb-camera-panel{
      width:min(560px,calc(100vw - 24px))!important;
      height:auto!important;
      max-height:calc(100vh - 24px)!important;
      max-height:calc(100dvh - 24px)!important;
      display:flex!important;
      flex-direction:column!important;
      gap:8px!important;
      padding:10px!important;
      overflow:hidden!important;
      background:var(--bg,#050505)!important;
      color:var(--text,#f5f3ed)!important;
    }
    .lb-direct-camera .lb-camera-view{
      flex:0 1 auto!important;
      width:100%!important;
      height:clamp(180px,52vh,420px)!important;
      height:clamp(180px,52dvh,420px)!important;
      min-height:0!important;
      max-height:420px!important;
      aspect-ratio:auto!important;
    }
    .lb-direct-camera .lb-camera-view video{object-fit:cover!important;object-position:50% 50%!important}
    .lb-direct-camera .lb-camera-guide{border-radius:0!important}
    .lb-direct-camera .lb-camera-head,
    .lb-direct-camera .lb-camera-head strong,
    .lb-direct-camera .lb-camera-head button,
    .lb-direct-camera .lb-camera-status,
    .lb-direct-camera .lb-camera-actions .button{
      color:var(--text,#f5f3ed)!important;
    }
    .lb-direct-camera .lb-camera-actions{
      flex:0 0 auto!important;
      margin:0!important;
      padding-bottom:max(2px,env(safe-area-inset-bottom))!important;
    }
    .lb-direct-camera .lb-camera-actions .button{
      min-height:42px!important;
      opacity:1;
    }
    .lb-direct-camera .lb-camera-actions .button:disabled{opacity:.48}
    html[data-theme="dark"] .lb-direct-camera .lb-camera-head,
    html[data-theme="dark"] .lb-direct-camera .lb-camera-head strong,
    html[data-theme="dark"] .lb-direct-camera .lb-camera-head button,
    html[data-theme="dark"] .lb-direct-camera .lb-camera-status,
    html[data-theme="dark"] .lb-direct-camera .lb-camera-actions .button{color:#fff!important}
    html[data-theme="light"] .lb-direct-camera .lb-camera-head,
    html[data-theme="light"] .lb-direct-camera .lb-camera-head strong,
    html[data-theme="light"] .lb-direct-camera .lb-camera-head button,
    html[data-theme="light"] .lb-direct-camera .lb-camera-status,
    html[data-theme="light"] .lb-direct-camera .lb-camera-actions .button{color:#111!important}
    @media(max-height:620px){
      .lb-direct-camera .lb-camera-view{
        height:clamp(150px,43vh,280px)!important;
        height:clamp(150px,43dvh,280px)!important;
      }
    }
    @media(max-width:560px){
      .lb-direct-camera{padding-left:8px!important;padding-right:8px!important}
      .lb-direct-camera .lb-camera-panel{
        width:100%!important;
        height:auto!important;
        max-height:calc(100vh - 20px)!important;
        max-height:calc(100dvh - 20px)!important;
        padding:8px!important;
      }
      .lb-direct-camera .lb-camera-view{
        height:clamp(170px,50vh,390px)!important;
        height:clamp(170px,50dvh,390px)!important;
      }
    }
  `;
  document.head.append(style);
}

function stopCamera() {
  for (const track of stream?.getTracks?.() || []) track.stop();
  stream = null;
  cameraRoot?.remove();
  cameraRoot = null;
}

function cameraErrorMessage(error) {
  if (error?.name === 'NotAllowedError') return '未获得摄像头权限，请在浏览器网站权限中允许使用摄像头。';
  if (error?.name === 'NotFoundError') return '没有找到可用摄像头。';
  if (error?.name === 'NotReadableError') return '摄像头正被其他应用占用，请关闭系统相机后重试。';
  if (!globalThis.isSecureContext) return '网页内摄像头只能在 HTTPS 安全连接中使用。';
  return `摄像头启动失败：${error?.message || error}`;
}

async function takeFrame(video) {
  const track = stream?.getVideoTracks?.()[0];
  if (!track) throw new Error('摄像头尚未启动');
  const width = video.videoWidth;
  const height = video.videoHeight;
  const guide = video.parentElement?.querySelector('.lb-camera-guide');
  if (!width || !height || !guide) throw new Error('取景画面尚未准备完成');
  const preview = video.getBoundingClientRect();
  const frame = guide.getBoundingClientRect();
  // object-fit: cover clips the live video. Map only the visible guide back into
  // that same frame; a separate still-camera stream can have a different field of view.
  const scale = Math.max(preview.width / width, preview.height / height);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('取景范围无效');
  const offsetX = (preview.width - width * scale) / 2;
  const offsetY = (preview.height - height * scale) / 2;
  const left = Math.max(0, (frame.left + guide.clientLeft - preview.left - offsetX) / scale);
  const top = Math.max(0, (frame.top + guide.clientTop - preview.top - offsetY) / scale);
  const cropWidth = Math.min(width - left, guide.clientWidth / scale);
  const cropHeight = Math.min(height - top, guide.clientHeight / scale);
  if (cropWidth <= 0 || cropHeight <= 0) throw new Error('中央取景框不可用');
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cropWidth));
  canvas.height = Math.max(1, Math.round(cropHeight));
  try {
    const context = canvas.getContext('2d');
    context.drawImage(video, left, top, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('摄像头画面截取失败')),
      'image/jpeg', 0.94
    ));
    return { blob, width:canvas.width, height:canvas.height };
  } finally { canvas.width = 1; canvas.height = 1; }
}

function sendBlobToBagCapture(blob, dimensions) {
  const input = document.querySelector('#bagCameraInput');
  if (!input) throw new Error('拍袋录入窗口已经关闭');
  const extension = blob.type === 'image/png' ? 'png' : 'jpg';
  const file = new File([blob], `coffee-bag-${Date.now()}.${extension}`, { type: blob.type || 'image/jpeg' });
  if (!(globalThis.__LUCKYBEAN_GALLERY_OCR_READY__ instanceof Map)) globalThis.__LUCKYBEAN_GALLERY_OCR_READY__ = new Map();
  const key = [file.name, file.size, file.lastModified, file.type].join('|');
  globalThis.__LUCKYBEAN_GALLERY_OCR_READY__.set(key, Object.freeze({ ...dimensions, source:'camera-guide-crop', skipSecondEncode:true }));
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function openStream(video, status) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持网页内摄像头');
  stopTracksOnly();
  status.textContent = '正在启动后置摄像头…';
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 2560 },
      height: { ideal: 1440 },
      frameRate: { ideal: 30, max: 30 }
    }
  });
  video.srcObject = stream;
  await video.play();

  const track = stream.getVideoTracks()[0];
  try {
    const capabilities = track.getCapabilities?.() || {};
    const advanced = [];
    if (capabilities.focusMode?.includes?.('continuous')) advanced.push({ focusMode: 'continuous' });
    if (capabilities.exposureMode?.includes?.('continuous')) advanced.push({ exposureMode: 'continuous' });
    if (advanced.length) await track.applyConstraints({ advanced });
  } catch { /* 浏览器不支持时保持默认相机参数 */ }

  const settings = track.getSettings?.() || {};
  status.textContent = '只拍摄中央框内区域，请将需要识别的文字放入框内';
}

function stopTracksOnly() {
  for (const track of stream?.getTracks?.() || []) track.stop();
  stream = null;
}

async function openCamera() {
  if (opening || cameraRoot) return;
  opening = true;
  ensureCameraStyles();
  const root = document.createElement('div');
  root.className = 'lb-direct-camera';
  root.innerHTML = `
    <div class="lb-camera-panel" role="dialog" aria-modal="true" aria-label="网页内拍摄豆袋">
      <div class="lb-camera-head"><strong>拍摄豆袋</strong><button type="button" data-camera-close aria-label="关闭">×</button></div>
      <div class="lb-camera-view"><video playsinline muted autoplay></video><div class="lb-camera-guide" aria-label="实际拍摄和识别范围"></div></div>
      <p class="lb-camera-status">正在请求摄像头权限…</p>
      <div class="lb-camera-actions">
        <button type="button" class="button" data-camera-switch>切换摄像头</button>
        <button type="button" class="button primary" data-camera-shot disabled>拍摄并加入</button>
      </div>
    </div>`;
  document.body.append(root);
  cameraRoot = root;
  const video = root.querySelector('video');
  const status = root.querySelector('.lb-camera-status');
  const shot = root.querySelector('[data-camera-shot]');

  root.querySelector('[data-camera-close]').addEventListener('click', stopCamera);
  root.addEventListener('click', event => { if (event.target === root) stopCamera(); });
  root.querySelector('[data-camera-switch]').addEventListener('click', async () => {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    shot.disabled = true;
    try {
      await openStream(video, status);
      shot.disabled = false;
    } catch (error) {
      status.textContent = cameraErrorMessage(error);
    }
  });
  shot.addEventListener('click', async () => {
    shot.disabled = true;
    status.textContent = '正在截取高清画面…';
    try {
      const frame = await takeFrame(video);
      sendBlobToBagCapture(frame.blob, { width:frame.width, height:frame.height });
      stopCamera();
    } catch (error) {
      status.textContent = cameraErrorMessage(error);
      shot.disabled = false;
    }
  });

  try {
    await openStream(video, status);
    shot.disabled = false;
  } catch (error) {
    status.textContent = cameraErrorMessage(error);
  } finally {
    opening = false;
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest?.('#bagCameraBtn');
  if (!button || button.disabled) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openCamera();
}, true);

window.addEventListener('pagehide', stopCamera);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && cameraRoot) stopCamera();
});

globalThis.LuckyBeanDirectCamera = { open: openCamera, close: stopCamera };
