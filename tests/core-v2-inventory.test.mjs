import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeInventory,
  makeInventoryEvent,
  INVENTORY_EVENT_TYPES
} from '../src/core-v2/domain/inventory.js';

const at = index => `2026-08-04T00:0${index}:00.000Z`;

test('inventory events deterministically calculate remaining weight', () => {
  const events = [
    makeInventoryEvent({ id: 'event-1', beanId: 'bean-1', type: INVENTORY_EVENT_TYPES.INITIAL, deltaG: 200, createdAt: at(1) }),
    makeInventoryEvent({ id: 'event-2', beanId: 'bean-1', type: INVENTORY_EVENT_TYPES.BREW, deltaG: -15, createdAt: at(2), sourceId: 'brew-1' }),
    makeInventoryEvent({ id: 'event-3', beanId: 'bean-1', type: INVENTORY_EVENT_TYPES.ADJUSTMENT, deltaG: -1.8, createdAt: at(3) }),
    makeInventoryEvent({ id: 'event-4', beanId: 'bean-1', type: INVENTORY_EVENT_TYPES.BREW, deltaG: -15, createdAt: at(4), sourceId: 'brew-2' })
  ];

  const result = computeInventory(events, { beanId: 'bean-1' });
  assert.equal(result.remainingG, 168.2);
  assert.equal(result.rawRemainingG, 168.2);
  assert.equal(result.eventCount, 4);
  assert.equal(result.wentNegative, false);
  assert.equal(result.lastEventAt, at(4));
});

test('inventory exposes negative history while protecting displayed remaining weight', () => {
  const result = computeInventory([
    makeInventoryEvent({ id: 'event-1', beanId: 'bean-1', type: INVENTORY_EVENT_TYPES.INITIAL, deltaG: 20, createdAt: at(1) }),
    makeInventoryEvent({ id: 'event-2', beanId: 'bean-1', type: INVENTORY_EVENT_TYPES.BREW, deltaG: -25, createdAt: at(2) })
  ], { beanId: 'bean-1' });

  assert.equal(result.remainingG, 0);
  assert.equal(result.rawRemainingG, -5);
  assert.equal(result.wentNegative, true);
  assert.equal(result.minimumG, -5);
});

test('deleted inventory events do not affect totals', () => {
  const result = computeInventory([
    makeInventoryEvent({ id: 'event-1', beanId: 'bean-1', type: INVENTORY_EVENT_TYPES.INITIAL, deltaG: 50, createdAt: at(1) }),
    {
      ...makeInventoryEvent({ id: 'event-2', beanId: 'bean-1', type: INVENTORY_EVENT_TYPES.DISCARD, deltaG: -10, createdAt: at(2) }),
      deletedAt: at(3)
    }
  ], { beanId: 'bean-1' });

  assert.equal(result.remainingG, 50);
  assert.equal(result.eventCount, 1);
});
