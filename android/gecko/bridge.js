globalThis.__LUCKYBEAN_ENGINE__ = 'gecko';
const port = browser.runtime.connectNative('luckybean');
// GeckoBundle transport requires homogeneous arrays; encode all payloads as JSON text.
const send = message => port.postMessage({ json: JSON.stringify(message) });
const requests = new Map();
let sequence = 0;
function call(method, args = []) {
  const id = `platform-${++sequence}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { requests.delete(id); reject(new Error('原生接口响应超时')); }, 60000);
    requests.set(id, { resolve, reject, timeout });
    send({ type: 'native', id, method, args });
  });
}
function fire(method, args) { void call(method, args).catch(error => console.warn('原生操作失败', method, error.message)); }
port.onMessage.addListener(envelope => {
  const message = JSON.parse(envelope.json);
  if (message.type === 'callback' && message.callback === 'network.setOnline') {
    globalThis.LuckyBeanNetworkBridge?.setOnline(message.value);
  } else if (message.type === 'callback') {
    const target = message.callback.startsWith('recognition.') ? globalThis.LuckyBeanNativeRecognition : globalThis.LuckyBeanStoreBridge;
    target?.[message.callback.endsWith('resolve') ? 'resolve' : 'reject']?.(message.id, message.value);
  } else if (message.type === 'result') {
    const request = requests.get(message.id);
    if (!request) return;
    requests.delete(message.id); clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(message.error)); else request.resolve(message.value);
  } else if (message.type === 'acceptance') {
    import('./acceptance.js').then(module => module.runAcceptance({ verifyOnly: message.verifyOnly === true })).then(
      result => send({ type: 'acceptanceResult', result }),
      error => send({ type: 'acceptanceResult', error: error.message })
    );
  } else if (message.type === 'back') {
    if (!globalThis.LuckyBeanNavigation?.back?.()) fire('exitApp', []);
  }
});
port.onDisconnect.addListener(() => {
  for (const { reject, timeout } of requests.values()) { clearTimeout(timeout); reject(new Error('原生连接已断开，请重新打开应用')); }
  requests.clear();
});
globalThis.LuckyBeanRoomNative = { request(id, json) { send({ type: 'store', id, json }); } };
globalThis.LuckyBeanNative = {
  isNetworkAvailable() { return call('isNetworkAvailable'); },
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
  send({ type: 'ready' });
});
window.addEventListener('error', event => send({ type: 'pageError', message: String(event.message || '页面加载失败') }));
window.addEventListener('unhandledrejection', event => send({ type: 'pageError', message: String(event.reason?.message || event.reason || '异步操作失败') }));
