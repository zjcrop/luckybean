import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('luckybean.onboarding.v2', JSON.stringify({stage:'existing-user',updatedAt:new Date().toISOString(),reason:'closeout-regression'})));
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
  await expect(card.locator('.lb-bean-secondary')).toContainText('/浅烘/水洗/85g');
  await expect(card).not.toContainText('未定');
});

test('cooling menus keep custom values stable and can return to model recommendation after repeated mutations', async ({ page }) => {
  await page.locator('[data-page-target="brew"]').click();
  const first = page.locator('#firstCoolingMode');
  const tail = page.locator('#tailCoolingMode');
  await expect(first).toContainText('自动', { timeout: 10000 });
  await expect(tail).toContainText('自动');

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
  await expect(page.locator('#tailCoolingMode')).toContainText('自动');
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

async function seedCloseoutBean(page, {remainingWeight = 100, photo = false} = {}) {
  await page.evaluate(async ({remainingWeight, photo}) => {
    const db = await import('/src/db.js');
    await db.put('beans', {
      id:'closeout-bean', name:'埃塞俄比亚 · JARC 74158', countryName:'埃塞俄比亚', varietyName:'JARC 74158',
      roasterName:'测试烘豆商', productName:'测试品牌', processName:'Washed', roastCode:'RL-L1',
      roastDate:'2026-09-20', initialWeight:100, remainingWeight, archived:false, source:'manual',
      createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
    });
    if (photo) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
      canvas.getContext('2d').fillRect(0, 0, 256, 256);
      const {saveBeanThumbnail} = await import('/src/domain/beans/bean-thumbnail-storage.js');
      await saveBeanThumbnail('closeout-bean', canvas.toDataURL('image/jpeg'));
    }
    document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh'));
  }, {remainingWeight, photo});
  await expect(page.locator('.bean-card[data-bean-id="closeout-bean"]')).toHaveClass(/lb-one-line-bean/);
}

test('the active bean renderer preserves local photos and displays roaster, origin and numeric variety', async ({page}) => {
  await seedCloseoutBean(page, {photo:true});
  const card = page.locator('.bean-card[data-bean-id="closeout-bean"]');
  await expect(card.locator('.lb-bean-primary')).toHaveText('测试烘豆商/埃塞/74158');
  const image = card.locator('img[data-bean-thumbnail]');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(node => Math.round(node.getBoundingClientRect().height * 10) / 10)).toBe(46);
  const dimensions = await image.evaluate(node => ({width:node.getBoundingClientRect().width, height:node.getBoundingClientRect().height, decoded:node.naturalWidth}));
  expect(dimensions.width).toBe(46); expect(dimensions.height).toBeCloseTo(46, 1); expect(dimensions.decoded).toBe(256);
  await card.click();
  await expect(page.locator('[data-overlay="bean-detail"] .bean-thumbnail-shell-detail img')).toBeVisible();
  expect(await page.evaluate(async () => JSON.stringify(await (await import('/src/db.js')).get('beans','closeout-bean')))).not.toContain('data:image');
});

test('typing a 14g custom dose persists it and reopening the dialog retains 14g without a page error', async ({page}) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await seedCloseoutBean(page);
  await page.locator('[data-page-target="brew"]').click();
  await page.locator('#brewBean').selectOption('closeout-bean');
  await page.locator('#brewDose').click();
  await page.locator('#customDoseInput').fill('14');
  await expect(page.locator('[data-dose-choice="manual"]')).toHaveClass(/primary/);
  await page.locator('#saveDoseModeBtn').click();
  await expect(page.locator('#brewDose')).toContainText('14');
  await page.locator('#brewDose').click();
  await expect(page.locator('#customDoseInput')).toHaveValue('14');
  expect(errors).toEqual([]);
});

test('remaining bean allocation changes only this brew dose and supports 28g, 27g and 12g', async ({page}) => {
  for (const [remainingWeight, doses] of [[28,'14.0g + 14.0g'],[27,'15.0g + 12.0g'],[12,'一次用完']]) {
    await page.locator('[data-page-target="beans"]').click();
    await seedCloseoutBean(page, {remainingWeight});
    await page.locator('[data-page-target="brew"]').click();
    await page.locator('#brewBean').selectOption('closeout-bean');
    await expect(page.locator('.leftover-brew-suggestion')).toContainText(doses);
    await page.locator('#useRemainingBeanBtn').click();
    await expect(page.locator('#brewDose')).toContainText(remainingWeight === 28 ? '14' : remainingWeight === 27 ? '15' : '12');
  }
});
