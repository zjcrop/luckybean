import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE_URL = 'http://127.0.0.1:4173';
const OUT = 'test-results/visual-baseline';

async function openApp(page, suffix) {
  await page.route('https://vaxwncdcuvbpvdbbketb.supabase.co/**', route => route.abort('failed'));
  await page.route('https://raw.githubusercontent.com/**', route => route.abort('failed'));
  await page.goto(`${BASE_URL}/?visual=${suffix}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => Boolean(globalThis.LuckyBeanRuntimeFeatures), null, { timeout: 15000 });
}

async function assertNoOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function capturePages(page, prefix) {
  for (const target of ['beans', 'brew', 'sensory', 'settings']) {
    await page.locator(`[data-page-target="${target}"]`).click();
    await expect(page.locator(`[data-page="${target}"]`)).toBeVisible();
    await assertNoOverflow(page);
    await page.screenshot({ path: `${OUT}/${prefix}-${target}.png`, fullPage: true });
  }
}

async function seedCompletedHistory(page) {
  await page.evaluate(async () => {
    const db = await import('/src/db.js');
    const history = await import('/src/domain/history/history-service.js');
    const local = await import('/src/services/local-reference-analysis.js');
    const now = new Date();
    const bean = { id:'visual-bean', name:'视觉基线测试豆', initialWeight:100, remainingWeight:100, roastDate:'2026-08-01', createdAt:now.toISOString(), updatedAt:now.toISOString() };
    await db.put('beans', bean);
    const input = { bean:{ roastCode:'RL-L2', processCode:'WA', varietyCode:'VA-GE' }, brew:{ doseG:15, ratio:15.5, profileId:'two-pulse' }, water:{ profileId:'washed', tdsMgL:90 }, environment:{ ambientTemperatureC:25, relativeHumidityPct:null, initialBedTemperatureC:25 }, targets:{ floral:2, acidity:1.5, sweetness:2, body:1, bitterness:2 } };
    const plan = { profile:{ id:'two-pulse', label:'两段式' }, totals:{ doseG:15, waterG:233, ratio:15.5, targetTimeSec:120 }, stages:[{ index:1,name:'闷蒸',startSec:0,durationSec:35,stageWaterG:45,cumulativeWaterG:45,temperatureC:88,coreTemperatureC:72,flowGPerSec:2.8 },{ index:2,name:'主体注水',startSec:35,durationSec:85,stageWaterG:188,cumulativeWaterG:233,temperatureC:92,coreTemperatureC:86,flowGPerSec:4.4 }] };
    const analysis = await local.createLocalReferenceAnalysis(input, plan, '视觉基线');
    await history.commitCompletedBrew({ beanId:bean.id,deductedWeightG:15,rawInput:input,normalizedInput:input,analysisSnapshot:analysis,execution:{ startedAt:new Date(now-120000).toISOString(),finishedAt:now.toISOString(),actualTotalTimeSec:120,stageExecutions:[],deviations:[],notes:['视觉基线'],environment:input.environment },providerVersions:{},idempotencyKey:'visual-history-1' });
  });
}

test.beforeAll(async () => { await mkdir(OUT, { recursive: true }); });

test('mobile 390x844 preserved layout screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, '390');
  await capturePages(page, '390x844');
});

test('mobile 412x915 history and 3D screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await openApp(page, '412');
  await seedCompletedHistory(page);
  await page.evaluate(async () => (await import('/src/ui/history/history-screen.js')).openHistoryScreen());
  await expect(page.locator('[data-overlay="formal-history"]')).toBeVisible();
  await assertNoOverflow(page);
  await page.screenshot({ path: `${OUT}/412x915-history.png`, fullPage: true });
  await page.locator('.history-row-main').click();
  await page.screenshot({ path: `${OUT}/412x915-history-detail.png`, fullPage: true });
  await page.locator('[data-history-spatial]').click();
  await expect(page.locator('.spatial-fullscreen-overlay')).toBeVisible();
  await page.screenshot({ path: `${OUT}/412x915-spatial.png`, fullPage: true });
});

test('desktop preserved layout screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page, 'desktop');
  await capturePages(page, '1280x900');
});
