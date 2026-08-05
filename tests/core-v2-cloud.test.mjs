import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createCloudAdapter, CloudAdapterError } from '../src/core-v2/cloud/cloud-adapter.js';
import { createSyncEvent } from '../src/core-v2/sync/outbox.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

async function event(id = 'bean-1') {
  return createSyncEvent({
    eventId: `event-${id}`,
    entityType: 'bean',
    entity: { id, revision: 1, updatedAt: '2026-08-04T00:00:00.000Z' },
    deviceId: 'device-a',
    clientTime: '2026-08-04T00:00:00.000Z'
  });
}

test('cloud adapter rejects insecure endpoints before any request', () => {
  assert.throws(
    () => createCloudAdapter({ baseUrl: 'http://example.test' }),
    error => error instanceof CloudAdapterError && error.code === 'INSECURE_CLOUD_ENDPOINT'
  );
});

test('cloud adapter accepts only JSON responses', async () => {
  const adapter = createCloudAdapter({
    baseUrl: 'https://cloud.example.test',
    fetchImpl: async () => new Response('<script>alert(1)</script>', {
      status: 200,
      headers: { 'content-type': 'text/html' }
    })
  });
  await assert.rejects(
    () => adapter.health(),
    error => error instanceof CloudAdapterError && error.code === 'NON_JSON_CLOUD_RESPONSE'
  );
});

test('failed push returns retry events and acknowledges nothing', async () => {
  const source = await event();
  const adapter = createCloudAdapter({
    baseUrl: 'https://cloud.example.test',
    fetchImpl: async () => { throw new Error('offline'); }
  });
  const result = await adapter.pushOutbox([source], { deviceId: 'device-a' });
  assert.deepEqual(result.acknowledged, []);
  assert.equal(result.retryEvents.length, 1);
  assert.equal(result.retryEvents[0].eventId, source.eventId);
  assert.equal(result.retryEvents[0].state, 'retry');
  assert.equal(result.retryEvents[0].lastError, 'offline');
});

test('push accepts only acknowledgements for submitted event ids', async () => {
  const source = await event();
  const adapter = createCloudAdapter({
    baseUrl: 'https://cloud.example.test',
    fetchImpl: async () => new Response(JSON.stringify({
      protocolVersion: 2,
      acknowledged: ['unexpected-event'],
      rejected: []
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  });
  const result = await adapter.pushOutbox([source], { deviceId: 'device-a' });
  assert.deepEqual(result.acknowledged, []);
  assert.equal(result.retryEvents.length, 1);
  assert.equal(result.error.code, 'UNKNOWN_SYNC_ACK');
});

test('valid acknowledgement is returned but local deletion remains caller controlled', async () => {
  const source = await event();
  const adapter = createCloudAdapter({
    baseUrl: 'https://cloud.example.test',
    fetchImpl: async (url, options) => {
      const request = JSON.parse(options.body);
      assert.equal(request.events.length, 1);
      assert.equal(request.events[0].eventId, source.eventId);
      return new Response(JSON.stringify({
        protocolVersion: 2,
        acknowledged: [source.eventId],
        rejected: [],
        serverTime: '2026-08-04T00:01:00.000Z'
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });
  const result = await adapter.pushOutbox([source], { deviceId: 'device-a' });
  assert.deepEqual(result.acknowledged, [source.eventId]);
  assert.deepEqual(result.submitted, [source.eventId]);
  assert.equal('retryEvents' in result, false);
});
