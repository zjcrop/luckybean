import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

async function openApp(page, suffix) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, route => route.abort('failed'));
  await page.goto(`${BASE_URL}/?${suffix}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => Boolean(globalThis.LuckyBeanRuntimeFeatures), null, { timeout: 15000 });
}

async function confirmRecognitionPreflight(page) {
  const preflight = page.locator('[data-overlay="recognition-preflight"]');
  await expect(preflight).toBeVisible({ timeout: 10000 });
  await expect(preflight.locator('#preflightConfirmBtn')).toHaveText('确认并填入');
  await preflight.locator('#preflightConfirmBtn').click();
  await expect(page.locator('[data-overlay="bean-form"] #beanForm')).toBeVisible({ timeout: 10000 });
}

test('text recognition preserves ambiguous variety evidence through the canonical preflight', async ({ page }) => {
  await openApp(page, 'v124p-preflight-text=1');
  await page.locator('#fabAddBtn').click();
  await page.locator('[data-add-mode="text"]').click();
  await page.locator('#recognitionText').fill([
    'COUNTRY: Ethiopia',
    'REGION: XQZ UNKNOWN REGION',
    'VARIETAL: 74110 / 74112',
    'PROCESS: Washed',
    'ROAST LEVEL: L2',
    'ROAST DATE: 2026-08-02',
    'NET WEIGHT: 150 g'
  ].join('\n'));
  await page.locator('#parseTextBtn').click();

  const preflight = page.locator('[data-overlay="recognition-preflight"]');
  await expect(preflight).toBeVisible();
  await expect(preflight).toContainText('识别信息确认');
  await confirmRecognitionPreflight(page);

  await expect(page.locator('#beanRoast')).toHaveValue('RL-L2');
  await expect(page.locator('#beanVariety')).toHaveValue('');
  await expect(page.locator('[data-evidence-field="varietyCode"][data-evidence-value="VA-JA10"]')).toBeVisible();
  await expect(page.locator('[data-evidence-field="varietyCode"][data-evidence-value="VA-JA12"]')).toBeVisible();
  await expect(page.locator('.evidence-row-v2').filter({ hasText: '产区' })).toHaveCount(0);
});

test('native OCR handoff requires preflight confirmation before populating the bean form', async ({ page }) => {
  await openApp(page, 'v124p-preflight-native=1');
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
  await page.locator('[data-bag-role]').selectOption('back');
  await page.locator('#bagRecognizeBtn').click();
  await expect(page.locator('[data-recognition-field="countryCode"]')).toContainText('埃塞俄比亚', { timeout: 15000 });
  await expect(page.locator('.bag-semantic-summary')).toContainText('待确认 0 项');

  await page.locator('#bagHandoffBtn').click();
  await confirmRecognitionPreflight(page);
  await expect(page.locator('#beanCountry')).toHaveValue('CO-EA');
  await expect(page.locator('#beanRegion')).toHaveValue('RG-EA-GU');
  await expect(page.locator('#beanVariety')).toHaveValue('VA-JA10');
  await expect(page.locator('#beanProcess')).toHaveValue('PR-WA');
  await expect(page.locator('#beanInitialWeight')).toHaveValue('150');
  await expect(page.locator('#beanRoastDate')).toHaveValue('2026-08-12');
  await expect(page.locator('#formFlavorSummary')).toContainText('蓝莓');
});

test('date ownership confirmation is followed by preflight before roast date enters the bean form', async ({ page }) => {
  await openApp(page, 'v124p-preflight-date=1');
  await page.evaluate(() => globalThis.LuckyBeanRecognitionFlow.openText('DATE 2026-07-28'));
  await page.locator('#parseTextBtn').click();

  const review = page.locator('[data-overlay="date-review"]');
  const type = review.locator('.date-review-type');
  await expect(review).toBeVisible();
  await expect(type).toHaveValue('pending');
  await expect(review.locator('#dateReviewContinueBtn')).toBeDisabled();
  await type.selectOption('roastDate');
  await expect(review.locator('#dateReviewContinueBtn')).toBeEnabled();
  await review.locator('#dateReviewContinueBtn').click();

  await confirmRecognitionPreflight(page);
  await expect(page.locator('#beanRoastDate')).toHaveValue('2026-07-28');
});

test('package pending entity enters preflight before explicit bean-form confirmation', async ({ page }) => {
  await openApp(page, 'v124p-preflight-pending=1');
  await page.evaluate(() => globalThis.LuckyBeanPackageCapture.open());
  await expect(page.locator('[data-overlay="bag-capture"]')).toBeVisible();
  await page.locator('#bagManualBtn').click();
  const text = page.locator('#bagOcrText');
  await expect(text).toBeVisible();
  await text.fill('COUNTRY ATLANTIS');
  await page.locator('#bagReanalyzeBtn').click();

  const packageRow = page.locator('.bag-semantic-row.review[data-recognition-field="countryCode"]');
  await expect(packageRow).toBeVisible({ timeout: 10000 });
  await expect(packageRow).toContainText('待确认');
  await packageRow.click();

  await confirmRecognitionPreflight(page);
  const form = page.locator('#beanForm');
  const pending = form.locator('[data-recognition-review="pending"] .evidence-row[data-evidence-field="countryCode"]');
  await expect(pending).toBeVisible();
  await expect(form.locator('[data-confirm-recognition-field="countryCode"]')).toBeVisible();
  await form.locator('#beanCountry').selectOption('CO-EA');
  await form.locator('[data-confirm-recognition-field="countryCode"]').click();
  await expect(pending).toHaveCount(0);
  await expect(form.locator('#beanCountry')).toHaveValue('CO-EA');
});
