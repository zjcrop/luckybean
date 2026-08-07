import { readFile, writeFile, rename, rm, access } from 'node:fs/promises';

const exists = async path => access(path).then(() => true).catch(() => false);
const mapping = Object.freeze([
  ['src/v099i-migrations.js', 'src/data-migrations.js', 'data-migrations'],
  ['src/v096-web-ocr.js', 'src/recognition-web-ocr.js', 'recognition-web-ocr'],
  ['src/v099g-paddle-ocr.js', 'src/recognition-paddle-ocr.js', 'recognition-paddle-ocr'],
  ['src/v099d-ocr-quality.js', 'src/recognition-quality-controller.js', 'recognition-quality'],
  ['src/v096-package-capture.js', 'src/package-capture-controller.js', 'package-capture'],
  ['src/v096-direct-camera.js', 'src/direct-camera-controller.js', 'direct-camera'],
  ['src/v095-postbrew-sensory.js', 'src/postbrew-sensory-controller.js', 'postbrew-sensory'],
  ['src/v095-qr-ui.js', 'src/qr-ui-controller.js', 'qr-ui'],
  ['src/v096-integrity-ui.js', 'src/integrity-ui-controller.js', 'integrity-ui'],
  ['src/v097-ui-fixes.js', 'src/ui-layout-controller.js', 'ui-layout'],
  ['src/v098-selection-bridge.js', 'src/selection-controller.js', 'selection'],
  ['src/v098-feature-fixes.js', 'src/feature-controller.js', 'feature-controller'],
  ['src/v099-runtime.js', 'src/runtime-controller.js', 'runtime-controller'],
  ['src/v099t-bean-groups.js', 'src/bean-groups-controller.js', 'bean-groups'],
  ['src/v099m-group-controller.js', 'src/group-interaction-controller.js', 'group-interaction'],
  ['src/v099f-ui-upgrade.js', 'src/ui-upgrade-controller.js', 'ui-upgrade'],
  ['src/v099g-world-map.js', 'src/origin-map-controller.js', 'origin-map'],
  ['src/v099p-settings-rebuild.js', 'src/settings-screen-controller.js', 'settings-screen'],
  ['src/v095-sensory-pro.js', 'src/sensory-professional-controller.js', 'sensory-professional']
]);

for (const [oldPath, newPath] of mapping) {
  if (await exists(oldPath) && !await exists(newPath)) await rename(oldPath, newPath);
  else if (await exists(oldPath) && await exists(newPath)) await rm(oldPath);
  if (!await exists(newPath)) throw new Error(`formal runtime feature missing: ${newPath}`);
}

const ordered = mapping.filter(([, , id]) => id !== 'sensory-professional');
const loader = `const RUNTIME_FEATURES = Object.freeze([\n${ordered.map(([, path, id]) => `  { id: '${id}', path: '../${path.slice(4)}?v=1.2.0-test' }`).join(',\n')}\n]);

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
  revision: '1.2.0-test',
  declared: RUNTIME_FEATURES.map(feature => feature.id),
  loaded,
  failures
};

document.dispatchEvent(new CustomEvent('luckybean:runtime-features-ready', {
  detail: { declared: RUNTIME_FEATURES.length, loaded: loaded.length, failures }
}));
`;
await writeFile('src/features/runtime-features.js', loader);
await rm('src/features/compatibility-bundle.js', { force: true });

let app = await readFile('src/app.js', 'utf8');
app = app.replace("import './v095-sensory-pro.js';", "import './sensory-professional-controller.js';");
if (app.includes("./v095-sensory-pro.js")) throw new Error('old professional sensory import remains');
await writeFile('src/app.js', app);

let index = await readFile('index.html', 'utf8');
index = index.replace(/\.\/src\/features\/compatibility-bundle\.js\?v=[^\"']+/, './src/features/runtime-features.js?v=1.2.0-test');
if (index.includes('compatibility-bundle')) throw new Error('compatibility bundle remains in index');
await writeFile('index.html', index);

let sw = await readFile('sw.js', 'utf8');
for (const [oldPath, newPath] of mapping) {
  sw = sw.replaceAll(`./${oldPath}?v=1.1.0-test`, `./${newPath}?v=1.2.0-test`);
  sw = sw.replaceAll(`./${oldPath}?v=1.2.0-test`, `./${newPath}?v=1.2.0-test`);
}
sw = sw.replaceAll('./src/features/compatibility-bundle.js?v=1.1.0-test', './src/features/runtime-features.js?v=1.2.0-test');
sw = sw.replaceAll('./src/features/compatibility-bundle.js?v=1.2.0-test', './src/features/runtime-features.js?v=1.2.0-test');
if (/src\/v0\d+[^'\"]*\.js/.test(sw) || sw.includes('compatibility-bundle')) throw new Error('version patch assets remain in service worker');
await writeFile('sw.js', sw);

for (const testPath of ['tests/v110-startup-smoke.spec.mjs','tests/v110-local-first-sync-static.mjs','tests/v120-core-contracts-static.mjs']) {
  let source = await readFile(testPath, 'utf8');
  source = source.replaceAll('LuckyBeanCompatibilityLayer', 'LuckyBeanRuntimeFeatures');
  source = source.replaceAll('compatibility-bundle.js', 'runtime-features.js');
  source = source.replaceAll('compatibility', 'runtimeFeatures');
  source = source.replaceAll('COMPATIBILITY_MODULES', 'RUNTIME_FEATURES');
  source = source.replaceAll('LuckyBeanCompatibilityLayer', 'LuckyBeanRuntimeFeatures');
  source = source.replaceAll('luckybean:compatibility-ready', 'luckybean:runtime-features-ready');
  await writeFile(testPath, source);
}

const remainingOld = [];
for (const [oldPath] of mapping) if (await exists(oldPath)) remainingOld.push(oldPath);
if (remainingOld.length) throw new Error(`versioned runtime files remain: ${remainingOld.join(', ')}`);

console.log(`Formalized ${mapping.length} runtime features and removed compatibility bundle.`);
