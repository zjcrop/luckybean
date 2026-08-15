import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const capture = readFileSync(new URL('../src/package-capture-controller.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/ui-layout-controller.js', import.meta.url), 'utf8');
const pipeline = readFileSync(new URL('../src/domain/recognition/recognition-pipeline.js', import.meta.url), 'utf8');

assert.match(capture, /analyzeRecognitionDocument\(captureState\.recognitionDocument, book\)/);
assert.match(capture, /翻译与字段整理/);
assert.match(capture, /已翻译归一/);
assert.match(capture, /LuckyBeanRecognitionFlow/);
assert.match(app, /processRecognitionDocument\(recognitionDocument/);
assert.match(app, /analyzeRecognitionDocument\(recognitionDocument, state\.codebook\)/);
assert.doesNotMatch(app, /parseNaturalLanguage\(sourceText, state\.codebook\)/);
assert.doesNotMatch(layout, /addEventListener\('click', interceptRecognitionParse/);
assert.match(pipeline, /rawFullText/);
assert.match(pipeline, /semanticText/);
assert.match(pipeline, /reviewFields/);

console.log('Recognition document is the single translated and structured bean-entry source');
