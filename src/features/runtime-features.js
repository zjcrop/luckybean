const RELEASE_REVISION = document.body?.dataset.releaseRevision || document.querySelector('meta[name="release-revision"]')?.content || '1.24P-main.4';
const feature = (id, path) => ({ id, path: `${path}?v=${encodeURIComponent(RELEASE_REVISION)}` });
const BEAN_GROUP_RUNTIME_REVISION = RELEASE_REVISION;
const pinnedFeature = (id, path, revision) => ({ id, path: `${path}?v=${encodeURIComponent(revision)}` });

const CORE_FEATURES = Object.freeze([
  feature('data-migrations', '../data-migrations.js'),
  feature('qr-ui', '../qr-ui-controller.js'),
  feature('integrity-ui', '../integrity-ui-controller.js'),
  feature('ui-layout', '../ui-layout-controller.js'),
  feature('feature-controller', '../feature-controller.js'),
  feature('runtime-controller', '../runtime-controller.js'),
  pinnedFeature('bean-groups', '../bean-groups-controller.js', BEAN_GROUP_RUNTIME_REVISION),
  feature('group-interaction', '../group-interaction-controller.js'),
  feature('ui-upgrade', '../ui-upgrade-controller.js'),
  feature('release-1.24b-ui-policy', './release-1.24b-ui-policy.js')
]);

const P2_CORE_FEATURES = Object.freeze([
  feature('bean-batch-manager', '../ui/bean-batch-manager-controller.js'),
  feature('bean-group-actions', '../ui/bean-group-actions-controller.js'),
  feature('bean-card-presentation', '../ui/bean-card-presentation-controller.js'),
  feature('bean-detail-presentation', '../ui/bean-detail-presentation-controller.js'),
  feature('brew-strategy', '../ui/brew-strategy-controller.js'),
  feature('brew-screen-awake', '../ui/brew-screen-awake-controller.js'),
  feature('brew-native-execution', '../ui/brew-native-execution-controller.js')
]);

const LAZY_FEATURES = Object.freeze([
  feature('recognition-paddle-ocr', '../recognition-paddle-ocr.js'),
  feature('recognition-quality', '../recognition-quality-controller.js'),
  feature('package-capture', '../package-capture-controller.js'),
  feature('recognition-multi-entry', './recognition-multi-entry-controller.js'),
  feature('direct-camera', '../direct-camera-controller.js'),
  feature('recognition-review-owner', '../ui/recognition-review-owner-controller.js'),
  feature('selection', '../selection-controller.js'),
  feature('origin-map', '../origin-map-controller.js'),
  feature('brew-pour-guide', '../ui/brew-pour-guide.js'),
  feature('recognition-batch-progress', './recognition-batch-progress-controller.js'),
  feature('release-1.24b-freshness-detail', './release-1.24b-freshness-detail.js'),
  feature('release-1.24b-brew-mode', './release-1.24b-brew-mode-controller.js'),
  feature('shared-sortable', '../ui/sortable-controller.js'),
  feature('sensory-tag-sort', './sensory-tag-sort-controller.js')
]);

const PREINTERACTION_FEATURE_IDS = Object.freeze([
  'recognition-quality', 'package-capture', 'recognition-multi-entry', 'direct-camera', 'recognition-review-owner',
  'recognition-batch-progress', 'brew-pour-guide', 'shared-sortable', 'sensory-tag-sort'
]);

const catalog = new Map([...CORE_FEATURES, ...P2_CORE_FEATURES, ...LAZY_FEATURES].map(item => [item.id, item]));
const failures = [];
const loaded = [];
const pending = new Map();

function recordLoaded(id) { if (!loaded.includes(id)) loaded.push(id); }
function recordFailure(featureEntry, error) {
  const failure = { id: featureEntry.id, path: featureEntry.path, message: error?.message || String(error) };
  failures.push(failure);
  console.error('正式运行功能加载失败', failure, error);
  document.dispatchEvent(new CustomEvent('luckybean:runtime-feature-error', { detail: failure }));
  return failure;
}
async function loadFeature(id) {
  const entry = catalog.get(String(id || ''));
  if (!entry) throw new Error(`未知运行功能：${id}`);
  if (loaded.includes(entry.id)) return true;
  if (pending.has(entry.id)) return pending.get(entry.id);
  const task = import(entry.path).then(() => { recordLoaded(entry.id); return true; }).catch(error => { recordFailure(entry, error); throw error; }).finally(() => pending.delete(entry.id));
  pending.set(entry.id, task); return task;
}
async function loadMany(ids) { const results = await Promise.allSettled(ids.map(loadFeature)); return results.every(result => result.status === 'fulfilled'); }

// Explicit diagnostic/manual warmup API only. Never call from camera/photo gestures:
// model initialization can overlap with image decoding and trigger a mobile tab/WebView restart.
async function warmRecognition() {
  await loadFeature('recognition-paddle-ocr').catch(() => false);
  return globalThis.LuckyBeanPaddleOCR?.preload?.().catch?.(() => null) ?? null;
}
function isLoaded(id) { return loaded.includes(id); }

function installLazyTriggers() {
  document.addEventListener('click', async event => {
    const photo = event.target.closest?.('[data-add-mode="photo"]');
    if (photo) {
      // Register only the validated PP-OCR provider. The experimental adaptive
      // ROI wrapper is intentionally not part of the production path because it
      // can duplicate inference and discard full-frame evidence on small labels.
      void loadFeature('recognition-paddle-ocr').catch(() => false);
      if (!isLoaded('package-capture')) {
        event.preventDefault(); event.stopImmediatePropagation();
        const ready = await loadMany(['recognition-quality','package-capture','direct-camera','recognition-review-owner','recognition-batch-progress']);
        if (ready && globalThis.LuckyBeanPackageCapture?.open) globalThis.LuckyBeanPackageCapture.open();
        return;
      }
    }
    const world = event.target.closest?.('[data-v099f-world]');
    if (world && !isLoaded('origin-map')) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (await loadFeature('origin-map').catch(() => false)) globalThis.LuckyBeanWorldMapV099g?.open?.();
      return;
    }
    const recommend = event.target.closest?.('#fabRecommendBtn');
    if (recommend && !isLoaded('selection')) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (await loadFeature('selection').catch(() => false)) recommend.click();
      return;
    }
    if (event.target.closest?.('[data-page-target="brew"]')) { void loadMany(['brew-pour-guide','release-1.24b-brew-mode']); return; }
    if (event.target.closest?.('[data-page-target="sensory"]')) { void loadMany(['shared-sortable','sensory-tag-sort']); return; }
    if (event.target.closest?.('.bean-card[data-bean-id],[data-bean-id]')) void loadFeature('release-1.24b-freshness-detail').catch(() => false);
  }, true);

  document.addEventListener('pointerdown', event => {
    if (event.target.closest?.('[data-add-mode="photo"]')) {
      void loadFeature('recognition-paddle-ocr').catch(() => false);
    }
    if (event.target.closest?.('#fabRecommendBtn')) void loadFeature('selection').catch(() => false);
    if (event.target.closest?.('[data-v099f-world]')) void loadFeature('origin-map').catch(() => false);
  }, { capture:true, passive:true });
}

const ALL_CORE_FEATURES = Object.freeze([...CORE_FEATURES, ...P2_CORE_FEATURES]);
globalThis.LuckyBeanRuntimeFeatures = {
  revision:RELEASE_REVISION,
  declared:[...catalog.keys()],
  core:ALL_CORE_FEATURES.map(item=>item.id),
  lazy:LAZY_FEATURES.map(item=>item.id),
  loaded,
  failures,
  load:loadFeature,
  loadMany,
  warmRecognition,
  isLoaded
};
document.documentElement.dataset.runtimeFeatures = 'declared';

// Preserve the validated core ordering and register the lightweight PP-OCR
// provider before capture UI modules. Heavy SDK/models remain lazy until the user
// actually starts recognition. No second-pass adaptive wrapper is installed.
for (const runtimeFeature of CORE_FEATURES) {
  try { await loadFeature(runtimeFeature.id); } catch { /* failure already recorded */ }
}
try { await loadFeature('recognition-paddle-ocr'); } catch { /* capture UI will expose a real failure */ }
await loadMany(PREINTERACTION_FEATURE_IDS);
await loadMany(P2_CORE_FEATURES.map(item => item.id));

installLazyTriggers();
document.dispatchEvent(new CustomEvent('luckybean:runtime-features-ready', {
  detail:{ revision:RELEASE_REVISION, declared:catalog.size, coreLoaded:ALL_CORE_FEATURES.filter(item=>isLoaded(item.id)).length, lazyDeclared:LAZY_FEATURES.length, loaded:loaded.length, failures }
}));
