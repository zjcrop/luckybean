import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('web OCR runs a 1600px fast pass and reserves 2200px for weak evidence', async () => {
  const source = await read('src/recognition-adaptive-detail.js');
  assert.match(source, /PACKAGE_OCR_FAST_EDGE = 1600/);
  assert.match(source, /PACKAGE_OCR_DETAIL_EDGE = 2200/);
  assert.match(source, /preparePackageImage\(image\.blob, \{ maxEdge:PACKAGE_OCR_FAST_EDGE \}\)/);
  assert.match(source, /needsDetail\(blocksForImage\(first, image\.id\)\)/);
  assert.match(source, /detailSource\(image\)/);
  assert.match(source, /materiallyBetter\(detailBlocks, fastBlocks\)/);
  assert.match(source, /没有得到可信文字/);
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
