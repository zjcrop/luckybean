const STATUS_TEXT = {
  authenticated: '云端已连接', connecting: '正在连接云端…', offline: '网络不可用，本地功能正常',
  'signed-out': '未登录云端', expired: '登录已超过7天，请重新登录', 'reauth-required': '云端登录已失效',
  syncing: '正在后台同步…', downloading: '正在读取云端数据…', synced: '云端同步完成', downloaded: '云端数据已恢复',
  idle: '云端数据已是最新', error: '云端同步失败，稍后重试', conflict: '检测到多设备冲突，已停止自动覆盖',
  disabled: '自动同步已关闭', 'waiting-for-login': '登录后自动同步', 'legacy-encrypted': '检测到旧版加密云端数据'
};

let lastAuthState = document.documentElement.dataset.cloudAuth || 'signed-out';
let lastSyncState = document.documentElement.dataset.cloudSync || 'idle';
let lastDetail = {};
let renderQueued = false;

function session() { return globalThis.LuckyBeanCloudAuth?.getSession?.() || null; }

async function panelState() {
  const promise = globalThis.LuckyBeanCloudSync?.getState?.();
  const state = promise ? await promise.catch(() => null) : null;
  const email = session()?.user?.email || '';
  const main = STATUS_TEXT[lastSyncState] || STATUS_TEXT[lastAuthState] || '本地优先运行';
  const last = state?.lastSuccessfulSyncAt ? new Date(state.lastSuccessfulSyncAt).toLocaleString('zh-CN') : '尚未同步';
  const enabledPromise = globalThis.LuckyBeanCloudSync?.enabled?.();
  const enabled = enabledPromise ? await enabledPromise.catch(() => true) : true;
  return { email, main, last, enabled, error: lastDetail.error || lastDetail.message || '' };
}

function accountSection() {
  return document.querySelector('#settingsContent [data-settings-key="account"]')
    || [...document.querySelectorAll('#settingsContent .settings-category')]
      .find(section => /云端|账户|账号/.test(section.querySelector('summary')?.textContent || ''));
}

async function renderPanel() {
  const root = document.querySelector('#settingsContent');
  const account = accountSection();
  if (!root || !account) return;
  root.querySelectorAll('[data-cloud-account-panel],[data-v099p-cloud-panel],[data-v099e-cloud-panel],[data-v099f-account-sync]').forEach(node => node.remove());
  const body = account.querySelector(':scope > .settings-category-body');
  if (!body) return;
  const info = await panelState();
  const signedIn = Boolean(session()?.user?.id);
  const section = document.createElement('section');
  section.className = 'cloud-account-panel';
  section.dataset.cloudAccountPanel = '1';
  section.innerHTML = `<div class="setting-row"><div><h3>云端同步</h3><p data-cloud-status>${info.main}${info.email ? ` · ${info.email}` : ''}</p><small class="muted">上次完成：${info.last}${info.error ? ` · ${info.error}` : ''}</small></div><label class="toggle"><input type="checkbox" data-cloud-sync-toggle ${info.enabled ? 'checked' : ''}>自动同步</label></div>
    <p class="muted small">本地功能无需登录。数据先写入本机；登录云端后，新变化等待约8秒批量增量同步。启动和使用不等待服务器。</p>
    <div class="text-actions data-actions">
      ${signedIn ? '<button class="button" type="button" data-cloud-sync-now>立即同步</button><button class="button" type="button" data-cloud-pull>从云端恢复</button><button class="button subtle" type="button" data-cloud-logout>退出云端</button>' : '<button class="button primary" type="button" data-cloud-login>登录云端</button><button class="button" type="button" data-cloud-register>注册云端</button>'}
    </div>`;
  body.replaceChildren(section);
  section.querySelector('[data-cloud-login]')?.addEventListener('click', () => globalThis.LuckyBeanCloudAuth?.openDialog?.('login'));
  section.querySelector('[data-cloud-register]')?.addEventListener('click', () => globalThis.LuckyBeanCloudAuth?.openDialog?.('register'));
  section.querySelector('[data-cloud-logout]')?.addEventListener('click', async () => { await globalThis.LuckyBeanCloudAuth?.signOut?.(); queueRender(); });
  section.querySelector('[data-cloud-sync-now]')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try { await globalThis.LuckyBeanCloudSync?.syncNow?.(); }
    catch (error) { lastDetail = { error: error.message }; }
    finally { queueRender(); }
  });
  section.querySelector('[data-cloud-pull]')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try { await globalThis.LuckyBeanCloudSync?.pullNow?.(); }
    catch (error) { lastDetail = { error: error.message }; }
    finally { queueRender(); }
  });
  section.querySelector('[data-cloud-sync-toggle]')?.addEventListener('change', event => globalThis.LuckyBeanCloudSync?.setEnabled?.(event.target.checked));
  document.documentElement.dataset.cloudPanelCount = String(root.querySelectorAll('[data-cloud-account-panel]').length);
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    renderPanel().catch(error => console.error('云端同步面板渲染失败', error));
  });
}

function bind() {
  const root = document.querySelector('#settingsContent');
  if (!root) return;
  if (root.dataset.cloudPanelObserver !== '1') {
    root.dataset.cloudPanelObserver = '1';
    new MutationObserver(records => {
      const externalChange = records.some(record => [...record.addedNodes, ...record.removedNodes]
        .some(node => node.nodeType === 1 && !node.matches?.('[data-cloud-account-panel]')));
      if (externalChange) queueRender();
    }).observe(root, { childList: true, subtree: true });
  }
  queueRender();
}

document.addEventListener('luckybean:cloud-auth-state', event => {
  lastAuthState = event.detail?.state || lastAuthState;
  lastDetail = event.detail || {};
  queueRender();
});
document.addEventListener('luckybean:cloud-sync-state', event => {
  lastSyncState = event.detail?.state || lastSyncState;
  lastDetail = event.detail || {};
  queueRender();
});
document.addEventListener('luckybean:app-refreshed', queueRender);

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
else bind();
