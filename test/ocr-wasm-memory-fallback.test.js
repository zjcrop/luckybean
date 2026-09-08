import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/recognition-paddle-ocr.js', 'utf8');
const executableTesseractFallback = /TESSERACT_VERSION|TESSERACT_URL|ensureTesseract|createWorker\s*\(\s*\[?['"]chi_sim|cdn\.jsdelivr\.net\/npm\/tesseract/iu;

test('PP-OCRv5 handles WebAssembly memory allocation failures without switching OCR engines', () => {
  assert.match(source, /function isWasmMemoryAllocationFailure\(error\)/u);
  assert.ok(source.includes('WebAssembly\\.Memory'), 'missing WebAssembly.Memory allocation signature');
  assert.match(source, /startMemoryCompatibilityEngine/u);
  assert.match(source, /direct-wasm-no-simd-low-memory/u);
  assert.match(source, /rememberMemoryConstraint/u);
  assert.match(source, /MEMORY_FALLBACK_SESSION_KEY/u);
  assert.match(source, /terminateModuleWorkers/u);
  assert.match(source, /simd:compatibility \? false : true/u);
  assert.match(source, /numThreads:1/u);
  assert.match(source, /currentLimitSide\(\)/u);
  assert.match(source, /currentMaxSide\(\)/u);
  assert.doesNotMatch(source, executableTesseractFallback);
});

test('memory allocation failure is retried before generic worker startup handling', () => {
  const memoryCheck = source.indexOf('if (isWasmMemoryAllocationFailure(error)) return startMemoryCompatibilityEngine');
  const genericWorkerCheck = source.indexOf('if (!isOpaqueWorkerStartupFailure(error)) throw error');
  assert.ok(memoryCheck >= 0, 'missing WASM memory fallback branch');
  assert.ok(genericWorkerCheck >= 0, 'missing generic worker startup branch');
  assert.ok(memoryCheck < genericWorkerCheck, 'WASM allocation failure must be handled before generic worker errors');
});

test('failed worker resources are reclaimed before retrying OCR', () => {
  const memoryFallback = source.match(/async function startMemoryCompatibilityEngine[\s\S]*?async function startWorkerEngine/u)?.[0] ?? '';
  const workerDelayMatch = source.match(/const MEMORY_WORKER_RECLAIM_DELAY_MS = (\d+);/u);
  const mainDelayMatch = source.match(/const MEMORY_MAIN_THREAD_RECLAIM_DELAY_MS = (\d+);/u);

  assert.ok(workerDelayMatch, 'worker reclaim delay must be explicit');
  assert.ok(mainDelayMatch, 'main-thread reclaim delay must be explicit');
  assert.ok(Number(workerDelayMatch[1]) >= 100, 'worker reclaim delay must allow a real reclamation window');
  assert.ok(Number(mainDelayMatch[1]) >= Number(workerDelayMatch[1]), 'main-thread fallback should not wait less than the worker retry');

  assert.match(memoryFallback, /terminateModuleWorkers\(\)/u);
  assert.match(memoryFallback, /releaseWorkerBundle\(\)/u);
  assert.match(memoryFallback, /await delay\(MEMORY_WORKER_RECLAIM_DELAY_MS\)/u);
  assert.match(memoryFallback, /await delay\(MEMORY_MAIN_THREAD_RECLAIM_DELAY_MS\)/u);

  const terminatePos = memoryFallback.indexOf('terminateModuleWorkers();');
  const releasePos = memoryFallback.indexOf('releaseWorkerBundle();');
  const waitPos = memoryFallback.indexOf('await delay(MEMORY_WORKER_RECLAIM_DELAY_MS);');
  const retryPos = memoryFallback.indexOf('createLowMemoryWorkerEngine();');
  assert.ok(terminatePos >= 0 && releasePos > terminatePos && waitPos > releasePos && retryPos > waitPos,
    'failed Worker resources must be terminated, released and given time to reclaim before the low-memory retry');

  assert.match(source, /async function startRememberedMemoryEngine\(\)[\s\S]*startMemoryCompatibilityEngine/u);
  assert.match(source, /memoryConstrained \? startRememberedMemoryEngine\(\) : startWorkerEngine\(\)/u);
});
