import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/recognition-paddle-ocr.js', 'utf8');

test('WebKit ONNX session failure enters the same PP-OCRv5 compatibility state machine', () => {
  assert.match(source, /const VERSION = '0\.4\.13'/u);
  assert.match(source, /async function startWebKitEngine\(\)/u);
  assert.match(source, /if \(isOnnxSessionCreationFailure\(error\)\) \{/u);
  assert.match(source, /return startSessionCompatibilityEngine\(generation, error\)/u);
  assert.match(source, /WEBKIT \? startWebKitEngine\(\)/u);
  assert.match(source, /webkit-direct-wasm-no-simd->direct-module-worker-wasm-no-simd->direct-wasm-no-simd-last-resort/u);
});
