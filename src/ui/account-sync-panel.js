const STATUS_TEXT = {
  authenticated: '服务器同步账户已登录',
  connecting: '正在连接服务器…',
  offline: '网络不可用，本地功能正常',
  'signed-out': '尚未登录服务器同步账户',
  expired: '登录已超过7天，请重新登录',
  'reauth-required': '服务器登录已失效，请重新登录',
  syncing: '正在后台自动同步…',
  downloading: '正在自动读取服务器数据…',
  synced: '自动同步已完成',
  downloaded: '服务器数据已自动恢复',
  idle: '服务器数据已是最新',
  error: '自动同步失败，稍后将重试',
  conflict: '检测到多设备冲突，已停止自动覆盖',
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

function esc(value) {
  return String(value ?? '').replace(/[&<>'\"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function session() {
  return globalThis.LuckyBeanCloudAuth?.getSession?.() || null;
}

async function panelState() {
  const promise = globalThis.LuckyBeanCloudSync?.getState?.();
  const state = promise ? await promise.catch(() => null) : null;
  const email = session()?.user?.email || '';
  const main = STATUS_TEXT[lastSyncState] || STATUS_TEXT[lastAuthState] || '本地优先运行';
  const last = state?.lastSuccessfulSyncAt
    ? new Date(state.lastSuccessfulSyncAt).toLocaleString('zh-CN')
    : '尚未完成同步';
  return { email, main, last, error: lastDetail.error || lastDetail.message || '' };
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
  if (summary) summary.innerHTML = '<span>云端同步</span><small>唯一的服务器登录与自动同步入口</small>';
}

function removeLegacyAccountUi(root, account) {
  root.querySelectorAll(LEGACY_CONTROL_SELECTOR).forEach(node => node.remove());

  const accountCategories = [...root.querySelectorAll('.settings-category')]
    .filter(section => section === account
      || section.dataset.settingsKey === 'account'
      || ACCOUNT_HEADING.test(headingText(section))
      || /账号|账户|个人信息与云端储存|个人信息与云端存储|服务器同步/.test(headingText(section)));

  accountCategories.forEach(section => {
    if (section !== account) section.remove();
  });

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
  const section = document.createElement('section');
  section.className = 'cloud-account-panel single-sync-account-panel';
  section.dataset.cloudAccountPanel = '1';
  section.dataset.singleSyncAccount = '1';
  section.innerHTML = signedIn
    ? `<div class="setting-row"><div><h3>服务器同步账户</h3><p data-cloud-status>${esc(info.main)}${info.email ? ` · ${esc(info.email)}` : ''}</p><small class="muted">上次完成：${esc(info.last)}${info.error ? ` · ${esc(info.error)}` : ''}</small></div></div>
      <p class="muted small">已登录。自动同步始终启用；数据先保存到本机，新变化约8秒后在后台增量同步，无需再次登录或另行设置。</p>
      <div class="text-actions data-actions"><button class="button subtle" type="button" data-cloud-logout>退出登录</button></div>`
    : `<div class="setting-row"><div><h3>服务器同步账户</h3><p data-cloud-status>${esc(STATUS_TEXT[lastAuthState] || STATUS_TEXT['signed-out'])}</p><small class="muted">本地功能无需登录</small></div></div>
      <p class="muted small">这是唯一的账户入口。登录后自动同步立即启用，不再需要服务器二次登录，也没有手动/自动同步或储存模式设置。</p>
      <div class="text-actions data-actions"><button class="button primary" type="button" data-cloud-login>登录服务器同步</button></div>`;

  body.replaceChildren(section);
  section.querySelector('[data-cloud-login]')?.addEventListener('click', () => {
    globalThis.LuckyBeanCloudAuth?.openDialog?.('login');
  });
  section.querySelector('[data-cloud-logout]')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    await globalThis.LuckyBeanCloudAuth?.signOut?.();
    lastAutomaticUserId = '';
    queueRender();
  });

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
});

document.addEventListener('luckybean:app-refreshed', queueRender);

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
else bind();
