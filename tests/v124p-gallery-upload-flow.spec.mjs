import { test, expect } from '@playwright/test';

test.setTimeout(120_000);

async function openCapture(page) {
  await page.addInitScript(() => {
    localStorage.setItem('luckybean.onboarding.v2', JSON.stringify({
      stage:'existing-user',
      updatedAt:new Date().toISOString(),
      reason:'gallery-upload-smoke'
    }));
  });
  await page.goto('http://127.0.0.1:4173/', { waitUntil:'domcontentloaded' });
  const splash = page.locator('#splashScreen');
  if (await splash.isVisible().catch(() => false)) await splash.click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout:15_000 });
  await expect(page.locator('#overlayRoot')).toBeAttached({ timeout:15_000 });
  await page.waitForFunction(() => Boolean(globalThis.LuckyBeanRuntimeFeatures?.loadMany), null, { timeout:20_000 });
  await page.evaluate(() => globalThis.LuckyBeanRuntimeFeatures.loadMany([
    'gallery-image-preprocess',
    'package-capture'
  ]));
  await page.waitForFunction(() => Boolean(globalThis.LuckyBeanPackageCapture?.open), null, { timeout:20_000 });
  await page.evaluate(() => globalThis.LuckyBeanPackageCapture.open());
  await expect(page.locator('#bagGalleryBtn')).toBeVisible({ timeout:10_000 });
  await expect(page.locator('#bagGalleryBtn')).toBeEnabled({ timeout:10_000 });
}

async function installAutoOcrProbe(page) {
  await page.evaluate(() => {
    globalThis.__luckyBeanAutoOcrStarts = 0;
    document.addEventListener('luckybean:package-auto-recognition-start', () => {
      globalThis.__luckyBeanAutoOcrStarts += 1;
    });
  });
}

async function expectAutoOcr(page, expected = 1) {
  await expect.poll(() => page.evaluate(() => Number(globalThis.__luckyBeanAutoOcrStarts || 0)), { timeout:10_000 }).toBe(expected);
  await expect(page.locator('#bagRecognizeBtn')).toHaveCount(0);
}

async function jpegBytes(page, width, height) {
  return page.evaluate(async ({ width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f8f6ef';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#151515';
    context.font = `bold ${Math.max(28, Math.round(width / 20))}px Arial`;
    context.fillText('ETHIOPIA GUJI', Math.max(30, Math.round(width * 0.08)), Math.max(90, Math.round(height * 0.32)));
    context.fillText('WASHED 1950M', Math.max(30, Math.round(width * 0.08)), Math.max(160, Math.round(height * 0.5)));
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      result => result ? resolve(result) : reject(new Error('JPEG fixture creation failed')),
      'image/jpeg',
      0.88
    ));
    canvas.width = 1;
    canvas.height = 1;
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, { width, height });
}

async function jpegFixture(page, { name, width, height }) {
  const bytes = await jpegBytes(page, width, height);
  return { name, mimeType:'image/jpeg', buffer:Buffer.from(bytes) };
}

async function chooseJpeg(page, spec) {
  const fixture = await jpegFixture(page, spec);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#bagGalleryBtn').click()
  ]);
  await chooser.setFiles(fixture);
}

test('small gallery image passes through unchanged and automatically starts OCR', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
  await openCapture(page);
  await installAutoOcrProbe(page);

  await chooseJpeg(page, { name:'gallery-small-direct.jpg', width:1200, height:800 });

  await expect(page.locator('.lb-img-pre')).toHaveCount(0);
  const card = page.locator('.bag-photo-card');
  await expect(card).toHaveCount(1, { timeout:20_000 });
  await expect(card).toContainText(/1200×800 px/);
  await expectAutoOcr(page);
  expect(pageErrors.filter(message => /gallery|image|bitmap|preview|canvas/i.test(message))).toEqual([]);
});

test('gallery image between 1600 and 3000px shrinks in Worker and automatically starts OCR', async ({ page }) => {
  await openCapture(page);
  await installAutoOcrProbe(page);
  await chooseJpeg(page, { name:'gallery-medium-worker.jpg', width:2400, height:1600 });

  await expect(page.locator('.lb-img-pre')).toHaveCount(0);
  const card = page.locator('.bag-photo-card');
  await expect(card).toHaveCount(1, { timeout:20_000 });
  await expect(card).toContainText(/1600×1067 px/);
  await expectAutoOcr(page);
});

test('gallery upload over 3000px crops first and automatically starts OCR after confirm', async ({ page }) => {
  await openCapture(page);
  await installAutoOcrProbe(page);
  await chooseJpeg(page, { name:'gallery-oversize-crop.jpg', width:3001, height:1800 });

  const cropOverlay = page.locator('.lb-img-pre');
  await expect(cropOverlay).toBeVisible({ timeout:20_000 });
  await expect(page.getByRole('heading', { name:'裁切识别范围' })).toBeVisible();
  await expect(page.locator('[data-confirm]')).toBeVisible();
  const statusText = await page.locator('.lb-img-pre__status').textContent();
  expect(String(statusText || '')).toMatch(/低分辨率预览|使用照片内置缩略图/);

  await page.locator('[data-confirm]').click();
  await expect(cropOverlay).toHaveCount(0, { timeout:20_000 });
  await expect(page.locator('.bag-photo-card')).toHaveCount(1, { timeout:20_000 });
  await expectAutoOcr(page);
});

test('camera image automatically starts OCR without crop', async ({ page }) => {
  await openCapture(page);
  await installAutoOcrProbe(page);
  const fixture = await jpegFixture(page, { name:'camera-direct.jpg', width:1600, height:1200 });

  await page.locator('#bagCameraInput').setInputFiles(fixture);

  await expect(page.locator('.lb-img-pre')).toHaveCount(0);
  await expect(page.locator('.bag-photo-card')).toHaveCount(1, { timeout:20_000 });
  await expectAutoOcr(page);
});
