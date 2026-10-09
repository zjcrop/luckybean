import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchBrewContract } from '../scripts/fetch-brew-contract.mjs';
const endpoint = 'https://vaxwncdcuvbpvdbbketb.supabase.co/functions/v1/brew-analyze-v2';
const options = { sleep: async () => {}, log: () => {} };

test('BrewProfiles deadline covers body reading and retries the identical deterministic request', async () => {
  const requests = []; const logs = [];
  const response = await fetchBrewContract(endpoint, { method: 'POST', headers: { apikey: 'private-test-marker', 'x-request-id': 'same-id' }, body: '{"test":true}' }, {
    ...options, timeoutMs: 15, log: value => logs.push(value), fetchImpl: async (url, init) => {
      requests.push(init);
      if (requests.length === 1) return { arrayBuffer: () => new Promise(() => {}) };
      return Response.json({ passed: true });
    }
  });
  assert.deepEqual(await response.json(), { passed: true });
  assert.equal(requests.length, 2); assert.equal(requests[0].signal.aborted, true);
  assert.equal(requests[0].body, requests[1].body);
  assert.equal(requests[0].headers['x-request-id'], requests[1].headers['x-request-id']);
  assert.match(logs.join(' '), /TimeoutError/);
  assert.equal(logs.join(' ').includes('private-test-marker'), false);
  await assert.rejects(fetchBrewContract(endpoint, {}, { ...options, timeoutMs: 10,
    fetchImpl: async () => ({ arrayBuffer: () => new Promise(() => {}) }) }), /deadline/);
});

test('BrewProfiles preserves expected authorization failures and CORS status without retry', async () => {
  for (const status of [400, 401, 403, 204]) {
    let calls = 0;
    const response = await fetchBrewContract(endpoint, {}, { ...options, fetchImpl: async () => {
      calls++; return new Response(status === 204 ? null : 'original error', { status, headers: { 'access-control-allow-origin': '*' } });
    } });
    assert.equal(calls, 1); assert.equal(response.status, status);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.equal(await response.text(), status === 204 ? '' : 'original error');
  }
});

test('BrewProfiles transient HTTP retry remains finite and returns persistent failure for assertions', async () => {
  for (const status of [429, 503]) {
    let calls = 0;
    const response = await fetchBrewContract(endpoint, {}, { ...options, fetchImpl: async () => {
      calls++; return new Response('persistent failure', { status });
    } });
    assert.equal(calls, 2); assert.equal(response.status, status);
    assert.equal(await response.text(), 'persistent failure');
  }
});

test('BrewProfiles helper refuses AI/unrelated endpoints before making a request', async () => {
  let calls = 0;
  await assert.rejects(fetchBrewContract(endpoint.replace('brew-analyze-v2', 'recognition-ai'), {}, {
    ...options, fetchImpl: async () => { calls++; }
  }), /unrelated endpoint/);
  assert.equal(calls, 0);
});
