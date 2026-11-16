import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { withOcrModelAssets } from '../src/domain/recognition/ocr-model-transport.js';

const bytes = Buffer.alloc(1000000, 42);
function fixture(change = () => {}) {
  const requests = [], active = new Map(), revoked = [];
  const transport = { crypto: webcrypto, atob: globalThis.atob,
    URL: { createObjectURL(blob) { const url = `blob:model-${active.size}`; active.set(url, blob); return url; },
      revokeObjectURL(url) { active.delete(url); revoked.push(url); } },
    async fetch(url) {
      requests.push(url);
      assert.match(url, /\.json$/);
      const role = url.includes('_det.') ? 'det' : 'rec';
      const data = { format:'luckybean-ocr-model/1', role, byteLength:bytes.length,
        sha256:createHash('sha256').update(bytes).digest('hex'), base64:bytes.toString('base64') };
      change(data);
      return { ok:true, json:async () => data };
    }
  };
  return { transport, active, requests, revoked };
}
test('HTTP only requests JSON; SDK gets byte-identical Blob archives, released after initialization', async () => {
  const f = fixture();
  const value = await withOcrModelAssets(p => `https://app.test/${p}`, async assets => {
    for (const asset of Object.values(assets)) {
      assert.match(asset.url, /^blob:/);
      assert.deepEqual(Buffer.from(await f.active.get(asset.url).arrayBuffer()), bytes);
    }
    return 42;
  }, f.transport);
  assert.equal(value, 42); assert.equal(f.requests.length, 2);
  assert.equal(f.active.size, 0); assert.equal(f.revoked.length, 2);
});
test('a corrupt model never reaches SDK, and concurrent successful model Blob is released', async () => {
  const f = fixture(data => { if (data.role === 'det') data.sha256 = '0'.repeat(64); });
  await assert.rejects(withOcrModelAssets(p => p, () => assert.fail('SDK must not initialize'), f.transport), /完整性/);
  assert.equal(f.active.size, 0); assert.equal(f.revoked.length, 1);
});
test('SDK initialization failure still releases both Blob URLs', async () => {
  const f = fixture();
  await assert.rejects(withOcrModelAssets(p => p, () => { throw Error('session failed'); }, f.transport), /session failed/);
  assert.equal(f.active.size, 0); assert.equal(f.revoked.length, 2);
});
