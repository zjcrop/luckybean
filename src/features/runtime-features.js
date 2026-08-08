const RUNTIME_FEATURES = Object.freeze([
  { id: 'data-migrations', path: '../data-migrations.js?v=1.23D' },
  { id: 'recognition-web-ocr', path: '../recognition-web-ocr.js?v=1.23D' },
  { id: 'recognition-paddle-ocr', path: '../recognition-paddle-ocr.js?v=1.23D' },
  { id: 'recognition-quality', path: '../recognition-quality-controller.js?v=1.23D' },
  { id: 'package-capture', path: '../package-capture-controller.js?v=1.23D' },
  { id: 'direct-camera', path: '../direct-camera-controller.js?v=1.23D' },
  { id: 'qr-ui', path: '../qr-ui-controller.js?v=1.23D' },
  { id: 'integrity-ui', path: '../integrity-ui-controller.js?v=1.23D' },
  { id: 'ui-layout', path: '../ui-layout-controller.js?v=1.23D' },
  { id: 'selection', path: '../selection-controller.js?v=1.23D' },
  { id: 'feature-controller', path: '../feature-controller.js?v=1.23D' },
  { id: 'runtime-controller', path: '../runtime-controller.js?v=1.23D' },
  { id: 'bean-groups', path: '../bean-groups-controller.js?v=1.23D' },
  { id: 'group-interaction', path: '../group-interaction-controller.js?v=1.23D' },
  { id: 'ui-upgrade', path: '../ui-upgrade-controller.js?v=1.23D' },
  { id: 'origin-map', path: '../origin-map-controller.js?v=1.23D' }
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
  revision: '1.23D',
  declared: RUNTIME_FEATURES.map(feature => feature.id),
  loaded,
  failures
};

document.dispatchEvent(new CustomEvent('luckybean:runtime-features-ready', {
  detail: { declared: RUNTIME_FEATURES.length, loaded: loaded.length, failures }
}));
