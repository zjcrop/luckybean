import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lifecycle = fs.readFileSync(new URL('../src/domain/beans/bean-lifecycle-service.js', import.meta.url), 'utf8');
const codec = fs.readFileSync(new URL('../src/cloud-codec.js', import.meta.url), 'utf8');

test('delete intent is durably recorded before canonical bean removal', () => {
  const intentIndex = lifecycle.indexOf('await recordBeanDeletions');
  const removeIndex = lifecycle.indexOf("await remove('beans'");
  assert.ok(intentIndex >= 0, 'recordBeanDeletions must exist');
  assert.ok(removeIndex > intentIndex, 'tombstone must be persisted before bean removal');
});

test('remote merge and full restore both enforce active delete mutations', () => {
  assert.match(codec, /skipKeysWithDeletes/);
  assert.match(codec, /mergeRemoteBeanMutations/);
  assert.match(codec, /enforceDeletedBeans/);
  assert.match(codec, /restorePackets/);
  assert.match(codec, /bean-mutations/);
});
