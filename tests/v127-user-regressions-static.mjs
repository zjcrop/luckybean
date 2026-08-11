import assert from 'node:assert/strict';
import fs from 'node:fs';

const experience = fs.readFileSync(new URL('../src/features/experience-fixes-controller.js', import.meta.url), 'utf8');
assert.ok(experience.includes('reconciling = true'), 'cooling/UI reconcile must be serialized');
assert.ok(experience.includes('editors.slice(1).forEach'), 'duplicate cooling editors must be removed');
assert.ok(experience.includes("await repairBeanCards(index)"), 'bean cards must be repaired from authoritative bean data');
assert.ok(experience.includes('named[0]') && experience.includes('named[1]'), 'bean display must fall back to readable bean.name country/variety');

const imageQuality = fs.readFileSync(new URL('../src/image-quality.js', import.meta.url), 'utf8');
assert.ok(imageQuality.includes('androidNativeFallback'), 'Android must bypass WebView image decode failure');
assert.ok(imageQuality.includes('blob: file'), 'Android fallback must preserve original image blob for native OCR');
assert.ok(imageQuality.includes('直接交给 Android 本地 OCR'), 'fallback reason must be explicit');

console.log('v127 screenshot regression static checks passed');
