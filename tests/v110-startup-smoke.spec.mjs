import { test, expect } from '@playwright/test';

test('server failure never blocks local startup', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.addInitScript(() => {
    localStorage.setItem('luckybean.supabase.session.v099d', JSON.stringify({
      refresh_token: 'smoke-test-invalid-refresh-token',
      access_token: '',
      user: { id: 'smoke-user', email: 'smoke@example.com' }
    }));
    localStorage.setItem('luckybean.cloud.remember.until.v1', String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  });
  await page.route('https://vaxwncdcuvbpvdbbketb.supabase.co/**', route => route.abort('failed'));

  await page.goto('http://127.0.0.1:4173/?smoke=1', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#splashScreen')).toBeVisible();
  await expect(page.locator('#splashImage')).toBeVisible();
  await page.locator('#splashScreen').click();

  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#loginScreen')).toBeHidden();
  await expect(page.locator('#pageBeans')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-release', '1.1.0-test');
  await page.waitForFunction(() => Boolean(globalThis.LuckyBeanCompatibilityLayer), null, { timeout: 15000 });

  const state = await page.evaluate(() => ({
    startup: document.documentElement.dataset.startup,
    cloudAuth: document.documentElement.dataset.cloudAuth,
    compatibilityLoaded: Boolean(globalThis.LuckyBeanCompatibilityLayer),
    compatibilityFailures: globalThis.LuckyBeanCompatibilityLayer?.failures || [],
    syncServiceLoaded: Boolean(globalThis.LuckyBeanCloudSync),
    authServiceLoaded: Boolean(globalThis.LuckyBeanCloudAuth)
  }));

  expect(state.startup).toBe('ready');
  expect(['offline', 'reauth-required', 'signed-out']).toContain(state.cloudAuth);
  expect(state.compatibilityLoaded).toBe(true);
  expect(state.compatibilityFailures).toEqual([]);
  expect(state.syncServiceLoaded).toBe(true);
  expect(state.authServiceLoaded).toBe(true);
  expect(pageErrors).toEqual([]);
});
