globalThis.__LUCKYBEAN_CORE_V2__ = true;
import('./app.js').catch(error => {
  console.error('LuckyBean Core v2 module load failed', error);
  const app = document.querySelector('#app');
  if (app) app.innerHTML = `<section class="panel"><h1>Core v2 模块加载失败</h1><p>${String(error?.message || error)}</p><a class="button-link" href="../index.html">打开 Classic 页面</a></section>`;
});
