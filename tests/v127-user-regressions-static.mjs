import assert from 'node:assert/strict';
import fs from 'node:fs';

const experience = fs.readFileSync(new URL('../src/features/experience-fixes-controller.js', import.meta.url), 'utf8');
assert.ok(experience.includes('reconciling = true'), 'cooling/UI reconcile must be serialized');
assert.ok(experience.includes('editors.slice(1).forEach'), 'duplicate cooling editors must be removed');
assert.ok(experience.includes("await repairBeanCards(index)"), 'bean cards must be repaired from authoritative bean data');
assert.ok(experience.includes('named[0]') && experience.includes('named[1]'), 'bean display must fall back to readable bean.name country/variety');

const fullIntegration = fs.readFileSync(new URL('../src/features/full-integration-controller-v3.js', import.meta.url), 'utf8');
assert.ok(fullIntegration.includes('const loaded=await loadCodebook();index=makeIndex(loaded?.data||loaded)'), 'full integration must unwrap loadCodebook result before indexing');
assert.ok(fullIntegration.includes('function beanNameParts(bean)'), 'compact bean cards must preserve readable name fallback');
assert.ok(fullIntegration.includes('bean.countryName') && fullIntegration.includes('bean.varietyName'), 'compact bean cards must use readable bean-owned fields before showing 未定');

const imageQuality = fs.readFileSync(new URL('../src/image-quality.js', import.meta.url), 'utf8');
assert.ok(imageQuality.includes('androidNativeFallback'), 'Android must bypass WebView image decode failure');
assert.ok(imageQuality.includes('nativeSource: true'), 'Android fallback must mark the image as URI/native backed');
assert.ok(imageQuality.includes('Android 直接读取原始照片'), 'fallback must state that native Android reads the original image');

const packageCapture = fs.readFileSync(new URL('../src/package-capture-controller.js', import.meta.url), 'utf8');
assert.ok(packageCapture.includes('Android 原图 · 本地 URI 直接读取'), 'capture UI must not present a zero-byte WebView blob as the image source');
assert.ok(packageCapture.includes('previewAvailable: !nativeSource'), 'native-source fallback must suppress the broken WebView image preview');

const activity = fs.readFileSync(new URL('../android/app/src/main/java/com/luckybean/app/MainActivity.java', import.meta.url), 'utf8');
assert.ok(activity.includes('pendingRecognitionUris'), 'Android must retain selected content URIs for OCR');
assert.ok(activity.includes('rememberRecognitionSources(result)'), 'file chooser results must be retained before handing them to WebView');
assert.ok(activity.includes('InputImage.fromFilePath(MainActivity.this, sourceUri)'), 'native OCR must read content:// directly when WebView bytes are empty');

const gearFix = fs.readFileSync(new URL('../src/features/gear-regression-fix-controller.js', import.meta.url), 'utf8');
assert.ok(gearFix.includes('滤杯角度'), 'matching gear UI must use dripper angle');
assert.ok(!gearFix.includes('lbDripperShape'), 'canonical matching gear UI must not expose the obsolete shape selector');
assert.ok(gearFix.includes("$$(BLOCK_SELECTOR, host).forEach(node => node.remove())"), 'matching gear UI must remove stale duplicate blocks before rendering');

console.log('v127 screenshot regression static checks passed');
