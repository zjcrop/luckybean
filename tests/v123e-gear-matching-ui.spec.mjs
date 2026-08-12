import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

async function openPrivateGear(page) {
  await page.locator('[data-page-target="settings"]').click();
  const privateGear = page.locator('#privateGearCategory');
  const topSummary = privateGear.locator(':scope > summary');
  if (!(await privateGear.evaluate(node => node.open))) await topSummary.click();
  return privateGear;
}

async function openGearSubpage(privateGear, kind) {
  const section = privateGear.locator(`[data-gear-kind="${kind}"]`);
  if (!(await section.evaluate(node => node.open))) await section.locator(':scope > summary').click();
  return section;
}

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, route => route.abort('failed'));
  await page.goto(`${BASE_URL}/?v123e-gear-matching=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
});

test('dripper angle and bypass are configured in 器设 and only displayed read-only in 小酌', async ({ page }) => {
  const privateGear = await openPrivateGear(page);
  const drippers = await openGearSubpage(privateGear, 'dripper');
  await drippers.locator('[data-add-gear="dripper"]').click();
  await expect(page.locator('#lbDripperAngle')).toBeVisible();
  await expect(page.locator('#lbDripperBypass')).toBeVisible();
  await page.locator('#dripperName').fill('测试角度滤杯');
  await page.locator('#dripperType').selectOption({ label: '锥形滤杯' });
  await page.locator('#dripperMaterial').selectOption('plastic');
  await page.locator('#lbDripperAngle').fill('45');
  await page.locator('#lbDripperBypass').selectOption('low');
  await page.locator('#saveDripperBtn').click();
  await expect(page.locator('[data-overlay="dripper-editor"]')).toHaveCount(0);
  const saved = page.locator('[data-dripper-item]').filter({ hasText: '测试角度滤杯' });
  await expect(saved).toHaveCount(1);
  const dripperId = await saved.getAttribute('data-dripper-item');
  await expect(saved).toContainText('45°');
  await expect(saved).toContainText('旁通少');
  await page.locator('[data-page-target="brew"]').click();
  await page.locator('#brewDripper').selectOption(dripperId);
  await page.locator('#brewDripper').dispatchEvent('change');
  await expect(page.locator('#brewDripperMaterial')).toHaveCount(0);
  await expect(page.locator('[data-lb-brew-dripper-properties]')).toHaveCount(0);
  await expect(page.locator('#brewContent')).not.toContainText('滤杯角度');
  const tops = await page.locator('[data-brew-row="filter-gear-water"] .control').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});

test('filter speed is bound to filter paper in 器设', async ({ page }) => {
  const privateGear = await openPrivateGear(page);
  const filters = await openGearSubpage(privateGear, 'filter');
  await filters.locator('[data-add-gear="filter"]').click();
  await expect(page.locator('#lbFilterSpeed')).toBeVisible();
  await page.locator('#filterBrand').fill('测试');
  await page.locator('#filterType').fill('高速滤纸');
  await page.locator('#lbFilterSpeed').selectOption('high');
  await page.locator('#filterQuantity').fill('20');
  await page.locator('#saveFilterBtn').click();
  await expect(page.locator('[data-overlay="filter-editor"]')).toHaveCount(0);
  const saved = page.locator('[data-filter-item]').filter({ hasText: '高速滤纸' });
  await expect(saved).toHaveCount(1);
  await expect(saved).toContainText('流速高');
});
