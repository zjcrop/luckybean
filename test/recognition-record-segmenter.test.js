import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecognitionDocument } from '../src/domain/recognition/recognition-document.js';
import { splitRecognitionEntries } from '../src/domain/recognition/recognition-entry-splitter.js';

function box(left, top, right, bottom) {
  return [[left, top], [right, top], [right, bottom], [left, bottom]];
}

function block(id, text, left, top, right, bottom) {
  return { id, imageId:'photo', text, polygon:box(left, top, right, bottom), confidence:0.98 };
}

test('geometry split re-infers field relations inside each child without cross-record evidence', () => {
  const parent = createRecognitionDocument({
    images:[{ id:'photo', role:'front' }],
    engine:'stage3-relations',
    blocks:[
      block('l-country-label', 'COUNTRY', 40, 60, 155, 90),
      block('l-country-value', 'ETHIOPIA', 180, 60, 400, 90),
      block('r-country-label', 'COUNTRY', 650, 60, 765, 90),
      block('r-country-value', 'COLOMBIA', 790, 60, 1050, 90),
      block('l-variety-label', 'VARIETY', 40, 135, 155, 165),
      block('l-variety-value', 'GESHA', 180, 135, 400, 165),
      block('r-variety-label', 'VARIETY', 650, 135, 765, 165),
      block('r-variety-value', 'PINK BOURBON', 790, 135, 1080, 165),
      block('l-process-label', 'PROCESS', 40, 210, 155, 240),
      block('l-process-value', 'WASHED', 180, 210, 400, 240),
      block('r-process-label', 'PROCESS', 650, 210, 765, 240),
      block('r-process-value', 'HONEY PROCESS', 790, 210, 1080, 240)
    ]
  });

  assert.equal(parent.relations.length, 6);
  const result = splitRecognitionEntries(parent);
  assert.equal(result.split, true);
  assert.equal(result.method, 'geometry-side-by-side-v1');
  assert.equal(result.documents.length, 2);

  const left = result.documents[0];
  const right = result.documents[1];
  assert.deepEqual(left.relations.map(item => [item.field, item.value]), [
    ['country','ETHIOPIA'], ['variety','GESHA'], ['process','WASHED']
  ]);
  assert.deepEqual(right.relations.map(item => [item.field, item.value]), [
    ['country','COLOMBIA'], ['variety','PINK BOURBON'], ['process','HONEY PROCESS']
  ]);
  assert.ok(left.relations.every(item => item.imageId === 'photo'));
  assert.ok(right.relations.every(item => item.imageId === 'photo'));
  assert.doesNotMatch(left.fullText, /COLOMBIA|PINK BOURBON|HONEY PROCESS/u);
  assert.doesNotMatch(right.fullText, /ETHIOPIA|GESHA|WASHED/u);
});
