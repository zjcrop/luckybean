import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('web OCR keeps a single precision pass and only retries a small label ROI', async () => {
  const source = await read('src/recognition-adaptive-detail.js');
  assert.match(source, /ADAPTIVE_OCR_IMAGE_POLICY = 'label-scale-roi\/2\.1'/);
  assert.match(source, /PACKAGE_OCR_FAST_EDGE = 2200/);
  assert.match(source, /PACKAGE_OCR_DETAIL_EDGE = 2200/);
  assert.doesNotMatch(source, /preparePackageImage\(image\.blob/);
  assert.doesNotMatch(source, /PACKAGE_OCR_FAST_EDGE = 1600/);
  assert.match(source, /const first = await base\.recognizeCoffeeBag\(sourceImages, options\)/);
  assert.match(source, /labelGeometry\(baseBlocks, image\)/);
  assert.match(source, /needsFocusedRetry\(baseBlocks, geometry\)/);
  assert.match(source, /originalCompressedSource\(image\.blob\)/);
  assert.match(source, /base\.recognizeRegion\(roiSource, geometry\.region/);
  assert.match(source, /materiallyBetter\(detailBlocks, baseBlocks\)/);
});

test('bounded preparation retains the original compressed blob by reference, not a decoded raster copy', async () => {
  const source = await read('src/image-quality.js');
  assert.match(source, /ORIGINAL_SOURCE_BY_PREPARED_BLOB = new WeakMap\(\)/);
  assert.match(source, /export function originalCompressedSource/);
  assert.match(source, /retainOriginalCompressedSource\(await canvasBlob\(outputCanvas\), file\)/);
  assert.doesNotMatch(source, /originalPixels|originalImageData|fullResolutionCanvas/);
});

test('small-label retry depends on label occupancy and text scale, not source megapixels alone', async () => {
  const source = await read('src/recognition-adaptive-detail.js');
  assert.match(source, /LABEL_AREA_TRIGGER = 0\.46/);
  assert.match(source, /SMALL_TEXT_HEIGHT_TRIGGER = 0\.038/);
  assert.match(source, /geometry\.medianHeight <= SMALL_TEXT_HEIGHT_TRIGGER/);
  assert.match(source, /geometry\.regionArea >= 0\.78/);
  assert.match(source, /source:roiSource === image\.blob \? 'prepared-bounded' : 'original-compressed'/);
});

test('adaptive provider is serialized after the lightweight PP-OCR provider and before capture UI', async () => {
  const source = await read('src/features/runtime-features.js');
  assert.match(source, /feature\('recognition-adaptive-detail', '\.\.\/recognition-adaptive-detail\.js'\)/);
  const startup = source.match(/try \{ await loadFeature\('recognition-paddle-ocr'\)[\s\S]*?await loadMany\(PREINTERACTION_FEATURE_IDS\)/)?.[0] || '';
  assert.match(startup, /await loadFeature\('recognition-adaptive-detail'\)/);
  assert.ok(startup.indexOf("loadFeature('recognition-paddle-ocr')") < startup.indexOf("loadFeature('recognition-adaptive-detail')"));
});

test('per-image progress reaches 100 only when the outer image task really completes', async () => {
  const source = await read('src/features/recognition-batch-progress-controller.js');
  assert.match(source, /rawProgress>=100\?90/);
  assert.match(source, /task\?\.status==='completed'\)return 100/);
  assert.doesNotMatch(source, /setInterval\(/);
});
