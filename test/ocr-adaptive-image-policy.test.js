import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production OCR uses only the session fast-path provider without the adaptive ROI wrapper', async () => {
  const runtime = await read('src/features/runtime-features.js');
  const index = await read('index.html');
  assert.match(runtime, /feature\('recognition-paddle-ocr', '\.\.\/recognition-paddle-ocr-fast\.js'\)/);
  assert.match(index, /src\/recognition-paddle-ocr-fast\.js\?v=/);
  assert.doesNotMatch(index, /src\/recognition-paddle-ocr\.js\?v=/);
  assert.doesNotMatch(runtime, /recognition-adaptive-detail/);
  assert.match(runtime, /beginRecognitionSession/);
  assert.match(runtime, /endRecognitionSession/);
  assert.match(runtime, /closest\?\.\('#fabAddBtn'\)/);
});

test('fast path preserves 2200px detector budget and only falls back after a real runtime failure', async () => {
  const source = await read('src/recognition-paddle-ocr-fast.js');
  assert.match(source, /const LIMIT_SIDE = LOW_MEMORY \? 736 : 960/);
  assert.match(source, /const MAX_SIDE = 2200/);
  assert.match(source, /simd:!compatibility/);
  assert.match(source, /looksLikeCompatibilityFailure/);
  assert.match(source, /worker-no-simd-fallback/);
  assert.match(source, /predict-runtime-recovery-success/);
  assert.match(source, /disposePolicy:'capture-session'/);
  assert.doesNotMatch(source, /textDetMaxSideLimit:LOW_MEMORY \? 1280 : 2200/);
});

test('gallery wrapper applies 1600/3000 automatic policy while camera input stays direct', async () => {
  const runtime = await read('src/features/runtime-features.js');
  const policy = await read('src/gallery-image-preprocess-fast.js');
  const preprocess = await read('src/gallery-image-preprocess.js');
  const worker = await read('src/gallery-image-finalize-worker.js');
  assert.match(runtime, /feature\('gallery-image-preprocess', '\.\.\/gallery-image-preprocess-fast\.js'\)/);
  assert.match(policy, /AUTO_CROP_TRIGGER_EDGE = 3000/);
  assert.match(policy, /FULL_IMAGE_OUTPUT_MAX_EDGE = 1600/);
  assert.match(policy, /readGalleryImageHeader/);
  assert.match(policy, /maxEdge > AUTO_CROP_TRIGGER_EDGE/);
  assert.match(policy, /base\.preprocessFiles\(\[file\]\)/);
  assert.match(policy, /Small images are never enlarged/);
  assert.doesNotMatch(policy, /bagCameraInput/);
  assert.match(preprocess, /自动角度校正/);
  assert.match(preprocess, /自动透视修正/);
  assert.match(preprocess, /detectPerspectiveQuad/);
  assert.match(preprocess, /gallery-image-finalize-worker\.js/);
  assert.match(worker, /perspectiveCanvas/);
  assert.match(worker, /OffscreenCanvas/);
  assert.doesNotMatch(preprocess, /warpPerspectiveMesh/);
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
