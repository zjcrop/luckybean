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

const recognitionBridge = fs.readFileSync(new URL('../src/recognition-bridge.js', import.meta.url), 'utf8');
assert.ok(recognitionBridge.includes("dataUrl: nativeSource ? '' : await blobToDataUrl(image.blob)"), 'Android URI-backed photos must skip WebView FileReader encoding');

const packageCapture = fs.readFileSync(new URL('../src/package-capture-controller.js', import.meta.url), 'utf8');
assert.ok(packageCapture.includes('bindAndroidImageSource(id, nativeSource)'), 'every Android-selected image must bind to its content URI in file order');
assert.ok(packageCapture.includes('原生缩略预览'), 'capture UI must expose the native JPEG preview path');
assert.ok(packageCapture.includes('previewAvailable: Boolean(previewUrl)'), 'native-source fallback must show a preview when Android returns a thumbnail');

const activity = fs.readFileSync(new URL('../android/app/src/main/java/com/luckybean/app/MainActivity.java', import.meta.url), 'utf8');
assert.ok(activity.includes('pendingRecognitionUris'), 'Android must retain selected content URIs for OCR');
assert.ok(activity.includes('rememberRecognitionSources(result)'), 'file chooser results must be retained before handing them to WebView');
assert.ok(activity.includes('bindImageSource(String imageId, boolean includePreview)'), 'WebView image ids must bind to native content URIs before OCR');
assert.ok(activity.includes('ImageDecoder.createSource'), 'Android must generate a platform-decoded JPEG preview for WebView');
assert.ok(activity.includes('InputImage.fromFilePath(MainActivity.this, sourceUri)'), 'native OCR must read content:// directly when WebView bytes are empty');

const gearFix = fs.readFileSync(new URL('../src/features/gear-regression-fix-controller.js', import.meta.url), 'utf8');
assert.ok(gearFix.includes('滤杯角度'), 'gear compatibility guard must document dripper-angle ownership');
assert.ok(!gearFix.includes('lbDripperShape'), 'small brew must not expose the obsolete shape selector');
assert.ok(gearFix.includes('data-lb-legacy-gear-disabled') || gearFix.includes('lbLegacyGearDisabled'), 'small brew must keep an inert sentinel that blocks legacy editor recreation');
assert.ok(gearFix.includes('if (!node.matches(SENTINEL_SELECTOR)) node.remove()'), 'stale legacy matching blocks must be removed while the inert sentinel remains');

console.log('v127 screenshot regression, no-small-brew-gear-editor and 1.23E Android image pipeline static checks passed');
