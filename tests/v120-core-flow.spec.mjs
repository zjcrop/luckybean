import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';
const SUPABASE = 'https://vaxwncdcuvbpvdbbketb.supabase.co/**';
const PROVIDERS = 'https://raw.githubusercontent.com/**';

async function openApp(page, suffix = 'v120-core=1') {
  await page.route(SUPABASE, route => route.abort('failed'));
  await page.route(PROVIDERS, route => route.abort('failed'));
  await page.goto(`${BASE_URL}/?${suffix}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#splashScreen')).toBeVisible();
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.bottom-nav .nav-button')).toHaveCount(4, { timeout: 15000 });
  await page.waitForFunction(() => {
    const shell = document.querySelector('#appShell');
    const activePage = document.querySelector('.page.active');
    return Boolean(shell && !shell.classList.contains('hidden') && activePage);
  }, null, { timeout: 15000 });
}

function collectErrors(page) {
  const errors = [];
  const missing = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('response', response => { if (response.status() === 404) missing.push(response.url()); });
  return { errors, missing };
}

test('confirmed bean deduction atomically creates exactly one formal history record', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const diagnostics = collectErrors(page);
  await openApp(page, 'completed-history=1');

  const result = await page.evaluate(async () => {
    const db = await import('/src/db.js');
    const history = await import('/src/domain/history/history-service.js');
    const local = await import('/src/services/local-reference-analysis.js');
    const now = new Date();
    const bean = {
      id: 'bean-history-001', name: '历史事务测试豆', roastDate: '2026-08-01',
      initialWeight: 100, remainingWeight: 100,
      createdAt: now.toISOString(), updatedAt: now.toISOString()
    };
    await db.put('beans', bean);
    const input = {
      bean: { roastCode: 'RL-L2', processCode: 'WA', varietyCode: 'VA-GE' },
      brew: { doseG: 15, ratio: 15.5, profileId: 'two-pulse' },
      water: { profileId: 'washed', tdsMgL: 90 },
      environment: { ambientTemperatureC: 25, relativeHumidityPct: null, initialBedTemperatureC: 25 },
      targets: { floral: 2, acidity: 1.5, sweetness: 2, body: 1, bitterness: 2 }
    };
    const plan = {
      profile: { id: 'two-pulse', label: '两段式' },
      totals: { doseG: 15, waterG: 233, ratio: 15.5, targetTimeSec: 120 },
      stages: [
        { index: 1, name: '闷蒸', startSec: 0, durationSec: 35, stageWaterG: 45, cumulativeWaterG: 45, temperatureC: 88, coreTemperatureC: 72, flowGPerSec: 2.8 },
        { index: 2, name: '主体注水', startSec: 35, durationSec: 85, stageWaterG: 188, cumulativeWaterG: 233, temperatureC: 92, coreTemperatureC: 86, flowGPerSec: 4.4 }
      ]
    };
    const analysis = await local.createLocalReferenceAnalysis(input, plan, '自动化浏览器测试');
    const commitInput = {
      beanId: bean.id,
      deductedWeightG: 15,
      rawInput: input,
      normalizedInput: input,
      analysisSnapshot: analysis,
      execution: {
        startedAt: new Date(now.getTime() - 120000).toISOString(),
        finishedAt: now.toISOString(), actualTotalTimeSec: 120,
        stageExecutions: [], deviations: [], notes: ['浏览器事务测试'],
        environment: input.environment
      },
      providerVersions: {},
      idempotencyKey: 'browser-completed-brew-001'
    };
    const first = await history.commitCompletedBrew(commitInput);
    const second = await history.commitCompletedBrew(commitInput);
    const savedBean = await db.get('beans', bean.id);
    const sessions = await db.all('brewSessions');
    const events = await db.all('inventoryEvents');
    const revisions = await db.all('historyRevisions');
    const outbox = await db.all('syncOutbox');
    let insufficient = '';
    try {
      await history.commitCompletedBrew({ ...commitInput, deductedWeightG: 200, idempotencyKey: 'browser-insufficient-001' });
    } catch (error) { insufficient = error.message; }
    return {
      firstId: first.record.id,
      duplicate: second.duplicate,
      remainingWeight: savedBean.remainingWeight,
      sessions: sessions.map(item => ({ id: item.id, schemaVersion: item.schemaVersion, status: item.status, inventoryEventId: item.inventoryEventId })),
      events: events.map(item => ({ id: item.id, amountG: item.amountG, sessionId: item.sessionId })),
      revisions: revisions.length,
      outbox: outbox.length,
      insufficient,
      afterFailureWeight: (await db.get('beans', bean.id)).remainingWeight,
      afterFailureSessions: (await db.all('brewSessions')).length
    };
  });

  expect(result.duplicate).toBe(true);
  expect(result.remainingWeight).toBe(85);
  expect(result.sessions).toHaveLength(1);
  expect(result.sessions[0].schemaVersion).toBe('brew-history/1.0');
  expect(result.sessions[0].status).toBeUndefined();
  expect(result.sessions[0].inventoryEventId).toBeTruthy();
  expect(result.events).toHaveLength(1);
  expect(result.events[0].amountG).toBe(-15);
  expect(result.events[0].sessionId).toBe(result.firstId);
  expect(result.revisions).toBe(1);
  expect(result.outbox).toBe(1);
  expect(result.insufficient).toContain('余量不足');
  expect(result.afterFailureWeight).toBe(85);
  expect(result.afterFailureSessions).toBe(1);

  await page.evaluate(async () => (await import('/src/ui/history/history-screen.js')).openHistoryScreen());
  await expect(page.locator('[data-overlay="formal-history"]')).toBeVisible();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await expect(page.locator('.history-row-main')).toContainText('历史事务测试豆');
  await page.locator('.history-row-main').click();
  await expect(page.locator('[data-overlay="history-detail"]')).toBeVisible();
  await expect(page.locator('.history-detail-summary')).toContainText('15.0g');

  await page.locator('[data-history-spatial]').click();
  await expect(page.locator('.spatial-fullscreen-overlay')).toBeVisible();
  await expect(page.locator('.spatial-canvas')).toBeVisible();
  await expect(page.locator('.spatial-axis-legend')).toContainText('X');
  await expect(page.locator('.spatial-axis-legend')).toContainText('粉床温度');
  await expect(page.locator('.spatial-reset-btn')).toBeVisible();
  await page.locator('.spatial-close-btn').click();
  await expect(page.locator('.spatial-fullscreen-overlay')).toBeHidden();

  expect(diagnostics.errors).toEqual([]);
  expect(diagnostics.missing).toEqual([]);
});

test('mobile UI keeps four-page layout and optional environment controls collapsed', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  const diagnostics = collectErrors(page);
  await openApp(page, 'layout-regression=1');

  await expect(page.locator('.bottom-nav .nav-button')).toHaveCount(4);
  for (const target of ['beans', 'brew', 'sensory', 'settings']) {
    await page.locator(`[data-page-target="${target}"]`).click();
    await expect(page.locator(`[data-page="${target}"]`)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }

  await page.locator('[data-page-target="brew"]').click();
  const details = page.locator('.brew-environment-details');
  await expect(details).toBeVisible();
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').click();
  await expect(page.locator('#ambientTemperatureC')).toHaveValue('25');
  await expect(page.locator('#initialBedTemperatureC')).toHaveValue('25');
  await expect(page.locator('#relativeHumidityPct')).toHaveValue('');

  expect(diagnostics.errors).toEqual([]);
  expect(diagnostics.missing).toEqual([]);
});