import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';

async function openApp(page) {
  await page.route('https://vaxwncdcuvbpvdbbketb.supabase.co/**', route => route.abort('failed'));
  await page.route('https://raw.githubusercontent.com/**', route => route.abort('failed'));
  await page.goto(`${BASE_URL}/?history-integrity=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
}

test('permanent deletion refuses missing or mismatched inventory evidence', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const db = await import('/src/db.js');
    const history = await import('/src/domain/history/history-service.js');
    const local = await import('/src/services/local-reference-analysis.js');
    const now = new Date();
    const bean = {
      id: 'bean-integrity-001', name: '账本校验豆', roastDate: '2026-08-01',
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
    const analysis = await local.createLocalReferenceAnalysis(input, plan, '历史完整性测试');
    const committed = await history.commitCompletedBrew({
      beanId: bean.id,
      deductedWeightG: 15,
      rawInput: input,
      normalizedInput: input,
      analysisSnapshot: analysis,
      execution: {
        startedAt: new Date(now.getTime() - 120000).toISOString(),
        finishedAt: now.toISOString(),
        actualTotalTimeSec: 120,
        stageExecutions: [], deviations: [], notes: [], environment: input.environment
      },
      providerVersions: {},
      idempotencyKey: 'history-integrity-record'
    });

    const originalEvent = await db.get('inventoryEvents', committed.record.inventoryEventId);
    await db.put('inventoryEvents', { ...originalEvent, amountG: -14 });
    let mismatch = '';
    try {
      await history.permanentlyDeleteBrewRecords([committed.record.id], { restoreWeight: true, sensoryMode: 'detach' });
    } catch (error) { mismatch = error.message; }
    const afterMismatch = {
      bean: await db.get('beans', bean.id),
      session: await db.get('brewSessions', committed.record.id),
      event: await db.get('inventoryEvents', committed.record.inventoryEventId)
    };

    await db.put('inventoryEvents', originalEvent);
    const deleted = await history.permanentlyDeleteBrewRecords([committed.record.id], { restoreWeight: true, sensoryMode: 'detach' });
    const events = await db.all('inventoryEvents');
    return {
      mismatch,
      mismatchWeight: afterMismatch.bean.remainingWeight,
      mismatchRecordExists: Boolean(afterMismatch.session),
      mismatchEventAmount: afterMismatch.event.amountG,
      deleted,
      finalWeight: (await db.get('beans', bean.id)).remainingWeight,
      finalRecord: await db.get('brewSessions', committed.record.id),
      originalEvent: await db.get('inventoryEvents', committed.record.inventoryEventId),
      restoreEvents: events.filter(item => item.type === 'restore-brew-deletion')
    };
  });

  expect(result.mismatch).toContain('原始库存事件不一致');
  expect(result.mismatchWeight).toBe(85);
  expect(result.mismatchRecordExists).toBe(true);
  expect(result.mismatchEventAmount).toBe(-14);
  expect(result.deleted.deleted).toBe(1);
  expect(result.deleted.restoredWeightG).toBe(15);
  expect(result.finalWeight).toBe(100);
  expect(result.finalRecord).toBeUndefined();
  expect(result.originalEvent.amountG).toBe(-15);
  expect(result.restoreEvents).toHaveLength(1);
  expect(result.restoreEvents[0].sourceEventId).toBe(result.originalEvent.id);
});
