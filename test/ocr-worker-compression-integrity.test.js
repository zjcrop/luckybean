import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';

const runtime = fs.readFileSync('src/recognition-paddle-ocr.js', 'utf8');
const vendor = fs.readFileSync('scripts/prepare-paddleocr-vendor.mjs', 'utf8');

test('PP-OCR Worker integrity is based on decoded manifest identity, not transfer Content-Length', () => {
  assert.match(runtime, /loadRuntimeManifest/);
  assert.match(runtime, /workerBytes/);
  assert.match(runtime, /workerSha256/);
  assert.match(runtime, /content-encoding/);
  assert.match(runtime, /transferBytes/);
  assert.match(runtime, /crypto\?\.subtle/);
  assert.doesNotMatch(runtime, /expectedBytes > 0 && expectedBytes !== bytes\.byteLength/);
});

test('vendoring records decoded Worker byte length and SHA-256 in manifest', () => {
  assert.match(vendor, /createHash/);
  assert.match(vendor, /Buffer\.byteLength\(workerSource, 'utf8'\)/);
  assert.match(vendor, /workerSha256/);
  assert.match(vendor, /workerBytes: workerIntegrity\.workerBytes/);
  assert.match(vendor, /workerSha256: workerIntegrity\.workerSha256/);
});

function runtimeWithResponse({ corrupt = false, missingIdentity = false } = {}) {
  const bytes = Buffer.alloc(100001, 65);
  const workerSha256 = createHash('sha256').update(bytes).digest('hex');
  if (corrupt) bytes[0] = 66; // Same decoded length, different content.
  const context = {
    navigator: { userAgent: 'Chrome', deviceMemory: 8 },
    document: { documentElement: { dataset: {} }, addEventListener() {} },
    addEventListener() {}, URL, Blob, crypto: webcrypto, setTimeout, clearTimeout,
    fetch: async url => url.endsWith('manifest.json')
      ? Response.json(missingIdentity ? {} : { workerBytes: bytes.length, workerSha256 })
      // Fetch exposes the decoded body while Content-Length still describes gzip bytes.
      : new Response(bytes, { headers: { 'content-encoding': 'gzip', 'content-length': '137' } })
  };
  vm.runInNewContext(runtime.replaceAll('import.meta.url', '"https://example.test/src/recognition-paddle-ocr.js"')
    + '\nglobalThis.fetchWorkerForTest = fetchCompleteWorkerBundle;', context);
  return context.fetchWorkerForTest;
}

test('production Worker fetch accepts decoded gzip content with a smaller transfer Content-Length', async () => {
  const bytes = await runtimeWithResponse()();
  assert.equal(bytes.byteLength, 100001);
});

test('production Worker fetch rejects same-length corruption and missing manifest identity', async () => {
  await assert.rejects(runtimeWithResponse({ corrupt: true })(), /SHA-256/);
  await assert.rejects(runtimeWithResponse({ missingIdentity: true })(), /完整性元数据/);
});
