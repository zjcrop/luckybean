import { downloadBlob, esc } from '../utils.js';
import { createRecoveryBackup, verifyRecoveryBackup, recoveryDiagnostics } from '../domain/archive/recovery-snapshot-service.js';
import { MAX_RECOVERY_BYTES } from '../domain/archive/recovery-snapshot-codec.js';

export function openRecoveryBackupDialog({ showOverlay, dialogHeader, bindClose }) {
  const overlay = showOverlay(`${dialogHeader('安全备份与恢复演练', '先验证备份，再进行架构升级')}
    <p>保存本机原始数据、豆袋照片、外观与语音偏好，以及私密记录恢复所需密钥。文件使用口令加密，请单独保存口令；遗失后无法找回。</p>
    <p>操作前请暂停编辑与同步，关闭其他富贵盒子页面。登录会话、未保存的识别图片和缓存不在备份范围内。</p>
    <label class="field"><span>备份口令（至少 12 个字符）</span><input data-recovery-password class="control" type="password" autocomplete="new-password" minlength="12" maxlength="1024"></label>
    <label class="field"><span>再次输入口令（创建备份时填写）</span><input data-recovery-confirm class="control" type="password" autocomplete="new-password" maxlength="1024"></label>
    <div class="text-actions"><button type="button" class="button" data-recovery-create>创建加密备份</button><button type="button" class="button" data-recovery-select>选择已保存备份并演练</button><button type="button" class="button" data-recovery-report>导出诊断记录</button></div>
    <input type="file" data-recovery-file accept=".lbsecure,application/json" hidden>
    <p class="muted small">演练只写入独立临时数据库，不覆盖当前数据，也不切换存储或引擎。演练通过不等于实体设备升级验收通过。</p>
    <p data-recovery-status role="status" aria-live="polite"></p><div data-recovery-result></div>`);
  bindClose(overlay);
  const find = selector => overlay.querySelector(selector);
  let busy = false;
  const status = text => { find('[data-recovery-status]').textContent = text; };
  const render = report => {
    const rows = Object.entries(report.manifest || {}).map(([name, value]) => `<tr><td>${esc(name)}</td><td>${value.count}</td><td>一致</td></tr>`).join('');
    find('[data-recovery-result]').innerHTML = `<p>逐表数量与 SHA-256 校验通过；私密品鉴 ${report.privateRecords.sensory} 条、身份记录 ${report.privateRecords.identity} 条可解密。</p><details><summary>查看校验清单</summary><table><thead><tr><th>范围</th><th>数量</th><th>校验</th></tr></thead><tbody>${rows}</tbody></table></details>`;
  };
  async function run(action) {
    if (busy) return;
    busy = true;
    overlay.querySelectorAll('button, input').forEach(node => { node.disabled = true; });
    find('[data-recovery-result]').replaceChildren();
    status('正在本机加密或验证，请保持此窗口打开…');
    try { await action(); }
    catch (error) { status(`未通过：${error.message}。可导出诊断记录；当前数据未被覆盖。`); }
    finally {
      find('[data-recovery-password]').value = '';
      find('[data-recovery-confirm]').value = '';
      overlay.querySelectorAll('button, input').forEach(node => { node.disabled = false; });
      busy = false;
    }
  }
  find('[data-recovery-create]').addEventListener('click', () => run(async () => {
    const password = find('[data-recovery-password]').value;
    if (password !== find('[data-recovery-confirm]').value) throw new Error('两次口令不一致');
    const { envelope, report } = await createRecoveryBackup(password);
    downloadBlob(`LuckyBean-recovery-${Date.now()}.lbsecure`, JSON.stringify(envelope), 'application/json');
    render(report);
    status('内存演练通过，已请求保存文件。请确认文件实际保存，然后重新输入口令，选择该文件完成读回验证。');
  }));
  find('[data-recovery-select]').addEventListener('click', () => find('[data-recovery-file]').click());
  find('[data-recovery-file]').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file) return;
    run(async () => {
      if (file.size > Math.ceil(MAX_RECOVERY_BYTES * 1.4) + 2048) throw new Error('加密备份文件超过大小限制');
      const report = await verifyRecoveryBackup(await file.text(), find('[data-recovery-password]').value);
      render(report);
      status('已保存文件读回、解密及隔离恢复演练通过。实机升级验收仍待完成。');
    }).finally(() => { event.target.value = ''; });
  });
  find('[data-recovery-report]').addEventListener('click', () => {
    downloadBlob(`LuckyBean-recovery-diagnostics-${Date.now()}.json`, JSON.stringify(recoveryDiagnostics(), null, 2), 'application/json');
    status('已请求保存诊断记录，其中不包含数据正文、照片、口令或密钥。');
  });
}
