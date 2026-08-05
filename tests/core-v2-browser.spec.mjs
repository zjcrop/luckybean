import { test, expect } from '@playwright/test';

const BASE = process.env.CORE_V2_BASE_URL || 'http://127.0.0.1:4173/core-v2/';

async function openCore(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await expect(page.locator('#platformBadge')).toContainText(/Web|Android|Core v2/);
  await expect(page.locator('#beanList')).toBeVisible();
  return errors;
}

test('Web core creates a bean, persists it and generates a local brew plan', async ({ page }) => {
  const errors = await openCore(page);

  await page.getByRole('button', { name: '新增豆卡' }).click();
  const dialog = page.locator('#modal');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="name"]').fill('Core v2 Golden Bean');
  await dialog.locator('input[name="initialWeight"]').fill('100');
  await dialog.locator('input[name="remainingWeight"]').fill('100');
  await dialog.getByRole('button', { name: '保存到本地' }).click();

  await expect(page.locator('#beanList')).toContainText('Core v2 Golden Bean');
  await expect(page.locator('#beanList')).toContainText('100.0');

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('#beanList')).toContainText('Core v2 Golden Bean');

  await page.locator('[data-nav="brew"]').click();
  await page.locator('#brewBean').selectOption({ label: /Core v2 Golden Bean/ });
  await page.locator('#brewForm').getByRole('button', { name: '生成本地方案' }).click();
  await expect(page.locator('#planPanel')).toContainText(/g/);
  await expect(page.locator('#planPanel [data-action="timer-start"]')).toBeVisible();

  expect(errors, `browser errors: ${errors.join('\n')}`).toEqual([]);
});

test('PWA core reloads while offline after service worker installation', async ({ page, context }) => {
  const errors = await openCore(page);
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    return Boolean(navigator.serviceWorker.controller) || Boolean((await navigator.serviceWorker.getRegistrations()).length);
  });

  await page.reload({ waitUntil: 'networkidle' });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#offlineBadge')).toContainText('离线模式');
  await expect(page.locator('#beanList')).toBeVisible();
  await context.setOffline(false);

  expect(errors, `browser errors: ${errors.join('\n')}`).toEqual([]);
});

test('clean core never loads a legacy patch script or remote runtime script', async ({ page }) => {
  const requested = [];
  page.on('request', request => requested.push(request.url()));
  await openCore(page);

  const remoteRuntime = requested.filter(url => {
    const parsed = new URL(url);
    return parsed.origin !== new URL(BASE).origin;
  });
  const legacyPatches = requested.filter(url => /v09(?:5|6|7|8|9)/i.test(url));
  expect(remoteRuntime).toEqual([]);
  expect(legacyPatches).toEqual([]);
});
