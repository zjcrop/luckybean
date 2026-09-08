import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production OCR uses the validated single-pass provider without the adaptive ROI wrapper', async () => {
  const runtime = await read('src/features/runtime-features.js');
  assert.match(runtime, /feature\('recognition-paddle-ocr', '\.\.\/recognition-paddle-ocr\.js'\)/);
  assert.doesNotMatch(runtime, /recognition-adaptive-detail/);
  assert.match(runtime, /No second-pass adaptive wrapper is installed/);
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
