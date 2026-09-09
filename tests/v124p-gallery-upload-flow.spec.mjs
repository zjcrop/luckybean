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

async function jpegBytes(page) {
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f8f6ef';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#151515';
    context.font = 'bold 64px Arial';
    context.fillText('ETHIOPIA GUJI', 100, 260);
    context.fillText('WASHED 1950M', 100, 390);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      result => result ? resolve(result) : reject(new Error('JPEG fixture creation failed')),
      'image/jpeg',
      0.9
    ));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
}

async function chooseJpeg(page, name) {
  const bytes = await jpegBytes(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#bagGalleryBtn').click()
  ]);
  await chooser.setFiles({ name, mimeType:'image/jpeg', buffer:Buffer.from(bytes) });
}

test('default gallery chooser uses bounded Worker fast path without forcing manual crop', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
  await openCapture(page);

  await expect(page.locator('#bagGalleryManualCrop')).toBeVisible({ timeout:10_000 });
  await expect(page.locator('#bagGalleryManualCrop')).not.toBeChecked();
  await chooseJpeg(page, 'gallery-fast-smoke.jpg');

  await expect(page.locator('.lb-img-pre')).toHaveCount(0);
  const card = page.locator('.bag-photo-card');
  await expect(card).toHaveCount(1, { timeout:20_000 });
  await expect(card).toContainText(/1200×800 px/);
  expect(pageErrors.filter(message => /gallery|image|bitmap|preview|canvas/i.test(message))).toEqual([]);
});

test('manual crop remains available as an explicit low-memory option', async ({ page }) => {
  await openCapture(page);
  const toggle = page.locator('#bagGalleryManualCrop');
  await expect(toggle).toBeVisible({ timeout:10_000 });
  await toggle.check();
  await chooseJpeg(page, 'gallery-manual-crop-smoke.jpg');

  const cropOverlay = page.locator('.lb-img-pre');
  await expect(cropOverlay).toBeVisible({ timeout:15_000 });
  await expect(page.getByRole('heading', { name:'裁切识别范围' })).toBeVisible();
  await expect(page.locator('[data-confirm]')).toBeVisible();
  await expect(page.locator('[data-cancel]')).toBeVisible();
  const statusText = await page.locator('.lb-img-pre__status').textContent();
  expect(String(statusText || '')).toMatch(/低分辨率预览|使用照片内置缩略图/);
  await page.locator('[data-cancel]').click();
  await expect(cropOverlay).toHaveCount(0);
});
