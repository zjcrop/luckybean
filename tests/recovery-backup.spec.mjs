import { test, expect } from '@playwright/test';
const BASE = 'http://127.0.0.1:4173';
async function seed(page) {
  await page.goto(`${BASE}/public/fallback-codebook.json`);
  await page.evaluate(async () => {
    const db = await import('/src/db.js');
    const photo = await import('/src/domain/beans/bean-thumbnail-storage.js');
    await db.put('beans', { id: 'b1', name: '真实形态测试豆', remainingWeight: 85, custom: { keep: true } });
    await db.put('brewSessions', { id: 'brew1', beanId: 'b1', createdAt: '2026-10-13T00:00:00Z' });
    await db.put('sensoryRecords', { id: 'sensory1', beanId: 'b1', createdAt: '2026-10-13T00:00:00Z', naturalNote: 'PRIVATE-NOTE', answers: {}, score: 80 });
    await db.setSetting('app.settings', { identity: { publicId: 'private-person', email: 'private@example.invalid' }, groupMethod: 'roast' });
    await db.put('recycleBin', { id: 'trash1', value: { id: 'old-bean' } });
    await db.put('syncOutbox', { id: 'out1', operation: 'put' });
    await db.put('customCodes', { code: 'CUSTOM', name: '保留词' });
    await photo.saveBeanThumbnail('b1', 'data:image/jpeg;base64,YWJj');
    localStorage.setItem('luckybean.voice.v120', '{"mode":"female"}');
    localStorage.setItem('auth-token-test', 'DO-NOT-EXPORT');
  });
}
test('file encryption and isolated IDB restore retain photos, ciphertext, keys and live data', async ({ page }) => {
  await seed(page);
  const result = await page.evaluate(async () => {
    const service = await import('/src/domain/archive/recovery-snapshot-service.js');
    const codec = await import('/src/domain/archive/recovery-snapshot-codec.js');
    const before = await service.captureRecoverySnapshot();
    const backup = await service.createRecoveryBackup('local-recovery-password');
    const bytes = JSON.stringify(backup.envelope);
    const report = await service.verifyRecoveryBackup(JSON.parse(bytes), 'local-recovery-password');
    const after = await service.captureRecoverySnapshot();
    const opened = await codec.openRecoverySnapshot(backup.envelope, 'local-recovery-password');
    return { report, unchanged: codec.canonical(await codec.snapshotManifest(before)) === codec.canonical(await codec.snapshotManifest(after)), excludedAuth: !JSON.stringify(opened).includes('DO-NOT-EXPORT'), privateCipher: !!opened.stores.sensoryRecords[0].value.cipher, diagnostics: JSON.stringify(service.recoveryDiagnostics()), temp: (await indexedDB.databases()).filter(db => db.name.startsWith('luckybean-recovery-rehearsal-')) };
  });
  expect(result.unchanged).toBe(true);
  expect(result.excludedAuth).toBe(true);
  expect(result.privateCipher).toBe(true);
  expect(result.report.manifest.photos.count).toBe(1);
  expect(result.report.privateRecords).toEqual({ sensory: 1, identity: 1 });
  expect(result.report.fileReadBack).toBe('passed');
  expect(result.temp).toEqual([]);
  expect(result.diagnostics).not.toMatch(/PRIVATE-NOTE|private-person|private@example|data:image|local-recovery-password/);
});
test('wrong password and broken private key preserve failure evidence without replacing data', async ({ page }) => {
  await seed(page);
  const result = await page.evaluate(async () => {
    const service = await import('/src/domain/archive/recovery-snapshot-service.js');
    const codec = await import('/src/domain/archive/recovery-snapshot-codec.js');
    const before = await service.captureRecoverySnapshot();
    const backup = await service.createRecoveryBackup('local-recovery-password');
    const failures = [];
    try { await service.verifyRecoveryBackup(backup.envelope, 'incorrect-password'); } catch { failures.push('password'); }
    const broken = structuredClone(before);
    broken.stores.syncMetadata = broken.stores.syncMetadata.filter(row => row.key !== 'local.sensory.key.v1');
    try { await service.verifyRecoveryBackup(await codec.sealRecoverySnapshot(broken, 'local-recovery-password'), 'local-recovery-password'); } catch { failures.push('private-key'); }
    return { failures, reports: service.recoveryDiagnostics().filter(x => x.status === 'failed'), unchanged: codec.canonical(await codec.snapshotManifest(before)) === codec.canonical(await codec.snapshotManifest(await service.captureRecoverySnapshot())), temp: (await indexedDB.databases()).filter(x => x.name.startsWith('luckybean-recovery-rehearsal-')) };
  });
  expect(result.failures).toEqual(['password', 'private-key']);
  expect(result.reports).toHaveLength(2);
  expect(result.unchanged).toBe(true);
  expect(result.temp).toEqual([]);
});
test('read errors and rehearsal write errors fail closed, never emit an empty successful backup', async ({ page }) => {
  await seed(page);
  const result = await page.evaluate(async () => {
    const service = await import('/src/domain/archive/recovery-snapshot-service.js');
    const codec = await import('/src/domain/archive/recovery-snapshot-codec.js');
    const before = await service.captureRecoverySnapshot();
    const transaction = IDBDatabase.prototype.transaction;
    const failures = [];
    try {
      IDBDatabase.prototype.transaction = function(...args) { if (this.name === 'luckybean') throw new DOMException('injected read failure', 'UnknownError'); return transaction.apply(this, args); };
      try { await service.createRecoveryBackup('local-recovery-password'); } catch { failures.push('read'); }
      IDBDatabase.prototype.transaction = function(...args) { if (this.name.startsWith('luckybean-recovery-rehearsal-') && args[1] === 'readwrite') throw new DOMException('injected quota failure', 'QuotaExceededError'); return transaction.apply(this, args); };
      try { await service.createRecoveryBackup('local-recovery-password'); } catch { failures.push('write'); }
    } finally { IDBDatabase.prototype.transaction = transaction; }
    return { failures, unchanged: codec.canonical(await codec.snapshotManifest(before)) === codec.canonical(await codec.snapshotManifest(await service.captureRecoverySnapshot())), reports: service.recoveryDiagnostics().filter(x => x.status === 'failed'), temp: (await indexedDB.databases()).filter(x => x.name.startsWith('luckybean-recovery-rehearsal-')) };
  });
  expect(result.failures).toEqual(['read', 'write']);
  expect(result.unchanged).toBe(true);
  expect(result.reports).toHaveLength(2);
  expect(result.temp).toEqual([]);
});
test('recovery UI exports then reads a saved file; never offers live restore', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    document.body.innerHTML = '<main></main>';
    const { openRecoveryBackupDialog } = await import('/src/ui/recovery-backup-controller.js');
    openRecoveryBackupDialog({ showOverlay(html) { const div = document.createElement('div'); div.innerHTML = html; document.body.append(div); return div; }, dialogHeader(title) { return `<h2>${title}</h2>`; }, bindClose() {} });
  });
  await page.locator('[data-recovery-password]').fill('local-recovery-password');
  await page.locator('[data-recovery-confirm]').fill('local-recovery-password');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-recovery-create]').click();
  const download = await downloadPromise;
  const path = await download.path();
  await expect(page.locator('[data-recovery-status]')).toContainText('已请求保存');
  await expect(page.locator('[data-recovery-password]')).toHaveValue('');
  await page.locator('[data-recovery-password]').fill('local-recovery-password');
  await page.locator('[data-recovery-file]').setInputFiles(path);
  await expect(page.locator('[data-recovery-status]')).toContainText('已保存文件读回、解密及隔离恢复演练通过');
  await expect(page.getByRole('button', { name: '确认恢复', exact: true })).toHaveCount(0);
});
test('writes observed during capture block export instead of mixing database states', async ({ page }) => {
  await seed(page);
  const result = await page.evaluate(async () => {
    const service = await import('/src/domain/archive/recovery-snapshot-service.js');
    const close = IDBDatabase.prototype.close;
    let injected = false, rejected = false;
    IDBDatabase.prototype.close = function() {
      if (this.name === 'luckybean' && !injected) {
        injected = true;
        this.transaction('beans', 'readwrite').objectStore('beans').put({ id: 'b1', name: '并发编辑', remainingWeight: 80 });
      }
      return close.call(this);
    };
    try { await service.createRecoveryBackup('local-recovery-password'); } catch (error) { rejected = error.message.includes('数据发生变化'); }
    finally { IDBDatabase.prototype.close = close; }
    return { rejected, reports: service.recoveryDiagnostics() };
  });
  expect(result.rejected).toBe(true);
  expect(result.reports.at(-1).step).toBe('capture-stable-snapshot');
  expect(result.reports.at(-1).status).toBe('failed');
});
test('settings entry opens the recovery workflow in the actual app', async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
  await page.locator('.bottom-nav [data-page-target="settings"]').click();
  await page.locator('#settingsRecoveryBtn').evaluate(button => {
    for (let parent = button.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
  });
  await page.locator('#settingsRecoveryBtn').click();
  await expect(page.locator('[data-recovery-create]')).toBeVisible();
  await expect(page.locator('[data-recovery-status]')).toHaveCount(1);
});
