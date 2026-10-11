globalThis.__LUCKYBEAN_ENGINE__ = 'gecko';
const port = browser.runtime.connectNative('luckybean');
const requests = new Map();
let sequence = 0;
function call(method, args = []) {
  const id = `platform-${++sequence}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { requests.delete(id); reject(new Error('原生接口响应超时')); }, 60000);
    requests.set(id, { resolve, reject, timeout });
    port.postMessage({ type: 'native', id, method, args });
  });
}
function fire(method, args) { void call(method, args).catch(error => console.warn('原生操作失败', method, error.message)); }
port.onMessage.addListener(message => {
  if (message.type === 'callback') {
    const target = message.callback.startsWith('recognition.') ? globalThis.LuckyBeanNativeRecognition : globalThis.LuckyBeanStoreBridge;
    target?.[message.callback.endsWith('resolve') ? 'resolve' : 'reject']?.(message.id, message.value);
  } else if (message.type === 'result') {
    const request = requests.get(message.id);
    if (!request) return;
    requests.delete(message.id); clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(message.error)); else request.resolve(message.value);
  } else if (message.type === 'back') {
    if (!globalThis.LuckyBeanNavigation?.back?.()) fire('exitApp', []);
  }
});
port.onDisconnect.addListener(() => {
  for (const { reject, timeout } of requests.values()) { clearTimeout(timeout); reject(new Error('原生连接已断开，请重新打开应用')); }
  requests.clear();
});
globalThis.LuckyBeanRoomNative = { request(id, json) { port.postMessage({ type: 'store', id, json }); } };
globalThis.LuckyBeanNative = {
  bindImageSource(id, preview) { return call('bindImageSource', [id, preview]); },
  recognizeImage(...args) { fire('recognizeImage', args); },
  saveFile(...args) { fire('saveFile', args); },
  prepareBrewExecution(...args) { fire('prepareBrewExecution', args); },
  startBrewExecution(...args) { fire('startBrewExecution', args); },
  announceBrewPreparation(...args) { fire('announceBrewPreparation', args); },
  pauseBrewExecution() { fire('pauseBrewExecution', []); },
  resumeBrewExecution() { fire('resumeBrewExecution', []); },
  cancelBrewExecution() { fire('cancelBrewExecution', []); },
  setBrewScreenAwake(...args) { fire('setBrewScreenAwake', args); },
  switchEngine(...args) { fire('switchEngine', args); },
  exitApp() { fire('exitApp', []); }
};
document.addEventListener('luckybean:local-app-ready', () => {
  port.postMessage({ type: 'ready' });
});
window.addEventListener('error', event => port.postMessage({ type: 'pageError', message: String(event.message || '页面加载失败') }));
window.addEventListener('unhandledrejection', event => port.postMessage({ type: 'pageError', message: String(event.reason?.message || event.reason || '异步操作失败') }));
