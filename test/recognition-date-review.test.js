import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRecognitionDates } from '../src/domain/recognition/recognition-date-classifier.js';
import { buildDateReviewModel, resolveDateReviewSelections } from '../src/domain/recognition/recognition-date-review.js';

test('review model exposes automatic, excluded and unresolved candidates together', () => {
  const decision = classifyRecognitionDates('ROAST DATE 2026-07-28\nBEST BEFORE 2026-10-28\nLOT 20260729');
  const model = buildDateReviewModel(decision);
  assert.deepEqual(model.map(item => item.defaultType), ['roastDate', 'bestBefore', 'pending']);
  assert.equal(model.length, 3);
});

test('unresolved candidate requires an explicit date assignment before confirmation', () => {
  const decision = classifyRecognitionDates('DATE 2026-07-28');
  const [candidate] = buildDateReviewModel(decision);
  const result = resolveDateReviewSelections(decision, [{ candidateId: candidate.candidateId, type: 'pending', value: candidate.values[0] }]);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /尚未选择日期归属/);
});

test('user confirmation retains source provenance instead of inventing confidence 1', () => {
  const decision = classifyRecognitionDates('DATE 2026-07-28');
  const [candidate] = buildDateReviewModel(decision);
  const result = resolveDateReviewSelections(decision, [{ candidateId: candidate.candidateId, type: 'roastDate', value: '2026-07-28' }]);
  assert.equal(result.ok, true);
  assert.equal(result.roastDate, '2026-07-28');
  assert.equal(result.confirmedRoastDate.decisionSource, 'user-confirmed');
  assert.equal(result.confirmedRoastDate.candidateId, candidate.candidateId);
  assert.equal(result.confirmedRoastDate.sourceConfidence, candidate.confidence);
  assert.notEqual(result.confirmedRoastDate.sourceConfidence, 1);
});

test('two roast date selections are rejected', () => {
  const decision = classifyRecognitionDates('ROAST DATE 2026-07-28\nROAST DATE 2026-07-29');
  const model = buildDateReviewModel(decision);
  const result = resolveDateReviewSelections(decision, model.map(item => ({ candidateId: item.candidateId, type: 'roastDate', value: item.values[0] })));
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /只能确认一个烘焙日期/);
});

test('candidate value cannot be replaced with an unrecognized date', () => {
  const decision = classifyRecognitionDates('DATE 2026-07-28');
  const [candidate] = buildDateReviewModel(decision);
  const result = resolveDateReviewSelections(decision, [{ candidateId: candidate.candidateId, type: 'roastDate', value: '2026-08-28' }]);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /不属于识别候选/);
});

test('stale or fabricated candidate id is rejected', () => {
  const decision = classifyRecognitionDates('DATE 2026-07-28');
  const result = resolveDateReviewSelections(decision, [{ candidateId: 'missing', type: 'roastDate', value: '2026-07-28' }]);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /不存在或已经失效/);
});

test('all candidates may be ignored without silently restoring automatic roast date', () => {
  const decision = classifyRecognitionDates('ROAST DATE 2026-07-28\nLOT 20260729');
  const model = buildDateReviewModel(decision);
  const result = resolveDateReviewSelections(decision, model.map(item => ({ candidateId: item.candidateId, type: 'ignore', value: item.values[0] })));
  assert.equal(result.ok, true);
  assert.equal(result.roastDate, '');
  assert.equal(result.confirmedRoastDate, null);
});

test('ambiguous day-month candidate can only resolve to one offered value', () => {
  const decision = classifyRecognitionDates('ROAST DATE 07/08/2026');
  const [candidate] = buildDateReviewModel(decision);
  assert.equal(candidate.values.length, 2);
  const result = resolveDateReviewSelections(decision, [{ candidateId: candidate.candidateId, type: 'roastDate', value: candidate.values[1] }]);
  assert.equal(result.ok, true);
  assert.equal(result.roastDate, candidate.values[1]);
});

test('duplicate submission of the same candidate is rejected', () => {
  const decision = classifyRecognitionDates('DATE 2026-07-28');
  const [candidate] = buildDateReviewModel(decision);
  const selection = { candidateId: candidate.candidateId, type: 'roastDate', value: candidate.values[0] };
  const result = resolveDateReviewSelections(decision, [selection, selection]);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /重复提交/);
});
