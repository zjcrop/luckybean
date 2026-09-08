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

test('small brew actions and primary settings use the requested interaction emphasis', async ({ page }) => {
  await page.locator('[data-page-target="brew"]').click();
  await expect(page.locator('link[data-brew-interaction-emphasis]')).toHaveCount(1);

  for (const selector of ['#generatePlanBtn', '#directSensoryBtn']) {
    const control = page.locator(selector);
    await expect(control).toBeVisible();
    const style = await control.evaluate(node => {
      const css = getComputedStyle(node);
      return { fontSize: css.fontSize, textAlign: css.textAlign, fontWeight: css.fontWeight, borderStyle: css.borderStyle, borderRadius: css.borderRadius, borderWidth: css.borderWidth, color: css.color };
    });
    expect(style.textAlign).toBe('center');
    expect(style.fontSize).toBe('20px');
    expect(Number(style.fontWeight)).toBeGreaterThanOrEqual(900);
    expect(style.borderStyle).toBe('solid');
    expect(style.borderWidth).toBe('1px');
    expect(style.borderRadius).toBe('12px');
    expect(style.color).toBe('rgb(255, 255, 255)');
  }

  await expect(page.locator('#openBrewTuneBtn')).toHaveText('方案微调');
  for (const selector of ['#brewDripper', '#brewFilterPaper', '#brewWaterProfile', '#openBrewTuneBtn', '#openFlavorTargetBtn', '#openEnvironmentBtn']) {
    await expect(page.locator(selector)).toHaveCSS('border-bottom-style', 'solid');
    await expect(page.locator(selector)).toHaveCSS('border-bottom-width', '1px');
  }
  for (const selector of ['#brewDose', '#brewRatio']) {
    await expect(page.locator(selector)).toHaveCSS('font-size', '20px');
    await expect(page.locator(selector)).toHaveCSS('font-weight', '900');
    await expect(page.locator(selector)).toHaveCSS('border-bottom-width', '1px');
  }
  await expect(page.locator('#brewProfile')).toHaveCSS('font-size', '18px');
  await expect(page.locator('#brewProfile')).toHaveCSS('font-weight', '900');

  await page.locator('#generatePlanBtn').evaluate(node => { node.textContent = '重新生成'; });
  await expect(page.locator('#generatePlanBtn')).toHaveCSS('text-align', 'center');
});

test('generated plan keeps one centered timer action and compact same-line title copy', async ({ page }) => {
  await page.locator('[data-page-target="brew"]').click();
  await page.locator('#planResult').evaluate(host => {
    host.innerHTML = `<section class="panel generated-plan" id="generatedPlan">
      <div class="panel-title"><div><h2>热冲方案</h2><p data-test-plan-summary>15.0g · 226g水 · 01:45</p></div><span class="plan-profile-label">甜感平衡 · 四六法</span></div>
      <div class="brew-preparation-card"><strong>计时前准备</strong><p>润湿滤纸并充分预热滤杯。</p></div>
      <section class="brew-strategy-options"><div class="nested-content">
        <button class="recommended-profile-option"><span>清晰香气</span></button>
        <button class="recommended-profile-option selected"><span>甜感平衡</span></button>
        <button class="recommended-profile-option"><span>醇厚高萃</span></button>
      </div></section>
      <div class="row menu-row"><button id="startBrewBtn">开始计时</button><button id="planToSensoryBtn">直接品鉴</button></div>
    </section>`;
  });

  await expect(page.locator('#generatedPlan .lb-brew-plan-title-line h2')).toHaveText('冲煮方案');
  await expect(page.locator('#generatedPlan .lb-brew-plan-title-line .plan-profile-label')).toHaveText('甜感平衡 · 四六法');
  await expect(page.locator('[data-test-plan-summary]')).toHaveText('15.0g · 226g水 · 01:45');
  await expect(page.locator('#generatedPlan .lb-brew-plan-title-line h2')).toHaveCSS('font-size', '14px');

  const preparationSizes = await page.locator('#generatedPlan .brew-preparation-card').evaluate(node => ({
    title: parseFloat(getComputedStyle(node.querySelector('strong')).fontSize),
    copy: parseFloat(getComputedStyle(node.querySelector('p')).fontSize),
    family: getComputedStyle(node.querySelector('p')).fontFamily
  }));
  expect(preparationSizes.copy).toBeLessThan(preparationSizes.title);
  expect(preparationSizes.family).toContain('SimSun');

  for (const option of await page.locator('.brew-strategy-options .recommended-profile-option').all()) {
    await expect(option).toHaveCSS('font-size', '15px');
    await expect(option).toHaveCSS('font-weight', '900');
    await expect(option).toHaveCSS('border-bottom-style', 'solid');
    await expect(option).toHaveCSS('border-bottom-width', '1px');
    await expect(option).toHaveCSS('border-radius', '12px');
    await expect(option).toHaveCSS('color', 'rgb(255, 255, 255)');
  }
  await expect(page.locator('#startBrewBtn')).toHaveCSS('font-size', '23px');
  const timerWeight = Number(await page.locator('#startBrewBtn').evaluate(node => getComputedStyle(node).fontWeight));
  expect(timerWeight).toBeGreaterThanOrEqual(900);
  await expect(page.locator('#startBrewBtn')).toHaveCSS('border-bottom-style', 'solid');
  await expect(page.locator('#startBrewBtn')).toHaveCSS('border-bottom-width', '1px');
  await expect(page.locator('#startBrewBtn')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.locator('#planToSensoryBtn')).toBeHidden();

  const timerRow = await page.locator('#generatedPlan > .row.menu-row').evaluate(node => {
    const row = node.getBoundingClientRect();
    const button = node.querySelector('#startBrewBtn').getBoundingClientRect();
    return { rowCenter: row.left + row.width / 2, buttonCenter: button.left + button.width / 2 };
  });
  expect(Math.abs(timerRow.rowCenter - timerRow.buttonCenter)).toBeLessThanOrEqual(1);
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
