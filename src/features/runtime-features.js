const RELEASE_REVISION = document.body?.dataset.releaseRevision || document.querySelector('meta[name="release-revision"]')?.content || '1.24P-main.1';
const feature = (id, path) => ({ id, path: `${path}?v=${encodeURIComponent(RELEASE_REVISION)}` });
const BEAN_GROUP_RUNTIME_REVISION = RELEASE_REVISION;
const pinnedFeature = (id, path, revision) => ({ id, path: `${path}?v=${encodeURIComponent(revision)}` });

const RUNTIME_FEATURES = Object.freeze([
  feature('data-migrations', '../data-migrations.js'),
  feature('recognition-paddle-ocr', '../recognition-paddle-ocr.js'),
  feature('recognition-quality', '../recognition-quality-controller.js'),
  feature('package-capture', '../package-capture-controller.js'),
  feature('direct-camera', '../direct-camera-controller.js'),
  feature('qr-ui', '../qr-ui-controller.js'),
  feature('integrity-ui', '../integrity-ui-controller.js'),
  feature('recognition-review-owner', '../ui/recognition-review-owner-controller.js'),
  feature('ui-layout', '../ui-layout-controller.js'),
  feature('selection', '../selection-controller.js'),
  feature('feature-controller', '../feature-controller.js'),
  feature('runtime-controller', '../runtime-controller.js'),
  pinnedFeature('bean-groups', '../bean-groups-controller.js', BEAN_GROUP_RUNTIME_REVISION),
  feature('group-interaction', '../group-interaction-controller.js'),
  feature('ui-upgrade', '../ui-upgrade-controller.js'),
  feature('origin-map', '../origin-map-controller.js'),
  feature('recognition-batch-progress', './recognition-batch-progress-controller.js'),
  feature('release-1.24b-freshness-detail', './release-1.24b-freshness-detail.js'),
  feature('release-1.24b-brew-mode', './release-1.24b-brew-mode-controller.js'),
  feature('release-1.24b-ui-policy', './release-1.24b-ui-policy.js'),
  feature('shared-sortable', '../ui/sortable-controller.js'),
  feature('sensory-tag-sort', './sensory-tag-sort-controller.js')
]);

const failures = [];
const loaded = [];
for (const runtimeFeature of RUNTIME_FEATURES) {
  try {
    await import(runtimeFeature.path);
    loaded.push(runtimeFeature.id);
  } catch (error) {
    const failure = { id: runtimeFeature.id, path: runtimeFeature.path, message: error?.message || String(error) };
    failures.push(failure);
    console.error('正式运行功能加载失败', failure, error);
    document.dispatchEvent(new CustomEvent('luckybean:runtime-feature-error', { detail: failure }));
  }
}

globalThis.LuckyBeanRuntimeFeatures = {
  revision: RELEASE_REVISION,
  declared: RUNTIME_FEATURES.map(runtimeFeature => runtimeFeature.id),
  loaded,
  failures
};

document.dispatchEvent(new CustomEvent('luckybean:runtime-features-ready', {
  detail: { revision: RELEASE_REVISION, declared: RUNTIME_FEATURES.length, loaded: loaded.length, failures }
}));
