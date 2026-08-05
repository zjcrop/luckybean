import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  createBackupDocument,
  verifyBackupDocument
} from '../src/core-v2/backup/backup-core.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const snapshot = {
  source: { database: 'luckybean', version: 9 },
  stores: {
    beans: [{ id: 'bean-1', name: 'Panama Geisha', schemaVersion: 3 }],
    brewSessions: [{ id: 'brew-1', beanId: 'bean-1', doseG: 15 }],
    sensoryRecords: [],
    inventoryEvents: [{ id: 'event-1', beanId: 'bean-1', deltaG: 200 }],
    settings: [{ id: 'app.settings', value: { theme: 'dark' } }]
  }
};

test('backup document verifies count and SHA-256 for every store', async () => {
  const document = await createBackupDocument(snapshot, {
    appVersion: '2.0.0-alpha.1',
    createdAt: '2026-08-04T00:00:00.000Z',
    deviceId: 'device-test'
  });
  const result = await verifyBackupDocument(document);

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(document.manifest.counts.beans, 1);
  assert.match(document.manifest.checksums.beans, /^[0-9a-f]{64}$/);
  assert.equal(result.stores.beans.hashOk, true);
});

test('backup verification rejects silent record mutation', async () => {
  const document = await createBackupDocument(snapshot, {
    createdAt: '2026-08-04T00:00:00.000Z'
  });
  document.stores.beans[0].name = 'Tampered';

  const result = await verifyBackupDocument(document);
  assert.equal(result.ok, false);
  assert.equal(result.stores.beans.countOk, true);
  assert.equal(result.stores.beans.hashOk, false);
  assert.ok(result.errors.includes('beans 校验值不一致'));
});

test('backup verification rejects missing records even when format is valid', async () => {
  const document = await createBackupDocument(snapshot, {
    createdAt: '2026-08-04T00:00:00.000Z'
  });
  document.stores.brewSessions = [];

  const result = await verifyBackupDocument(document);
  assert.equal(result.ok, false);
  assert.equal(result.stores.brewSessions.countOk, false);
  assert.equal(result.stores.brewSessions.hashOk, false);
});
