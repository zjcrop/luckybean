import { test, expect } from '@playwright/test';
import { installBrewProfilesBrowserFixture } from './helpers/brewprofiles-browser-fixture.mjs';

const BASE_URL = 'http://127.0.0.1:4173';

test.beforeEach(async ({ page }) => {
  await installBrewProfilesBrowserFixture(page);
  await page.goto(`${BASE_URL}/?cold-brew-ui=1`, { waitUntil:'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout:15000 });
  await page.locator('[data-page-target="brew"]').click();
});

test('first row switches hot/cold and automatic/custom dose without adding another row', async ({ page }) => {
  const row = page.locator('[data-brew-row="dose-ratio"]');
  const dose = row.locator('#brewDose');
  const ratio = row.locator('#brewRatio');
  await expect(row.locator('#brewServeMode')).toContainText('热');
  await expect(dose).toHaveAttribute('data-source','auto');
  await expect(dose).toHaveClass(/lb-auto-field/);
  await expect(dose).toHaveText(/^\d+(?:\.\d+)?g$/);
  await expect(dose).not.toContainText('自动');
  await expect(ratio).toHaveAttribute('data-source','auto');
  await expect(ratio).toHaveClass(/lb-auto-field/);
  await expect(ratio).toHaveText(/^1:\d+(?:\.\d+)?$/);
  await expect(ratio).not.toContainText('自动');
  await expect(page.locator('.lb-brew-five-row > [data-brew-row]')).toHaveCount(5);

  await row.locator('#brewServeMode').click();
  await expect(page.locator('#brewServeMode')).toContainText('冷');
  await expect(page.locator('#brewServeMode')).toContainText('❄');

  await page.locator('#brewDose').click();
  await expect(page.locator('[data-overlay="dose-mode"]')).toBeVisible();
  await page.locator('[data-dose-choice="manual"]').click();
  await page.locator('#customDoseInput').fill('12.5');
  await page.locator('#saveDoseModeBtn').click();
  await expect(page.locator('#brewDose')).toContainText('12.5g');
  await expect(page.locator('#brewDose')).not.toHaveAttribute('data-source','auto');
});