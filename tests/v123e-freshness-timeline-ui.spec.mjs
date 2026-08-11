import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, route => route.abort('failed'));
  await page.goto(`${BASE_URL}/?freshness-timeline=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
});

test('one-line bean card restores historical freshness color/length and uses it for tasting-window grouping', async ({ page }) => {
  const expected = await page.evaluate(async () => {
    const db = await import('/src/db.js');
    const { freshnessProfile } = await import('/src/utils.js');
    const roastDate = new Date(Date.now() - 18 * 86400000).toISOString().slice(0, 10);
    const bean = {
      id: 'freshness-line-bean',
      name: 'Ethiopia · Geisha',
      countryCode: 'ET',
      varietyCode: 'GESHA',
      processCode: 'WA',
      roastCode: 'RL-L1',
      roastDate,
      initialWeight: 100,
      remainingWeight: 88,
      archived: false,
      source: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.put('beans', bean);
    const profile = freshnessProfile(bean);
    document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail: { source: 'freshness-timeline-ui-test' } }));
    return {
      color: profile.color,
      progress: Math.round(profile.progress * 1000) / 10,
      stage: profile.progress < 1 / 3 ? '养豆中' : profile.progress < 2 / 3 ? '味正盛' : '味将尽'
    };
  });

  const card = page.locator('.bean-card[data-bean-id="freshness-line-bean"]');
  await expect(card).toHaveClass(/lb-one-line-bean/, { timeout: 10000 });
  const timeline = card.locator('[data-lb-freshness-timeline]');
  await expect(timeline).toBeVisible();
  await expect(timeline).toHaveCount(1);
  const solidStyle = await timeline.locator('.bean-freshness-solid').getAttribute('style');
  const dashStyle = await timeline.locator('.bean-freshness-dashed').getAttribute('style');
  expect(solidStyle).toContain(`width:${expected.progress}%`);
  expect(solidStyle).toContain(`background:${expected.color}`);
  expect(dashStyle).toContain(`left:${expected.progress}%`);

  await page.locator('#groupBtn').click();
  const option = page.locator('[data-lb-freshness-group-option]');
  await expect(option).toBeVisible({ timeout: 5000 });
  await expect(option).toContainText('按赏味期阶段');
  await option.click();

  await expect(page.locator('[data-lb-freshness-stage="养豆中"]')).toBeVisible();
  await expect(page.locator('[data-lb-freshness-stage="味正盛"]')).toBeVisible();
  await expect(page.locator('[data-lb-freshness-stage="味将尽"]')).toBeVisible();
  await page.locator(`[data-lb-freshness-stage="${expected.stage}"]`).click();

  const groupedCard = page.locator('.bean-card[data-bean-id="freshness-line-bean"]');
  await expect(groupedCard).toHaveClass(/lb-one-line-bean/, { timeout: 10000 });
  await expect(groupedCard.locator('[data-lb-freshness-timeline]')).toBeVisible();
});
