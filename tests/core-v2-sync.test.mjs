import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  createSyncEvent,
  coalescePendingEvents,
  markSyncAttempt,
  mergeIncomingEntity
} from '../src/core-v2/sync/outbox.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

test('sync event hash and id are deterministic for the same entity revision', async () => {
  const input = {
    entityType: 'bean',
    entity: { id: 'bean-1', revision: 2, name: 'Geisha', updatedAt: '2026-08-04T00:00:00.000Z' },
    deviceId: 'device-a',
    clientTime: '2026-08-04T00:00:00.000Z'
  };
  const first = await createSyncEvent(input);
  const second = await createSyncEvent(input);
  assert.equal(first.eventId, second.eventId);
  assert.equal(first.contentHash, second.contentHash);
  assert.match(first.contentHash, /^[0-9a-f]{64}$/);
});

test('coalesce keeps latest mutable entity but preserves append-only records', async () => {
  const beanV1 = await createSyncEvent({
    eventId: 'bean-v1', entityType: 'bean', entity: { id: 'bean-1', revision: 1 }, deviceId: 'a', clientTime: '2026-08-04T00:00:00.000Z'
  });
  const beanV2 = await createSyncEvent({
    eventId: 'bean-v2', entityType: 'bean', entity: { id: 'bean-1', revision: 2 }, deviceId: 'a', clientTime: '2026-08-04T00:01:00.000Z'
  });
  const brew1 = await createSyncEvent({
    eventId: 'brew-1', entityType: 'brewSession', entity: { id: 'brew-1', revision: 1 }, deviceId: 'a', clientTime: '2026-08-04T00:02:00.000Z'
  });
  const brew2 = await createSyncEvent({
    eventId: 'brew-2', entityType: 'brewSession', entity: { id: 'brew-2', revision: 1 }, deviceId: 'a', clientTime: '2026-08-04T00:03:00.000Z'
  });
  const result = coalescePendingEvents([beanV2, brew2, beanV1, brew1]);
  assert.equal(result.length, 3);
  assert.equal(result.find(item => item.entityType === 'bean').revision, 2);
  assert.equal(result.filter(item => item.entityType === 'brewSession').length, 2);
});

test('failed attempts remain local and receive bounded exponential backoff', async () => {
  const event = await createSyncEvent({
    entityType: 'bean', entity: { id: 'bean-1', revision: 1 }, deviceId: 'a', clientTime: '2026-08-04T00:00:00.000Z'
  });
  const attempted = markSyncAttempt(event, {
    now: '2026-08-04T00:00:00.000Z',
    error: new Error('offline')
  });
  assert.equal(attempted.state, 'retry');
  assert.equal(attempted.attempts, 1);
  assert.equal(attempted.lastError, 'offline');
  assert.equal(attempted.nextAttemptAt, '2026-08-04T00:02:00.000Z');
});

test('entity conflict resolution prioritizes revision before time', () => {
  const result = mergeIncomingEntity(
    { id: 'bean-1', revision: 5, updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'bean-1', revision: 4, updatedAt: '2026-12-01T00:00:00.000Z' }
  );
  assert.equal(result.resolution, 'higher-local-revision');
  assert.equal(result.winner.revision, 5);
});
