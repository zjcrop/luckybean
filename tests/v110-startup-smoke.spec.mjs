import { test, expect } from '@playwright/test';

test('server failure never blocks local startup', async ({ page }) => {
  const pageErrors = [];
  const consoleMessages = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => consoleMessages.push(`${message.type()}: ${message.text()}`));

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
  await page.waitForTimeout(5000);

  const diagnostics = await page.evaluate(async () => {
    let settings = null;
    let settingsError = '';
    try {
      const db = await import('/src/db.js');
      settings = await db.getSetting('app.settings', null);
    } catch (error) {
      settingsError = error?.message || String(error);
    }
    return {
      startup: document.documentElement.dataset.startup || '',
      cloudAuth: document.documentElement.dataset.cloudAuth || '',
      cloudSync: document.documentElement.dataset.cloudSync || '',
      splashStatus: document.querySelector('#splashStatus')?.textContent || '',
      appShellClass: document.querySelector('#appShell')?.className || '',
      loginClass: document.querySelector('#loginScreen')?.className || '',
      overlayText: document.querySelector('#overlayRoot')?.textContent?.trim() || '',
      settingsIdentity: settings?.identity || null,
      settingsError,
      compatibilityLoaded: Boolean(globalThis.LuckyBeanCompatibilityLayer),
      compatibilityFailures: globalThis.LuckyBeanCompatibilityLayer?.failures || [],
      syncServiceLoaded: Boolean(globalThis.LuckyBeanCloudSync),
      authServiceLoaded: Boolean(globalThis.LuckyBeanCloudAuth)
    };
  });
  console.log('STARTUP_DIAGNOSTICS', JSON.stringify({ diagnostics, pageErrors, consoleMessages }, null, 2));

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
