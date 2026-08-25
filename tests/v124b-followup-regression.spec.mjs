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
      id: 'followup-bean',
      name: '后续回归豆',
      countryCode: 'CO-EA',
      varietyCode: 'VA-JA10',
      processCode: 'PR-WA',
      roastCode: 'RL-L2',
      roastDate: '2026-08-20',
      initialWeight: 100,
      remainingWeight: 90,
      archived: false,
      source: 'manual',
      createdAt: now,
      updatedAt: now
    });
  });
  await refreshFrom(page, 'followup-seed');
}

async function openSensory(page) {
  await page.locator('[data-page-target="sensory"]').click();
  await expect(page.locator('#sensoryBeanSelect')).toBeVisible();
  await page.locator('#sensoryBeanSelect').selectOption('followup-bean');
}

async function openProfessional(page) {
  await openSensory(page);
  await expect(page.locator('[data-v095-mode="professional"]')).toBeVisible();
  await page.locator('[data-v095-mode="professional"]').click();
  await expect(page.locator('#v095ProfessionalOverlay')).toBeVisible();
}

async function reachRadar(page) {
  for (let index = 0; index < 12; index += 1) {
    if (await page.locator('.v095-radar-stage').isVisible().catch(() => false)) return;
    await expect(page.locator('[data-v095-next]')).toBeVisible();
    await page.locator('[data-v095-next]').click();
  }
  throw new Error('未能进入专业品鉴雷达图步骤');
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const ui = JSON.stringify({ theme: 'dark', splash: 'red' });
    localStorage.setItem('luckybean.ui.v095', ui);
    localStorage.setItem('luckybean.ui.v094', ui);
    localStorage.setItem('luckybean.onboarding.v2', JSON.stringify({ stage: 'existing-user', updatedAt: new Date().toISOString(), reason: 'followup-regression' }));
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, route => route.abort('failed'));
  await page.goto(`${BASE_URL}/?followup-regression=1`, { waitUntil: 'domcontentloaded' });
  await waitForStartup(page);
  await seedBean(page);
});

test('dark professional radar labels use visible theme text fill and actions touch viewport bottom', async ({ page }) => {
  await openProfessional(page);

  const actions = page.locator('.v095-wizard-actions');
  const actionBox = await actions.boundingBox();
  expect(actionBox).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(Math.abs(actionBox.y + actionBox.height - viewport.height)).toBeLessThanOrEqual(2);
  await expect(actions).toHaveCSS('position', 'fixed');

  await reachRadar(page);
  const label = page.locator('.v095-radar-stage svg text').first();
  await expect(label).toBeVisible();
  const result = await label.evaluate(node => {
    const css = getComputedStyle(node);
    return { fill: css.fill, theme: document.documentElement.dataset.theme };
  });
  expect(result.theme).toBe('dark');
  expect(result.fill).not.toBe('rgb(0, 0, 0)');
  expect(result.fill).not.toBe('black');
  const rgb = result.fill.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) || [];
  expect(rgb).toHaveLength(3);
  expect(Math.min(...rgb)).toBeGreaterThan(180);
});

test('note mode removes voice note and obsolete explanatory copy', async ({ page }) => {
  await openSensory(page);
  await expect(page.locator('[data-v095-mode="note"]')).toBeVisible();
  await page.locator('[data-v095-mode="note"]').click();
  await expect(page.locator('#sensoryNaturalNote')).toBeVisible();
  await expect(page.locator('#sensoryVoiceNoteBtn')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('文字将写入品鉴记录和对应冲煮记录');
  await expect(page.locator('body')).not.toContainText('专业标签、雷达图和评分会另行结构化保存');
});

test('package pending field click enters its actual bean editor and requires explicit confirmation', async ({ page }) => {
  await page.evaluate(() => globalThis.LuckyBeanPackageCapture.open());
  await expect(page.locator('[data-overlay="bag-capture"]')).toBeVisible();
  await page.locator('#bagManualBtn').click();
  const text = page.locator('#bagOcrText');
  await expect(text).toBeVisible();
  await text.fill('COUNTRY ATLANTIS');
  await page.locator('#bagReanalyzeBtn').click();

  const packageRow = page.locator('.bag-semantic-row.review[data-recognition-field="countryCode"]');
  await expect(packageRow).toBeVisible({ timeout: 10000 });
  await expect(packageRow).toContainText('待确认');
  await expect(packageRow).toHaveAttribute('role', 'button');
  await packageRow.click();

  const form = page.locator('#beanForm');
  await expect(form).toBeVisible({ timeout: 10000 });
  const pending = form.locator('[data-recognition-review="pending"] .evidence-row[data-evidence-field="countryCode"]');
  await expect(pending).toBeVisible();
  await expect(form.locator('[data-confirm-recognition-field="countryCode"]')).toBeVisible();
  await expect(form.locator('#beanCountry').locator('..')).toHaveClass(/recognition-review-active/);
  await form.locator('#beanCountry').selectOption('CO-EA');
  await form.locator('[data-confirm-recognition-field="countryCode"]').click();
  await expect(pending).toHaveCount(0);
  await expect(form.locator('#beanCountry')).toHaveValue('CO-EA');
});

test('bean card never exposes roast code and uses canonical seven-level roast wording', async ({ page }) => {
  await page.locator('[data-page-target="beans"]').click();
  const card = page.locator('.bean-card[data-bean-id="followup-bean"]');
  await expect(card).toBeVisible({ timeout: 10000 });
  const compact = card.locator('.lb-bean-secondary');
  await expect(compact).toBeVisible({ timeout: 10000 });
  await expect(compact).not.toContainText('RL-L2');
  await expect(compact).toContainText('浅中烘');
});
