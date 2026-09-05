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

  if (globalThis.ImageCapture) {
    try {
      const capture = new ImageCapture(track);
      const blob = await capture.takePhoto();
      if (blob?.size) return blob;
    } catch { /* 部分手机仅支持视频帧回退 */ }
  }

  const width = video.videoWidth || 1920;
  const height = video.videoHeight || 1080;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('摄像头画面截取失败')),
    'image/jpeg',
    0.94
  ));
}

function sendBlobToBagCapture(blob) {
  const input = document.querySelector('#bagCameraInput');
  if (!input) throw new Error('拍袋录入窗口已经关闭');
  const extension = blob.type === 'image/png' ? 'png' : 'jpg';
  const file = new File([blob], `coffee-bag-${Date.now()}.${extension}`, { type: blob.type || 'image/jpeg' });
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
  status.textContent = `${settings.width || video.videoWidth || ''}×${settings.height || video.videoHeight || ''} · 对准文字后点击拍摄`;
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
      <div class="lb-camera-view"><video playsinline muted autoplay></video><div class="lb-camera-guide"><span>尽量让中文和英文文字占满框内区域</span></div></div>
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
      const blob = await takeFrame(video);
      sendBlobToBagCapture(blob);
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
