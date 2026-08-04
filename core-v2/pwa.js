const protocol = globalThis.location?.protocol || '';
const isWeb = protocol === 'https:' || protocol === 'http:';
if (isWeb && 'serviceWorker' in navigator) {
  globalThis.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .catch(error => console.warn('Core v2 Service Worker 注册失败', error));
  }, { once: true });
}
