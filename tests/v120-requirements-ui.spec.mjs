import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';
const SUPABASE_PATTERN = 'https://vaxwncdcuvbpvdbbketb.supabase.co/**';

async function openApp(page, suffix) {
  await page.route(SUPABASE_PATTERN, route => route.abort('failed'));
  await page.goto(`${BASE_URL}/?${suffix}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => Boolean(globalThis.LuckyBeanRuntimeFeatures), null, { timeout: 15000 });
}

async function seedBean(page) {
  await page.evaluate(async () => {
    const db = await import('/src/db.js');
    await db.put('beans', {
      id: 'requirements-bean', name: '测试豆', countryCode: 'CO-ET', varietyCode: 'VA-GE', processCode: 'PR-WA', roastCode: 'RL-L1',
      roastDate: '2026-08-01', initialWeight: 100, remainingWeight: 100, altitude: 1900, archived: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail: { source: 'requirements-test' } }));
  });
}

test('one cloud panel, all profile selection and stable 3D mount', async ({ page }) => {
  await openApp(page, 'requirements-account-brew=1');
  await page.locator('[data-page-target="settings"]').click();
  const cloudSection = page.locator('#settingsContent [data-settings-key="account"]');
  await expect(cloudSection).toBeVisible();
  await cloudSection.locator('summary').click();
  await expect(page.locator('[data-cloud-account-panel]')).toHaveCount(1);
  await expect(page.locator('[data-v099p-cloud-panel],[data-v099e-cloud-panel],[data-v099f-account-sync]')).toHaveCount(0);
  await expect(page.locator('#saveIdentityBtn,#settingsNickname,#settingsPhone,#settingsWechat,#settingsQq')).toHaveCount(0);

  await seedBean(page);
  await page.locator('[data-page-target="brew"]').click();
  const options = await page.locator('#brewProfile option').evaluateAll(nodes => nodes.map(node => node.value).filter(Boolean));
  expect(options.length).toBeGreaterThan(8);
  const profile = page.locator('#brewProfile');
  const generate = page.locator('#generatePlanBtn');
  for (const selected of options) {
    await profile.selectOption(selected);
    await expect(profile).toHaveValue(selected);
    await generate.click();
    await expect(generate).toBeEnabled({ timeout: 20000 });
    await expect(page.locator('#generatedPlan')).toBeVisible({ timeout: 20000 });
    await expect(profile).toHaveValue(selected);
  }
  await expect(page.locator('#brewSpatialMount [data-brew-spatial-preview]')).toBeVisible({ timeout: 10000 });
});

test('professional tags sort and radar nodes select and drag; note mode opens directly', async ({ page }) => {
  await openApp(page, 'requirements-sensory=1');
  await seedBean(page);
  await page.locator('[data-page-target="sensory"]').click();
  await page.locator('#sensoryBeanSelect').selectOption('requirements-bean');
  await page.locator('[data-v095-mode="professional"]').click();
  const tags = page.locator('[data-v095-tag]');
  await tags.nth(0).click();
  await tags.nth(1).click();
  await expect(page.locator('[data-v120-selected-tag]')).toHaveCount(2);
  const first = page.locator('[data-v120-selected-tag]').nth(0);
  const second = page.locator('[data-v120-selected-tag]').nth(1);
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + secondBox.width, secondBox.y + secondBox.height / 2, { steps: 5 });
  await page.mouse.up();

  for (let i = 0; i < 8; i += 1) await page.locator('[data-v095-next]').click();
  const node = page.locator('[data-v120-radar-node]').first();
  await expect(node).toBeVisible();
  const before = Number(await node.getAttribute('aria-valuenow'));
  const box = await node.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 24, { steps: 5 });
  await page.mouse.up();
  const after = Number(await node.getAttribute('aria-valuenow'));
  expect(after).not.toBe(before);

  await page.locator('[data-v095-close]').click();
  await page.locator('[data-v095-mode="note"]').click();
  await expect(page.locator('#sensoryDeltaWheel')).toBeVisible({ timeout: 3000 });
});
