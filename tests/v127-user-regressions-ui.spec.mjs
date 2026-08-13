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

test('cooling menus keep custom values stable and can return to model recommendation after repeated mutations', async ({ page }) => {
  await page.locator('[data-page-target="brew"]').click();
  const first = page.locator('#firstCoolingMode');
  const tail = page.locator('#tailCoolingMode');
  await expect(first).toContainText('模型推荐', { timeout: 10000 });
  await expect(tail).toContainText('模型推荐');

  await tail.click();
  await expect(page.locator('[data-overlay="cooling-mode"]')).toBeVisible();
  await page.locator('[data-cooling-choice="custom"]').click();
  await expect(page.locator('[data-overlay="cooling"]')).toBeVisible();
  await page.locator('#coolingTemperature').fill('80');
  await page.locator('#saveCoolingBtn').click();
  await expect(tail).toContainText('80°C');

  await page.evaluate(() => {
    for (let i = 0; i < 20; i += 1) {
      const marker = document.createElement('i');
      marker.hidden = true;
      document.body.append(marker);
      marker.remove();
    }
  });
  await page.waitForTimeout(300);
  await expect(page.locator('[data-lb-cooling-editor]')).toHaveCount(0);
  await expect(page.locator('#tailCoolingMode')).toContainText('80°C');

  await page.locator('#tailCoolingMode').click();
  await page.locator('[data-cooling-choice="auto"]').click();
  await expect(page.locator('#tailCoolingMode')).toContainText('模型推荐');
});

test('小酌 never recreates editable dripper angle bypass or paper-speed controls after repeated DOM mutations', async ({ page }) => {
  await page.locator('[data-page-target="brew"]').click();
  await expect(page.locator('[data-lb-matching-gear][data-lb-legacy-gear-disabled]')).toHaveCount(0);
  await expect(page.locator('#brewContent #lbDripperAngle')).toHaveCount(0);
  await expect(page.locator('#brewContent #lbDripperBypass')).toHaveCount(0);
  await expect(page.locator('#brewContent #lbPaperSpeed')).toHaveCount(0);
  await expect(page.locator('#brewContent #lbDripperShape')).toHaveCount(0);

  await page.evaluate(() => {
    for (let i = 0; i < 30; i += 1) {
      const marker = document.createElement('i');
      marker.dataset.gearMutation = String(i);
      document.querySelector('#brewContent')?.append(marker);
      marker.remove();
    }
  });
  await page.waitForTimeout(500);
  await expect(page.locator('[data-lb-matching-gear]')).toHaveCount(0);
  await expect(page.locator('[data-lb-matching-gear][data-lb-legacy-gear-disabled]')).toHaveCount(0);
  await expect(page.locator('#brewContent #lbDripperAngle,#brewContent #lbDripperBypass,#brewContent #lbPaperSpeed,#brewContent #lbDripperShape')).toHaveCount(0);
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
