import {
  nativeStorageAvailable,
  nativeCapabilities,
  nativeExportBackup,
  nativeImportBackup,
  nativeEnqueueSync
} from './native-storage.js';

let installed = false;
let busy = false;

function nativeAndroid() {
  return nativeStorageAvailable() && globalThis.__LUCKYBEAN_NATIVE_ENGINE__ === 'geckoview';
}

function status(message, kind = '') {
  const toast = document.querySelector('#toast');
  if (!toast) {
    console[kind === 'status-bad' ? 'error' : 'info'](message);
    return;
  }
  toast.textContent = String(message);
  toast.className = `toast show ${kind}`;
  clearTimeout(status.timer);
  status.timer = setTimeout(() => { toast.className = 'toast'; }, 3500);
}

function safeBackupName() {
  const date = new Date().toISOString().slice(0, 10);
  return `luckybean_backup_${date}.luckybean`;
}

async function exportArchive() {
  if (busy) return;
  busy = true;
  status('正在生成完整本地备份…');
  try {
    const result = await nativeExportBackup({ name: safeBackupName() });
    status(`备份已保存：${Number(result?.recordCount || 0)} 条记录`, 'status-good');
  } catch (error) {
    status(`备份失败：${error?.message || error}`, 'status-bad');
  } finally {
    busy = false;
  }
}

async function importArchive() {
  if (busy) return;
  busy = true;
  status('请选择 .luckybean 备份文件');
  try {
    const result = await nativeImportBackup();
    const restored = Number(result?.stagedRecords || 0);
    status(`备份已校验并恢复：${restored} 条记录`, 'status-good');
    setTimeout(() => location.reload(), 900);
  } catch (error) {
    status(`恢复失败，现有数据未清除：${error?.message || error}`, 'status-bad');
  } finally {
    busy = false;
  }
}

function actionFromTarget(target) {
  if (!(target instanceof Element)) return '';
  if (target.closest('#settingsExportBtn')) return 'export';
  if (target.closest('#settingsImportBtn')) return 'import';
  return target.closest('[data-manage-action]')?.getAttribute('data-manage-action') || '';
}

async function captureDataAction(event) {
  if (!nativeAndroid()) return;
  const action = actionFromTarget(event.target);
  if (action !== 'export' && action !== 'import') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (action === 'export') await exportArchive();
  else await importArchive();
}

async function publishCapabilities() {
  if (!nativeAndroid()) return;
  document.documentElement.dataset.luckybeanPlatform = 'android';
  document.documentElement.dataset.luckybeanEngine = 'geckoview';
  try {
    const capabilities = await nativeCapabilities();
    globalThis.dispatchEvent(new CustomEvent('luckybean:capabilities', { detail: capabilities }));
  } catch (error) {
    status(`原生能力检查失败：${error?.message || error}`, 'status-bad');
  }
}

function installOnlineResume() {
  globalThis.addEventListener('online', () => {
    if (!nativeAndroid()) return;
    nativeEnqueueSync().catch(error => console.warn('后台同步入队失败', error));
  });
}

export function installCoreV2PlatformUi() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('click', captureDataAction, true);
  installOnlineResume();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', publishCapabilities, { once: true });
  } else {
    publishCapabilities();
  }
}

installCoreV2PlatformUi();
