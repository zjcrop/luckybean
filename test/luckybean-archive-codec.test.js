import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PORTABLE_STORES,
  buildLuckyBeanArchive,
  parseLuckyBeanArchive
} from '../src/domain/archive/luckybean-archive-codec.js';

const emptyStores = () => Object.fromEntries(PORTABLE_STORES.map(name => [name, []]));

test('archive round-trip preserves every portable store', async () => {
  const stores = emptyStores();
  stores.beans.push({ id: 'bean-1', name: '测试豆', remainingWeight: 120 });
  stores.settings.push({ id: 'app.settings', value: { groupMethod: 'country' } });
  const archive = await buildLuckyBeanArchive({ stores, schemaVersion: 8, appVersion: '1.23D' });
  const parsed = await parseLuckyBeanArchive(archive, { currentSchemaVersion: 8 });
  assert.deepEqual(parsed.stores, stores);
});

test('archive rejects tampered store data', async () => {
  const stores = emptyStores();
  stores.beans.push({ id: 'bean-1', name: '原始名称' });
  const archive = await buildLuckyBeanArchive({ stores, schemaVersion: 8, appVersion: '1.23D' });
  archive.stores.beans[0].name = '被篡改';
  await assert.rejects(() => parseLuckyBeanArchive(archive, { currentSchemaVersion: 8 }), /校验失败/);
});

test('legacy 1.2.x JSON backup migrates without inventing records', async () => {
  const parsed = await parseLuckyBeanArchive({
    format: 'luckybean-backup', schemaVersion: 7, appVersion: '1.2.3', exportedAt: '2026-08-06T00:00:00.000Z',
    beans: [{ id: 'b1' }], brewSessions: [], sensoryRecords: [], inventoryEvents: [], settings: { groupMethod: 'country' }
  }, { currentSchemaVersion: 8 });
  assert.equal(parsed.migratedFrom, 'luckybean-backup');
  assert.equal(parsed.stores.beans.length, 1);
  assert.equal(parsed.stores.settings[0].id, 'app.settings');
  assert.equal(parsed.stores.customCodes.length, 0);
});

test('future schema cannot be imported', async () => {
  const archive = await buildLuckyBeanArchive({ stores: emptyStores(), schemaVersion: 99, appVersion: 'future' });
  await assert.rejects(() => parseLuckyBeanArchive(archive, { currentSchemaVersion: 8 }), /高于当前应用/);
});
