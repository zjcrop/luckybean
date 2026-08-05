const COMPATIBILITY_MODULES = Object.freeze([
  '../v099i-migrations.js?v=1.1.0-test',
  '../v096-web-ocr.js?v=1.1.0-test',
  '../v099g-paddle-ocr.js?v=1.1.0-test',
  '../v099d-ocr-quality.js?v=1.1.0-test',
  '../v096-package-capture.js?v=1.1.0-test',
  '../v096-direct-camera.js?v=1.1.0-test',
  '../v095-postbrew-sensory.js?v=1.1.0-test',
  '../v095-qr-ui.js?v=1.1.0-test',
  '../v096-integrity-ui.js?v=1.1.0-test',
  '../v097-ui-fixes.js?v=1.1.0-test',
  '../v099-trajectory-signal-bridge.js?v=1.1.0-test',
  '../v099i-trajectory-space.js?v=1.1.0-test',
  '../v098-selection-bridge.js?v=1.1.0-test',
  '../v098-feature-fixes.js?v=1.1.0-test',
  '../v099-runtime.js?v=1.1.0-test',
  '../v099t-bean-groups.js?v=1.1.0-test',
  '../v099m-group-controller.js?v=1.1.0-test',
  '../v099f-ui-upgrade.js?v=1.1.0-test',
  '../v099g-world-map.js?v=1.1.0-test',
  '../v099p-settings-rebuild.js?v=1.1.0-test',
  '../v109-history-management.js?v=1.1.0-test'
]);

const failures = [];
for (const path of COMPATIBILITY_MODULES) {
  try {
    await import(path);
  } catch (error) {
    failures.push({ path, message: error?.message || String(error) });
    console.error(`兼容功能模块加载失败：${path}`, error);
    document.dispatchEvent(new CustomEvent('luckybean:compatibility-module-error', {
      detail: { path, error: error?.message || String(error) }
    }));
  }
}

globalThis.LuckyBeanCompatibilityLayer = {
  revision: '1.1.0-test',
  modules: COMPATIBILITY_MODULES,
  failures
};

document.dispatchEvent(new CustomEvent('luckybean:compatibility-ready', {
  detail: { loaded: COMPATIBILITY_MODULES.length - failures.length, failures }
}));
