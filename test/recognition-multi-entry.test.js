import test from 'node:test';
import assert from 'node:assert/strict';
import { recognitionDocumentFromText, createRecognitionDocument } from '../src/domain/recognition/recognition-document.js';
import { splitRecognitionEntries, MULTI_ENTRY_SCHEMA } from '../src/domain/recognition/recognition-entry-splitter.js';
import { groupRecognitionRecordCandidates, RECOGNITION_RECORD_CANDIDATE_SCHEMA } from '../src/domain/recognition/recognition-record-segmenter.js';

function box(left, top, right, bottom) {
  return [[left, top], [right, top], [right, bottom], [left, bottom]];
}

function block(id, text, left, top, right, bottom) {
  return { id, imageId:'photo', text, polygon:box(left, top, right, bottom), confidence:0.98 };
}

function sideBySideDocument() {
  return createRecognitionDocument({
    images:[{ id:'photo', role:'front', roleLabel:'菜单照片' }],
    engine:'stage3-fixture',
    blocks:[
      block('left-origin', 'Ethiopia Guji', 60, 90, 470, 135),
      block('right-origin', 'Colombia Huila', 680, 90, 1110, 135),
      block('left-variety', 'Gesha', 60, 185, 330, 230),
      block('right-variety', 'Pink Bourbon', 680, 185, 1080, 230),
      block('left-process', 'Washed', 60, 280, 330, 325),
      block('right-process', 'Honey Process', 680, 280, 1000, 325),
      block('left-flavor', 'Jasmine Citrus', 60, 375, 470, 420),
      block('right-flavor', 'Peach Cacao', 680, 375, 1050, 420)
    ]
  });
}

test('explicit bean headings split into independent recognition documents', () => {
  const document = recognitionDocumentFromText(`样品1：\n国家: ETHIOPIA\n产区: GUJI\n处理法: NATURAL\n豆种: 74110\n\n样品2：\n国家: KENYA\n产区: NYERI\n处理法: WASHED\n豆种: SL28`);
  const result = splitRecognitionEntries(document);
  assert.equal(result.split, true);
  assert.equal(result.documents.length, 2);
  assert.equal(result.method, 'entry-headings');
  assert.equal(result.schemaVersion, MULTI_ENTRY_SCHEMA);
  assert.match(result.documents[0].rawFullText, /ETHIOPIA/);
  assert.match(result.documents[1].rawFullText, /KENYA/);
  assert.equal(result.documents[0].extensions.multiEntry.index, 1);
  assert.equal(result.documents[1].extensions.multiEntry.index, 2);
  assert.equal(result.documents[0].extensions.multiEntry.requiresUserConfirmation, true);
  assert.equal(result.documents[0].extensions.multiEntry.evidencePreserved, false);
});

test('repeated strong country anchors split when each segment contains multiple coffee fields', () => {
  const document = recognitionDocumentFromText(`COUNTRY: ETHIOPIA\nREGION: GUJI\nPROCESS: NATURAL\nVARIETY: 74110\nCOUNTRY: COLOMBIA\nREGION: HUILA\nPROCESS: WASHED\nVARIETY: CASTILLO`);
  const result = splitRecognitionEntries(document);
  assert.equal(result.split, true);
  assert.equal(result.documents.length, 2);
  assert.equal(result.method, 'repeated-country-anchor');
});

test('geometry-first side-by-side cards become evidence-preserving record candidates', () => {
  const document = sideBySideDocument();

  const grouped = groupRecognitionRecordCandidates(document);
  assert.equal(grouped.grouped, true);
  assert.equal(grouped.method, 'geometry-side-by-side-v1');
  assert.equal(grouped.schemaVersion, RECOGNITION_RECORD_CANDIDATE_SCHEMA);
  assert.equal(grouped.candidates.length, 2);
  assert.deepEqual(grouped.candidates[0].blockIds, ['left-origin','left-variety','left-process','left-flavor']);
  assert.deepEqual(grouped.candidates[1].blockIds, ['right-origin','right-variety','right-process','right-flavor']);

  const result = splitRecognitionEntries(document);
  assert.equal(result.split, true);
  assert.equal(result.method, 'geometry-side-by-side-v1');
  assert.equal(result.documents.length, 2);
  assert.equal(result.recordCandidateSchemaVersion, RECOGNITION_RECORD_CANDIDATE_SCHEMA);

  const left = result.documents[0];
  const right = result.documents[1];
  assert.equal(left.engine, 'stage3-fixture');
  assert.equal(right.engine, 'stage3-fixture');
  assert.equal(left.images[0]?.id, 'photo');
  assert.equal(right.images[0]?.id, 'photo');
  assert.deepEqual(left.blocks.map(item => item.id), ['left-origin','left-variety','left-process','left-flavor']);
  assert.deepEqual(right.blocks.map(item => item.id), ['right-origin','right-variety','right-process','right-flavor']);
  assert.ok(left.blocks.every(item => Array.isArray(item.polygon) && item.polygon.length >= 2));
  assert.ok(right.blocks.every(item => Array.isArray(item.polygon) && item.polygon.length >= 2));
  assert.equal(left.extensions.multiEntry.evidencePreserved, true);
  assert.equal(left.extensions.multiEntry.recordCandidate.schemaVersion, RECOGNITION_RECORD_CANDIDATE_SCHEMA);
  assert.match(left.fullText, /Ethiopia Guji/u);
  assert.doesNotMatch(left.fullText, /Colombia|Pink Bourbon|Honey Process|Peach Cacao/u);
  assert.match(right.fullText, /Colombia Huila/u);
  assert.doesNotMatch(right.fullText, /Ethiopia|Gesha|Washed|Jasmine Citrus/u);
});

test('geometry-first strong vertical separation creates independent stacked records', () => {
  const document = createRecognitionDocument({
    images:[{ id:'photo', role:'front' }],
    blocks:[
      block('a-origin', 'Ethiopia Guji', 80, 50, 440, 75),
      block('a-variety', 'Gesha', 80, 95, 260, 120),
      block('a-process', 'Natural', 80, 140, 300, 165),
      block('a-flavor', 'Jasmine', 80, 185, 300, 210),
      block('b-origin', 'Kenya Nyeri', 80, 430, 440, 455),
      block('b-variety', 'SL28', 80, 475, 260, 500),
      block('b-process', 'Washed', 80, 520, 300, 545),
      block('b-flavor', 'Blackcurrant', 80, 565, 360, 590)
    ]
  });
  const grouped = groupRecognitionRecordCandidates(document);
  assert.equal(grouped.grouped, true);
  assert.equal(grouped.method, 'geometry-vertical-gap-v1');
  assert.equal(grouped.candidates.length, 2);
  const result = splitRecognitionEntries(document);
  assert.equal(result.documents.length, 2);
  assert.match(result.documents[0].fullText, /Ethiopia Guji/u);
  assert.match(result.documents[1].fullText, /Kenya Nyeri/u);
});

test('one coffee using a two-column package design is not falsely split', () => {
  const document = createRecognitionDocument({
    images:[{ id:'photo', role:'front' }],
    blocks:[
      block('origin', 'Ethiopia Guji', 70, 100, 470, 145),
      block('notes-heading', 'Tasting Notes', 710, 100, 1060, 145),
      block('variety', 'Gesha', 70, 195, 300, 240),
      block('note-1', 'Jasmine', 710, 195, 980, 240),
      block('process', 'Washed', 70, 290, 320, 335),
      block('note-2', 'Peach', 710, 290, 930, 335),
      block('altitude', '1950M', 70, 385, 300, 430),
      block('note-3', 'Citrus', 710, 385, 950, 430)
    ]
  });
  const grouped = groupRecognitionRecordCandidates(document);
  assert.equal(grouped.grouped, false);
  const result = splitRecognitionEntries(document);
  assert.equal(result.split, false);
  assert.equal(result.documents.length, 1);
});

test('multi-view photos of one bean are never split merely because images produce paragraphs', () => {
  const document = createRecognitionDocument({
    images:[{id:'front',role:'front'},{id:'back',role:'back'}],
    blocks:[
      {id:'f1',imageId:'front',text:'COUNTRY: ETHIOPIA',confidence:0.95},
      {id:'f2',imageId:'front',text:'REGION: GUJI',confidence:0.95},
      {id:'b1',imageId:'back',text:'PROCESS: NATURAL',confidence:0.95},
      {id:'b2',imageId:'back',text:'VARIETY: 74110',confidence:0.95}
    ],
    fullText:'COUNTRY: ETHIOPIA\nREGION: GUJI\n\nPROCESS: NATURAL\nVARIETY: 74110'
  });
  const result = splitRecognitionEntries(document);
  assert.equal(result.split, false);
  assert.equal(result.documents.length, 1);
});

test('weak prose is kept as one recognition document to prevent false bean creation', () => {
  const document = recognitionDocumentFromText('Ethiopia Guji natural coffee with jasmine and blueberry. Roast carefully.');
  const result = splitRecognitionEntries(document);
  assert.equal(result.split, false);
  assert.equal(result.documents.length, 1);
});

test('geometry evidence can split records even when the flattened full-text envelope is unavailable', () => {
  const document = sideBySideDocument();
  document.fullText = '';
  document.rawFullText = '';

  const result = splitRecognitionEntries(document);
  assert.equal(result.split, true);
  assert.equal(result.method, 'geometry-side-by-side-v1');
  assert.equal(result.documents.length, 2);
  assert.equal(result.documents[0].extensions.multiEntry.evidencePreserved, true);
  assert.deepEqual(result.documents[0].blocks.map(item => item.id), ['left-origin','left-variety','left-process','left-flavor']);
  assert.deepEqual(result.documents[1].blocks.map(item => item.id), ['right-origin','right-variety','right-process','right-flavor']);
});

test('geometry entry construction does not depend on native structuredClone support', () => {
  const originalStructuredClone = globalThis.structuredClone;
  globalThis.structuredClone = undefined;
  try {
    const result = splitRecognitionEntries(sideBySideDocument());
    assert.equal(result.split, true);
    assert.equal(result.documents.length, 2);
    assert.equal(result.documents[0].extensions.multiEntry.recordCandidate.evidence.identity, true);
    assert.ok(Array.isArray(result.documents[0].extensions.multiEntry.recordCandidate.evidence.anchors));
  } finally {
    globalThis.structuredClone = originalStructuredClone;
  }
});
