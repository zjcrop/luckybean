import test from 'node:test';
import assert from 'node:assert/strict';
import { brewApiJson } from '../src/services/brew-api-client.js';

test('offline native mode stops remote requests and reconnect uses the authoritative API', async () => {
  const originalFetch = globalThis.fetch;
  const previousOnline = globalThis.__LUCKYBEAN_NATIVE_ONLINE__;
  const previousStorage = globalThis.localStorage;
  let calls = 0;
  globalThis.localStorage = { getItem() { return 'lb-offline-regression-installation'; }, setItem() {} };
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ authoritative: true }), { status: 200 }); };
  try {
    globalThis.__LUCKYBEAN_NATIVE_ONLINE__ = false;
    await assert.rejects(brewApiJson('?mode=profiles'), error => error.code === 'NETWORK_UNAVAILABLE');
    await assert.rejects(brewApiJson('', { method: 'POST', body: { doseG: 15 } }), error => error.code === 'NETWORK_UNAVAILABLE');
    assert.equal(calls, 0);
    globalThis.__LUCKYBEAN_NATIVE_ONLINE__ = true;
    assert.deepEqual((await brewApiJson('?mode=profiles')).payload, { authoritative: true });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.__LUCKYBEAN_NATIVE_ONLINE__ = previousOnline;
    globalThis.localStorage = previousStorage;
  }
});
