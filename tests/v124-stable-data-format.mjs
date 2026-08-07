import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  STABLE_TARGET_IDS,
  isStableBrewData,
  toBrewProfilesTransport,
  toStableBrewData
} from '../src/contracts/stable-brew-data.js';

const source = {
  schemaVersion: 2,
  appVersion: '1.2.3-main-test',
  bean: { countryCode: 'CO' },
  brew: { brewStyle: 'two-pulse', doseG: '15', ratio: '15.5' },
  water: { recipeVolumeL: '5' },
  environment: { ambientTemperatureC: '25', initialBedTemperatureC: '25' },
  targets: {
    acidity: '1.5',
    floral: '2',
    fruity: '2.5',
    sweetness: '2',
    bitterness: '1.5',
    astringency: '2',
    body: 3
  },
  extensions: { futureProjectField: true }
};

const stable = toStableBrewData(source);
for (const key of ['schemaVersion', 'appVersion', 'engineVersion', 'profileVersion']) {
  assert.equal(Object.hasOwn(stable, key), false);
}
assert.equal(stable.brew.profileId, 'two-pulse');
assert.equal(stable.brew.doseG, 15);
assert.equal(stable.environment.ambientTemperatureC, 25);
assert.equal(stable.extensions.futureProjectField, true);
assert.equal(Object.hasOwn(stable.targets, 'body'), false);
assert.deepEqual(Object.keys(stable.targets).sort(), [...STABLE_TARGET_IDS].sort());
assert.equal(isStableBrewData(stable), true);

const transport = toBrewProfilesTransport(stable);
assert.deepEqual(transport, stable);
assert.equal(Object.hasOwn(transport, 'schemaVersion'), false);

const schema = JSON.parse(await readFile(new URL('../contracts/luckybean-brew-data.schema.json', import.meta.url), 'utf8'));
assert.deepEqual(schema.required, ['bean', 'brew', 'water', 'environment', 'targets']);
assert.deepEqual(schema.properties.targets.required, [...STABLE_TARGET_IDS]);
assert.equal(schema.properties.targets.not.required[0], 'body');
assert.equal(schema.not.anyOf[0].required[0], 'schemaVersion');

console.log('Stable cross-project brew data is version-independent and uses the fixed six-target contract.');
