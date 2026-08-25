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

test('mobile theme persists and canonical viewport has no horizontal overflow', async ({ page }) => {
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

  await page.reload({ waitUntil:'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout:15000 });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
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
  await page.locator('[data-bean-quick-delete]').click();
  await expect(page.locator('[data-overlay="bean-quick-actions"]')).toHaveCount(0);

  const state = await page.evaluate(async () => {
    const db = await import('/src/db.js');
    const bean = await db.get('beans', 'ui-longpress-bean');
    const recycle = await db.get('recycleBin', 'bean:ui-longpress-bean');
    return { bean, recycle, retentionMs:recycle ? Date.parse(recycle.expiresAt) - Date.parse(recycle.recycledAt) : 0 };
  });
  expect(state.bean).toBeUndefined();
  expect(state.recycle?.entity).toBe('beans');
  expect(state.recycle?.entityId).toBe('ui-longpress-bean');
  expect(state.recycle?.payload?.name).toBe('UI稳定性测试豆');
  expect(state.retentionMs).toBe(7 * 24 * 60 * 60 * 1000);
});

test('professional cupping keeps page scrolling separate from shared tag sorting and radar gestures', async ({ page }) => {
  await page.setViewportSize({ width:360, height:740 });
  await openApp(page, 'professional-touch');
  await seedBean(page, 'ui-cupping-bean');
  await page.locator('[data-page-target="sensory"]').click();
  await expect(page.locator('#sensoryBeanSelect')).toBeVisible();
  await page.locator('#sensoryBeanSelect').selectOption('ui-cupping-bean');
  await expect(page.locator('[data-v095-mode="professional"]')).toBeVisible();
  await page.locator('[data-v095-mode="professional"]').click();
  await expect(page.locator('#v095ProfessionalOverlay')).toBeVisible();

  await page.locator('[data-v095-tag="花香"]').click();
  await page.locator('[data-v095-tag="茉莉"]').click();
  const selected = page.locator('[data-v120-selected-tag]');
  await expect(selected).toHaveCount(2);
  await expect(page.locator('.v095-sort-hint')).toContainText('长按任一已选标签');
  const touch = await page.evaluate(() => ({
    chip:getComputedStyle(document.querySelector('[data-v120-selected-tag]')).touchAction,
    handlePointer:getComputedStyle(document.querySelector('[data-v120-drag-handle]')).pointerEvents
  }));
  expect(touch.chip).toBe('pan-y');
  expect(touch.handlePointer).toBe('none');

  const chip = selected.first();
  const box = await chip.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width * .35, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(410);
  await expect(page.locator('.lb-sort-ghost')).toHaveCount(1);
  await expect(page.locator('.lb-sort-placeholder')).toHaveCount(1);
  await expect(chip).toHaveCSS('visibility', 'hidden');
  await page.mouse.up();
  await expect(page.locator('.lb-sort-ghost')).toHaveCount(0);
  await expect(page.locator('.lb-sort-placeholder')).toHaveCount(0);
  await expect(chip).toHaveCSS('visibility', 'visible');

  for (let i = 0; i < 8; i += 1) await page.locator('[data-v095-next]').click();
  await expect(page.locator('.v095-radar-stage')).toBeVisible();
  const radarTouch = await page.evaluate(() => ({
    svg:getComputedStyle(document.querySelector('.v095-radar-stage svg')).touchAction,
    node:getComputedStyle(document.querySelector('.v120-radar-node')).touchAction,
    overflow:getComputedStyle(document.querySelector('.v095-professional-dialog')).overflowY,
    overlayOverflow:getComputedStyle(document.querySelector('.v095-professional-overlay')).overflowY
  }));
  expect(radarTouch.svg).toBe('pan-y');
  expect(radarTouch.node).toBe('none');
  expect(['auto','scroll']).toContain(radarTouch.overflow);
  expect(radarTouch.overlayOverflow).toBe('hidden');

  const scrolled = await page.locator('.v095-professional-dialog').evaluate(dialog => {
    dialog.scrollTop = dialog.scrollHeight;
    return { top:dialog.scrollTop, max:dialog.scrollHeight - dialog.clientHeight };
  });
  expect(scrolled.top).toBeGreaterThanOrEqual(Math.max(0, scrolled.max - 2));
  await expect(page.locator('[data-v095-next]')).toBeVisible();
});

test('system back closes overlays first and then follows actual main-page history', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await openApp(page, 'navigation-back');
  await seedBean(page, 'ui-navigation-bean');

  await expect.poll(() => page.evaluate(() => globalThis.LuckyBeanNavigation?.snapshot?.().depth ?? -1)).toBe(0);
  await page.locator('[data-page-target="settings"]').click();
  await expect(page.locator('.page[data-page="settings"]')).toHaveClass(/active/);
  await page.locator('[data-page-target="beans"]').click();
  await expect(page.locator('.page[data-page="beans"]')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => globalThis.LuckyBeanNavigation.snapshot().depth)).toBe(2);

  // Long-press recognition is covered by the dedicated gesture test above.
  // This case opens the same canonical overlay directly so it only measures back-stack behavior.
  await page.evaluate(() => globalThis.LuckyBeanBeanCards.openActions('ui-navigation-bean'));
  await expect(page.locator('[data-overlay="bean-quick-actions"]')).toBeVisible();

  expect(await page.evaluate(() => globalThis.LuckyBeanNavigation.back())).toBe(true);
  await expect(page.locator('[data-overlay="bean-quick-actions"]')).toHaveCount(0);
  await expect(page.locator('.page[data-page="beans"]')).toHaveClass(/active/);

  expect(await page.evaluate(() => globalThis.LuckyBeanNavigation.back())).toBe(true);
  await expect(page.locator('.page[data-page="settings"]')).toHaveClass(/active/);
  expect(await page.evaluate(() => globalThis.LuckyBeanNavigation.back())).toBe(true);
  await expect(page.locator('.page[data-page="beans"]')).toHaveClass(/active/);
  expect(await page.evaluate(() => globalThis.LuckyBeanNavigation.canGoBack())).toBe(false);
});

test('bean metadata groups use one-character gap instead of growing into a wide blank band', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await openApp(page, 'bean-metadata-gap');
  await seedBean(page, 'ui-gap-bean');
  const metrics = await page.locator('.bean-card[data-bean-id="ui-gap-bean"] .lb-bean-line').evaluate(line => {
    const style = getComputedStyle(line);
    const primary = getComputedStyle(line.querySelector('.lb-bean-primary'));
    const secondary = getComputedStyle(line.querySelector('.lb-bean-secondary'));
    return {
      gap:parseFloat(style.columnGap || style.gap),
      fontSize:parseFloat(style.fontSize),
      primaryGrow:Number(primary.flexGrow),
      secondaryGrow:Number(secondary.flexGrow)
    };
  });
  expect(metrics.gap).toBeGreaterThan(9);
  expect(metrics.gap).toBeLessThan(20);
  expect(metrics.primaryGrow).toBe(0);
  expect(metrics.secondaryGrow).toBe(0);
});
