import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';
const SUPABASE_PATTERN = 'https://vaxwncdcuvbpvdbbketb.supabase.co/**';

async function openApp(page, suffix) {
  await page.addInitScript(() => {
    localStorage.setItem('luckybean.onboarding.v2', JSON.stringify({ stage:'existing-user', updatedAt:new Date().toISOString(), reason:'ui-test' }));
  });
  await page.route(SUPABASE_PATTERN, route => route.abort('failed'));
  await page.route('https://raw.githubusercontent.com/**', route => route.abort('failed'));
  await page.goto(`${BASE_URL}/?ui-stability=${suffix}`, { waitUntil:'domcontentloaded' });
  await expect(page.locator('#splashScreen')).toBeVisible();
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout:15000 });
  await page.waitForFunction(() => document.documentElement.dataset.startup === 'ready');
}

async function seedBean(page, id = 'ui-stability-bean') {
  await page.evaluate(async beanId => {
    const db = await import('/src/db.js');
    await db.put('beans', {
      id:beanId,
      name:'UI稳定性测试豆',
      countryName:'埃塞俄比亚',
      varietyName:'Gesha',
      processName:'Washed',
      roastCode:'RL-L1',
      roastDate:'2026-08-01',
      initialWeight:100,
      remainingWeight:100,
      flavorCodes:[],
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString()
    });
    document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail:{ source:'ui-stability-test' } }));
  }, id);
  await expect(page.locator(`.bean-card[data-bean-id="${id}"]`)).toBeVisible({ timeout:10000 });
}

async function assertMainPagesFit(page, width) {
  for (const target of ['beans','brew','sensory','settings']) {
    await page.locator(`[data-page-target="${target}"]`).click();
    await expect(page.locator(`.page[data-page="${target}"]`)).toHaveClass(/active/);
    const geometry = await page.evaluate(() => {
      const nav = document.querySelector('#bottomNav').getBoundingClientRect();
      const main = document.querySelector('#mainContent').getBoundingClientRect();
      return {
        documentOverflow:document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bodyOverflow:document.body.scrollWidth - document.documentElement.clientWidth,
        navLeft:nav.left,
        navRight:nav.right,
        mainLeft:main.left,
        mainRight:main.right,
        viewport:document.documentElement.clientWidth
      };
    });
    expect(geometry.viewport).toBe(width);
    expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
    expect(geometry.bodyOverflow).toBeLessThanOrEqual(1);
    expect(geometry.navLeft).toBeGreaterThanOrEqual(-1);
    expect(geometry.navRight).toBeLessThanOrEqual(width + 1);
    expect(geometry.mainLeft).toBeGreaterThanOrEqual(-1);
    expect(geometry.mainRight).toBeLessThanOrEqual(width + 1);
  }
}

test('mobile theme persists and canonical viewport has no horizontal overflow', async ({ page, context }) => {
  await page.setViewportSize({ width:360, height:800 });
  await openApp(page, 'theme');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#themeToggleBtn').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('luckybean.ui.v095') || '{}'));
  expect(saved.theme).toBe('light');
  const viewport = await page.evaluate(() => ({
    cssHeight:getComputedStyle(document.documentElement).getPropertyValue('--viewport-height').trim(),
    overflow:document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  expect(viewport.cssHeight).toMatch(/px$/);
  expect(viewport.overflow).toBeLessThanOrEqual(1);

  // Use a fresh page in the same BrowserContext to verify persisted storage. This exercises a real
  // document restart without racing Chromium's reload against late module/service-worker activity.
  const reopened = await context.newPage();
  try {
    await reopened.setViewportSize({ width:360, height:800 });
    await reopened.route(SUPABASE_PATTERN, route => route.abort('failed'));
    await reopened.route('https://raw.githubusercontent.com/**', route => route.abort('failed'));
    await reopened.goto(`${BASE_URL}/?ui-stability=theme-reopen`, { waitUntil:'domcontentloaded' });
    await expect(reopened.locator('#splashScreen')).toBeVisible();
    await reopened.locator('#splashScreen').click();
    await expect(reopened.locator('#appShell')).toBeVisible({ timeout:15000 });
    await reopened.waitForFunction(() => document.documentElement.dataset.startup === 'ready');
    await expect(reopened.locator('html')).toHaveAttribute('data-theme', 'light');
  } finally {
    await reopened.close();
  }
});

test('extreme 320px and 430px mobile widths keep all four main pages inside viewport', async ({ page }) => {
  await page.setViewportSize({ width:320, height:720 });
  await openApp(page, 'width-contract');
  await assertMainPagesFit(page, 320);
  await page.setViewportSize({ width:430, height:900 });
  await page.locator('[data-page-target="beans"]').click();
  await page.locator('#themeToggleBtn').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await assertMainPagesFit(page, 430);
});

test('500ms bean long press opens quick actions and delete uses seven-day recycle bin', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await openApp(page, 'bean-longpress');
  await seedBean(page, 'ui-longpress-bean');

  const card = page.locator('.bean-card[data-bean-id="ui-longpress-bean"]');
  const box = await card.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + Math.min(24, box.width / 4), box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await expect(page.locator('[data-overlay="bean-quick-actions"]')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('[data-overlay="bean-detail"]')).toHaveCount(0);

  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-quick-delete]').click();
  await expect(card).toHaveCount(0);

  const recycled = await page.evaluate(async beanId => {
    const db = await import('/src/db.js');
    return db.get('recycleBin', `bean:${beanId}`);
  }, 'ui-longpress-bean');
  expect(recycled?.kind).toBe('bean');
  expect(recycled?.expiresAt).toBeTruthy();
});

test('professional cupping keeps page scrolling separate from shared tag sorting and radar gestures', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await openApp(page, 'sensory-gesture');
  await seedBean(page, 'ui-sensory-bean');
  await page.locator('[data-page-target="sensory"]').click();
  await expect(page.locator('#pageSensory')).toHaveClass(/active/);

  await page.waitForFunction(() => Boolean(globalThis.LuckyBeanProfessionalSensory));
  await page.evaluate(() => globalThis.LuckyBeanProfessionalSensory.start({ beanId:'ui-sensory-bean', mode:'cupping' }));
  await page.waitForTimeout(100);
  const body = page.locator('body');
  const html = page.locator('html');
  await expect(body).not.toHaveCSS('overflow', 'hidden');
  await expect(html).not.toHaveCSS('overflow', 'hidden');

  const scrollState = await page.evaluate(() => ({
    pageOverflow:document.documentElement.scrollHeight - document.documentElement.clientHeight,
    touchAction:getComputedStyle(document.querySelector('#pageSensory')).touchAction,
    sortable:Boolean(globalThis.LuckyBeanSharedSortable)
  }));
  expect(scrollState.pageOverflow).toBeGreaterThanOrEqual(0);
  expect(scrollState.touchAction).not.toBe('none');
  expect(scrollState.sortable).toBe(true);

  await page.evaluate(() => globalThis.LuckyBeanProfessionalSensory.stop?.());
});

test('system back closes overlays first and then follows actual main-page history', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await openApp(page, 'navigation-back');
  await seedBean(page, 'ui-back-bean');

  await page.locator('.bean-card[data-bean-id="ui-back-bean"]').click();
  await expect(page.locator('[data-overlay="bean-detail"]')).toBeVisible();
  await page.goBack();
  await expect(page.locator('[data-overlay="bean-detail"]')).toHaveCount(0);
  await expect(page.locator('#pageBeans')).toHaveClass(/active/);

  await page.locator('[data-page-target="brew"]').click();
  await expect(page.locator('#pageBrew')).toHaveClass(/active/);
  await page.goBack();
  await expect(page.locator('#pageBeans')).toHaveClass(/active/);
});

test('bean metadata groups use one-character gap instead of growing into a wide blank band', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await openApp(page, 'metadata-gap');
  await seedBean(page, 'ui-gap-bean');
  const card = page.locator('.bean-card[data-bean-id="ui-gap-bean"]');
  const metrics = await card.evaluate(element => {
    const rows = [...element.querySelectorAll('.bean-meta-row')];
    return rows.map(row => ({ gap:getComputedStyle(row).columnGap, width:row.getBoundingClientRect().width }));
  });
  expect(metrics.length).toBeGreaterThan(0);
  for (const item of metrics) {
    expect(parseFloat(item.gap || '0')).toBeLessThanOrEqual(16);
    expect(item.width).toBeLessThanOrEqual(390);
  }
});