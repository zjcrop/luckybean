import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalJson,
  normalizeRevisionedRecord,
  assertStoreName,
  CoreContractError
} from '../src/core-v2/contracts.js';

test('canonicalJson sorts object keys recursively', () => {
  assert.equal(
    canonicalJson({ z: 1, a: { d: 4, b: 2 }, list: [{ y: 2, x: 1 }] }),
    '{"a":{"b":2,"d":4},"list":[{"x":1,"y":2}],"z":1}'
  );
});

test('normalizeRevisionedRecord adds stable metadata without replacing supplied values', () => {
  const value = normalizeRevisionedRecord(
    { id: 'bean-1', name: 'Test', revision: 4, createdAt: '2026-01-01T00:00:00.000Z' },
    { now: '2026-08-04T00:00:00.000Z', deviceId: 'device-a' }
  );
  assert.equal(value.id, 'bean-1');
  assert.equal(value.revision, 4);
  assert.equal(value.schemaVersion, 3);
  assert.equal(value.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(value.updatedAt, '2026-08-04T00:00:00.000Z');
  assert.equal(value.deviceId, 'device-a');
  assert.equal(value.deletedAt, null);
});

test('unknown stores are rejected', () => {
  assert.throws(() => assertStoreName('randomStore'), error => {
    assert.ok(error instanceof CoreContractError);
    assert.equal(error.code, 'UNKNOWN_STORE');
    return true;
  });
});
