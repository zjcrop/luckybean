import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [paddle, bridge, runtime, capture] = await Promise.all([
  readFile(new URL('../src/recognition-paddle-ocr.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/recognition-bridge.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/features/runtime-features.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/package-capture-controller.js', import.meta.url), 'utf8')
]);

assert.match(paddle, /worker:\s*\{\s*createWorker:/, 'PP-OCR must use an explicit dedicated Worker factory');
assert.match(paddle, /new Worker\(bootstrapUrl,\s*\{\s*type:\s*'module'/, 'cross-origin Paddle worker bundle must be bootstrapped through a module Blob worker');
assert.match(paddle, /worker-entry-/, 'worker bundle path must come from the pinned official distribution');
assert.doesNotMatch(paddle, /worker:\s*false/, 'PP-OCR must never fall back to direct main-thread mode');
assert.doesNotMatch(paddle, /createEngine\(false\)/, 'legacy main-thread Paddle fallback must stay removed');
assert.match(paddle, /workerOnly:\s*true/, 'provider must advertise the Worker-only safety contract');
assert.match(paddle, /requestIdleCallback/, 'web OCR model preparation must be scheduled during browser idle time');
assert.match(paddle, /preload/, 'web OCR provider must expose background preloading');
assert.match(paddle, /ENGINE_INIT_TIMEOUT_MS/, 'engine initialization must have a bounded watchdog');
assert.match(paddle, /PREDICT_TIMEOUT_MS/, 'per-image prediction must have a bounded watchdog');
assert.match(paddle, /不会切换到主线程 OCR 或 Tesseract/, 'interactive failure must explicitly preserve the non-blocking fallback policy');

assert.doesNotMatch(runtime, /feature\(['"]recognition-web-ocr['"]/, 'legacy Tesseract runtime must not be loaded by the formal app');
assert.match(runtime, /feature\(['"]recognition-paddle-ocr['"]/, 'formal runtime must load PP-OCR before package capture');
assert.ok(
  runtime.indexOf("feature('recognition-paddle-ocr'") < runtime.indexOf("feature('package-capture'"),
  'PP-OCR module must be installed before the package-capture UI becomes available'
);

assert.match(bridge, /paddleWorkerRecognize/, 'bridge must route web OCR through the Worker-only Paddle provider');
assert.match(bridge, /provider\.workerOnly\s*!==\s*true/, 'bridge must reject an unsafe non-worker Paddle provider');
assert.doesNotMatch(bridge, /invokeWebProvider\(globalThis\.LuckyBeanWebOCR/, 'bridge must not automatically invoke Tesseract');
assert.doesNotMatch(bridge, /\['web',\s*globalThis\.LuckyBeanWebOCR/, 'legacy provider must not re-enter an automatic fallback list');
assert.match(bridge, /webPaddle:\s*Boolean\(globalThis\.LuckyBeanPaddleOCR\?\.workerOnly\s*===\s*true\)/, 'capability UI must only report a safe Worker Paddle engine');

assert.match(capture, /finally\s*\{[\s\S]*captureState\.busy\s*=\s*false;[\s\S]*render\(\)/, 'package recognition must always restore interactive UI state');
assert.match(capture, /recognitionQueued\s*=\s*false/, 'recognition click queue must always be releasable');

console.log('LuckyBean 1.24B browser OCR is Worker-only, prewarmed, timeout-bounded, and has no automatic Tesseract/main-thread fallback');
