import { all } from '../src/db.js';
import { nativeStorageAvailable } from '../src/core-v2/platform/native-storage.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));

function beanName(bean) {
  return String(bean?.name || bean?.label || bean?.entityName || '未命名咖啡豆');
}

function qrPayload(bean) {
  return JSON.stringify({
    schemaVersion: 3,
    name: beanName(bean),
    countryCode: bean.countryCode || '',
    regionCode: bean.regionCode || '',
    entityCode: bean.entityCode || '',
    varietyCode: bean.varietyCode || bean.varietyCodes?.[0] || '',
    varietyCodes: bean.varietyCodes || (bean.varietyCode ? [bean.varietyCode] : []),
    processCode: bean.processCode || bean.processCodes?.[0] || '',
    processCodes: bean.processCodes || (bean.processCode ? [bean.processCode] : []),
    roastCode: bean.roastCode || bean.roastLevelCode || '',
    roastDate: bean.roastDate || '',
    flavorTags: bean.flavorTags || [],
    initialWeight: Number(bean.initialWeight || 0),
    remainingWeight: Number(bean.remainingWeight || 0),
    importedFrom: 'luckybean-core-v2-qr'
  });
}

function showToast(message, kind = '') {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show ${kind}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = 'toast'; }, 3200);
}

async function openGenerator() {
  const beans = (await all('beans')).filter(bean => !bean.deletedAt && !bean.archived);
  if (!beans.length) return showToast('请先新增豆卡', 'bad');
  const dialog = document.querySelector('#modal');
  const content = document.querySelector('#modalContent');
  content.innerHTML = `<div class="modal-body"><div class="modal-head"><h2>生成豆卡二维码</h2><button type="button" data-qr-close>关闭</button></div>
    <label>咖啡豆<select id="qrBeanSelect">${beans.map(bean => `<option value="${escapeHtml(bean.id)}">${escapeHtml(beanName(bean))}</option>`).join('')}</select></label>
    <div class="action-grid" style="margin-top:12px"><button class="primary" type="button" data-qr-render>生成</button><button type="button" data-qr-copy>复制载荷</button></div>
    <div id="qrOutput" class="panel" style="margin-top:14px"><p>Android 版在本地生成二维码；Web 版可复制标准载荷。</p></div></div>`;
  dialog.showModal();
  const selected = () => beans.find(bean => bean.id === content.querySelector('#qrBeanSelect').value) || beans[0];
  content.querySelector('[data-qr-close]').addEventListener('click', () => dialog.close());
  content.querySelector('[data-qr-copy]').addEventListener('click', async () => {
    await navigator.clipboard?.writeText(qrPayload(selected()));
    showToast('二维码载荷已复制', 'good');
  });
  content.querySelector('[data-qr-render]').addEventListener('click', async () => {
    const payload = qrPayload(selected());
    const output = content.querySelector('#qrOutput');
    if (!nativeStorageAvailable() || !globalThis.LuckyBeanNative?.invoke) {
      output.innerHTML = `<p>当前 Web 环境未内置二维码绘图库，以避免在线依赖。</p><pre>${escapeHtml(payload)}</pre>`;
      return;
    }
    try {
      output.innerHTML = '<p>正在本地生成…</p>';
      const response = await globalThis.LuckyBeanNative.invoke('qr.render', { text: payload, size: 768 });
      const value = response?.value ?? response;
      output.innerHTML = `<img src="${escapeHtml(value.dataUrl)}" alt="豆卡二维码" style="display:block;width:min(100%,420px);margin:auto;border-radius:12px;background:white"><p>SHA-256：${escapeHtml(value.sha256)}</p>`;
    } catch (error) {
      output.innerHTML = `<p>生成失败：${escapeHtml(error.message || error)}</p>`;
    }
  });
}

function install() {
  const grid = document.querySelector('#view-tools .action-grid');
  if (!grid || grid.querySelector('[data-core-qr-generate]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.coreQrGenerate = '';
  button.textContent = '生成豆卡二维码';
  button.addEventListener('click', openGenerator);
  grid.append(button);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
