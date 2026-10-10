import test from 'node:test';
import assert from 'node:assert/strict';
import { bestDictionarySpan, findDictionarySpans } from '../src/domain/recognition/dictionary-span-matcher.js';

const rows = [
  ['ST-TEST-SARDO', 'CO-CR', 'estate_or_farm', '莎朵庄园', 'Sardo Estate', 'active'],
  ['ST-TEST-CAMIS', 'CO-CR', 'estate_or_farm', '卡米斯特地块', 'Camist Lot', 'active'],
  ['ST-TEST-VOLCAN', 'CO-CR', 'estate_or_farm', '蓝火山庄园', 'Volcan Azul Estate', 'active']
];

test('dictionary scan finds aliases in continuous OCR text without token separators', () => {
  const codes = findDictionarySpans('产地哥斯达黎加莎朵庄园卡米斯特地块', rows).map(item => item.code);
  assert.ok(codes.includes('ST-TEST-SARDO'));
  assert.ok(codes.includes('ST-TEST-CAMIS'));
  assert.equal(bestDictionarySpan('蓝火山庄园批次 OT-036', rows)?.code, 'ST-TEST-VOLCAN');
});

test('dictionary scan crosses OCR whitespace, punctuation, and line boundaries', () => {
  const source = '庄园：\n莎朵庄\n园，卡米斯特\n地块';
  const matches = findDictionarySpans(source, rows);
  assert.deepEqual(new Set(matches.map(item => item.code)), new Set(['ST-TEST-SARDO', 'ST-TEST-CAMIS']));
  const sardo = matches.find(item => item.code === 'ST-TEST-SARDO');
  assert.equal(source.slice(sardo.start, sardo.end), '莎朵庄\n园');
});

test('same-length aliases from different dictionary rows remain ambiguous', () => {
  const ambiguousRows = [
    ['ST-A', '蓝色火山庄园', 'active'],
    ['ST-B', '蓝色火山庄园', 'active']
  ];
  assert.equal(bestDictionarySpan('蓝色火山庄园', ambiguousRows), null);
});

test('matching keeps astral characters and source offsets aligned', () => {
  const emojiRows = [['ST-EMOJI', '豆😀庄园', 'active']];
  const source = '产区：豆\n😀庄园';
  const match = bestDictionarySpan(source, emojiRows);
  assert.equal(match?.code, 'ST-EMOJI');
  assert.equal(source.slice(match.start, match.end), '豆\n😀庄园');
});
