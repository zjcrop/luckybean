import { test, expect } from '@playwright/test';
import { installBrewProfilesBrowserFixture } from './helpers/brewprofiles-browser-fixture.mjs';

const BASE_URL = 'http://127.0.0.1:4173';

test.beforeEach(async ({ page }) => {
  await installBrewProfilesBrowserFixture(page);
  await page.addInitScript(()=>localStorage.setItem('luckybean.onboarding.v2',JSON.stringify({stage:'existing-user',updatedAt:new Date().toISOString(),reason:'cold-brew-ui-test'})));
  await page.goto(`${BASE_URL}/?cold-brew-ui=1`, { waitUntil:'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout:15000 });
  await page.locator('[data-page-target="brew"]').click();
});

test('P3 hides the redundant top hot-cold control while automatic/custom dose stays in the same row', async ({ page }) => {
  const row = page.locator('[data-brew-row="dose-ratio"]');
  const dose = row.locator('#brewDose');
  const ratio = row.locator('#brewRatio');
  await expect(row.locator('#brewServeMode')).toBeHidden();
  await expect(page.locator('.brew-mode-field')).toBeHidden();
  await expect(dose).toHaveAttribute('data-source','auto');
  await expect(dose).toHaveClass(/lb-auto-field/);
  await expect(dose).toHaveText(/^\d+(?:\.\d+)?g$/);
  await expect(dose).not.toContainText('自动');
  await expect(ratio).toHaveValue('auto');
  await expect(ratio).toHaveAttribute('data-source','auto');
  await expect(ratio).toHaveClass(/lb-auto-field/);
  await expect(page.locator('.lb-brew-five-row > [data-brew-row]')).toHaveCount(5);

  await page.locator('#brewDose').click();
  await expect(page.locator('[data-overlay="dose-mode"]')).toBeVisible();
  await page.locator('[data-dose-choice="manual"]').click();
  await page.locator('#customDoseInput').fill('12.5');
  await page.locator('#saveDoseModeBtn').click();
  await expect(page.locator('#brewDose')).toContainText('12.5g');
  await expect(page.locator('#brewDose')).not.toHaveAttribute('data-source','auto');
});
