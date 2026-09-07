import test from 'node:test';
import assert from 'node:assert/strict';

import { recommendProfile } from '../src/brew-engine-core.js';
import {
  BREW_STRATEGY_ORCHESTRATOR_CONTRACT,
  brewStrategyDefinitions,
  buildDifferentiatedBrewStrategies
} from '../src/services/brew-strategy-orchestrator.js';

function sampleInput() {
  return {
    bean: {
      countryCode: 'ET',
      varietyCode: 'JARC-74158',
      processCode: 'NA',
      roastCode: 'RL-L1'
    },
    brew: {
      serveMode: 'hot',
      dripperCode: 'V60',
      profileId: 'recommended',
      repeatability: false
    },
    targets: {
      acidity: 1.5,
      floral: 2,
      fruity: 2,
      sweetness: 2,
      bitterness: 2,
      astringency: 2
    }
  };
}

test('three strategy objectives select three structurally distinct profiles without mutating shared targets', () => {
  const input = sampleInput();
  const before = structuredClone(input);
  const choices = buildDifferentiatedBrewStrategies(input, { recommend: recommendProfile });

  assert.equal(choices.length, 3);
  assert.deepEqual(choices.map(choice => choice.strategy.id), ['clarity-aroma', 'sweet-balance', 'body-extraction']);
  assert.equal(new Set(choices.map(choice => choice.id)).size, 3);
  assert.deepEqual(input, before);

  for (const choice of choices) {
    assert.equal(choice.strategy.contract, BREW_STRATEGY_ORCHESTRATOR_CONTRACT);
    assert.ok(choice.profile.label.includes(choice.strategy.label));
    assert.ok(choice.reason.includes('BrewProfiles'));
    assert.equal(Object.hasOwn(choice.strategy.sharedTargetProjection, 'body'), false);
    assert.deepEqual(
      Object.keys(choice.strategy.sharedTargetProjection).sort(),
      ['acidity', 'astringency', 'bitterness', 'floral', 'fruity', 'sweetness']
    );
  }
});

test('method-layer target projections are bounded and remain product-local', () => {
  const input = sampleInput();
  input.targets = { acidity: 0, floral: 3, fruity: 3, sweetness: 3, bitterness: 3, astringency: 3 };
  const choices = buildDifferentiatedBrewStrategies(input, { recommend: recommendProfile });

  for (const choice of choices) {
    for (const value of Object.values(choice.strategy.sharedTargetProjection)) {
      assert.ok(Number.isFinite(Number(value)));
      assert.ok(Number(value) >= 0 && Number(value) <= 3);
    }
  }

  const definitions = brewStrategyDefinitions();
  assert.equal(definitions.length, 3);
  assert.equal(definitions.some(definition => Object.hasOwn(definition.sharedShift, 'body')), false);
});

test('authoritative candidate metadata is reused without changing the outer objective choice', () => {
  const input = sampleInput();
  const authoritativeCandidates = [
    { id: 'three-pulse', score: 91, profile: { id: 'three-pulse', label: '权威三段式', tags: ['clarity'] } },
    { id: 'four-six-v17', score: 89, profile: { id: 'four-six-v17', label: '权威四六法', tags: ['sweetness'] } },
    { id: 'one-pour', score: 82, profile: { id: 'one-pour', label: '权威一刀流', tags: ['body'] } }
  ];
  const choices = buildDifferentiatedBrewStrategies(input, { recommend: recommendProfile, authoritativeCandidates });

  assert.equal(choices.length, 3);
  assert.equal(new Set(choices.map(choice => choice.id)).size, 3);
  assert.ok(choices.some(choice => choice.profile.label.includes('权威三段式')));
  assert.ok(choices.some(choice => choice.profile.label.includes('权威四六法')));
  assert.ok(choices.some(choice => choice.profile.label.includes('权威一刀流')));
});
