import { all, bulkPut, getSetting, setSetting } from './db.js';

const SUPABASE_URL = 'https://vaxwncdcuvbpvdbbketb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MsB0RFoxxf5zJbbT9PPBjQ_WP7GBMMn';
const SESSION_KEY = 'luckybean.supabase.session.v099d';
const PREF_KEY = 'storage.cloud.preference.v1';
const DEVICE_KEY = 'cloud.device.id.v1';
const STORES = ['beans', 'brewSessions', 'sensoryRecords', 'inventoryEvents', 'customCodes'];
const enc = new TextEncoder();
const dec = new TextDecoder();
let busy = false;

const $ = (s, r = document) => r.querySelector(s);
const bytesToB64 = bytes => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};
const b64ToBytes = value => Uint8Array.from(atob(String(value || '')), ch => ch.charCodeAt(0));
const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
const toast = message => {
  const node = $('#toast');
  if (!node) return alert(message);
  node.textContent = message;
  node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 2600);
};

function session() {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!value?.access_token || !value?.user?.id) return null;
    return value;
  } catch { return null; }
}

async function deviceId() {
  let id = await getSetting(DEVICE_KEY, '');
  if (!id) {
    id = crypto.randomUUID();
    await setSetting(DEVICE_KEY, id);
  }
  return id;
}

async function gzip(bytes) {
  if (!globalThis.CompressionStream) return { bytes, algorithm: 'none' };
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), algorithm: 'gzip' };
}

async function gunzip(bytes, algorithm) {
  if (algorithm !== 'gzip') return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deriveKey(password, salt, iterations = 150000) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function sha256(bytes) {
  return bytesToB64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

async function codedPayload() {
  const data = Object.fromEntries(await Promise.all(STORES.map(async store => [store, await all(store)])));
  const counts = Object.fromEntries(STORES.map(store => [store, data[store].length]));
  return {
    format: 'luckybean-coded-data-v1',
    exportedAt: new Date().toISOString(),
    codebookVersion: String((await getSetting('codebook.version', '6')) || '6'),
    records: data,
    counts
  };
}

async function seal(password) {
  const payload = await codedPayload();
  const plain = enc.encode(JSON.stringify(payload));
  const packed = await gzip(plain);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, packed.bytes));
  return {
    payload,
    envelope: {
      format: 'luckybean-vault-v1', schema_version: 1, codebook_version: payload.codebookVersion,
      compression: packed.algorithm, cipher: 'AES-GCM-256', kdf: 'PBKDF2-SHA256', kdf_iterations: 150000,
      salt: bytesToB64(salt), iv: bytesToB64(iv), payload: bytesToB64(cipher), content_hash: await sha256(plain),
      source_device_id: await deviceId(), item_counts: payload.counts, plain_bytes: plain.byteLength,
      compressed_bytes: packed.bytes.byteLength, cipher_bytes: cipher.byteLength, client_updated_at: payload.exportedAt
    }
  };
}

async function openEnvelope(row, password) {
  const key = await deriveKey(password, b64ToBytes(row.salt), Number(row.kdf_iterations || 150000));
  const packed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(row.iv) }, key, b64ToBytes(row.payload)));
  const plain = await gunzip(packed, row.compression);
  if (await sha256(plain) !== row.content_hash) throw new Error('云端数据完整性校验失败');
  const data = JSON.parse(dec.decode(plain));
  if (data?.format !== 'luckybean-coded-data-v1') throw new Error('云端数据格式不兼容');
  return data;
}

async function request(path, options = {}) {
  const active = session();
  if (!active) throw new Error('请先登录并完成邮箱激活');
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${active.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(options.headers || {}) }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.message || body?.error_description || `云端请求失败 HTTP ${response.status}`);
  return body;
}

async function upload() {
  const active = session();
  if (!active) throw new Error('云端储存必须先登录并激活账号');
  const password = prompt('设置或输入云端数据密码（至少8位）。该密码不上传服务器，遗失后无法解密。');
  if (!password || password.length < 8) throw new Error('云端数据密码至少8位');
  const { envelope } = await seal(password);
  const body = { user_id: active.user.id, ...envelope, uploaded_at: new Date().toISOString() };
  const result = await request('/rest/v1/luckybean_cloud_vaults?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(body) });
  await setSetting(PREF_KEY, 'cloud');
  await setSetting('cloud.last.upload', result?.[0]?.uploaded_at || body.uploaded_at);
  return envelope;
}

async function download() {
  const active = session();
  if (!active) throw new Error('请先登录并激活账号');
  const rows = await request(`/rest/v1/luckybean_cloud_vaults?user_id=eq.${encodeURIComponent(active.user.id)}&select=*`, { method: 'GET' });
  const row = rows?.[0];
  if (!row) throw new Error('云端没有可恢复的数据');
  const password = prompt('输入云端数据密码以解密恢复');
  if (!password) throw new Error('未输入云端数据密码');
  const data = await openEnvelope(row, password);
  for (const store of STORES) if (Array.isArray(data.records?.[store]) && data.records[store].length) await bulkPut(store, data.records[store]);
  await setSetting(PREF_KEY, 'cloud');
  await setSetting('cloud.last.download', new Date().toISOString());
  location.reload();
}

function panelHtml(pref, active) {
  return `<section class="settings-category v099e-cloud-panel" data-v099e-cloud-panel>
    <button class="settings-category-header" type="button"><span><strong>账号与数据储存</strong><small>本地优先；云端仅保存压缩密文</small></span></button>
    <div class="settings-category-body">
      <div class="v099e-storage-choice">
        <label><input type="radio" name="v099eStorage" value="local" ${pref !== 'cloud' ? 'checked' : ''}> 本地储存</label>
        <label><input type="radio" name="v099eStorage" value="cloud" ${pref === 'cloud' ? 'checked' : ''}> 云端储存</label>
      </div>
      <p class="muted small">本地模式仅通过网络验证账号，豆卡、冲煮和品鉴数据留在本机。云端模式必须登录并激活后手动上传；不会自动覆盖本地数据。</p>
      <p class="small">账号状态：<strong>${active ? `已登录 ${active.user.email || ''}` : '未登录'}</strong></p>
      <div class="v099e-cloud-actions">
        <button class="button primary" type="button" data-cloud-upload ${active ? '' : 'disabled'}>上传云端</button>
        <button class="button" type="button" data-cloud-download ${active ? '' : 'disabled'}>从云端恢复</button>
      </div>
      <output data-cloud-status class="muted small"></output>
    </div>
  </section>`;
}

async function injectPanel() {
  const root = $('#settingsContent');
  if (!root || $('[data-v099e-cloud-panel]', root)) return;
  const pref = await getSetting(PREF_KEY, 'local');
  root.insertAdjacentHTML('afterbegin', panelHtml(pref, session()));
  $$('input[name="v099eStorage"]', root).forEach(input => input.addEventListener('change', async event => {
    if (event.target.value === 'cloud' && !session()) {
      event.preventDefault();
      root.querySelector('input[value="local"]').checked = true;
      toast('云端储存必须先登录并激活账号');
      return;
    }
    await setSetting(PREF_KEY, event.target.value);
  }));
  const run = async action => {
    if (busy) return;
    busy = true;
    const status = $('[data-cloud-status]', root);
    try {
      status.textContent = action === upload ? '正在编码、压缩和加密…' : '正在下载并解密…';
      const result = await action();
      if (action === upload) status.textContent = `上传完成：明文 ${result.plain_bytes} B，压缩 ${result.compressed_bytes} B，密文 ${result.cipher_bytes} B`;
    } catch (error) {
      status.textContent = error.message;
      toast(error.message);
    } finally { busy = false; }
  };
  $('[data-cloud-upload]', root)?.addEventListener('click', () => run(upload));
  $('[data-cloud-download]', root)?.addEventListener('click', () => run(download));
}

const observer = new MutationObserver(injectPanel);
observer.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('click', event => {
  if (event.target.closest?.('[data-page-target="settings"]')) setTimeout(injectPanel, 80);
});
setTimeout(injectPanel, 600);

globalThis.LuckyBeanCloudSync = { upload, download, seal, openEnvelope };
