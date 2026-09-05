import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';
const SUPABASE_PATTERN = 'https://vaxwncdcuvbpvdbbketb.supabase.co/**';

async function openLocalApp(page, suffix) {
  await page.goto(`${BASE_URL}/?${suffix}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#splashScreen')).toBeVisible();
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#pageBeans')).toBeVisible();
  await page.waitForFunction(() => Boolean(globalThis.LuckyBeanCloudAuth), null, { timeout: 15000 });
}

test('startup survives when native structuredClone is unavailable', async ({ page }) => {
  await page.addInitScript(() => { globalThis.structuredClone = undefined; });
  await openLocalApp(page, 'p0-no-structured-clone=1');

  const state = await page.evaluate(() => ({
    startup: document.documentElement.dataset.startup,
    cloneCompatibility: document.documentElement.dataset.cloneCompatibility,
    cloneType: typeof globalThis.structuredClone
  }));

  expect(state.startup).toBe('ready');
  expect(state.cloneCompatibility).toBe('fallback');
  expect(state.cloneType).toBe('function');
});

test('legacy short password reaches server and unconfirmed email gets actionable message', async ({ page }) => {
  let passwordRequests = 0;
  await page.route(SUPABASE_PATTERN, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      passwordRequests += 1;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error_code: 'email_not_confirmed', msg: 'Email not confirmed' })
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await openLocalApp(page, 'p0-legacy-login=1');
  await page.evaluate(() => globalThis.LuckyBeanCloudAuth.openDialog('login'));
  await page.locator('#cloudAuthEmail').fill('legacy@example.com');
  await page.locator('#cloudAuthPassword').fill('123456');
  await page.locator('[data-cloud-auth-submit="login"]').click();

  await expect.poll(() => passwordRequests).toBe(1);
  await expect(page.locator('[data-cloud-auth-message]')).toContainText('邮箱尚未验证');
});
