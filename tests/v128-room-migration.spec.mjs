import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';
const STORES = [
  'beans', 'beanSummaries', 'brewSessions', 'sensoryRecords', 'inventoryEvents',
  'settings', 'customCodes', 'codebookCache', 'syncMetadata', 'shareDrafts',
  'historyRevisions', 'recycleBin', 'syncOutbox'
];

async function installFixture(page) {
  await page.goto(`${BASE_URL}/public/fallback-codebook.json?room-migration-contract=1`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async stores => {
    await new Promise(resolve => {
      const request = indexedDB.deleteDatabase('luckybean');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('luckybean', 10);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const name of stores) {
          if (!database.objectStoreNames.contains(name)) {
            database.createObjectStore(name, { keyPath: name === 'customCodes' ? 'code' : 'id' });
          }
        }
        for (const name of ['brewSessions', 'sensoryRecords', 'inventoryEvents']) {
          const objectStore = request.transaction.objectStore(name);
          objectStore.createIndex('beanId', 'beanId');
          objectStore.createIndex('beanCreatedAt', ['beanId', 'createdAt']);
        }
        request.transaction.objectStore('beanSummaries').createIndex('updatedAt', 'updatedAt');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = {
      beans: [{ id: 'bean-1', name: 'Migration · Geisha', note: 'KEEP-UNKNOWN-FIELD', nested: { flags: ['x', 3] } }],
      brewSessions: [{ id: 'brew-1', beanId: 'bean-1', createdAt: '2026-10-01T00:00:00.000Z', stages: [{ index: 1, seconds: 40 }] }],
      sensoryRecords: [{ id: 'sensory-1', beanId: 'bean-1', storageFormat: 'sensory-record/aes-gcm-v1', ciphertext: 'OPAQUE-SEALED-VALUE', iv: 'opaque-iv' }],
      inventoryEvents: [{ id: 'inventory-1', beanId: 'bean-1', amountG: -15, createdAt: '2026-10-01T00:00:00.000Z' }],
      customCodes: [{ code: 'CUSTOM-1', name: 'Custom', extra: { keep: true } }],
      syncMetadata: [{ id: 'local.sensory.key.v1', secret: 'DEVICE-KEY-MUST-SURVIVE', algorithm: 'AES-GCM-256' }],
      syncOutbox: [{ id: 'outbox-1', store: 'beans', recordId: 'bean-1', payload: { unknown: 'keep' }, state: 'pending' }]
    };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite');
      for (const [name, values] of Object.entries(rows)) {
        for (const row of values) tx.objectStore(name).put(row);
      }
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();

    const room = new Map();
    const keyOf = (name, row) => name === 'customCodes' ? row.code : row.id;
    const clone = value => value == null ? value : structuredClone(value);
    const getMap = name => {
      if (!room.has(name)) room.set(name, new Map());
      return room.get(name);
    };
    const api = {
      failStore: '',
      async get(name, key) { return clone(getMap(name).get(String(key)) ?? null); },
      async all(name) { return [...getMap(name).values()].map(clone); },
      async allByBean(name, beanId) { return [...getMap(name).values()].filter(row => row.beanId === beanId).map(clone); },
      async put(name, row) { getMap(name).set(String(keyOf(name, row)), clone(row)); },
      async putBean(row, summary) {
        getMap('beans').set(String(row.id), clone(row));
        getMap('beanSummaries').set(String(summary.id), clone(summary));
      },
      async bulkPut(name, values) {
        for (const row of values) getMap(name).set(String(keyOf(name, row)), clone(row));
        if (name === this.failStore && values.length) getMap(name).delete(String(keyOf(name, values[values.length - 1])));
      },
      async bulkPutBeans(values, summaries) {
        for (const row of values) getMap('beans').set(String(row.id), clone(row));
        for (const row of summaries) getMap('beanSummaries').set(String(row.id), clone(row));
      },
      async remove(name, key) { getMap(name).delete(String(key)); },
      async removeBean(key) { getMap('beans').delete(String(key)); getMap('beanSummaries').delete(String(key)); },
      async clear(name) { getMap(name).clear(); },
      async clearBeans() { getMap('beans').clear(); getMap('beanSummaries').clear(); },
      async replaceStores(storesToReplace) {
        for (const [name, values] of Object.entries(storesToReplace)) {
          getMap(name).clear();
          for (const row of values) getMap(name).set(String(keyOf(name, row)), clone(row));
        }
      },
      async applyChanges(changes) {
        for (const name of changes.clearStores) getMap(name).clear();
        for (const row of changes.deletes) getMap(row.store).delete(String(row.key));
        for (const row of changes.puts) getMap(row.store).set(String(keyOf(row.store, row.value)), clone(row.value));
      },
      async clearAll() { room.clear(); }
    };
    globalThis.__LUCKYBEAN_ANDROID__ = true;
    globalThis.LuckyBeanRoomStore = api;
    const storage = await import('/src/db-storage-core.js?room-migration-contract=1');
    globalThis.__roomMigrationApi = storage;
    return Object.keys(rows);
  }, STORES);
}

async function rawRows(page, name) {
  return page.evaluate(async store => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('luckybean');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows;
  }, name);
}

test('schema 10 migration snapshots, verifies, runs atomic Room transactions and can roll back to IndexedDB', async ({ page }) => {
  await installFixture(page);
  const before = {};
  for (const name of STORES) before[name] = await rawRows(page, name);

  const result = await page.evaluate(() => globalThis.__roomMigrationApi.migrateSchema10ToRoom());
  expect(result.migrated).toBe(true);
  expect(result.total).toBeGreaterThan(0);

  const state = await page.evaluate(async () => {
    const store = globalThis.LuckyBeanRoomStore;
    const manifest = await store.get('migrationSnapshots', 'manifest');
    const bean = await store.get('beans', 'bean-1');
    const sensory = await store.get('sensoryRecords', 'sensory-1');
    const outbox = await store.get('syncOutbox', 'outbox-1');
    const snapshot = (await store.all('migrationSnapshots')).filter(row => row.sourceStore === 'beans');
    return { manifest, bean, sensory, outbox, snapshotCount: snapshot.length };
  });
  expect(state.manifest.sourceSchemaVersion).toBe(10);
  expect(state.bean.note).toBe('KEEP-UNKNOWN-FIELD');
  expect(state.bean.nested.flags).toEqual(['x', 3]);
  expect(state.sensory.ciphertext).toBe('OPAQUE-SEALED-VALUE');
  expect(state.outbox.payload.unknown).toBe('keep');
  expect(state.snapshotCount).toBe(1);
  for (const name of STORES) expect(await rawRows(page, name)).toEqual(before[name]);

  await page.evaluate(async () => {
    const db = await globalThis.__roomMigrationApi.openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['beans', 'syncOutbox'], 'readwrite');
      const beans = tx.objectStore('beans');
      const current = beans.get('bean-1');
      current.onsuccess = () => {
        beans.put({ ...current.result, name: 'Room edit', note: 'LATEST' });
        tx.objectStore('syncOutbox').put({
          id: 'transaction-outbox-1', store: 'beans', recordId: 'bean-1', state: 'pending'
        });
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Room transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('Room transaction aborted'));
    });
  });
  const transactionState = await page.evaluate(async () => ({
    bean: await globalThis.LuckyBeanRoomStore.get('beans', 'bean-1'),
    summary: await globalThis.LuckyBeanRoomStore.get('beanSummaries', 'bean-1'),
    outbox: await globalThis.LuckyBeanRoomStore.get('syncOutbox', 'transaction-outbox-1')
  }));
  expect(transactionState.bean.name).toBe('Room edit');
  expect(transactionState.summary.displayName).toBe('Room edit');
  expect(transactionState.outbox.recordId).toBe('bean-1');

  const expectedAfterRollback = await page.evaluate(async stores => {
    const nativeStore = globalThis.LuckyBeanRoomStore;
    return Object.fromEntries(await Promise.all(stores.map(async name => {
      const values = await nativeStore.all(name);
      return [name, name === 'syncMetadata'
        ? values.filter(value => value.id !== 'native.storage.backend.v1')
        : values];
    })));
  }, STORES);
  const rollback = await page.evaluate(() => globalThis.__roomMigrationApi.rollbackRoomToIndexedDb());
  expect(rollback.rolledBack).toBe(true);
  for (const name of STORES) expect(await rawRows(page, name)).toEqual(expectedAfterRollback[name]);
  expect(await page.evaluate(() => globalThis.LuckyBeanRoomStore.get('syncMetadata', 'native.storage.backend.v1'))).toBeNull();
});

test('failed verification leaves the schema 10 source intact and Room inactive', async ({ page }) => {
  await installFixture(page);
  const before = await rawRows(page, 'inventoryEvents');
  await page.evaluate(() => { globalThis.LuckyBeanRoomStore.failStore = 'inventoryEvents'; });
  await expect(page.evaluate(() => globalThis.__roomMigrationApi.migrateSchema10ToRoom())).rejects.toThrow(/校验失败/);
  expect(await rawRows(page, 'inventoryEvents')).toEqual(before);
  expect(await page.evaluate(() => globalThis.LuckyBeanRoomStore.all('beans'))).toEqual([]);
});
