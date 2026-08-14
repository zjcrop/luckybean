import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecognitionDocument } from '../src/domain/recognition/recognition-document.js';

function box(left, top, right, bottom) {
  return [[left, top], [right, top], [right, bottom], [left, bottom]];
}

test('reversed inline key-value keeps the semantic field association', () => {
  const doc = createRecognitionDocument({
    images: [{ id: 'a', role: 'back' }],
    blocks: [{ imageId: 'a', text: '2026.07.27：烘焙日期', polygon: box(10, 10, 220, 34), confidence: 0.96 }]
  });
  assert.match(doc.fullText, /烘焙日期:\s*2026\.07\.27/);
  assert.equal(doc.relations[0]?.field, 'roastDate');
  assert.equal(doc.relations[0]?.mode, 'inline-punctuation');
});

test('same-row value before label is paired by geometry and field semantics', () => {
  const doc = createRecognitionDocument({
    images: [{ id: 'a', role: 'back' }],
    blocks: [
      { id: 'value', imageId: 'a', text: '74110', polygon: box(10, 40, 88, 66), confidence: 0.98 },
      { id: 'label', imageId: 'a', text: '豆种', polygon: box(120, 40, 175, 66), confidence: 0.99 }
    ]
  });
  assert.match(doc.fullText, /豆种:\s*74110/);
  assert.equal(doc.relations[0]?.field, 'variety');
  assert.equal(doc.relations[0]?.mode, 'same-row');
});

test('vertical title and value are paired in either reading direction', () => {
  const doc = createRecognitionDocument({
    images: [{ id: 'a', role: 'back' }],
    blocks: [
      { id: 'value', imageId: 'a', text: '1850 MASL', polygon: box(200, 50, 310, 76), confidence: 0.95 },
      { id: 'label', imageId: 'a', text: '海拔', polygon: box(205, 88, 268, 114), confidence: 0.99 }
    ]
  });
  assert.match(doc.fullText, /海拔:\s*1850 MASL/);
  assert.equal(doc.relations[0]?.field, 'altitude');
  assert.equal(doc.relations[0]?.mode, 'same-column');
});

test('standalone unordered coffee entities remain available instead of being forced into unrelated fields', () => {
  const doc = createRecognitionDocument({
    images: [{ id: 'a', role: 'front' }],
    blocks: [
      { imageId: 'a', text: '埃塞俄比亚', polygon: box(20, 20, 130, 45), confidence: 0.96 },
      { imageId: 'a', text: '西达摩', polygon: box(20, 70, 100, 95), confidence: 0.95 },
      { imageId: 'a', text: '水洗', polygon: box(20, 120, 80, 145), confidence: 0.97 },
      { imageId: 'a', text: '74110', polygon: box(20, 170, 90, 195), confidence: 0.98 }
    ]
  });
  assert.equal(doc.relations.length, 0);
  assert.match(doc.fullText, /埃塞俄比亚/);
  assert.match(doc.fullText, /西达摩/);
  assert.match(doc.fullText, /水洗/);
  assert.match(doc.fullText, /74110/);
});

test('range hyphen is preserved as value content rather than treated as a field separator', () => {
  const doc = createRecognitionDocument({
    images: [{ id: 'a', role: 'back' }],
    blocks: [{ imageId: 'a', text: '海拔：1500-1800m', polygon: box(10, 10, 220, 34), confidence: 0.96 }]
  });
  assert.match(doc.fullText, /海拔:\s*1500-1800m/);
  assert.equal(doc.relations[0]?.field, 'altitude');
});
