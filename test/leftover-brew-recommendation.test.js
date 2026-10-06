import test from 'node:test';
import assert from 'node:assert/strict';
import { leftoverBrewDose } from '../src/domain/beans/leftover-brew-recommendation.js';

test('recommends using the remaining amount when it is a supported small brew dose', () => {
  assert.equal(leftoverBrewDose(19.94), 19.9);
  assert.equal(leftoverBrewDose(19.99), 19.9);
  assert.equal(leftoverBrewDose(15), 15);
  assert.equal(leftoverBrewDose(5), 5);
});

test('does not recommend a dose outside the supported range or at the 20g boundary', () => {
  for (const value of [0, 4.9, 20, 21, NaN, Infinity, null, undefined]) assert.equal(leftoverBrewDose(value), null);
});
