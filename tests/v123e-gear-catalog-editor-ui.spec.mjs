import { test, expect } from '@playwright/test';
import { installBrewProfilesBrowserFixture } from './helpers/brewprofiles-browser-fixture.mjs';

const BASE_URL = 'http://127.0.0.1:4173';

async function openApp(page, suffix, { installFixture = true } = {}) {
  if (installFixture) await installBrewProfilesBrowserFixture(page);
  await page.goto(`${BASE_URL}/?${suffix}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
}

test('private gear catalog editors remain closed, aligned, editable and persistent', async ({ page }) => {
  await openApp(page, 'requirements-gear-catalog=1');
  await page.locator('[data-page-target="settings"]').click();
  const privateGear = page.locator('#privateGearCategory');
  await expect(privateGear).not.toHaveAttribute('open', '');
  await privateGear.locator(':scope > summary').click();
  const subpages = privateGear.locator('.gear-subpage');
  await expect(subpages).toHaveCount(3);
  await expect(subpages.nth(0).locator(':scope > summary strong')).toHaveText('滤纸');
  await expect(subpages.nth(1).locator(':scope > summary strong')).toHaveText('滤杯');
  await expect(subpages.nth(2).locator(':scope > summary strong')).toHaveText('磨豆机');
  for (let index = 0; index < 3; index += 1) await expect(subpages.nth(index)).not.toHaveAttribute('open', '');
  const alignments = await subpages.locator(':scope > summary').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).textAlign));
  expect(alignments).toEqual(['left', 'left', 'left']);

  await subpages.nth(2).locator(':scope > summary').click();
  await page.locator('[data-add-gear="grinder"]').click();
  await page.locator('#grinderName').fill('测试磨豆机');
  await page.locator('#grinderSetting').fill('22格');
  await page.locator('#saveGrinderBtn').click();

  await page.locator('#privateGearCategory > summary').click();
  await page.locator('[data-gear-kind="filter"] > summary').click();
  await page.locator('[data-add-gear="filter"]').click();
  await page.locator('#pMode').selectOption('custom');
  await page.locator('#pCatalog').selectOption('cafec-abaca-plus-cone');
  await page.locator('#pBrand').fill('测试品牌');
  await page.locator('#pName').fill('测试滤纸');
  await page.locator('#pQty').fill('50');
  await page.locator('#pSave').click();
  await expect(page.locator('[data-overlay="filter-editor"]')).toHaveCount(0);

  await page.locator('#privateGearCategory > summary').click();
  await page.locator('[data-gear-kind="dripper"] > summary').click();
  await page.locator('[data-add-gear="dripper"]').click();
  await page.locator('#dMode').selectOption('custom');
  await page.locator('#dCatalog').selectOption('hario-v60-02-plastic');
  await page.locator('#dName').fill('测试滤杯');
  await page.locator('#dMaterial').selectOption('ceramic');
  await page.locator('#dMass').fill('260');
  await page.locator('#dSave').click();
  await expect(page.locator('[data-overlay="dripper-editor"]')).toHaveCount(0);

  await page.locator('#privateGearCategory > summary').click();
  await page.locator('[data-gear-kind="dripper"] > summary').click();
  const dripperItem = page.locator('[data-dripper-item]').filter({ hasText: '测试滤杯' });
  await expect(dripperItem).toHaveCount(1);
  await dripperItem.click();
  await expect(page.locator('#dMaterial')).toHaveValue('ceramic');
  await expect(page.locator('#dMass')).toHaveValue('260');
  await page.locator('[data-close-overlay]').click();

  // Restart the UI on a fresh Page in the same BrowserContext. This preserves the
  // origin's IndexedDB/localStorage like an app restart, while eliminating teardown
  // navigation races from the old document. Persistence assertions remain unchanged.
  const context = page.context();
  await page.close();
  const reopenedPage = await context.newPage();
  await openApp(reopenedPage, 'requirements-gear-catalog-persisted=1');
  await reopenedPage.locator('[data-page-target="settings"]').click();
  await reopenedPage.locator('#privateGearCategory > summary').click();
  for (const kind of ['filter', 'dripper', 'grinder']) await expect(reopenedPage.locator(`[data-gear-kind="${kind}"]`)).not.toHaveAttribute('open', '');
  await reopenedPage.locator('[data-gear-kind="filter"] > summary').click();
  await expect(reopenedPage.locator('[data-filter-item]')).toContainText('测试品牌 测试滤纸');
  await reopenedPage.locator('[data-gear-kind="filter"] > summary').click();
  await reopenedPage.locator('[data-gear-kind="dripper"] > summary').click();
  await expect(reopenedPage.locator('[data-dripper-item]').filter({ hasText: '测试滤杯' })).toHaveCount(1);
  await reopenedPage.locator('[data-gear-kind="dripper"] > summary').click();
  await reopenedPage.locator('[data-gear-kind="grinder"] > summary').click();
  await expect(reopenedPage.locator('[data-grinder-item]')).toContainText('测试磨豆机');
});
