import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, route => route.abort('failed'));
});

test('bean digest precedes leaderboard and analytics live only in settings data collection', async ({ page }) => {
  await page.goto(`${BASE_URL}/?bean-summary=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
  await page.evaluate(async () => {
    const db = await import('/src/db.js');
    const now = new Date();
    const late = new Date(now);
    late.setHours(18, 0, 0, 0);
    await db.bulkPut('beans', [
      { id: 'summary-a', name: '测试豆A', remainingWeight: 1000, initialWeight: 1000, archived: false, updatedAt: now.toISOString() },
      { id: 'summary-b', name: '测试豆B', remainingWeight: 250, initialWeight: 250, archived: false, updatedAt: now.toISOString() }
    ]);
    await db.bulkPut('inventoryEvents', [
      { id: 'summary-use-a', beanId: 'summary-a', type: 'brew-consume', amountG: -15, createdAt: late.toISOString() },
      { id: 'summary-use-b', beanId: 'summary-b', type: 'brew-consume', amountG: -30, createdAt: late.toISOString() }
    ]);
    await db.put('sensoryRecords', { id: 'summary-score', beanId: 'summary-a', subjectiveScore: 88, createdAt: now.toISOString() });
    document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail: { source: 'bean-summary-test' } }));
  });

  const summary = page.locator('.bean-consumption-summary');
  const leaderboard = page.locator('.preference-board-strip');
  await expect(summary).toContainText('现有咖啡豆 1.25kg');
  await expect(summary).toContainText('今日已饮用 45.0g豆');
  await expect(summary).toContainText('已经超量喽，可能影响身体健康');
  await expect(summary).toContainText('可能妨碍入睡，要不明天再喝？');
  await expect(leaderboard).toBeVisible();
  expect(await summary.evaluate((node, other) => Boolean(node.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING), await leaderboard.elementHandle())).toBe(true);
  await expect(page.locator('#v099fBeanModules')).toHaveCount(0);

  await page.locator('[data-page-target="settings"]').click();
  const dataCollection = page.locator('#settingsContent .data-category');
  await dataCollection.locator(':scope > summary').click();
  await expect(dataCollection.locator('[data-v099f-preference]')).toHaveCount(1);
  await expect(dataCollection.locator('[data-v099f-world]')).toHaveCount(1);
  await expect(page.locator('#pageBeans [data-v099f-preference],#pageBeans [data-v099f-world]')).toHaveCount(0);
});
