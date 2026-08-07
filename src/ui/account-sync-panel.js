const STATUS_TEXT = {
  authenticated: '服务器同步账户已登录',
  connecting: '正在连接服务器…',
  comparing: '正在核对本机与云端数据…',
  offline: '网络不可用，本地功能正常',
  'signed-out': '尚未登录服务器同步账户',
  expired: '登录已超过7天，请重新登录',
  'reauth-required': '服务器登录已失效，请重新登录',
  syncing: '正在后台自动同步…',
  downloading: '正在自动读取服务器数据…',
  synced: '自动同步已完成',
  'synced-preserved': '更新已同步，云端独有数据已保留',
  downloaded: '服务器数据已自动恢复',
  idle: '服务器数据已是最新',
  error: '自动同步失败，稍后将重试',
  conflict: '检测到多设备冲突，已停止自动覆盖',
  'deletion-confirmation-required': '检测到云端数据可能被删除，等待确认',
  'waiting-for-login': '登录后自动同步',
  'legacy-encrypted': '检测到旧版加密服务器数据'
};

const LEGACY_CONTROL_SELECTOR = [
  '[data-v099p-cloud-panel]',
  '[data-v099e-cloud-panel]',
  '[data-v099f-account-sync]',
  '#saveIdentityBtn',
  '#settingsNickname',
  '#settingsEmail',
  '#settingsPhone',
  '#settingsWechat',
  '#settingsQq',
  '#cloudSyncEnabled',
  '#cloudSyncMode',
  '#saveCloudSettingsBtn',
  '#saveStorageSettingsBtn',
  '[data-cloud-sync-toggle]',
  '[data-cloud-sync-now]',
  '[data-cloud-pull]'
].join(',');

const ACCOUNT_HEADING = /^(?:账号|账户|云端|服务器同步|个人信息与云端储存|个人信息与云端存储)$/;

let lastAuthState = document.documentElement.dataset.cloudAuth || 'signed-out';
let lastSyncState = document.documentElement.dataset.cloudSync || 'idle';
let lastDetail = {};
let renderQueued = false;
let lastAutomaticUserId = '';
let deletionDialogFingerprint = '';
let readinessTimer = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>'\"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function session() {
  return globalThis.LuckyBeanCloudAuth?.getSession?.() || null;
}

async function panelState() {
  const service = globalThis.LuckyBeanCloudSync;
  const state = service?.getState ? await service.getState().catch(() => null) : null;
  const email = session()?.user?.email || '';
  const main = service
    ? (STATUS_TEXT[lastSyncState] || STATUS_TEXT[lastAuthState] || '本地优先运行')
    : '同步服务正在初始化…';
  const last = state?.lastSuccessfulSyncAt
    ? new Date(state.lastSuccessfulSyncAt).toLocaleString('zh-CN')
    : '尚未完成同步';
  return { email, main, last, error: lastDetail.error || lastDetail.message || '', state };
}

function headingText(section) {
  return String(section?.querySelector(':scope > summary > span')?.textContent
    || section?.querySelector(':scope > summary')?.textContent
    || '').trim();
}

function accountSection(root) {
  const exact = root.querySelector('.settings-category[data-settings-key="account"]');
  if (exact) return exact;
  return [...root.querySelectorAll('.settings-category')]
    .find(section => ACCOUNT_HEADING.test(headingText(section)) || /账号|账户|服务器同步/.test(headingText(section)));
}

function normalizeAccountSection(section) {
  if (!section) return;
  section.dataset.settingsKey = 'account';
  if (section.dataset.singleSyncNormalized === '1') return;
  section.dataset.singleSyncNormalized = '1';
  const summary = section.querySelector(':scope > summary');
  if (summary) summary.innerHTML = '<span>账户</span><small>唯一的登录与自动同步入口</small>';
}

function removeLegacyAccountUi(root, account) {
  root.querySelectorAll(LEGACY_CONTROL_SELECTOR).forEach(node => node.remove());
  const accountCategories = [...root.querySelectorAll('.settings-category')]
    .filter(section => section === account
      || section.dataset.settingsKey === 'account'
      || ACCOUNT_HEADING.test(headingText(section))
      || /账号|账户|个人信息与云端储存|个人信息与云端存储|服务器同步/.test(headingText(section)));
  accountCategories.forEach(section => { if (section !== account) section.remove(); });
  root.querySelectorAll('[data-cloud-account-panel]').forEach(node => node.remove());
}

async function ensureAutomaticSync(reason) {
  const userId = session()?.user?.id || '';
  if (!userId) {
    lastAutomaticUserId = '';
    return false;
  }
  if (reason === 'render' && lastAutomaticUserId === userId) return true;
  lastAutomaticUserId = userId;
  return Boolean(await globalThis.LuckyBeanCloudSync?.ensureAutomatic?.(reason));
}

function deletionSummary(detail = {}) {
  if (detail.baselineUnknown) {
    return '此手机尚未建立云端同步基线，而服务器已经有数据。继续用本机数据覆盖前必须确认。';
  }
  const ratio = Number(detail.ratioPct || 0);
  return `检测到本机缺少云端中的 ${Number(detail.missingUnits || 0)} 项记录${ratio ? `，约占云端记录的 ${ratio}%` : ''}。`;
}

function closeDeletionDialog() {
  const root = document.querySelector('#overlayRoot');
  if (root?.querySelector('[data-overlay="cloud-deletion-review"]')) root.innerHTML = '';
}

function openDeletionDialog(detail = lastDetail) {
  const root = document.querySelector('#overlayRoot');
  if (!root) return;
  const fingerprint = detail?.fingerprint || detail?.state?.pendingDeletionFingerprint || '';
  const existing = root.querySelector('[data-overlay="cloud-deletion-review"]');
  if (existing && deletionDialogFingerprint === fingerprint) return;
  if (root.children.length && !existing) return;
  deletionDialogFingerprint = fingerprint;
  root.innerHTML = `<div class="overlay" data-overlay="cloud-deletion-review"><div class="dialog cloud-deletion-review-dialog">
    <div class="dialog-header"><div><h2>确认云端删除</h2><p>自动同步已暂停删除操作</p></div><button class="close-button" type="button" data-cloud-deletion-close aria-label="关闭">×</button></div>
    <p>${esc(deletionSummary(detail))}</p>
    <p class="muted small">安全默认：保留服务器中本机缺少的数据，只上传本机新增和更新内容。只有明确确认后，才会删除服务器中的对应数据。</p>
    ${detail?.largeDeletion ? '<p class="status-bad">这是一次较大范围的数据减少，请核对后再确认删除。</p>' : ''}
    <p class="muted small" data-cloud-deletion-message role="status"></p>
    <div class="text-actions data-actions"><button class="button primary" type="button" data-cloud-deletion-preserve>保留云端数据并同步</button><button class="button danger" type="button" data-cloud-deletion-delete>删除云端缺失数据</button></div>
  </div></div>`;

  root.querySelector('[data-cloud-deletion-close]')?.addEventListener('click', closeDeletionDialog);
  root.querySelector('[data-overlay="cloud-deletion-review"]')?.addEventListener('click', event => {
    if (event.target.matches('[data-overlay="cloud-deletion-review"]')) closeDeletionDialog();
  });
  root.querySelector('[data-cloud-deletion-preserve]')?.addEventListener('click', async () => {
    const buttons = root.querySelectorAll('[data-cloud-deletion-preserve],[data-cloud-deletion-delete]');
    buttons.forEach(button => { button.disabled = true; });
    const message = root.querySelector('[data-cloud-deletion-message]');
    if (message) message.textContent = '正在保留云端独有数据并同步本机更新…';
    try {
      await globalThis.LuckyBeanCloudSync?.resolveDeletionDecision?.('preserve');
      closeDeletionDialog();
    } catch (error) {
      if (message) message.textContent = error?.message || '处理失败';
      buttons.forEach(button => { button.disabled = false; });
    }
  });
  root.querySelector('[data-cloud-deletion-delete]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    if (button.dataset.confirmed !== '1') {
      button.dataset.confirmed = '1';
      button.textContent = '再次点击确认删除';
      return;
    }
    const buttons = root.querySelectorAll('[data-cloud-deletion-preserve],[data-cloud-deletion-delete]');
    buttons.forEach(node => { node.disabled = true; });
    const message = root.querySelector('[data-cloud-deletion-message]');
    if (message) message.textContent = '正在执行已确认的云端删除…';
    try {
      await globalThis.LuckyBeanCloudSync?.resolveDeletionDecision?.('delete');
      closeDeletionDialog();
    } catch (error) {
      if (message) message.textContent = error?.message || '处理失败';
      buttons.forEach(node => { node.disabled = false; });
      button.dataset.confirmed = '';
      button.textContent = '删除云端缺失数据';
    }
  });
}

async function renderPanel() {
  const root = document.querySelector('#settingsContent');
  if (!root) return;
  const account = accountSection(root);
  if (!account) return;
  normalizeAccountSection(account);
  removeLegacyAccountUi(root, account);
  const body = account.querySelector(':scope > .settings-category-body');
  if (!body) return;

  const info = await panelState();
  const signedIn = Boolean(session()?.user?.id);
  const reviewRequired = lastSyncState === 'deletion-confirmation-required'
    || info.state?.lastStatus === 'deletion-confirmation-required';
  const reviewDetail = lastDetail?.fingerprint ? lastDetail : info.state?.pendingDeletionDetail || {};
  const section = document.createElement('section');
  section.className = 'cloud-account-panel single-sync-account-panel';
  section.dataset.cloudAccountPanel = '1';
  section.dataset.singleSyncAccount = '1';
  section.innerHTML = signedIn
    ? `<div class="setting-row"><div><h3>服务器同步账户</h3><p data-cloud-status>${esc(info.main)}${info.email ? ` · ${esc(info.email)}` : ''}</p><small class="muted">上次完成：${esc(info.last)}${info.error ? ` · ${esc(info.error)}` : ''}</small></div></div>
      <p class="muted small">已登录。自动同步始终启用；数据先保存到本机，新变化约8秒后在后台增量同步，无需再次登录或另行设置。</p>
      ${reviewRequired ? `<div class="cloud-deletion-warning"><p class="status-bad">${esc(deletionSummary(reviewDetail))}</p><button class="button primary" type="button" data-cloud-deletion-review>处理云端删除确认</button></div>` : ''}
      <div class="text-actions data-actions"><button class="button subtle" type="button" data-cloud-logout>退出登录</button></div>`
    : `<div class="setting-row"><div><h3>服务器同步账户</h3><p data-cloud-status>${esc(STATUS_TEXT[lastAuthState] || STATUS_TEXT['signed-out'])}</p><small class="muted">本地功能无需登录</small></div></div>
      <p class="muted small">这是唯一的账户入口。登录后自动同步立即启用，不再需要服务器二次登录，也没有手动/自动同步或储存模式设置。</p>
      <div class="text-actions data-actions"><button class="button primary" type="button" data-cloud-login>登录服务器同步</button></div>`;

  body.replaceChildren(section);
  section.querySelector('[data-cloud-login]')?.addEventListener('click', () => globalThis.LuckyBeanCloudAuth?.openDialog?.('login'));
  section.querySelector('[data-cloud-logout]')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    await globalThis.LuckyBeanCloudAuth?.signOut?.();
    lastAutomaticUserId = '';
    queueRender();
  });
  section.querySelector('[data-cloud-deletion-review]')?.addEventListener('click', () => openDeletionDialog(reviewDetail));
  document.documentElement.dataset.cloudPanelCount = String(root.querySelectorAll('[data-cloud-account-panel]').length);
  if (signedIn) ensureAutomaticSync('render').catch(error => {
    lastDetail = { error: error?.message || String(error) };
    queueRender();
  });
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    renderPanel().catch(error => console.error('服务器同步账户面板渲染失败', error));
  });
}

function startReadinessRecovery() {
  clearInterval(readinessTimer);
  let attempts = 0;
  readinessTimer = setInterval(() => {
    attempts += 1;
    queueRender();
    const ready = Boolean(document.querySelector('[data-cloud-account-panel]')
      && globalThis.LuckyBeanCloudAuth
      && globalThis.LuckyBeanCloudSync);
    if (ready || attempts >= 40) clearInterval(readinessTimer);
  }, 250);
}

function bind() {
  const root = document.querySelector('#settingsContent');
  if (!root) return;
  if (root.dataset.singleSyncObserver !== '1') {
    root.dataset.singleSyncObserver = '1';
    new MutationObserver(records => {
      const externalChange = records.some(record => [...record.addedNodes, ...record.removedNodes]
        .some(node => node.nodeType === 1
          && !node.matches?.('[data-cloud-account-panel]')
          && !node.closest?.('[data-cloud-account-panel]')));
      if (externalChange) queueRender();
    }).observe(root, { childList: true, subtree: true });
  }
  queueRender();
  startReadinessRecovery();
}

document.addEventListener('luckybean:cloud-auth-state', event => {
  lastAuthState = event.detail?.state || lastAuthState;
  lastDetail = event.detail || {};
  if (lastAuthState === 'authenticated') {
    ensureAutomaticSync('authenticated').catch(error => {
      lastDetail = { error: error?.message || String(error) };
    }).finally(queueRender);
    return;
  }
  if (['signed-out', 'expired', 'reauth-required'].includes(lastAuthState)) lastAutomaticUserId = '';
  queueRender();
});

document.addEventListener('luckybean:cloud-login-success', () => {
  ensureAutomaticSync('login-success').catch(error => {
    lastDetail = { error: error?.message || String(error) };
  }).finally(queueRender);
});

document.addEventListener('luckybean:cloud-sync-state', event => {
  lastSyncState = event.detail?.state || lastSyncState;
  lastDetail = event.detail || {};
  queueRender();
  if (lastSyncState === 'deletion-confirmation-required') setTimeout(() => openDeletionDialog(lastDetail), 0);
});

document.addEventListener('luckybean:cloud-sync-service-ready', () => {
  startReadinessRecovery();
  queueRender();
});
document.addEventListener('luckybean:app-refreshed', queueRender);

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
else bind();

globalThis.LuckyBeanAccountSyncPanel = {
  revision: 'single-account-safe-delete-v2',
  renderNow: queueRender,
  openDeletionReview: openDeletionDialog
};
document.dispatchEvent(new CustomEvent('luckybean:cloud-account-panel-ready'));
