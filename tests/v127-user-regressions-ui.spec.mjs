import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, route => route.abort('failed'));
  await page.goto(`${BASE_URL}/?v123e-regressions=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
});

test('edited legacy bean keeps readable country and variety in compact card', async ({ page }) => {
  await page.evaluate(async () => {
    const db = await import('/src/db.js');
    await db.put('beans', {
      id: 'legacy-readable-bean',
      name: '埃塞俄比亚 · Geisha',
      countryCode: 'LEGACY-COUNTRY',
      varietyCode: 'LEGACY-VARIETY',
      processCode: 'LEGACY-PROCESS',
      processName: 'Washed',
      roastCode: 'RL-L1',
      roastDate: '2026-08-01',
      initialWeight: 85,
      remainingWeight: 85,
      archived: false,
      source: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail: { source: 'v123e-legacy-card' } }));
  });

  const card = page.locator('.bean-card[data-bean-id="legacy-readable-bean"]');
  await expect(card).toHaveClass(/lb-one-line-bean/, { timeout: 10000 });
  const storedName = await page.evaluate(async () => {
    const db = await import('/src/db.js');
    return (await db.get('beans', 'legacy-readable-bean'))?.name || '';
  });
  expect(storedName).toBe('埃塞俄比亚 · Geisha');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('luckybean:app-refreshed', { detail: { source: 'v123e-force-display-repair' } })));
  await expect(card.locator('.lb-bean-primary')).toHaveText('埃塞/瑰夏');
  await expect(card.locator('.lb-bean-secondary')).toContainText('/浅/水洗/85g');
  await expect(card).not.toContainText('未定');
});

test('custom first and tail cooling keep exactly one inline editor each after repeated mutations', async ({ page }) => {
  await page.evaluate(async () => {
    const db = await import('/src/db.js');
    const current = await db.getSetting('app.settings', {}) || {};
    current.brew ||= {};
    current.brew.firstCoolingMode = 'custom';
    current.brew.firstTemperatureC = 90;
    current.brew.tailCoolingMode = 'custom';
    current.brew.tailTemperatureC = 80;
    await db.setSetting('app.settings', current);
    document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail: { source: 'v123e-cooling' } }));
  });

  await page.locator('[data-page-target="brew"]').click();
  await expect(page.locator('#firstCoolingMode')).toHaveValue('custom', { timeout: 10000 });
  await expect(page.locator('#tailCoolingMode')).toHaveValue('custom');

  await page.evaluate(() => {
    for (let i = 0; i < 20; i += 1) {
      const marker = document.createElement('i');
      marker.hidden = true;
      document.body.append(marker);
      marker.remove();
    }
  });
  await page.waitForTimeout(500);

  await expect(page.locator('[data-lb-cooling-editor="first"]')).toHaveCount(1);
  await expect(page.locator('[data-lb-cooling-editor="tail"]')).toHaveCount(1);
  await expect(page.locator('[data-lb-cooling-editor="first"] input')).toHaveValue('90');
  await expect(page.locator('[data-lb-cooling-editor="tail"] input')).toHaveValue('80');
});

test('matching gear has one canonical angle bypass and paper-speed block after repeated DOM mutations', async ({ page }) => {
  await page.locator('[data-page-target="brew"]').click();
  const block = page.locator('[data-lb-matching-gear]');
  await expect(block).toHaveCount(1, { timeout: 10000 });
  await expect(block.locator('#lbDripperAngle')).toHaveCount(1);
  await expect(block).toContainText('滤杯角度');
  await expect(block).toContainText('旁通');
  await expect(block).toContainText('滤纸流速');
  await expect(page.locator('#lbDripperShape')).toHaveCount(0);

  await page.evaluate(() => {
    for (let i = 0; i < 30; i += 1) {
      const marker = document.createElement('i');
      marker.dataset.gearMutation = String(i);
      document.querySelector('#brewContent')?.append(marker);
      marker.remove();
    }
  });
  await page.waitForTimeout(500);
  await expect(page.locator('[data-lb-matching-gear]')).toHaveCount(1);
  await expect(page.locator('#lbDripperAngle')).toHaveCount(1);
  await expect(page.locator('#lbDripperShape')).toHaveCount(0);
});

test('Android image decode failure marks native URI fallback instead of pretending WebView bytes are valid', async ({ page }) => {
  const result = await page.evaluate(async () => {
    globalThis.__LUCKYBEAN_ANDROID__ = true;
    const { preparePackageImage } = await import('/src/image-quality.js?v123e-native-fallback');
    const file = new File([new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])], 'unsupported-photo.heic', { type: 'image/heic' });
    const prepared = await preparePackageImage(file);
    return {
      status: prepared.status,
      size: prepared.blob.size,
      type: prepared.blob.type,
      nativeSource: prepared.nativeSource,
      warning: prepared.warnings?.join(' ') || ''
    };
  });
  expect(result.status).toBe('usable');
  expect(result.size).toBe(8);
  expect(result.type).toBe('image/heic');
  expect(result.nativeSource).toBe(true);
  expect(result.warning).toContain('Android 直接读取原始照片');
});

test('Android URI-backed image reaches native OCR with empty dataUrl and no FileReader encoding', async ({ page }) => {
  const result = await page.evaluate(async () => {
    globalThis.__LUCKYBEAN_ANDROID__ = true;
    let captured = null;
    globalThis.LuckyBeanRecognitionBridge = {
      async recognizeCoffeeBag(payload) {
        captured = payload.images[0];
        return {
          engine: 'android-test',
          blocks: [{ text: 'ETHIOPIA', confidence: 0.9, imageId: captured.id, imageRole: captured.role }],
          fullText: 'ETHIOPIA'
        };
      }
    };
    const { recognizeCoffeeBag } = await import('/src/recognition-bridge.js?v123e-uri-ocr');
    const blob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: 'image/heic' });
    const response = await recognizeCoffeeBag([{
      id: 'native-heic-1',
      role: 'front',
      roleLabel: '正面主体',
      blob,
      nativeSource: true
    }]);
    return { dataUrl: captured?.dataUrl, nativeSource: captured?.nativeSource, text: response.fullText };
  });
  expect(result.dataUrl).toBe('');
  expect(result.nativeSource).toBe(true);
  expect(result.text).toContain('ETHIOPIA');
});
