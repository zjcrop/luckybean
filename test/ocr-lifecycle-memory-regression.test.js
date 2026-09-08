import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('OCR provider is registered before capture and model warmup starts only from an explicit add-session', async () => {
  const source = await read('src/features/runtime-features.js');
  const startup = source.match(/for \(const runtimeFeature of CORE_FEATURES\)[\s\S]*?await loadMany\(P2_CORE_FEATURES/)?.[0] || '';
  assert.match(startup, /await loadFeature\('recognition-paddle-ocr'\)/);
  assert.match(startup, /await loadMany\(PREINTERACTION_FEATURE_IDS\)/);
  assert.ok(startup.indexOf("await loadFeature('recognition-paddle-ocr')") < startup.indexOf('await loadMany(PREINTERACTION_FEATURE_IDS)'));
  assert.doesNotMatch(startup, /\.preload\s*\(|beginRecognitionSession\s*\(/, 'startup registration must not initialize the OCR model');

  const preinteraction = source.match(/const PREINTERACTION_FEATURE_IDS[\s\S]*?\]\);/)?.[0] || '';
  assert.match(preinteraction, /'package-capture'/);

  const beginSession = source.match(/async function beginRecognitionSession\([\s\S]*?\n}\nasync function endRecognitionSession/)?.[0] || '';
  assert.match(beginSession, /loadFeature\('recognition-paddle-ocr'\)/);
  assert.match(beginSession, /provider\.beginSession\(reason\)/);

  const triggerSection = source.match(/function installLazyTriggers\(\)[\s\S]*?\n}\n\nconst ALL_CORE_FEATURES/)?.[0] || '';
  assert.doesNotMatch(triggerSection, /void warmRecognition\(\)/);
  assert.match(triggerSection, /beginRecognitionSession\(addEntry\.reason\)/);
  assert.match(triggerSection, /beginRecognitionSession\(`pointer:\$\{addEntry\.reason\}`\)/);
});

test('terminal OCR batches are purged and never restored as active progress', async () => {
  const source = await read('src/features/recognition-batch-progress-controller.js');
  assert.match(source, /clearRecognitionBatchSnapshot/);
  assert.match(source, /\['paused','failed','completed'\]/);
  assert.match(source, /batch\?\.status==='processing'\)render\(batch\)/);
  assert.doesNotMatch(source, /\['processing','paused'\]\.includes\(batch\.status\)/);
  assert.match(source, /本次识别失败/);
});

test('web package preprocessing is memory-aware and explicitly releases canvas buffers', async () => {
  const source = await read('src/image-quality.js');
  assert.match(source, /PACKAGE_OCR_MAX_EDGE = 2200/);
  assert.match(source, /PACKAGE_OCR_LOW_MEMORY_MAX_EDGE = 1600/);
  assert.match(source, /deviceMemory/);
  assert.match(source, /memoryAwareMaxEdge\(maxEdge\)/);
  assert.match(source, /releaseCanvas\(sampleCanvas\)/);
  assert.match(source, /releaseCanvas\(outputCanvas\)/);
  assert.match(source, /image\.close/);
});
