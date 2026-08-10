import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBeanConsumptionSummary } from '../src/domain/beans/bean-consumption-summary.js';

function localIso(year, month, day, hour, minute = 0) {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

test('sums every bean remaining weight and counts authoritative consumption events once', () => {
  const now = new Date(2026, 7, 10, 12);
  const result = buildBeanConsumptionSummary({
    now,
    beans: [{ id: 'a', remainingWeight: 1000 }, { id: 'b', remainingWeight: 250 }, { id: 'c', remainingWeight: -5 }],
    inventoryEvents: [
      { id: 'e1', beanId: 'a', type: 'brew-consume', amountG: -15, createdAt: localIso(2026, 8, 10, 8) },
      { id: 'e2', beanId: 'b', type: 'consume', amountG: -30, createdAt: localIso(2026, 8, 10, 11) },
      { id: 'e3', beanId: 'a', type: 'correct', amountG: -20, createdAt: localIso(2026, 8, 10, 11) },
      { id: 'old', beanId: 'a', type: 'brew-consume', amountG: -99, createdAt: localIso(2026, 8, 9, 11) }
    ]
  });
  assert.equal(result.totalRemainingKg, 1.25);
  assert.equal(result.consumedTodayG, 45);
  assert.equal(result.estimatedCaffeineMg, 540);
  assert.equal(result.exceeded, true);
});

test('restored mistaken brew is removed from today total', () => {
  const now = new Date(2026, 7, 10, 12);
  const result = buildBeanConsumptionSummary({
    now,
    beans: [{ id: 'a', remainingWeight: 100 }],
    inventoryEvents: [
      { id: 'source', beanId: 'a', type: 'brew-consume', amountG: -15, createdAt: localIso(2026, 8, 10, 8) },
      { beanId: 'a', sourceEventId: 'source', type: 'restore-brew-deletion', amountG: 15, createdAt: localIso(2026, 8, 10, 9) }
    ]
  });
  assert.equal(result.consumedTodayG, 0);
  assert.equal(result.estimatedCaffeineMg, 0);
  assert.equal(result.exceeded, false);
  assert.equal(result.late, false);
});

test('warns when latest completed consumption is within the configured sleep buffer', () => {
  const result = buildBeanConsumptionSummary({
    now: new Date(2026, 7, 10, 20),
    beans: [{ id: 'a', remainingWeight: 100 }],
    inventoryEvents: [{ beanId: 'a', type: 'brew-consume', amountG: -15, createdAt: localIso(2026, 8, 10, 18) }],
    healthSettings: { bedtimeLocal: '23:00', caffeineCutoffHours: 6 }
  });
  assert.equal(result.late, true);
});

test('uses a higher caffeine estimate for robusta beans', () => {
  const result = buildBeanConsumptionSummary({
    now: new Date(2026, 7, 10, 12),
    beans: [{ id: 'r', name: 'Robusta', remainingWeight: 100 }],
    inventoryEvents: [{ beanId: 'r', type: 'brew-consume', amountG: -20, createdAt: localIso(2026, 8, 10, 10) }]
  });
  assert.equal(result.estimatedCaffeineMg, 440);
  assert.equal(result.exceeded, true);
});
