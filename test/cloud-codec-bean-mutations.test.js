import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYNC_FORMAT,
  SYNC_SCHEMA_VERSION,
  materializePackets,
  packBeanMutation,
  unpackBeanMutation
} from '../src/cloud-codec.js';

test('bean lifecycle mutation packet round-trips without changing the existing sync format version', () => {
  const mutation = {
    entity: 'beans',
    entityId: 'bean-a',
    operation: 'delete',
    mutatedAt: '2026-09-07T02:00:00.000Z',
    mutationId: 'bm-test-delete',
    sourceDeviceId: 'device-a',
    syncState: 'pending'
  };
  const row = packBeanMutation(mutation);
  assert.equal(unpackBeanMutation(row).operation, 'delete');
  const materialized = materializePackets([{
    v: SYNC_SCHEMA_VERSION,
    f: SYNC_FORMAT,
    k: 'bean-mutations',
    p: 0,
    x: [row]
  }]);
  assert.equal(materialized.beanMutations.length, 1);
  assert.equal(materialized.beanMutations[0].entityId, 'bean-a');
  assert.equal(materialized.beanMutations[0].operation, 'delete');
});
