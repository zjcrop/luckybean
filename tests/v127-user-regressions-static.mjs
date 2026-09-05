import assert from 'node:assert/strict';
import fs from 'node:fs';

const cooling = fs.readFileSync(new URL('../src/ui/brew-cooling-controller.js', import.meta.url), 'utf8');
assert.ok(cooling.includes('editors.slice(1).forEach'), 'duplicate cooling editors must be removed at the canonical editor source');
assert.ok(cooling.includes("current.brew[first ? 'firstCoolingMode' : 'tailCoolingMode'] = 'custom'"), 'custom cooling must persist its mode');
assert.ok(cooling.includes('luckybean:brew-rendered'), 'cooling editor must update from brew render events');
assert.ok(!cooling.includes('MutationObserver'), 'cooling editor must not depend on repair observers');

const fullIntegration = fs.readFileSync(new URL('../src/features/full-integration-controller-v3.js', import.meta.url), 'utf8');
assert.ok(!fullIntegration.includes('loadCodebook'), 'full integration startup path must not load the full codebook');
assert.ok(fullIntegration.includes('bean-display-index.json'), 'full integration must use the compact derived display index');
assert.ok(fullIntegration.includes("all('beanSummaries')"), 'full integration must read the lightweight bean directory instead of canonical beans');
assert.ok(fullIntegration.includes('function beanNameParts(bean)'), 'compact bean cards must preserve readable name fallback');
assert.ok(fullIntegration.includes('bean.countryName') && fullIntegration.includes('bean.varietyName'), 'compact bean cards must use readable bean-owned fields before showing 未定');
assert.ok(fullIntegration.includes('beanObserver.observe(root'), 'compact bean presentation observer must be scoped to the bean container');
assert.ok(!fullIntegration.includes('observe(document.body'), 'full integration must not observe the whole document');

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

const gear = fs.readFileSync(new URL('../src/ui/gear-controller.js', import.meta.url), 'utf8');
assert.ok(gear.includes('滤杯角度'), 'canonical gear editor must own dripper angle');
assert.ok(gear.includes('旁通量'), 'canonical gear editor must own bypass');
assert.ok(gear.includes('过滤速度'), 'canonical gear editor must own paper speed');
assert.ok(!gear.includes('lbDripperShape'), 'small brew must not expose the obsolete shape selector');
assert.ok(!gear.includes('data-lb-legacy-gear-disabled'), 'legacy sentinel must not survive canonical ownership');
assert.ok(!gear.includes('MutationObserver'), 'gear editor must be event-driven');
assert.equal(fs.existsSync(new URL('../src/features/gear-regression-fix-controller.js', import.meta.url)), false, 'legacy gear guard must stay deleted');
assert.equal(fs.existsSync(new URL('../src/features/experience-fixes-controller.js', import.meta.url)), false, 'experience repair controller must stay deleted');

console.log('v127 canonical cooling/gear ownership and 1.24B Android image pipeline static checks passed');
