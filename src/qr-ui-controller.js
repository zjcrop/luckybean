const QR_OVERLAY_SELECTOR = '[data-overlay="camera"]';
const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
let overlayObserver = null;

function retryScanner(status) {
  const scanner = globalThis.LuckyBeanQrScanner;
  if (!scanner?.restart) {
    status.textContent = '扫描器尚未建立，请关闭窗口后重新打开二维码扫描';
    return;
  }
  status.textContent = '正在重新扫描…';
  scanner.restart().catch(error => {
    const name = String(error?.name || '');
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      status.textContent = '相机权限未开启。请在系统或浏览器设置中允许富贵盒子使用相机，然后再次点击“重新扫描”。';
      return;
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      status.textContent = '摄像头可能被其他应用占用。关闭占用后再次点击“重新扫描”。';
      return;
    }
    status.textContent = `重新扫描失败：${error?.message || '未知错误'}`;
  });
}

function decorateCameraOverlay(overlay) {
  if (!overlay || overlay.dataset.lbQrDecorated === '1') return;
  const video = $('#cameraVideo', overlay);
  const status = $('#cameraStatus', overlay);
  const fileButton = $('#cameraFileBtn', overlay);
  if (!video || !status || !fileButton) return;

  overlay.dataset.lbQrDecorated = '1';
  if (!video.parentElement?.classList.contains('v095-qr-stage')) {
    const stage = document.createElement('div');
    stage.className = 'v095-qr-stage';
    video.parentElement.insertBefore(stage, video);
    stage.append(video);
    stage.insertAdjacentHTML('beforeend', '<span class="v095-qr-frame" aria-hidden="true"></span><span class="v095-qr-live">本地识别</span>');
  }

  fileButton.textContent = '改用图片';
  let retry = $('#cameraRetryBtn', overlay);
  if (!retry) {
    retry = document.createElement('button');
    retry.id = 'cameraRetryBtn';
    retry.className = 'button';
    retry.type = 'button';
    retry.textContent = '重新扫描';
    fileButton.before(retry);
  }
  retry.disabled = false;
  retry.style.pointerEvents = 'auto';
  retry.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    retryScanner(status);
  }, { once:true });

  if (!overlay.querySelector('[data-lb-qr-help]')) {
    status.insertAdjacentHTML('afterend', '<p class="muted small" data-lb-qr-help>保持二维码完整、平整并避免反光。失败后可以直接重新扫描；相机不可用时可改用二维码图片。</p>');
  }
}

function scan() {
  const root = document.querySelector('#overlayRoot');
  const overlay = root?.querySelector(QR_OVERLAY_SELECTOR);
  if (overlay) decorateCameraOverlay(overlay);
}

function bindOverlayObserver() {
  const root = document.querySelector('#overlayRoot');
  if (!root || overlayObserver) return;
  overlayObserver = new MutationObserver(scan);
  overlayObserver.observe(root, { childList:true, subtree:true });
}

document.addEventListener('luckybean:app-refreshed', scan);
document.addEventListener('luckybean:local-app-ready', () => { bindOverlayObserver(); scan(); }, { once:true });
bindOverlayObserver();
scan();

globalThis.LuckyBeanQrUi = { scan, decorateCameraOverlay };
