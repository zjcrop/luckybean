import fs from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { installBrewProfilesBrowserFixture } from './helpers/brewprofiles-browser-fixture.mjs';

const base = process.env.DSB_TEST_URL || 'http://127.0.0.1:4173';
test.use({
  viewport: { width: 430, height: 932 },
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
});
test.setTimeout(90000);

async function enter(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 20000 });
  await page.waitForFunction(() => document.documentElement.dataset.startup === 'ready');
}

async function seed(page) {
  await page.evaluate(async () => {
    const db = await import('/src/db.js');
    const now = new Date().toISOString();
    await db.put('beans', {
      id: 'ios-bean', name: 'iOS regression bean', countryCode: 'CO-EA',
      varietyCode: 'VA-JA10', processCode: 'PR-WA', roastCode: 'RL-L2',
      roastDate: now.slice(0, 10), roasterName: 'iOS roaster',
      initialWeight: 250, remainingWeight: 250, archived: false,
      source: 'manual', createdAt: now, updatedAt: now
    });
    await new Promise(resolve => {
      const done = event => {
        if (event.detail?.source !== 'dsb-ios-seed') return;
        document.removeEventListener('luckybean:app-refreshed', done);
        resolve();
      };
      document.addEventListener('luckybean:app-refreshed', done);
      document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail: { source: 'dsb-ios-seed' } }));
    });
  });
}

test('fresh browser needs no account; an image-free bean edits and exports on mobile', async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, route => route.abort());
  await enter(page);
  await expect(page.locator('[data-lb-onboarding],[data-overlay="cloud-auth"]')).toHaveCount(0);
  expect(await page.evaluate(async () => (await import('/src/distribution.js')).IS_LUCKYBEAN_DS)).toBe(true);
  await seed(page);
  await page.locator('#beanGroups [data-bean-id="ios-bean"]').first().click();
  await page.locator('#editBeanBtn').click();
  await expect(page.locator('#beanForm')).toBeVisible();
  await page.locator('#beanNotes').fill('iOS edited without a photo');
  await page.locator('#beanRoaster').fill('iOS roaster');
  await page.locator('#beanForm button[type="submit"]').click();
  await expect(page.locator('#beanForm')).toHaveCount(0);
  expect(await page.evaluate(async () => (await (await import('/src/db.js')).get('beans', 'ios-bean')).notes)).toBe('iOS edited without a photo');
  const before = await page.evaluate(() => scrollY);
  await page.waitForTimeout(800);
  expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThan(3);
  await page.locator('[data-page-target="settings"]').click();
  await expect(page.locator('[data-settings-key="account"] summary')).toContainText('本地数据');
  await page.locator('.data-category > summary').click();
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#settingsExportBtn').click();
  const download = await downloadEvent;
  const archive = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  expect(JSON.stringify(archive)).toContain('iOS edited without a photo');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible();
  expect(await page.evaluate(async () => (await (await import('/src/db.js')).get('beans', 'ios-bean')).notes)).toBe('iOS edited without a photo');
});

test('xBloom editor remains usable without browser Bluetooth and exports a valid recipe', async ({ page, browserName }, testInfo) => {
  await installBrewProfilesBrowserFixture(page);
  await enter(page);
  await seed(page);
  await page.locator('[data-page-target="brew"]').click();
  await page.locator('#brewBean').selectOption('ios-bean');
  await page.locator('#generatePlanBtn').click();
  await expect(page.locator('#xBloomProfileBtn')).toBeVisible({ timeout: 30000 });
  await page.locator('#xBloomProfileBtn').click();
  const editor = page.locator('[data-overlay="xbloom-editor"]');
  await expect(editor).toBeVisible();
  if (browserName === 'webkit') {
    await expect(page.locator('#sendXbloomProfileBtn')).toBeDisabled();
    await expect(page.locator('#xbloomConnectionStatus')).toContainText('Safari');
  }
  await expect(page.locator('#saveXbloomProfileBtn')).toBeEnabled();
  await editor.locator('[data-xbloom-temperature]').first().selectOption('95');
  await editor.locator('[data-xbloom-flow]').first().selectOption('3.1');
  await page.locator('#saveXbloomProfileBtn').click();
  const stored = await page.evaluate(async () => (await (await import('/src/db.js')).getSetting('app.settings')).xbloom.profiles['ios-bean']);
  expect(stored.pours[0].temperatureC).toBe(95);
  expect(stored.pours[0].flowMlS).toBe(3.1);
  const geometry = await editor.evaluate(node => {
    const dialog = node.querySelector('.dialog');
    return { overflow: dialog.scrollWidth - dialog.clientWidth, font: parseFloat(getComputedStyle(node.querySelector('.control')).fontSize) };
  });
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.font).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: testInfo.outputPath('dsb-iphone-editor.png') });
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#exportXbloomProfileBtn').click();
  const recipe = JSON.parse(await fs.readFile(await (await downloadEvent).path(), 'utf8'));
  expect(recipe.pours[0].temperatureC).toBe(95);
  expect(recipe.pours[0].flowMlS).toBe(3.1);
});

test('live online brew calculation opens the device editor', async ({ page }, testInfo) => {
  test.skip(process.env.DSB_LIVE !== '1', 'Run explicitly when checking the live provider');
  await enter(page);
  await seed(page);
  await page.locator('[data-page-target="brew"]').click();
  await page.locator('#brewBean').selectOption('ios-bean');
  await page.locator('#generatePlanBtn').click();
  await expect(page.locator('#xBloomProfileBtn')).toBeVisible({ timeout: 60000 });
  await page.locator('#xBloomProfileBtn').click();
  await expect(page.locator('[data-overlay="xbloom-editor"]')).toBeVisible();
  await expect(page.locator('#saveXbloomProfileBtn')).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('dsb-live-iphone-editor.png') });
});
