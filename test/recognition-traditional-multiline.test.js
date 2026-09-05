import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRecognitionDocument } from '../src/domain/recognition/recognition-document.js';
import { analyzeRecognitionDocument } from '../src/domain/recognition/recognition-pipeline.js';
import { repairRecognitionSemanticText } from '../src/domain/recognition/recognition-semantic-repair.js';

const book = JSON.parse(readFileSync(new URL('../public/fallback-codebook.json', import.meta.url), 'utf8'));

function textDocument(fullText) {
  return createRecognitionDocument({
    images: [{ id: 'text', role: 'text' }],
    blocks: [],
    engine: 'text-regression',
    fullText
  });
}

test('label-only Traditional Chinese lines pair with the following OCR value', () => {
  const repaired = repairRecognitionSemanticText([
    '國家',
    '衣索比亞',
    '產區',
    '古吉',
    '品種',
    'Gesha',
    '處理法',
    '日曬'
  ].join('\n'), book);

  assert.match(repaired, /国家: 衣索比亞 \/ 埃塞俄比亚/);
  assert.match(repaired, /产区: 古吉/);
  assert.match(repaired, /豆种: Gesha/);
  assert.match(repaired, /处理法: 日曬 \/ 日晒/);
});

test('Traditional multiline coffee metadata resolves through the normal canonical pipeline', () => {
  const analysis = analyzeRecognitionDocument(textDocument([
    '國家',
    '衣索比亞',
    '產區',
    '古吉',
    '品種',
    'Gesha',
    '處理法',
    '日曬',
    '烘焙日期',
    '2026-08-18'
  ].join('\n')), book);

  assert.equal(analysis.parsed.countryCode, 'CO-EA');
  assert.equal(analysis.parsed.regionCode, 'RG-EA-GU');
  assert.equal(analysis.parsed.processCode, 'PR-NA');
  assert.equal(analysis.parsed.roastDate, '2026-08-18');
  assert.match(analysis.semanticText, /国家:/);
  assert.match(analysis.semanticText, /处理法:/);
});

test('Traditional inline field labels are canonicalized without changing unknown proper names', () => {
  const analysis = analyzeRecognitionDocument(textDocument([
    '國家：哥倫比亞',
    '莊園：山嵐莊園',
    '處理法：厭氧發酵',
    '風味描述：白花、柑橘、蜂蜜'
  ].join('\n')), book);

  assert.equal(analysis.parsed.countryCode, 'CO-CO');
  assert.equal(analysis.parsed.entityCode, undefined);
  assert.equal(analysis.parsed.entityCustomName, '山嵐莊園');
  assert.match(analysis.semanticText, /庄园 \/ 处理站: 山嵐莊園/);
  assert.match(analysis.semanticText, /处理法:/);
  assert.match(analysis.semanticText, /风味:/);
});

test('a following field label is never consumed as the previous label-only value', () => {
  const repaired = repairRecognitionSemanticText(['產區', '處理法', '水洗'].join('\n'), book);
  assert.equal(repaired, ['产区', '处理法: 水洗'].join('\n'));
});
