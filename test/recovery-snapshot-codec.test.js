import test from 'node:test';
import assert from 'node:assert/strict';
import { RECOVERY_FORMAT, RECOVERY_STORES, RECOVERY_PREFERENCES, sealRecoverySnapshot, openRecoverySnapshot, validateSnapshot, canonical, snapshotManifest } from '../src/domain/archive/recovery-snapshot-codec.js';
function fixture() {
  return { format: RECOVERY_FORMAT, schemaVersion: 10, createdAt: '2026-10-13T12:00:00Z', stores: Object.fromEntries(RECOVERY_STORES.map(name => [name, []])), photos: [{ key: 'b1', value: 'data:image/jpeg;base64,YWJj' }], preferences: Object.fromEntries(RECOVERY_PREFERENCES.map(key => [key, null])) };
}
const password = 'a-long-local-backup-password';
test('encrypted backup authenticates all data; original photo bytes survive', async () => {
  const source = fixture();
  source.stores.beans.push({ key: 'b1', value: { id: 'b1', name: '私有豆卡', remainingWeight: 12.5 } });
  source.stores.syncMetadata.push({ key: 'key', value: { id: 'key', secret: 'private-secret-marker' } });
  const encrypted = await sealRecoverySnapshot(source, password);
  assert(!JSON.stringify(encrypted).includes('private-secret-marker'));
  assert(!JSON.stringify(encrypted).includes('私有豆卡'));
  assert.deepEqual(await openRecoverySnapshot(encrypted, password), source);
  assert.notEqual((await sealRecoverySnapshot(source, password)).cipher, encrypted.cipher);
});
test('wrong password, modified ciphertext and KDF downgrade fail closed', async () => {
  const encrypted = await sealRecoverySnapshot(fixture(), password);
  await assert.rejects(openRecoverySnapshot(encrypted, 'wrong-long-password'), /口令错误/);
  await assert.rejects(openRecoverySnapshot({ ...encrypted, cipher: (encrypted.cipher[0] === 'A' ? 'B' : 'A') + encrypted.cipher.slice(1) }, password), /口令错误/);
  await assert.rejects(openRecoverySnapshot({ ...encrypted, iterations: 1 }, password), /不支持/);
});
test('missing sections, duplicate keys and key mismatches cannot reach a restore', () => {
  const missing = fixture(); delete missing.stores.syncOutbox;
  assert.throws(() => validateSnapshot(missing), /不完整/);
  const duplicate = fixture(); duplicate.photos.push(duplicate.photos[0]);
  assert.throws(() => validateSnapshot(duplicate), /重复/);
  const mismatch = fixture(); mismatch.stores.beans = [{ key: 'one', value: { id: 'two' } }];
  assert.throws(() => validateSnapshot(mismatch), /不匹配/);
});
test('unsupported JSON values are not silently lost', () => {
  for (const value of [undefined, NaN, Infinity, new Date(), new Uint8Array(2), [, 1]]) assert.throws(() => canonical(value));
  assert.throws(() => canonical(JSON.parse('{"__proto__":{"x":1}}')));
});
test('manifest detects photo and preference changes', async () => {
  const source = fixture(), before = await snapshotManifest(source);
  source.photos[0].value = 'data:image/jpeg;base64,ZGVm';
  source.preferences['luckybean.voice.v120'] = '{"mode":"female"}';
  const after = await snapshotManifest(source);
  assert.notEqual(before.photos.sha256, after.photos.sha256);
  assert.notEqual(before.preferences.sha256, after.preferences.sha256);
  assert.equal(before.beans.sha256, after.beans.sha256);
});
test('short password and future schema are refused', async () => {
  await assert.rejects(sealRecoverySnapshot(fixture(), 'short'), /12/);
  assert.throws(() => validateSnapshot({ ...fixture(), schemaVersion: 11 }), /schema 10/);
});
