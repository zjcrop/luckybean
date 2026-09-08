import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production OCR uses the session fast-path provider without the adaptive ROI wrapper', async () => {
  const runtime = await read('src/features/runtime-features.js');
  assert.match(runtime, /feature\('recognition-paddle-ocr', '\.\.\/recognition-paddle-ocr-fast\.js'\)/);
  assert.doesNotMatch(runtime, /recognition-adaptive-detail/);
  assert.match(runtime, /beginRecognitionSession/);
  assert.match(runtime, /endRecognitionSession/);
});

test('fast path preserves 2200px detector budget and only falls back after a real runtime failure', async () => {
  const source = await read('src/recognition-paddle-ocr-fast.js');
  assert.match(source, /const LIMIT_SIDE = LOW_MEMORY \? 736 : 960/);
  assert.match(source, /const MAX_SIDE = 2200/);
  assert.match(source, /simd:!compatibility/);
  assert.match(source, /looksLikeCompatibilityFailure/);
  assert.match(source, /worker-no-simd-fallback/);
  assert.doesNotMatch(source, /textDetMaxSideLimit:LOW_MEMORY \? 1280 : 2200/);
});

test('gallery upload gets manual crop and geometry correction while camera input stays direct', async () => {
  const runtime = await read('src/features/runtime-features.js');
  const preprocess = await read('src/gallery-image-preprocess.js');
  assert.match(runtime, /feature\('gallery-image-preprocess', '\.\.\/gallery-image-preprocess\.js'\)/);
  assert.match(preprocess, /input\.id!==['"]bagGalleryInput['"]/);
  assert.doesNotMatch(preprocess, /bagCameraInput/);
  assert.match(preprocess, /自动角度校正/);
  assert.match(preprocess, /自动透视修正/);
  assert.match(preprocess, /warpPerspectiveMesh/);
});

test('bounded preparation may retain the original compressed blob without enabling a second OCR pass', async () => {
  const imageQuality = await read('src/image-quality.js');
  const runtime = await read('src/features/runtime-features.js');
  assert.match(imageQuality, /ORIGINAL_SOURCE_BY_PREPARED_BLOB = new WeakMap\(\)/);
  assert.match(imageQuality, /export function originalCompressedSource/);
  assert.doesNotMatch(runtime, /recognition-adaptive-detail\.js/);
});

test('per-image progress reaches 100 only when the outer image task really completes', async () => {
  const source = await read('src/features/recognition-batch-progress-controller.js');
  assert.match(source, /rawProgress>=100\?90/);
  assert.match(source, /task\?\.status==='completed'\)return 100/);
  assert.doesNotMatch(source, /setInterval\(/);
});
