import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('index.html', 'utf8');
const runtime = fs.readFileSync('src/features/runtime-features.js', 'utf8');
const provider = fs.readFileSync('src/recognition-paddle-ocr-fast.js', 'utf8');

test('lightweight PP-OCR fast provider is registered before runtime feature orchestration with the same release URL', () => {
  const providerTag = index.indexOf('./src/recognition-paddle-ocr-fast.js?v=1.24P-main.4');
  const runtimeTag = index.indexOf('./src/features/runtime-features.js?v=1.24P-main.4');
  assert.ok(providerTag >= 0, 'fast provider module script must exist');
  assert.ok(runtimeTag > providerTag, 'provider module must execute before runtime feature orchestration');
  assert.match(runtime, /feature\('recognition-paddle-ocr', '\.\.\/recognition-paddle-ocr-fast\.js'\)/);
});

test('deterministic fast-provider registration does not eagerly initialize SDK, models, or WASM', () => {
  const loaderStart = provider.indexOf('async function loadModule()');
  assert.ok(loaderStart > 0, 'lazy SDK loader must exist');

  const registrationPrefix = provider.slice(0, loaderStart);
  assert.doesNotMatch(registrationPrefix, /\bloadModule\s*\(/, 'module registration must not invoke the Paddle SDK loader');
  assert.doesNotMatch(registrationPrefix, /PaddleOCR\.create|sdk\.mjs|PP-OCRv5_mobile_(?:det|rec)_onnx_infer|ort\//, 'module registration must not initialize SDK, models, or WASM');

  assert.match(provider, /async function loadModule\(\)/);
  assert.match(provider, /import\(assetUrl\('sdk\.mjs'\)\)/);
  assert.match(provider, /autoPreload:false/);
  assert.match(provider, /beginSession/);
  assert.match(provider, /disposePolicy:'capture-session'/);
});
