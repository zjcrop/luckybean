const SUPABASE_URL = 'https://vaxwncdcuvbpvdbbketb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MsB0RFoxxf5zJbbT9PPBjQ_WP7GBMMn';
const SESSION_KEY = 'luckybean.supabase.session.v099d';
const REMEMBER_UNTIL_KEY = 'luckybean.cloud.remember.until.v1';
const LAST_SERVER_ACTIVITY_KEY = 'luckybean.cloud.last.server.activity.v1';
const PENDING_REGISTRATION_KEY = 'luckybean.cloud.pending-registration.v1';
const REMEMBER_MS = 7 * 24 * 60 * 60 * 1000;
const PENDING_REGISTRATION_MS = 7 * 24 * 60 * 60 * 1000;
const CALLBACK_SESSION_GRACE_MS = 15000;
const SOURCE_APP = 'luckybean';

function parseAuthCallbackHash(hashValue) {
  const hash = String(hashValue || '').replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  if (!params.has('access_token') && !params.has('refresh_token') && !params.has('error') && !params.has('error_code')) return null;
  return new URLSearchParams(params.toString());
}

const INITIAL_AUTH_CALLBACK_PARAMS = parseAuthCallbackHash(location.hash);
let refreshPromise = null;
let authCallbackPromise = null;
let authCallbackConsumed = false;
let dialogBusy = false;
let volatileSession = null;
let callbackSessionAcceptedAt = 0;
const volatileStorage = new Map();

function storageGet(key) {
  if (volatileStorage.has(key)) return volatileStorage.get(key);
  try { return localStorage.getItem(key); }
  catch { return null; }
}
function storageSet(key, value) {
  volatileStorage.set(key, String(value));
  try { localStorage.setItem(key, String(value)); return true; }
  catch { document.documentElement.dataset.cloudStorage = 'volatile'; return false; }
}
function storageRemove(key) {
  volatileStorage.delete(key);
  try { localStorage.removeItem(key); return true; }
  catch { document.documentElement.dataset.cloudStorage = 'volatile'; return false; }
}
function readSession() {
  try {
    const stored = storageGet(SESSION_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* use volatile session */ }
  return volatileSession;
}
function writeSession(value) {
  volatileSession = value?.access_token || value?.refresh_token ? value : null;
  if (volatileSession) storageSet(SESSION_KEY, JSON.stringify(volatileSession));
  else storageRemove(SESSION_KEY);
}
function rememberUntil() { return Number(storageGet(REMEMBER_UNTIL_KEY) || 0); }
function markServerActivity() {
  const now = Date.now();
  storageSet(LAST_SERVER_ACTIVITY_KEY, String(now));
  storageSet(REMEMBER_UNTIL_KEY, String(now + REMEMBER_MS));
}
function rememberPendingRegistration(email) {
  storageSet(PENDING_REGISTRATION_KEY, JSON.stringify({ email:String(email || '').toLowerCase(), createdAt:Date.now() }));
}
function readPendingRegistration() {
  try {
    const value = JSON.parse(storageGet(PENDING_REGISTRATION_KEY) || 'null');
    if (!value?.email || Date.now() - Number(value.createdAt || 0) > PENDING_REGISTRATION_MS) { storageRemove(PENDING_REGISTRATION_KEY); return null; }
    return value;
  } catch { storageRemove(PENDING_REGISTRATION_KEY); return null; }
}
function clearPendingRegistration() { storageRemove(PENDING_REGISTRATION_KEY); }
function decodeJwtPayload(token) {
  try {
    const encoded = String(token || '').split('.')[1]; if (!encoded) return null;
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    return JSON.parse(decodeURIComponent([...atob(normalized)].map(char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')));
  } catch { return null; }
}
function accessTokenValid(active, skewSeconds = 60) { return Number(decodeJwtPayload(active?.access_token)?.exp || 0) > Math.floor(Date.now() / 1000) + skewSeconds; }
function emit(state, detail = {}) { document.documentElement.dataset.cloudAuth = state; document.dispatchEvent(new CustomEvent('luckybean:cloud-auth-state', { detail:{ state, ...detail } })); }
function messageFrom(payload, fallback) { return payload?.msg || payload?.message || payload?.error_description || payload?.error || fallback; }

function friendlyAuthMessage(error, mode = 'login') {
  const code = String(error?.payload?.error_code || error?.payload?.code || error?.code || '').toLowerCase();
  const raw = String(error?.message || '').toLowerCase();
  if (code === 'email_not_confirmed' || raw.includes('email not confirmed')) return '邮箱尚未验证。请先打开注册确认邮件完成验证，再返回此处登录。';
  if (code === 'invalid_credentials' || raw.includes('invalid login credentials')) return mode === 'login'
    ? '邮箱或密码不正确；如果刚完成注册，请先确认邮箱验证已经完成。'
    : '账号信息无效，请检查邮箱和密码后重试。';
  if (code === 'over_email_send_rate_limit' || Number(error?.status) === 429 || raw.includes('rate limit')) return '请求过于频繁。请不要重复点击验证或注册按钮，稍后再试。';
  if (code === 'otp_expired' || code === 'otp_disabled' || raw.includes('token not found') || raw.includes('invalid or has expired')) return '验证链接已经失效或已被使用。请使用最新一封验证邮件中的链接。';
  if (code === 'user_already_exists' || raw.includes('already registered') || raw.includes('already exists')) return '该邮箱已经注册，请直接登录；如果尚未完成邮箱验证，请先完成验证。';
  if (code === 'weak_password' || raw.includes('password should be') || raw.includes('weak password')) return '注册密码强度不足，请设置至少 8 位密码后重试。';
  if (code === 'network_timeout' || raw.includes('云端连接超时')) return '云端连接超时，请检查网络后重试。';
  if (raw.includes('failed to fetch') || raw.includes('networkerror')) return '当前无法连接云端，请检查网络后重试。';
  return error?.message || (mode === 'register' ? '注册失败' : '登录失败');
}

async function rawRequest(path, { method = 'POST', body, token, timeoutMs = 6000, headers = {} } = {}) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timeout = null;
  try {
    const request = fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers:{ apikey:SUPABASE_KEY, Accept:'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type':'application/json' } : {}), ...headers },
      body:body === undefined ? undefined : JSON.stringify(body), cache:'no-store', ...(controller ? { signal:controller.signal } : {})
    });
    let response;
    if (controller) {
      timeout = setTimeout(() => controller.abort(), timeoutMs);
      response = await request;
    } else {
      response = await Promise.race([request, new Promise((_, reject) => {
        timeout = setTimeout(() => { const e = new Error('云端连接超时'); e.code = 'NETWORK_TIMEOUT'; reject(e); }, timeoutMs);
      })]);
    }
    const text = await response.text(); let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
    if (!response.ok) { const error = new Error(messageFrom(payload, `云端请求失败（${response.status}）`)); error.status = response.status; error.payload = payload; throw error; }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') { const timeoutError = new Error('云端连接超时'); timeoutError.code = 'NETWORK_TIMEOUT'; throw timeoutError; }
    throw error;
  } finally { if (timeout) clearTimeout(timeout); }
}

function callbackParams() {
  if (!authCallbackConsumed && INITIAL_AUTH_CALLBACK_PARAMS) return new URLSearchParams(INITIAL_AUTH_CALLBACK_PARAMS.toString());
  return parseAuthCallbackHash(location.hash);
}
function clearAuthCallbackUrl() {
  try { history.replaceState(history.state, document.title, `${location.pathname}${location.search}`); }
  catch { try { location.hash = ''; } catch {} }
}
async function consumeAuthCallback() {
  if (authCallbackPromise) return authCallbackPromise;
  if (authCallbackConsumed) {
    const active = readSession();
    return callbackSessionAcceptedAt && Date.now() - callbackSessionAcceptedAt < CALLBACK_SESSION_GRACE_MS && active?.refresh_token ? active : null;
  }
  const params = callbackParams();
  if (!params) { authCallbackConsumed = true; return null; }

  authCallbackPromise = (async () => {
    const callbackError = params.get('error_description') || params.get('error') || params.get('error_code');
    if (callbackError) {
      authCallbackConsumed = true;
      clearAuthCallbackUrl();
      const error = new Error(callbackError);
      error.code = params.get('error_code') || params.get('error') || 'auth_callback_error';
      emit('reauth-required', { error:friendlyAuthMessage(error, 'login'), authAction:'email-callback' });
      return null;
    }
    const accessToken = params.get('access_token') || '';
    const refreshToken = params.get('refresh_token') || '';
    if (!accessToken || !refreshToken) { authCallbackConsumed = true; return null; }
    const expiresIn = Number(params.get('expires_in') || 3600);
    const provisional = {
      access_token:accessToken,
      refresh_token:refreshToken,
      token_type:params.get('token_type') || 'bearer',
      expires_in:expiresIn,
      expires_at:Math.floor(Date.now() / 1000) + Math.max(60, expiresIn),
      user:null
    };

    // Accept the callback atomically before any profile/network work. On Safari and weak
    // networks, /auth/v1/user must never decide whether the freshly-issued session exists.
    writeSession(provisional);
    markServerActivity();
    callbackSessionAcceptedAt = Date.now();
    authCallbackConsumed = true;
    clearAuthCallbackUrl();
    emit('authenticated', { user:null, login:true, authAction:'email-callback', profilePending:true });

    let user = null;
    try { user = await rawRequest('/auth/v1/user', { method:'GET', token:accessToken, timeoutMs:3000 }); } catch { user = null; }
    const payload = { ...provisional, user };
    writeSession(payload);
    markServerActivity();

    const pending = readPendingRegistration();
    const email = String(user?.email || pending?.email || '').toLowerCase();
    const completedRegistration = Boolean(pending?.email && (!email || pending.email === email));
    emit('authenticated', { user, login:true, authAction:completedRegistration ? 'register-verification' : 'email-callback', profilePending:false });
    globalThis.LuckyBeanCloudSync?.ensureAutomatic?.('email-callback-success');
    if (completedRegistration) dispatchRegisterSuccess(payload, email || pending.email, true);
    dispatchLoginSuccess(payload, completedRegistration ? 'register-verification' : 'email-callback');
    return payload;
  })();

  try { return await authCallbackPromise; }
  finally { authCallbackPromise = null; }
}

async function refreshSession({ force = false, reason = 'background' } = {}) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    let active = readSession();
    if (!active?.refresh_token) { emit('signed-out'); return null; }
    if (rememberUntil() && Date.now() > rememberUntil()) { writeSession(null); emit('expired', { reason:'seven-day-inactivity' }); return null; }
    if (!navigator.onLine) { emit('offline', { session:active }); return accessTokenValid(active, 0) ? active : null; }
    if (!force && accessTokenValid(active)) { emit('authenticated', { user:active.user, cached:true }); return active; }
    emit('connecting', { reason });
    try {
      const payload = await rawRequest('/auth/v1/token?grant_type=refresh_token', { body:{ refresh_token:active.refresh_token }, timeoutMs:5000 });
      if (!payload?.access_token || !payload?.refresh_token) throw Object.assign(new Error('云端刷新会话返回无效'), { code:'invalid_refresh_payload' });
      active = { ...payload, user:payload?.user || active.user || null }; writeSession(active); markServerActivity(); emit('authenticated', { user:active.user, refreshed:true }); return active;
    } catch (error) {
      if ([400,401,403].includes(Number(error.status))) { writeSession(null); emit('reauth-required', { error:friendlyAuthMessage(error, 'login') }); return null; }
      emit('offline', { error:friendlyAuthMessage(error, 'login'), session:active });
      return active?.refresh_token ? active : null;
    }
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function getAccessToken({ forceRefresh = false } = {}) {
  const active = readSession(); if (!forceRefresh && accessTokenValid(active)) return active.access_token;
  const refreshed = await refreshSession({ force:true, reason:'api-request' }); return refreshed?.access_token || '';
}
async function apiRequest(path, options = {}) {
  const run = async forceRefresh => { const token = await getAccessToken({ forceRefresh }); if (!token) throw new Error('请先登录云端账号'); return rawRequest(path, { ...options, token }); };
  try { return await run(false); } catch (error) { if (Number(error.status) !== 401) throw error; return run(true); }
}
function esc(value) { return String(value ?? '').replace(/[&<>'\"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }
function overlayRoot() { return document.querySelector('#overlayRoot'); }
function closeDialog() { const root = overlayRoot(); if (root) root.innerHTML = ''; }
function values() { return { nickname:document.querySelector('#cloudAuthNickname')?.value?.trim() || '', email:document.querySelector('#cloudAuthEmail')?.value?.trim().toLowerCase() || '', password:document.querySelector('#cloudAuthPassword')?.value || '', confirm:document.querySelector('#cloudAuthConfirm')?.value || '' }; }
function setDialogMessage(message) { const node = document.querySelector('[data-cloud-auth-message]'); if (node) node.textContent = message; }

function openDialog(mode = 'login', notice = '', preset = {}) {
  const root = overlayRoot(); if (!root) return;
  const register = mode === 'register';
  const passwordRules = register ? ' minlength="8" placeholder="至少8位"' : ' placeholder="输入账户密码"';
  root.innerHTML = `<div class="overlay" data-overlay="cloud-auth"><div class="dialog v099d-auth-dialog"><div class="dialog-header"><div><h2>${register ? '注册云端账号' : '登录云端账号'}</h2><p>这是唯一的服务器同步账号。登录后自动同步立即启用，无需在其他位置再次登录或设置同步方式。密码不会保存在设备中。</p></div><button class="close-button" type="button" data-cloud-auth-close>×</button></div>${register ? `<label class="field"><span>昵称</span><input id="cloudAuthNickname" class="control" maxlength="24" autocomplete="nickname" value="${esc(preset.nickname || '')}"></label>` : ''}<label class="field"><span>邮箱</span><input id="cloudAuthEmail" class="control" type="email" autocomplete="email" value="${esc(preset.email || '')}" placeholder="name@example.com"></label><label class="field"><span>密码</span><input id="cloudAuthPassword" class="control" type="password"${passwordRules} autocomplete="${register ? 'new-password' : 'current-password'}"></label>${register ? '<label class="field"><span>确认密码</span><input id="cloudAuthConfirm" class="control" type="password" minlength="8" autocomplete="new-password"></label>' : ''}<p class="muted small" data-cloud-auth-message role="status">${esc(notice)}</p><div class="v099d-auth-actions"><button class="button subtle" type="button" data-cloud-auth-switch="${register ? 'login' : 'register'}">${register ? '已有账号' : '注册账号'}</button><button class="button primary" type="button" data-cloud-auth-submit="${mode}">${register ? '注册' : '登录'}</button></div></div></div>`;
  root.querySelector('[data-cloud-auth-close]')?.addEventListener('click', closeDialog);
  root.querySelector('[data-cloud-auth-switch]')?.addEventListener('click', event => openDialog(event.currentTarget.dataset.cloudAuthSwitch, '', values()));
  root.querySelector('[data-cloud-auth-submit]')?.addEventListener('click', () => submit(mode));
  root.querySelector('[data-overlay="cloud-auth"]')?.addEventListener('click', event => { if (event.target.matches('[data-overlay="cloud-auth"]')) closeDialog(); });
  root.querySelectorAll('input').forEach(input => input.addEventListener('keydown', event => { if (event.key === 'Enter') submit(mode); }));
}

function dispatchLoginSuccess(payload, authAction) { document.dispatchEvent(new CustomEvent('luckybean:cloud-login-success', { detail:{ user:payload?.user || null, authAction } })); }
function dispatchRegisterSuccess(payload, email, verificationCompleted = false) {
  clearPendingRegistration();
  document.dispatchEvent(new CustomEvent('luckybean:cloud-register-success', { detail:{ user:payload?.user || null, email, verificationCompleted } }));
}

async function submit(mode) {
  if (dialogBusy) return;
  const input = values();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return setDialogMessage('邮箱格式无效');
  if (!input.password) return setDialogMessage('请输入密码');
  if (mode === 'register' && input.password.length < 8) return setDialogMessage('注册密码至少需要8位');
  if (mode === 'register' && input.password !== input.confirm) return setDialogMessage('两次输入的密码不一致');
  dialogBusy = true;
  const button = document.querySelector('[data-cloud-auth-submit]');
  if (button) { button.disabled = true; button.textContent = mode === 'register' ? '注册中…' : '登录中…'; }
  try {
    if (mode === 'register') {
      const redirect = `${location.origin}${location.pathname}`;
      const payload = await rawRequest(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirect)}`, { body:{ email:input.email, password:input.password, data:{ nickname:input.nickname || input.email.split('@')[0], source_app:SOURCE_APP } }, timeoutMs:10000 });
      if (!payload?.access_token) {
        rememberPendingRegistration(input.email);
        document.dispatchEvent(new CustomEvent('luckybean:cloud-registration-pending', { detail:{ email:input.email } }));
        openDialog('login', '验证邮件已发送。未完成邮箱验证前无法登录；请打开最新一封确认邮件完成验证后再登录。', { email:input.email });
        return;
      }
      writeSession(payload); markServerActivity(); emit('authenticated', { user:payload.user, login:true, authAction:'register' }); closeDialog();
      globalThis.LuckyBeanCloudSync?.ensureAutomatic?.('register-success');
      dispatchRegisterSuccess(payload, input.email, false); dispatchLoginSuccess(payload, 'register');
      return;
    }
    const payload = await rawRequest('/auth/v1/token?grant_type=password', { body:{ email:input.email, password:input.password }, timeoutMs:10000 });
    writeSession(payload); markServerActivity();
    const pending = readPendingRegistration();
    const completedRegistration = Boolean(pending?.email && pending.email === input.email);
    emit('authenticated', { user:payload.user, login:true, authAction:completedRegistration ? 'register-verification' : 'login' }); closeDialog();
    globalThis.LuckyBeanCloudSync?.ensureAutomatic?.(completedRegistration ? 'register-verification-success' : 'login-success');
    if (completedRegistration) dispatchRegisterSuccess(payload, input.email, true);
    dispatchLoginSuccess(payload, completedRegistration ? 'register-verification' : 'login');
  } catch (error) { setDialogMessage(friendlyAuthMessage(error, mode)); }
  finally {
    dialogBusy = false;
    const current = document.querySelector('[data-cloud-auth-submit]');
    if (current) { current.disabled = false; current.textContent = mode === 'register' ? '注册' : '登录'; }
  }
}

async function signOut() {
  const active = readSession();
  if (active?.access_token) await rawRequest('/auth/v1/logout', { token:active.access_token, timeoutMs:3500 }).catch(() => {});
  callbackSessionAcceptedAt = 0;
  writeSession(null); storageRemove(REMEMBER_UNTIL_KEY); emit('signed-out');
}
async function warmSession() {
  const callback = await consumeAuthCallback();
  if (callback?.refresh_token) return callback;
  const active = readSession();
  if (!active?.refresh_token) { emit('signed-out'); return null; }
  if (callbackSessionAcceptedAt && Date.now() - callbackSessionAcceptedAt < CALLBACK_SESSION_GRACE_MS) {
    emit('authenticated', { user:active.user, cached:true, authAction:'email-callback' });
    return active;
  }
  return refreshSession({ force:true, reason:'startup' });
}

globalThis.LuckyBeanCloudAuth = {
  revision:'cloud-auth-service-v7-immediate-atomic-callback', getSession:readSession, warmSession, refreshSession, getAccessToken, apiRequest, openDialog, signOut, consumeAuthCallback,
  isRemembered:() => Boolean(readSession()?.refresh_token && Date.now() <= rememberUntil()), rememberUntil,
  pendingRegistration:readPendingRegistration
};
// Start callback consumption immediately. The async function accepts and stores callback tokens
// synchronously before its first network await, which avoids WebKit/Safari microtask timing races.
void warmSession().catch(error => emit('offline', { error:friendlyAuthMessage(error, 'login') }));