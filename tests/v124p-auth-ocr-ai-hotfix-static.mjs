import assert from 'node:assert/strict';
import fs from 'node:fs';

const auth=fs.readFileSync('src/services/cloud-auth-service.js','utf8');
const ai=fs.readFileSync('src/services/recognition-ai-service.js','utf8');
const pipeline=fs.readFileSync('src/domain/recognition/recognition-pipeline.js','utf8');
const capture=fs.readFileSync('src/package-capture-controller.js','utf8');
const paddle=fs.readFileSync('src/recognition-paddle-ocr.js','utf8');
const bridge=fs.readFileSync('src/recognition-bridge.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const release=JSON.parse(fs.readFileSync('release.json','utf8'));

assert.match(auth,/function consumeAuthCallback\(/);
assert.match(auth,/new URLSearchParams\(hash\)/);
assert.match(auth,/INITIAL_AUTH_CALLBACK_PARAMS = parseAuthCallbackHash\(INITIAL_AUTH_CALLBACK_HASH\)/);
assert.match(auth,/__LuckyBeanInitialAuthCallbackHash/);
assert.match(auth,/if \(authCallbackPromise\) return authCallbackPromise/);
assert.match(auth,/params\.get\('access_token'\)/);
assert.match(auth,/params\.get\('refresh_token'\)/);
assert.match(auth,/writeSession\(provisional\);[\s\S]*markServerActivity\(\);[\s\S]*clearAuthCallbackUrl\(\);[\s\S]*rawRequest\('\/auth\/v1\/user'/);
assert.match(auth,/history\.replaceState/);
assert.match(auth,/volatileSession/);
assert.match(auth,/cloud-auth-service-v7-immediate-atomic-callback/);
assert.match(auth,/void warmSession\(\)\.catch/);
assert.doesNotMatch(auth,/function writeSession\(value\) \{ if \(value\?\.access_token/,'session persistence must not use the old unguarded storage writer');

assert.match(ai,/recognition-ai-v1/);
assert.match(ai,/x-installation-id/);
assert.match(ai,/ai-enrichment-result\/1\.0/);
assert.match(ai,/authority !== 'advisory'/);
assert.match(ai,/mayOverwriteFact !== false/);
assert.doesNotMatch(ai,/ZHIPU_API_KEY|ZAI_API_KEY|open\.bigmodel\.cn/,'provider secret and provider endpoint must remain server-side');

assert.match(pipeline,/extensions\?\.aiEnrichment/);
assert.match(pipeline,/authority !== 'advisory'/);
assert.match(pipeline,/mayOverwriteFact !== false/);
assert.match(pipeline,/aiCandidates/);
assert.match(pipeline,/if \(missingEvidence && !item\.aiCandidates\?\.length\)/,'AI-only candidates must not become local evidence automatically');
assert.match(capture,/enrichRecognitionWithAi/);
assert.match(capture,/extensions = \{[\s\S]*aiEnrichment/);
assert.match(capture,/仅供确认/);

assert.match(paddle,/isWebKitFamily/);
assert.match(paddle,/direct-wasm-no-simd/);
assert.match(paddle,/browserSafe:true/);
assert.match(paddle,/simd:compatibility \? false : true/);
assert.match(bridge,/provider\.browserSafe !== true/);
assert.match(bridge,/isSafeWebPaddleProvider\(provider\)/);
assert.match(bridge,/module-worker/);
assert.match(bridge,/webkit-direct-wasm-no-simd/);
assert.match(bridge,/provider\.roiWorkerOnly !== true/);
assert.doesNotMatch(bridge,/invokeWebProvider\(globalThis\.LuckyBeanWebOCR|result\s*=\s*await[^\n]*LuckyBeanWebOCR/,'automatic Tesseract fallback must remain disabled');

assert.equal(release.revision,'1.24P-main.3');
assert.equal(release.androidVersionCode,102419);
assert.equal(release.releaseTag,'v1.24P-main.3');
assert.match(sw,/recognition-ai-service\.js/);

console.log('LuckyBean P0 deterministic auth callback, Safari OCR fallback and advisory AI recognition safety contract passed');