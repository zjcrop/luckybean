import fs from 'node:fs';
import assert from 'node:assert/strict';

const runtime = fs.readFileSync('src/features/runtime-features.js', 'utf8');
const full = fs.readFileSync('src/features/full-integration-controller-v3.js', 'utf8');
const freshness = fs.readFileSync('src/features/freshness-timeline-controller.js', 'utf8');
const ocr = fs.readFileSync('src/recognition-paddle-ocr.js', 'utf8');

for (const id of ['recognition-paddle-ocr','recognition-quality','package-capture','direct-camera','origin-map']) {
  const coreSection = runtime.split('const LAZY_FEATURES')[0];
  assert.equal(coreSection.includes(`'${id}'`), false, `${id} must not be in the startup core feature set`);
  assert.equal(runtime.includes(`feature('${id}'`), true, `${id} must remain declared for lazy loading`);
}

assert.match(runtime, /\[data-add-mode="photo"\]/, 'photo entry must install a lazy loader');
assert.match(runtime, /warmRecognition\(\)/, 'photo entry must prewarm OCR');
assert.match(runtime, /LuckyBeanPackageCapture\?\.open/, 'photo entry must open capture after lazy imports');
assert.match(runtime, /\[data-v099f-world\]/, 'world map must have a lazy trigger');
assert.match(runtime, /loadFeature\('origin-map'\)/, 'world map must load only on demand');

assert.equal(full.includes("loadCodebook"), false, 'full integration must not load the full codebook on startup');
assert.equal(full.includes("all('beans')"), false, 'full integration must not read canonical beans at startup');
assert.match(full, /all\('beanSummaries'\)/, 'full integration must consume beanSummaries');
assert.match(full, /bean-display-index\.json/, 'full integration must use the compact display index');

assert.equal(freshness.includes("all('beans')"), false, 'freshness decoration must not read canonical beans');
assert.match(freshness, /all\('beanSummaries'\)/, 'freshness decoration must consume beanSummaries');

assert.match(ocr, /LOW_MEMORY \|\| WEBKIT/, 'constrained-device preload policy must remain explicit');
assert.match(ocr, /await loadModule\(\)/, 'constrained devices must prewarm the vendored OCR runtime module');
assert.match(ocr, /拍摄阶段/, 'OCR prewarm must be tied to the capture/composition phase');
assert.match(ocr, /globalThis\.__LUCKYBEAN_ANDROID__/, 'Android native OCR path must remain separate');

console.log('v124p runtime lazy architecture: OK');
