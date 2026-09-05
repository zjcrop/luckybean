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

assert.match(paddle, /worker:\s*\{\s*createWorker:/, 'primary PP-OCR path must use an explicit dedicated Worker factory');
assert.match(paddle, /new Worker\(assetUrl\('worker\.js'\),\s*\{\s*type:\s*'module'/, 'primary PP-OCR Worker must stay same-origin and relocatable');
assert.match(paddle, /new Worker\(assetUrl\('roi-worker\.js'\),\s*\{\s*type:\s*'classic'/, 'ROI cropper must remain isolated in a Worker');
assert.match(paddle, /roiWorkerOnly:\s*true/, 'ROI contract must remain Worker-only');
assert.match(paddle, /regionRecognition:\s*'recognition-roi\/1\.0'/, 'provider must expose normalized ROI protocol');
assert.match(paddle, /runtimeOrigin:\s*'same-origin-vendored'/, 'provider must stay same-origin');
assert.match(paddle, /CoffeeFoundationOcrAssetBase/, 'Foundation consumers must be able to relocate OCR assets');
assert.match(paddle, /textDetectionModelAsset:[\s\S]*PP-OCRv5_mobile_det_onnx_infer\.tar/, 'detection model must be vendored');
assert.match(paddle, /textRecognitionModelAsset:[\s\S]*PP-OCRv5_mobile_rec_onnx_infer\.tar/, 'recognition model must be vendored');
assert.match(paddle, /wasmPaths:\s*assetUrl\('ort\/'\)/, 'ORT WASM must stay same-origin');
assert.doesNotMatch(paddle, /cdn\.jsdelivr\.net/, 'browser OCR source must not depend on CDN at runtime');
assert.doesNotMatch(paddle, /paddle-model-ecology\.bj\.bcebos\.com/, 'browser OCR source must not fetch models cross-origin at runtime');

assert.match(paddle, /function isWebKitFamily\(/, 'Safari fallback must be WebKit-gated');
assert.match(paddle, /createCompatibilityEngine/, 'Safari must have a bounded compatibility engine');
assert.match(paddle, /simd:\s*compatibility\s*\?\s*false\s*:\s*true/, 'compatibility engine must disable SIMD');
assert.match(paddle, /direct-wasm-no-simd/, 'compatibility engine must be explicitly identified');
assert.match(paddle, /Math\.min\(LIMIT_SIDE,\s*640\)/, 'compatibility mode must cap OCR input size');
assert.match(paddle, /browserSafe:\s*true/, 'provider must advertise the bounded browser-safe contract');
assert.match(paddle, /compatibilityFallback:\s*'webkit-direct-wasm-no-simd'/, 'provider must disclose Safari fallback mode');
assert.match(paddle, /ENGINE_INIT_TIMEOUT_MS/, 'engine initialization must remain bounded');
assert.match(paddle, /PREDICT_TIMEOUT_MS/, 'per-image prediction must remain bounded');
assert.match(paddle, /ROI_CROP_TIMEOUT_MS/, 'ROI preprocessing must remain bounded');
assert.match(paddle, /不会切换到 Tesseract/, 'failure policy must explicitly prohibit Tesseract fallback');
assert.doesNotMatch(paddle, /LuckyBeanWebOCR/, 'formal Paddle provider must never invoke legacy Tesseract');

assert.match(roiWorker, /createImageBitmap\(blob,\s*\{\s*imageOrientation:\s*'from-image'/, 'ROI Worker must decode orientation-aware source pixels');
assert.match(roiWorker, /new\s+OffscreenCanvas\(/, 'ROI Worker must keep crop canvas off the UI thread');
assert.match(roiWorker, /convertToBlob\(/, 'ROI Worker must return Blob output');
assert.doesNotMatch(roiWorker, /\bdocument\b/, 'ROI Worker must not depend on DOM APIs');

assert.match(vendor, /SDK_ESM_URL/, 'build must vendor pinned PaddleOCR ESM runtime');
assert.match(vendor, /PP-OCRv5_mobile_det_onnx_infer\.tar/, 'build must vendor detection model');
assert.match(vendor, /PP-OCRv5_mobile_rec_onnx_infer\.tar/, 'build must vendor recognition model');
assert.match(vendor, /ort-wasm-simd-threaded\.wasm/, 'build must vendor ORT WASM');
assert.match(vendor, /roi-worker\.js/, 'build must ship ROI worker');

assert.doesNotMatch(runtime, /feature\(['"]recognition-web-ocr['"]/, 'legacy Tesseract runtime must stay disabled');
assert.match(runtime, /feature\(['"]recognition-paddle-ocr['"]/, 'runtime must load PP-OCR before package capture');
assert.ok(runtime.indexOf("feature('recognition-paddle-ocr'") < runtime.indexOf("feature('package-capture'"), 'PP-OCR must install before capture UI');

assert.match(bridge, /paddleBrowserRecognize/, 'bridge must accept the controlled browser-safe provider');
assert.match(bridge, /provider\.workerOnly!==true\s*&&\s*provider\.browserSafe!==true/, 'bridge must reject undeclared unsafe providers');
assert.match(bridge, /provider\.roiWorkerOnly!==true/, 'ROI bridge must still reject non-worker ROI providers');
assert.match(bridge, /不会回退主线程裁剪/, 'ROI must not fall back to UI-thread crop');
assert.doesNotMatch(bridge, /invokeWebProvider\(globalThis\.LuckyBeanWebOCR/, 'bridge must not automatically invoke Tesseract');
assert.match(bridge, /webPaddle:Boolean\(globalThis\.LuckyBeanPaddleOCR\?\.workerOnly===true\s*\|\|\s*globalThis\.LuckyBeanPaddleOCR\?\.browserSafe===true\)/, 'capability UI must accept worker or bounded browser-safe PP-OCR');

assert.match(capture, /captureState\.busy\s*=\s*false/, 'package recognition must restore interactive state');
assert.match(capture, /recognitionQueued\s*=\s*false/, 'recognition click queue must be releasable');

console.log(`LuckyBean ${release.displayVersion} browser OCR keeps Worker-first isolation, adds bounded WebKit direct-WASM fallback, preserves Worker-only ROI, and never falls back to Tesseract`);
