import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/recognition-paddle-ocr.js', 'utf8');

test('PP-OCRv5 handles WebAssembly memory allocation failures without switching OCR engines', () => {
  assert.match(source, /function isWasmMemoryAllocationFailure\(error\)/u);
  assert.match(source, /WebAssembly\\\.Memory/u);
  assert.match(source, /startMemoryCompatibilityEngine/u);
  assert.match(source, /direct-wasm-no-simd-low-memory/u);
  assert.match(source, /memoryConstrained = true/u);
  assert.match(source, /simd:compatibility \? false : true/u);
  assert.match(source, /numThreads:1/u);
  assert.match(source, /currentLimitSide\(\)/u);
  assert.match(source, /currentMaxSide\(\)/u);
  assert.doesNotMatch(source, /Tesseract|tesseract/u);
});

test('memory allocation failure is retried before generic worker startup handling', () => {
  const memoryCheck = source.indexOf('if (isWasmMemoryAllocationFailure(error)) return startMemoryCompatibilityEngine');
  const genericWorkerCheck = source.indexOf('if (!isOpaqueWorkerStartupFailure(error)) throw error');
  assert.ok(memoryCheck >= 0, 'missing WASM memory fallback branch');
  assert.ok(genericWorkerCheck >= 0, 'missing generic worker startup branch');
  assert.ok(memoryCheck < genericWorkerCheck, 'WASM allocation failure must be handled before generic worker errors');
});
