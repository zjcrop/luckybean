import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';
const ORIGINAL_STORES = ['beans','brewSessions','sensoryRecords','inventoryEvents','settings','customCodes','codebookCache','syncMetadata','shareDrafts','historyRevisions','recycleBin','syncOutbox'];

async function seedV9(page) {
  await page.goto(`${BASE_URL}/public/fallback-codebook.json?migration-seed=1`, { waitUntil: 'domcontentloaded' });
  return page.evaluate(async stores => {
    await new Promise(resolve => {
      const request = indexedDB.deleteDatabase('luckybean');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('luckybean', 9);
      request.onupgradeneeded = () => {
        for (const name of stores) if (!request.result.objectStoreNames.contains(name)) {
          request.result.createObjectStore(name, { keyPath: name === 'customCodes' ? 'code' : 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const bean = {
      id: 'bean_migration_1',
      name: '旧数据保真测试 · 瑰夏',
      countryCode: 'CO-ET',
      regionCode: '', entityCode: '', varietyCode: 'VA-GE', processCode: 'PR-WA', roastCode: 'RL-L1',
      roastDate: '2026-08-30', initialWeight: 200, remainingWeight: 167.5, refrigerated: false,
      price: 128, roasterName: 'Migration Test Roaster', altitude: 1950,
      flavorCodes: ['FV-100'], notes: 'CANONICAL-NOTES-MUST-SURVIVE',
      recognitionMetadata: { nested: { preserve: true }, source: 'legacy-v9' },
      recognitionProvenance: { evidence: { countryCode: 'Ethiopia' }, confidence: { countryCode: 0.93 } },
      archived: false, createdAt: '2026-08-30T01:02:03.000Z', updatedAt: '2026-09-01T04:05:06.000Z'
    };
    const brew = { id: 'brew_migration_1', beanId: bean.id, createdAt: '2026-09-01T05:00:00.000Z', stages: [{ index: 1, durationSec: 40, stageWaterG: 50 }], immutableMarker: 'BREW-MUST-SURVIVE' };
    const sensory = { id: 'sensory_migration_1', beanId: bean.id, brewSessionId: brew.id, createdAt: '2026-09-01T05:05:00.000Z', answers: { floral: ['茉莉'] }, naturalNote: 'SENSORY-MUST-SURVIVE', score: 88.5 };
    const inventory = { id: 'inv_migration_1', beanId: bean.id, type: 'brew', amountG: -15, resultingWeightG: 167.5, createdAt: '2026-09-01T05:00:00.000Z', immutableMarker: 'INV-MUST-SURVIVE' };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['beans','brewSessions','sensoryRecords','inventoryEvents'], 'readwrite');
      tx.objectStore('beans').put(bean);
      tx.objectStore('brewSessions').put(brew);
      tx.objectStore('sensoryRecords').put(sensory);
      tx.objectStore('inventoryEvents').put(inventory);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return { bean, brew, sensory, inventory };
  }, ORIGINAL_STORES);
}

async function readV10State(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('luckybean');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (store, key) => new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = store => new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = {
      version: db.version,
      stores: [...db.objectStoreNames],
      bean: await read('beans', 'bean_migration_1'),
      summary: await read('beanSummaries', 'bean_migration_1'),
      brew: await read('brewSessions', 'brew_migration_1'),
      sensory: await read('sensoryRecords', 'sensory_migration_1'),
      inventory: await read('inventoryEvents', 'inv_migration_1'),
      counts: {
        beans: await count('beans'),
        summaries: await count('beanSummaries'),
        brew: await count('brewSessions'),
        sensory: await count('sensoryRecords'),
        inventory: await count('inventoryEvents')
      },
      indexes: {
        brew: [...db.transaction('brewSessions').objectStore('brewSessions').indexNames],
        sensory: [...db.transaction('sensoryRecords').objectStore('sensoryRecords').indexNames],
        inventory: [...db.transaction('inventoryEvents').objectStore('inventoryEvents').indexNames]
      }
    };
    db.close();
    return result;
  });
}

test('v9 -> v10 builds a derived bean directory without rewriting canonical user data', async ({ page }) => {
  const original = await seedV9(page);
  await page.goto(`${BASE_URL}/?local-first-migration=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-bean-id="bean_migration_1"]')).toBeVisible({ timeout: 15000 });

  const migrated = await readV10State(page);
  expect(migrated.version).toBe(10);
  expect(migrated.stores).toContain('beanSummaries');
  expect(migrated.counts).toEqual({ beans: 1, summaries: 1, brew: 1, sensory: 1, inventory: 1 });
  expect(migrated.bean).toEqual(original.bean);
  expect(migrated.brew).toEqual(original.brew);
  expect(migrated.sensory).toEqual(original.sensory);
  expect(migrated.inventory).toEqual(original.inventory);
  expect(migrated.summary.id).toBe(original.bean.id);
  expect(migrated.summary.displayName).toBe(original.bean.name);
  expect(migrated.summary.remainingWeight).toBe(original.bean.remainingWeight);
  expect(migrated.summary.notes).toBeUndefined();
  expect(migrated.summary.recognitionMetadata).toBeUndefined();
  expect(migrated.summary.recognitionProvenance).toBeUndefined();
  expect(migrated.indexes.brew).toContain('beanId');
  expect(migrated.indexes.sensory).toContain('beanId');
  expect(migrated.indexes.inventory).toContain('beanId');
});
