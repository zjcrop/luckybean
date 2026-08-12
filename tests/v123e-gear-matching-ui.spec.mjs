import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, route => route.abort('failed'));
  await page.goto(`${BASE_URL}/?v123e-gear-matching=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
});

test('dripper angle and bypass are configured in 器设 and only displayed read-only in 小酌', async ({ page }) => {
  await page.locator('[data-page-target="settings"]').click();
  const privateGear = page.locator('#privateGearCategory');
  await privateGear.locator('summary').click();
  await privateGear.locator('[data-add-gear="dripper"]').click();
  await expect(page.locator('#lbDripperAngle')).toBeVisible();
  await expect(page.locator('#lbDripperBypass')).toBeVisible();
  await page.locator('#lbDripperName').fill('测试角度滤杯');
  await page.locator('#lbDripperType').selectOption({ label: '锥形滤杯' });
  await page.locator('#lbDripperMaterial').selectOption('plastic');
  await page.locator('#lbDripperAngle').fill('45');
  await page.locator('#lbDripperBypass').selectOption('low');
  await page.locator('#lbSaveDripper').click();
  await expect(page.locator('[data-overlay="gear-matching-editor"]')).toHaveCount(0);
  const saved = page.locator('[data-dripper-item]').filter({ hasText: '测试角度滤杯' });
  await expect(saved).toHaveCount(1);
  const dripperId = await saved.getAttribute('data-dripper-item');
  await expect(saved).toContainText('45°');
  await expect(saved).toContainText('旁通少');
  await page.locator('[data-page-target="brew"]').click();
  await page.locator('#brewDripper').selectOption(dripperId);
  await page.locator('#brewDripper').dispatchEvent('change');
  await expect(page.locator('#brewDripperMaterial')).toBeDisabled();
  await expect(page.locator('[data-lb-brew-dripper-properties]')).toContainText('45°');
  await expect(page.locator('[data-lb-brew-dripper-properties]')).toContainText('旁通少');
  await expect(page.locator('#brewContent')).not.toContainText('滤杯角度');
});

test('filter speed is bound to filter paper in 器设', async ({ page }) => {
  await page.locator('[data-page-target="settings"]').click();
  const privateGear = page.locator('#privateGearCategory');
  await privateGear.locator('summary').click();
  await privateGear.locator('[data-add-gear="filter"]').click();
  await expect(page.locator('#lbFilterSpeed')).toBeVisible();
  await page.locator('#lbFilterBrand').fill('测试');
  await page.locator('#lbFilterType').fill('高速滤纸');
  await page.locator('#lbFilterSpeed').selectOption('high');
  await page.locator('#lbFilterQuantity').fill('20');
  await page.locator('#lbSaveFilter').click();
  const saved = page.locator('[data-filter-item]').filter({ hasText: '高速滤纸' });
  await expect(saved).toHaveCount(1);
  await expect(saved).toContainText('流速高');
});
