import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/recognition-paddle-ocr.js', 'utf8');
const executableTesseractFallback = /TESSERACT_VERSION|TESSERACT_URL|ensureTesseract|createWorker\s*\(\s*\[?['"]chi_sim|cdn\.jsdelivr\.net\/npm\/tesseract/iu;

test('PP-OCRv5 retries exact ONNX session creation failures in local WASM compatibility mode', () => {
  assert.match(source, /function isOnnxSessionCreationFailure\(error\)/u);
  assert.ok(source.includes('Failed to create ONNX session'), 'exact production failure signature must be classified');
  assert.match(source, /startSessionCompatibilityEngine/u);
  assert.match(source, /direct-module-no-simd-session-retry/u);
  assert.match(source, /direct-wasm-no-simd-session-last-resort/u);
  assert.match(source, /COMPATIBILITY_FALLBACK_SESSION_KEY/u);
  assert.match(source, /runtimeCompatibilityConstrained/u);
  assert.match(source, /sessionFallback:'onnx-session->direct-module-worker-wasm-no-simd->direct-wasm-no-simd-last-resort'/u);
  assert.doesNotMatch(source, executableTesseractFallback);
});

test('ONNX session fallback is reached before the generic worker error is rethrown', () => {
  const memoryCheck = source.indexOf('if (isWasmMemoryAllocationFailure(error)) return startMemoryCompatibilityEngine');
  const sessionCheck = source.indexOf('if (isOnnxSessionCreationFailure(error)) return startSessionCompatibilityEngine');
  const genericThrow = source.indexOf('if (!isOpaqueWorkerStartupFailure(error)) throw error');
  assert.ok(memoryCheck >= 0, 'missing memory branch');
  assert.ok(sessionCheck > memoryCheck, 'missing ONNX session branch after memory classification');
  assert.ok(genericThrow > sessionCheck, 'ONNX session fallback must happen before generic rethrow');
});

test('a second ONNX session failure can fall through to the same PP-OCRv5 main-thread WASM path', () => {
  const fallback = source.match(/async function startSessionCompatibilityEngine[\s\S]*?async function startRememberedSessionCompatibilityEngine/u)?.[0] ?? '';
  assert.match(fallback, /createLowMemoryWorkerEngine\(\)/u);
  assert.match(fallback, /isOnnxSessionCreationFailure\(workerRetryError\)/u);
  assert.match(fallback, /createCompatibilityEngine\(\)/u);
  assert.match(fallback, /主线程 ONNX session 兼容模式/u);
  assert.doesNotMatch(fallback, executableTesseractFallback);
});

test('ONNX compatibility memory is not mislabeled as a low-memory session flag', () => {
  const rememberCompatibility = source.match(/function rememberRuntimeCompatibilityConstraint[\s\S]*?\n}/u)?.[0] ?? '';
  assert.match(rememberCompatibility, /COMPATIBILITY_FALLBACK_SESSION_KEY/u);
  assert.doesNotMatch(rememberCompatibility, /MEMORY_FALLBACK_SESSION_KEY/u);
  assert.doesNotMatch(rememberCompatibility, /memoryConstrained\s*=\s*true/u);
});
