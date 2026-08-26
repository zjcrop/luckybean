import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

async function waitForStartup(page) {
  const splash = page.locator('#splashScreen');
  if (await splash.isVisible().catch(() => false)) await splash.click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => document.documentElement.dataset.startup === 'ready');
}

async function refreshFrom(page, source) {
  await page.evaluate(async source => {
    await new Promise(resolve => {
      const done = event => {
        if (event.detail?.source !== source) return;
        document.removeEventListener('luckybean:app-refreshed', done);
        resolve();
      };
      document.addEventListener('luckybean:app-refreshed', done);
      document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh', { detail: { source } }));
    });
  }, source);
}

async function seedBean(page) {
  await page.evaluate(async () => {
    const db = await import('/src/db.js');
    const now = new Date().toISOString();
    await db.put('beans', {
      id: 'ui-alignment-bean',
      name: '界面回归测试豆',
      countryCode: 'ET',
      varietyCode: 'GESHA',
      processCode: 'WA',
      roastCode: 'RL-L1',
      roastDate: '2026-08-20',
      initialWeight: 100,
      remainingWeight: 90,
      archived: false,
      source: 'manual',
      createdAt: now,
      updatedAt: now
    });
  });
  await refreshFrom(page, 'ui-alignment-seed');
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    localStorage.setItem('luckybean.onboarding.v2', JSON.stringify({ stage: 'existing-user', updatedAt: new Date().toISOString(), reason: 'ui-alignment-regression' }));
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, route => route.abort('failed'));
  await page.goto(`${BASE_URL}/?ui-alignment-regression=1`, { waitUntil: 'domcontentloaded' });
  await waitForStartup(page);
  await seedBean(page);
});

test('small brew peer controls share the centered dripper value typography', async ({ page }) => {
  await page.locator('[data-page-target="brew"]').click();
  const reference = page.locator('#brewDripper');
  await expect(reference).toBeVisible();

  const referenceStyle = await reference.evaluate(node => {
    const css = getComputedStyle(node);
    return { fontSize: css.fontSize, lineHeight: css.lineHeight, textAlign: css.textAlign };
  });
  expect(referenceStyle.textAlign).toBe('center');

  for (const selector of ['#openBrewTuneBtn', '#openFlavorTargetBtn', '#openEnvironmentBtn', '#generatePlanBtn', '#directSensoryBtn']) {
    const control = page.locator(selector);
    await expect(control).toBeVisible();
    const style = await control.evaluate(node => {
      const css = getComputedStyle(node);
      return { fontSize: css.fontSize, lineHeight: css.lineHeight, textAlign: css.textAlign, fontWeight: css.fontWeight, textDecoration: css.textDecorationLine };
    });
    expect(style.textAlign).toBe('center');
    expect(style.fontSize).toBe(referenceStyle.fontSize);
    expect(style.lineHeight).toBe(referenceStyle.lineHeight);
    expect(Number(style.fontWeight)).toBeLessThanOrEqual(500);
    expect(style.textDecoration).toBe('none');
  }

  await page.locator('#generatePlanBtn').evaluate(node => { node.textContent = '重新生成'; });
  await expect(page.locator('#generatePlanBtn')).toHaveCSS('text-align', 'center');
});

test('professional cupping score slider starts below the subjective number and never exceeds the content width', async ({ page }) => {
  await page.locator('[data-page-target="sensory"]').click();
  await expect(page.locator('#sensoryBeanSelect')).toBeVisible();
  await page.locator('#sensoryBeanSelect').selectOption('ui-alignment-bean');
  await expect(page.locator('[data-v095-mode="professional"]')).toBeVisible({ timeout: 10000 });
  await page.locator('[data-v095-mode="professional"]').click();

  for (let index = 0; index < 9; index += 1) {
    await expect(page.locator('[data-v095-next]')).toBeVisible();
    await page.locator('[data-v095-next]').click();
  }

  const stage = page.locator('.v095-score-stage');
  const deltaScore = stage.locator('[data-v095-score-delta]');
  const slider = stage.locator('[data-v095-score-delta-input]');
  const summary = stage.locator('pre');
  await expect(stage).toBeVisible();
  await expect(slider).toBeVisible();

  for (const width of [360, 375, 390, 412, 430]) {
    await page.setViewportSize({ width, height: 780 });
    await page.waitForTimeout(30);
    const [stageBox, deltaBox, sliderBox, summaryBox] = await Promise.all([
      stage.boundingBox(), deltaScore.boundingBox(), slider.boundingBox(), summary.boundingBox()
    ]);
    expect(stageBox).not.toBeNull();
    expect(deltaBox).not.toBeNull();
    expect(sliderBox).not.toBeNull();
    expect(summaryBox).not.toBeNull();

    expect(sliderBox.y).toBeGreaterThanOrEqual(deltaBox.y + deltaBox.height + 4);
    expect(Math.abs(sliderBox.x - deltaBox.x)).toBeLessThanOrEqual(1.5);
    expect(sliderBox.x + sliderBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1.5);
    expect(sliderBox.width).toBeGreaterThan(stageBox.width * 0.38);
    expect(summaryBox.x + summaryBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1.5);

    const overflow = await stage.evaluate(node => ({
      stageScroll: node.scrollWidth,
      stageClient: node.clientWidth,
      pageScroll: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
      summaryScroll: node.querySelector('pre')?.scrollWidth || 0,
      summaryClient: node.querySelector('pre')?.clientWidth || 0
    }));
    expect(overflow.stageScroll).toBeLessThanOrEqual(overflow.stageClient + 1);
    expect(overflow.pageScroll).toBeLessThanOrEqual(overflow.viewport + 1);
    expect(overflow.summaryScroll).toBeLessThanOrEqual(overflow.summaryClient + 1);
  }

  await expect(slider).toHaveCSS('direction', 'ltr');
  const before = Number(await stage.locator('[data-v095-subjective-score]').textContent());
  await slider.evaluate(node => {
    node.value = '4';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(stage.locator('[data-v095-score-delta]')).toHaveText('+4.0');
  const after = Number(await stage.locator('[data-v095-subjective-score]').textContent());
  expect(after).toBeGreaterThan(before);
});

test('interface and data archive settings begin directly below their headings', async ({ page }) => {
  await page.locator('[data-page-target="settings"]').click();
  await expect(page.locator('#appearanceSettings')).toBeAttached({ timeout: 10000 });

  const appearance = page.locator('#appearanceSettings');
  await appearance.locator(':scope > summary').click();
  const appearanceGap = await appearance.evaluate(node => {
    const body = node.querySelector(':scope > .settings-category-body');
    const first = body?.firstElementChild;
    if (!body || !first) return 999;
    return first.getBoundingClientRect().top - body.getBoundingClientRect().top;
  });
  expect(appearanceGap).toBeLessThanOrEqual(2);

  const data = page.locator('#settingsContent .settings-category.data-category');
  await data.locator(':scope > summary').click();
  const dataGap = await data.evaluate(node => {
    const body = node.querySelector(':scope > .settings-category-body');
    const first = body?.firstElementChild;
    if (!body || !first) return 999;
    return first.getBoundingClientRect().top - body.getBoundingClientRect().top;
  });
  expect(dataGap).toBeLessThanOrEqual(2);
  await expect(data.locator('[data-v099p-data-analysis]')).toHaveCSS('border-top-width', '0px');
});
