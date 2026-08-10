const RUNTIME_FEATURES = Object.freeze([
  { id: 'data-migrations', path: '../data-migrations.js?v=1.23D-main-sync.2' },
  { id: 'recognition-web-ocr', path: '../recognition-web-ocr.js?v=1.23D-main-sync.2' },
  { id: 'recognition-paddle-ocr', path: '../recognition-paddle-ocr.js?v=1.23D-main-sync.2' },
  { id: 'recognition-quality', path: '../recognition-quality-controller.js?v=1.23D-main-sync.2' },
  { id: 'package-capture', path: '../package-capture-controller.js?v=1.23D-main-sync.2' },
  { id: 'direct-camera', path: '../direct-camera-controller.js?v=1.23D-main-sync.2' },
  { id: 'qr-ui', path: '../qr-ui-controller.js?v=1.23D-main-sync.2' },
  { id: 'integrity-ui', path: '../integrity-ui-controller.js?v=1.23D-main-sync.2' },
  { id: 'ui-layout', path: '../ui-layout-controller.js?v=1.23D-main-sync.2' },
  { id: 'selection', path: '../selection-controller.js?v=1.23D-main-sync.2' },
  { id: 'feature-controller', path: '../feature-controller.js?v=1.23D-main-sync.2' },
  { id: 'runtime-controller', path: '../runtime-controller.js?v=1.23D-main-sync.2' },
  { id: 'bean-groups', path: '../bean-groups-controller.js?v=1.23D-main-sync.2' },
  { id: 'group-interaction', path: '../group-interaction-controller.js?v=1.23D-main-sync.2' },
  { id: 'ui-upgrade', path: '../ui-upgrade-controller.js?v=1.23D-main-sync.2' },
  { id: 'origin-map', path: '../origin-map-controller.js?v=1.23D-main-sync.2' }
]);

const failures = [];
const loaded = [];
for (const feature of RUNTIME_FEATURES) {
  try {
    await import(feature.path);
    loaded.push(feature.id);
  } catch (error) {
    const failure = { id: feature.id, path: feature.path, message: error?.message || String(error) };
    failures.push(failure);
    console.error('正式运行功能加载失败', failure, error);
    document.dispatchEvent(new CustomEvent('luckybean:runtime-feature-error', { detail: failure }));
  }
}

globalThis.LuckyBeanRuntimeFeatures = {
  revision: '1.23D-main-sync.2',
  declared: RUNTIME_FEATURES.map(feature => feature.id),
  loaded,
  failures
};

document.dispatchEvent(new CustomEvent('luckybean:runtime-features-ready', {
  detail: { declared: RUNTIME_FEATURES.length, loaded: loaded.length, failures }
}));
