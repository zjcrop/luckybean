from pathlib import Path
import re

path = Path('src/v099f-cloud-sync.js')
text = path.read_text(encoding='utf-8')

text = text.replace(
    'async function uploadSync({ interactive = true } = {}) {',
    "async function uploadSync({ interactive = true, passwordOverride = '', forceReencrypt = false } = {}) {"
)
text = text.replace(
    '    let password = sessionPassphrase();\n    if (!password && interactive) password = await promptPassphrase();',
    "    let password = passwordOverride || sessionPassphrase();\n    if (!password && interactive) password = await promptPassphrase();"
)
text = text.replace(
    '    const existing = await remoteManifest(active.user.id);\n    const salt = existing?.kdf_salt ? b64ToBytes(existing.kdf_salt) : randomBytes(16);',
    "    const existing = await remoteManifest(active.user.id);\n    if (existing && existing.key_mode !== 'login-password-v1' && !forceReencrypt) {\n      throw new Error('检测到旧版独立密码云备份。请先执行“下载并合并”，使用旧密码一次完成迁移；系统不会覆盖旧备份。');\n    }\n    const salt = existing?.kdf_salt ? b64ToBytes(existing.kdf_salt) : randomBytes(16);"
)
text = text.replace(
    '      if (previous?.content_hash === contentHash) {',
    '      if (!forceReencrypt && previous?.content_hash === contentHash) {'
)
text = text.replace(
    "      kdf: 'PBKDF2-SHA256',\n      kdf_iterations:",
    "      kdf: 'PBKDF2-SHA256',\n      key_mode: 'login-password-v1',\n      kdf_iterations:"
)

download_pattern = r'''  async function downloadSync\(\{ interactive = true \} = \{\}\) \{.*?\n  \}\n\n  function syncPanelHtml'''
download_replacement = '''  async function downloadSync({ interactive = true } = {}) {
    const active = authSession();
    if (!active) throw new Error('请先登录并完成邮箱激活');
    const manifest = await remoteManifest(active.user.id);
    if (!manifest) throw new Error('云端没有可恢复的增量数据');

    const loginPassword = interactive
      ? await promptPassphrase('重新输入登录密码，以下载并合并旧记录。')
      : sessionPassphrase();
    if (!loginPassword) throw new Error('尚未验证登录密码');

    const legacy = manifest.key_mode !== 'login-password-v1';
    let decryptPassword = loginPassword;
    if (legacy) {
      const oldPassword = prompt('检测到旧版独立密码云备份。请输入原云端数据密码；仅本次迁移需要，成功后将统一改为登录密码。') || '';
      if (oldPassword.length < 8) throw new Error('旧版云端数据密码至少8位；为保护旧记录，本次未执行覆盖。');
      decryptPassword = oldPassword;
    }

    const key = await deriveMasterKey(decryptPassword, b64ToBytes(manifest.kdf_salt), Number(manifest.kdf_iterations || KDF_ITERATIONS));
    const chunks = manifest.chunks || [];
    const packets = [];
    try {
      for (const meta of chunks) {
        const rows = await request(`/rest/v1/luckybean_sync_chunks?user_id=eq.${encodeURIComponent(active.user.id)}&chunk_id=eq.${encodeURIComponent(meta.chunk_id)}&select=*`, { method: 'GET' });
        if (!rows?.[0]) throw new Error(`云端缺少分包 ${meta.chunk_id}`);
        packets.push(await decryptChunk(rows[0], key, active.user.id));
      }
    } catch (error) {
      throw new Error(`${legacy ? '旧版云端密码' : '登录密码'}无法解密备份：${error.message}`);
    }

    const restored = await restorePackets(packets);
    const downloadedAt = new Date().toISOString();
    await setSetting('cloud.sync.last.download.v2', { at: downloadedAt, packets: packets.length, restored, legacy });

    let migratedLegacy = false;
    if (legacy) {
      await uploadSync({ interactive: false, passwordOverride: loginPassword, forceReencrypt: true });
      migratedLegacy = true;
      await setSetting('cloud.sync.password.migration.v1', { at: new Date().toISOString(), from: 'legacy-passphrase', to: 'login-password-v1' });
    }
    return { packets: packets.length, restored, migratedLegacy };
  }

  function syncPanelHtml'''
updated, count = re.subn(download_pattern, download_replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'failed to replace downloadSync: {count}')
text = updated

text = text.replace(
    '数据始终先保存在本地。开启云端后，按豆卡和月份分包，编码去重、GZIP压缩并在本机AES-GCM加密后上传。自动同步仅在账号已登录且本次会话已验证时执行。',
    '数据始终先保存在本地。云端操作重新验证登录密码；旧版独立密码仅在首次迁移旧备份时输入一次。数据按豆卡和月份分包、压缩并在本机AES-GCM加密后上传。'
)

required = [
    "key_mode: 'login-password-v1'",
    'forceReencrypt = false',
    'migratedLegacy',
    '系统不会覆盖旧备份'
]
for marker in required:
    if marker not in text:
        raise SystemExit(f'missing cloud migration marker: {marker}')

path.write_text(text, encoding='utf-8')
