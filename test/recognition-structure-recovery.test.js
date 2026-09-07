import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecognitionDocument, recognitionDocumentFromText } from '../src/domain/recognition/recognition-document.js';
import { splitRecognitionEntries } from '../src/domain/recognition/recognition-entry-splitter.js';
import { buildRecognitionRecordHypothesis } from '../src/domain/recognition/recognition-record-hypothesis.js';
import {
  AI_STRUCTURE_RESULT_SCHEMA,
  RECOGNITION_STRUCTURE_RECOVERY_SCHEMA,
  recoverRecognitionStructure,
  recoverRecognitionStructureLocal
} from '../src/domain/recognition/recognition-structure-recovery.js';

function box(left, top, right, bottom) {
  return [[left, top], [right, top], [right, bottom], [left, bottom]];
}
function block(id, text, left, top, right, bottom) {
  return { id, imageId:'photo', text, polygon:box(left, top, right, bottom), confidence:0.98 };
}
function sideBySideDocument() {
  return createRecognitionDocument({
    images:[{ id:'photo', role:'front' }],
    engine:'p0-structure-test',
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
}
function structureResult(recordCount, groups, confidence = 0.91) {
  return {
    schemaVersion:AI_STRUCTURE_RESULT_SCHEMA,
    task:'structure', recordCount, confidence, reason:'OCR evidence grouping', groups,
    engine:'zhipu', model:'test-model', createdAt:'2026-09-07T00:00:00Z',
    policy:{ authority:'advisory', mayOverwriteFact:false, mayCreateFacts:false }
  };
}

const leftRefs = [
  'block:l-country-label','block:l-country-value','block:l-variety-label','block:l-variety-value','block:l-process-label','block:l-process-value'
];
const rightRefs = [
  'block:r-country-label','block:r-country-value','block:r-variety-label','block:r-variety-value','block:r-process-label','block:r-process-value'
];

test('record hypothesis treats geometry as evidence and does not make it final authority', () => {
  const document = sideBySideDocument();
  const hypothesis = buildRecognitionRecordHypothesis(document);
  assert.equal(hypothesis.schemaVersion, 'recognition-record-hypothesis/1.0');
  assert.equal(hypothesis.geometry.grouped, true);
  assert.equal(hypothesis.geometry.candidates.length, 2);
  assert.equal(hypothesis.evidence.find(item => item.source === 'geometry-record-candidates')?.authority, 'evidence-only');
  assert.equal(hypothesis.recommendedRecordCount, 1);
  assert.equal(hypothesis.ambiguous, true);
  assert.equal(hypothesis.shouldInvokeAi, true);

  const local = recoverRecognitionStructureLocal(document);
  assert.equal(local.schemaVersion, RECOGNITION_STRUCTURE_RECOVERY_SCHEMA);
  assert.equal(local.split, false);
  assert.equal(local.source, 'geometry-evidence-only');
  assert.equal(local.requiresUserConfirmation, true);
  assert.equal(local.documents[0], document);
});

test('legacy splitter remains compatible while authoritative recovery disables direct geometry split', () => {
  const document = sideBySideDocument();
  const legacy = splitRecognitionEntries(document);
  assert.equal(legacy.split, true);
  assert.equal(legacy.method, 'geometry-side-by-side-v1');
  const evidenceOnly = splitRecognitionEntries(document, { allowGeometry:false });
  assert.equal(evidenceOnly.split, false);
  assert.equal(evidenceOnly.documents.length, 1);
});

test('valid AI evidence groups materialize independent review-required records without cross-record leakage', async () => {
  const document = sideBySideDocument();
  const recovery = await recoverRecognitionStructure(document, {
    aiRecoverStructure:async () => ({
      ok:true,
      result:structureResult(2, [
        { id:'record:left', evidenceRefs:leftRefs },
        { id:'record:right', evidenceRefs:rightRefs }
      ])
    })
  });
  assert.equal(recovery.split, true);
  assert.equal(recovery.source, 'ai-advisory');
  assert.equal(recovery.method, 'ai-structure-evidence-groups-v1');
  assert.equal(recovery.requiresUserConfirmation, true);
  assert.equal(recovery.documents.length, 2);
  assert.equal(recovery.ai.accepted, true);

  const [left, right] = recovery.documents;
  assert.deepEqual(left.relations.map(item => [item.field, item.value]), [
    ['country','ETHIOPIA'], ['variety','GESHA'], ['process','WASHED']
  ]);
  assert.deepEqual(right.relations.map(item => [item.field, item.value]), [
    ['country','COLOMBIA'], ['variety','PINK BOURBON'], ['process','HONEY PROCESS']
  ]);
  assert.doesNotMatch(left.fullText, /COLOMBIA|PINK BOURBON|HONEY PROCESS/u);
  assert.doesNotMatch(right.fullText, /ETHIOPIA|GESHA|WASHED/u);
  assert.deepEqual(left.extensions.multiEntry.structureRecovery.evidenceRefs, leftRefs);
  assert.deepEqual(right.extensions.multiEntry.structureRecovery.evidenceRefs, rightRefs);
});

test('AI can resolve a geometry ambiguity as one record without geometry overriding it', async () => {
  const document = sideBySideDocument();
  const recovery = await recoverRecognitionStructure(document, {
    aiRecoverStructure:async () => ({ ok:true, result:structureResult(1, [], 0.88) })
  });
  assert.equal(recovery.split, false);
  assert.equal(recovery.count, 1);
  assert.equal(recovery.method, 'ai-structure-single-v1');
  assert.equal(recovery.ai.accepted, true);
  assert.equal(recovery.documents[0], document);
});

test('fabricated or duplicated AI evidence is rejected and safely falls back without creating records', async () => {
  const document = sideBySideDocument();
  const fabricated = await recoverRecognitionStructure(document, {
    aiRecoverStructure:async () => ({
      ok:true,
      result:structureResult(2, [
        { id:'record:1', evidenceRefs:[...leftRefs.slice(0, 5), 'block:invented'] },
        { id:'record:2', evidenceRefs:rightRefs }
      ])
    })
  });
  assert.equal(fabricated.split, false);
  assert.equal(fabricated.ai.accepted, false);
  assert.equal(fabricated.ai.reason, 'invalid-structure-contract');

  const duplicated = await recoverRecognitionStructure(document, {
    aiRecoverStructure:async () => ({
      ok:true,
      result:structureResult(2, [
        { id:'record:1', evidenceRefs:leftRefs },
        { id:'record:2', evidenceRefs:['block:l-country-label', ...rightRefs.slice(1)] }
      ])
    })
  });
  assert.equal(duplicated.split, false);
  assert.equal(duplicated.ai.accepted, false);
  assert.equal(duplicated.ai.reason, 'invalid-structure-contract');
});

test('low-confidence AI grouping remains advisory and cannot create multiple records', async () => {
  const document = sideBySideDocument();
  const recovery = await recoverRecognitionStructure(document, {
    aiRecoverStructure:async () => ({
      ok:true,
      result:structureResult(2, [
        { id:'record:left', evidenceRefs:leftRefs },
        { id:'record:right', evidenceRefs:rightRefs }
      ], 0.41)
    })
  });
  assert.equal(recovery.split, false);
  assert.equal(recovery.ai.accepted, false);
  assert.equal(recovery.ai.reason, 'low-confidence');
});

test('AI adapter failure is never a single point of failure', async () => {
  const document = sideBySideDocument();
  const recovery = await recoverRecognitionStructure(document, {
    aiRecoverStructure:async () => { throw new Error('offline'); }
  });
  assert.equal(recovery.split, false);
  assert.equal(recovery.documents[0], document);
  assert.equal(recovery.ai.engaged, true);
  assert.equal(recovery.ai.accepted, false);
  assert.equal(recovery.ai.reason, 'adapter-error');
});

test('strong text structure splits deterministically and does not invoke AI', async () => {
  const document = recognitionDocumentFromText([
    'Sample 1',
    'Country: Ethiopia',
    'Variety: Gesha',
    'Process: Washed',
    'Sample 2',
    'Country: Colombia',
    'Variety: Pink Bourbon',
    'Process: Honey Process'
  ].join('\n'));
  let aiCalls = 0;
  const recovery = await recoverRecognitionStructure(document, {
    aiRecoverStructure:async () => { aiCalls += 1; throw new Error('must not be called'); }
  });
  assert.equal(recovery.split, true);
  assert.equal(recovery.method, 'entry-headings');
  assert.equal(recovery.source, 'deterministic-text-structure');
  assert.equal(recovery.documents.length, 2);
  assert.equal(aiCalls, 0);
});
