import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

async function openGear(page, kind) {
  await page.locator('[data-page-target="settings"]').click();
  const root = page.locator('#privateGearCategory');
  if (!(await root.evaluate(node => node.open))) await root.locator(':scope > summary').click();
  const section = root.locator(`[data-gear-kind="${kind}"]`);
  if (!(await section.evaluate(node => node.open))) await section.locator(':scope > summary').click();
  return section;
}

async function readSettings(page) {
  return page.evaluate(async () => (await import('/src/db.js')).getSetting('app.settings', {}));
}

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, route => route.abort('failed'));
  await page.goto(`${BASE_URL}/?gear-physics-ui=1`, { waitUntil:'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout:15000 });
});

test('standard dripper catalog stores a B75 physical snapshot', async ({ page }) => {
  const section = await openGear(page, 'dripper');
  await section.locator('[data-add-gear="dripper"]').click();
  await page.locator('#dCatalog').selectOption('timemore-b75-pctg');
  await expect(page.locator('#dGroup')).toHaveValue('flat');
  await expect(page.locator('#dAngle')).toHaveValue('75');
  await page.locator('#dSave').click();
  const item = page.locator('[data-dripper-item]').filter({ hasText:'Crystal Eye B75' });
  await expect(item).toHaveCount(1);
  const id = await item.getAttribute('data-dripper-item');
  const saved = await readSettings(page);
  const physics = saved.matchingGear.drippers[id].resolvedPhysics;
  expect(physics.contract).toBe('gear-physics/1.0');
  expect(physics.group).toBe('flat');
  expect(physics.angleDeg).toBe(75);
  expect(physics.materialClass).toBe('plastic');
});

test('custom template edits and catalog paper resolve without missing-data failure', async ({ page }) => {
  let section = await openGear(page, 'dripper');
  await section.locator('[data-add-gear="dripper"]').click();
  await page.locator('#dMode').selectOption('custom');
  await page.locator('#dCatalog').selectOption('hario-v60-02-plastic');
  await page.locator('#dName').fill('测试陶瓷滤杯');
  await page.locator('#dMaterial').selectOption('ceramic');
  await page.locator('#dAngle').fill('62');
  await page.locator('#dMass').fill('260');
  await page.locator('#dSave').click();
  let item = page.locator('[data-dripper-item]').filter({ hasText:'测试陶瓷滤杯' });
  const dripperId = await item.getAttribute('data-dripper-item');
  let saved = await readSettings(page);
  expect(saved.matchingGear.drippers[dripperId].basedOnCatalogId).toBe('hario-v60-02-plastic');
  expect(saved.matchingGear.drippers[dripperId].resolvedPhysics.materialClass).toBe('ceramic');
  expect(saved.matchingGear.drippers[dripperId].resolvedPhysics.massG).toBe(260);

  section = await openGear(page, 'filter');
  await section.locator('[data-add-gear="filter"]').click();
  await page.locator('#pCatalog').selectOption('cafec-abaca-plus-cone');
  await expect(page.locator('#pFlow')).toHaveValue('high');
  await page.locator('#pQty').fill('20');
  await page.locator('#pSave').click();
  item = page.locator('[data-filter-item]').filter({ hasText:'Abaca+ Cone' });
  const paperId = await item.getAttribute('data-filter-item');
  saved = await readSettings(page);
  expect(saved.matchingGear.papers[paperId].resolvedPhysics.contract).toBe('gear-physics/1.0');
  expect(saved.matchingGear.papers[paperId].resolvedPhysics.flowClass).toBe('high');
  expect(Number.isFinite(saved.matchingGear.papers[paperId].resolvedPhysics.flowIndex)).toBe(true);
});
