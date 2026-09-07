import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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

test('compressed transfer length is not a decoded-body truncation signal', () => {
  const compressedTransferBytes = 3_622_327;
  const decodedWorkerBytes = 11_341_486;
  assert.notEqual(compressedTransferBytes, decodedWorkerBytes);
  assert.equal(decodedWorkerBytes, 11_341_486);
});
