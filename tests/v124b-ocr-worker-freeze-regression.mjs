import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [releaseText, paddle, bridge, roiWorker, runtime, capture, vendor] = await Promise.all([
  readFile(new URL('../release.json', import.meta.url), 'utf8'),
  readFile(new URL('../src/recognition-paddle-ocr.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/recognition-bridge.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/recognition-roi-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/features/runtime-features.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/package-capture-controller.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/prepare-paddleocr-vendor.mjs', import.meta.url), 'utf8')
]);
const release = JSON.parse(releaseText);

assert.match(paddle, /worker:\s*\{\s*createWorker:/, 'PP-OCR must use an explicit dedicated Worker factory');
assert.match(paddle, /new Worker\(assetUrl\('worker\.js'\),\s*\{\s*type:\s*'module'/, 'PP-OCR worker must resolve through the relocatable same-origin asset base');
assert.match(paddle, /new Worker\(assetUrl\('roi-worker\.js'\),\s*\{\s*type:\s*'classic'/, 'ROI cropper must run in its own same-origin Worker');
assert.match(paddle, /roiWorkerOnly:\s*true/, 'provider must advertise a Worker-only ROI contract');
assert.match(paddle, /regionRecognition:\s*'recognition-roi\/1\.0'/, 'provider must expose the versioned normalized ROI protocol');
assert.match(paddle, /recognizeRegion\(blob,\s*region,\s*options\s*=\s*\{\}\)/, 'provider must expose explicit region recognition');
assert.doesNotMatch(paddle, /document\.createElement\(['"]canvas['"]\)/, 'formal PP-OCR provider must not crop on a DOM canvas');
assert.doesNotMatch(paddle, /new\s+OffscreenCanvas/, 'formal PP-OCR provider must not perform ROI canvas work on the UI thread');
assert.match(paddle, /runtimeOrigin:\s*'same-origin-vendored'/, 'provider must advertise a same-origin runtime');
assert.match(paddle, /public\/vendor\/paddleocr/, 'LuckyBean standalone runtime must retain its native source-module vendor default');
assert.match(paddle, /CoffeeFoundationOcrAssetBase/, 'Foundation consumers must be able to provide a relocated OCR asset base');
assert.match(paddle, /function defaultRuntimeBase\(\)[\s\S]*new URL\('\.\.\/public\/vendor\/paddleocr\/',\s*import\.meta\.url\)/, 'import.meta fallback must be lazy and source-module only');
assert.doesNotMatch(paddle, /const\s+DEFAULT_RUNTIME_BASE\s*=\s*new URL\([^\n]*import\.meta\.url/, 'import.meta must not be evaluated at module initialization because classic-IIFE consumers cannot provide it');
assert.match(paddle, /if \(configured\)[\s\S]*new URL\(configured,\s*globalThis\.location\?\.href\s*\|\|\s*'http:\/\/localhost\/'\)/, 'configured consumer base must resolve without touching import.meta');
assert.match(paddle, /textDetectionModelAsset:\s*\{\s*url:\s*assetUrl\('models\/PP-OCRv5_mobile_det_onnx_infer\.tar'\)\s*\}/, 'detection model must resolve from the configured same-origin asset base');
assert.match(paddle, /textRecognitionModelAsset:\s*\{\s*url:\s*assetUrl\('models\/PP-OCRv5_mobile_rec_onnx_infer\.tar'\)\s*\}/, 'recognition model must resolve from the configured same-origin asset base');
assert.match(paddle, /wasmPaths:\s*assetUrl\('ort\/'\)/, 'ONNX Runtime WASM must resolve from the configured same-origin asset base');
assert.doesNotMatch(paddle, /cdn\.jsdelivr\.net/, 'browser OCR source must not depend on jsDelivr at runtime');
assert.doesNotMatch(paddle, /paddle-model-ecology\.bj\.bcebos\.com/, 'browser OCR source must not fetch Paddle models cross-origin at runtime');
assert.doesNotMatch(paddle, /worker:\s*false/, 'PP-OCR must never fall back to direct main-thread mode');
assert.doesNotMatch(paddle, /createEngine\(false\)/, 'legacy main-thread Paddle fallback must stay removed');
assert.match(paddle, /workerOnly:\s*true/, 'provider must advertise the Worker-only safety contract');
assert.match(paddle, /requestIdleCallback/, 'web OCR model preparation must be scheduled during browser idle time');
assert.match(paddle, /preload/, 'web OCR provider must expose background preloading');
assert.match(paddle, /ENGINE_INIT_TIMEOUT_MS/, 'engine initialization must have a bounded watchdog');
assert.match(paddle, /PREDICT_TIMEOUT_MS/, 'per-image prediction must have a bounded watchdog');
assert.match(paddle, /ROI_CROP_TIMEOUT_MS/, 'ROI preprocessing must have a bounded watchdog');
assert.match(paddle, /不会切换到主线程 OCR 或 Tesseract/, 'interactive failure must explicitly preserve the non-blocking fallback policy');

assert.match(roiWorker, /createImageBitmap\(blob,\s*\{\s*imageOrientation:\s*'from-image'\s*\}\)/, 'ROI Worker must decode orientation-aware source pixels off the UI thread');
assert.match(roiWorker, /new\s+OffscreenCanvas\(/, 'ROI Worker must crop with OffscreenCanvas');
assert.match(roiWorker, /convertToBlob\(/, 'ROI Worker must return an immutable Blob to the OCR provider');
assert.match(roiWorker, /Math\.min\(1,\s*maxEdge\s*\/\s*Math\.max\(crop\.width,\s*crop\.height\)\)/, 'ROI Worker may downscale oversized crops but must never upscale them before PP-OCR');
assert.doesNotMatch(roiWorker, /\bdocument\b/, 'ROI Worker must not depend on DOM APIs');
assert.doesNotMatch(roiWorker, /FileReader/, 'ROI Worker must not base64-encode source images');

assert.match(vendor, /SDK_ESM_URL/, 'build step must vendor the pinned PaddleOCR ESM runtime');
assert.match(vendor, /PP-OCRv5_mobile_det_onnx_infer\.tar/, 'build step must vendor the PP-OCRv5 detection model');
assert.match(vendor, /PP-OCRv5_mobile_rec_onnx_infer\.tar/, 'build step must vendor the PP-OCRv5 recognition model');
assert.match(vendor, /ort-wasm-simd-threaded\.wasm/, 'build step must vendor the baseline ONNX Runtime WASM binary');
assert.match(vendor, /ort-wasm-simd-threaded\.jsep\.mjs/, 'build step must vendor the ONNX Runtime JSEP module selected by the browser build');
assert.match(vendor, /ort-wasm-simd-threaded\.jsep\.wasm/, 'build step must vendor the matching ONNX Runtime JSEP WASM binary');
assert.match(vendor, /roi-worker\.js/, 'build step must ship the ROI preprocessing Worker beside the PP-OCR runtime');
assert.match(vendor, /remainingImports/, 'vendored browser ESM must reject unresolved CDN import dependencies');

assert.doesNotMatch(runtime, /feature\(['"]recognition-web-ocr['"]/, 'legacy Tesseract runtime must not be loaded by the formal app');
assert.match(runtime, /feature\(['"]recognition-paddle-ocr['"]/, 'formal runtime must load PP-OCR before package capture');
assert.ok(
  runtime.indexOf("feature('recognition-paddle-ocr'") < runtime.indexOf("feature('package-capture'"),
  'PP-OCR module must be installed before the package-capture UI becomes available'
);

assert.match(bridge, /paddleWorkerRecognize/, 'bridge must route web OCR through the Worker-only Paddle provider');
assert.match(bridge, /provider\.workerOnly\s*!==\s*true/, 'bridge must reject an unsafe non-worker Paddle provider');
assert.match(bridge, /export\s+async\s+function\s+recognizeImageRegion/, 'shared bridge must expose normalized ROI recognition to downstream Foundation consumers');
assert.match(bridge, /provider\.roiWorkerOnly\s*!==\s*true/, 'bridge must reject any ROI provider that is not explicitly Worker-only');
assert.match(bridge, /不会回退主线程裁剪/, 'ROI failure must not enter a main-thread crop fallback');
assert.doesNotMatch(bridge, /invokeWebProvider\(globalThis\.LuckyBeanWebOCR/, 'bridge must not automatically invoke Tesseract');
assert.doesNotMatch(bridge, /\['web',\s*globalThis\.LuckyBeanWebOCR/, 'legacy provider must not re-enter an automatic fallback list');
assert.match(bridge, /webPaddle:\s*Boolean\(globalThis\.LuckyBeanPaddleOCR\?\.workerOnly\s*===\s*true\)/, 'capability UI must only report a safe Worker Paddle engine');
assert.match(bridge, /webPaddleRegion:\s*Boolean\(/, 'capability contract must report region recognition separately');

assert.match(capture, /finally\s*\{[\s\S]*captureState\.busy\s*=\s*false;[\s\S]*render\(\)/, 'package recognition must always restore interactive UI state');
assert.match(capture, /recognitionQueued\s*=\s*false/, 'recognition click queue must always be releasable');

console.log(`LuckyBean ${release.displayVersion} browser OCR is same-origin, Worker-only, relocatable, ROI-capable, timeout-bounded, and has no automatic Tesseract/main-thread fallback`);
