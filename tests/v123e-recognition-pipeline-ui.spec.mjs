import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

test('native OCR payload is translated, structured and handed to the bean form without the legacy parser race', async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, route => route.abort('failed'));
  await page.goto(`${BASE_URL}/?recognition-pipeline=2`, { waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });

  await page.evaluate(() => {
    const box = (left, top, right, bottom) => [[left, top], [right, top], [right, bottom], [left, bottom]];
    globalThis.LuckyBeanRecognitionBridge = {
      async recognizeCoffeeBag(payload) {
        const imageId = payload.images[0].id;
        const rows = [
          ['COUNTRY', 'ETHIOPIA'], ['REGION', 'GUJI'], ['PROCESS', 'WASHED'],
          ['VARIETY', '74110'], ['ROAST LEVEL', 'LIGHT'], ['NET WEIGHT', '150 g'],
          ['ROASTED ON', '2026-08-12'], ['TASTING NOTES', 'BLUEBERRY, JASMINE, HONEY']
        ];
        const blocks = [];
        rows.forEach(([label, value], index) => {
          const top = 20 + index * 38;
          blocks.push({ id: `l-${index}`, imageId, imageRole: 'back', text: label, polygon: box(20, top, 150, top + 22), confidence: 0.95 });
          blocks.push({ id: `v-${index}`, imageId, imageRole: 'back', text: value, polygon: box(180, top, 500, top + 22), confidence: 0.94 });
        });
        return { engine: 'android-golden', blocks, fullText: blocks.map(item => item.text).join('\n') };
      }
    };
    globalThis.LuckyBeanPackageCapture.open();
  });

  await page.locator('#bagGalleryInput').setInputFiles({ name: 'beanbag.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await expect(page.locator('#bagRecognizeBtn')).toBeEnabled();
  await page.locator('#bagRecognizeBtn').click();

  const country = page.locator('[data-recognition-field="countryCode"]');
  await expect(country).toContainText('埃塞俄比亚', { timeout: 15000 });
  await expect(country).toContainText('原文：ETHIOPIA');
  await expect(page.locator('[data-recognition-field="regionCode"]')).toContainText('古吉');
  await expect(page.locator('[data-recognition-field="processCode"]')).toContainText('水洗');
  await expect(page.locator('[data-recognition-field="flavorCodes"]')).toContainText('蓝莓');
  await expect(page.locator('[data-recognition-field="altitude"]')).toHaveCount(0);
  await expect(page.locator('.bag-semantic-summary')).toContainText('待确认 0 项');

  await page.locator('#bagHandoffBtn').click();
  await expect(page.locator('#beanForm')).toBeVisible();
  await expect(page.locator('#beanCountry')).toHaveValue('CO-EA');
  await expect(page.locator('#beanRegion')).toHaveValue('RG-EA-GU');
  await expect(page.locator('#beanVariety')).toHaveValue('VA-JA10');
  await expect(page.locator('#beanProcess')).toHaveValue('PR-WA');
  await expect(page.locator('#beanInitialWeight')).toHaveValue('150');
  await expect(page.locator('#beanRoastDate')).toHaveValue('2026-08-12');
  await expect(page.locator('#formFlavorSummary')).toContainText('蓝莓');
});
