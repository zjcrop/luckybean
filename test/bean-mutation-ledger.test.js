import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeDeletedBeanIds,
  compareBeanMutations,
  mergeBeanMutationLists,
  normalizeBeanMutation
} from '../src/domain/beans/bean-mutation-ledger.js';

const mutation = (entityId, operation, mutatedAt, mutationId, syncState = 'pending') => ({
  entity: 'beans', entityId, operation, mutatedAt, mutationId, sourceDeviceId: 'device-a', syncState
});

test('newer explicit delete wins over older restore or upsert-era state', () => {
  const older = mutation('bean-a', 'restore', '2026-09-07T01:00:00.000Z', 'bm-001');
  const newer = mutation('bean-a', 'delete', '2026-09-07T02:00:00.000Z', 'bm-002');
  assert.ok(compareBeanMutations(newer, older) > 0);
  const merged = mergeBeanMutationLists([older], [newer]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].operation, 'delete');
  assert.deepEqual([...activeDeletedBeanIds(merged)], ['bean-a']);
});

test('explicit restore newer than delete is the only lifecycle operation that clears tombstone', () => {
  const deleted = mutation('bean-a', 'delete', '2026-09-07T02:00:00.000Z', 'bm-002');
  const restored = mutation('bean-a', 'restore', '2026-09-07T03:00:00.000Z', 'bm-003');
  const merged = mergeBeanMutationLists([deleted], [restored]);
  assert.equal(merged[0].operation, 'restore');
  assert.equal(activeDeletedBeanIds(merged).has('bean-a'), false);
});

test('ledger retains one deterministic latest mutation per bean', () => {
  const merged = mergeBeanMutationLists([
    mutation('bean-b', 'delete', '2026-09-07T02:00:00.000Z', 'bm-200'),
    mutation('bean-a', 'restore', '2026-09-07T03:00:00.000Z', 'bm-300')
  ], [
    mutation('bean-b', 'restore', '2026-09-07T01:00:00.000Z', 'bm-100', 'synced')
  ]);
  assert.deepEqual(merged.map(item => item.entityId), ['bean-a', 'bean-b']);
  assert.equal(merged.find(item => item.entityId === 'bean-b').operation, 'delete');
});

test('invalid lifecycle records are rejected instead of becoming implicit deletes', () => {
  assert.equal(normalizeBeanMutation({ entityId: 'bean-a', operation: 'unknown' }), null);
  assert.equal(normalizeBeanMutation({ operation: 'delete' }), null);
});
