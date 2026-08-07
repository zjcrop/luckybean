import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isStableBrewData, toBrewProfilesTransport, toStableBrewData } from '../src/contracts/stable-brew-data.js';

const source = {
  schemaVersion: 2,
  appVersion: '1.2.3-main-test',
  bean: { countryCode: 'CO' },
  brew: { brewStyle: 'two-pulse', doseG: '15', ratio: '15.5' },
  water: { recipeVolumeL: '5' },
  environment: { ambientTemperatureC: '25', initialBedTemperatureC: '25' },
  targets: { floral: '2', acidity: '1.5' },
  extensions: { futureProjectField: true }
};
const stable = toStableBrewData(source);
assert.equal(stable.schemaVersion, undefined);
assert.equal(stable.appVersion, undefined);
assert.equal(stable.brew.profileId, 'two-pulse');
assert.equal(stable.brew.doseG, 15);
assert.equal(stable.environment.ambientTemperatureC, 25);
assert.equal(stable.extensions.futureProjectField, true);
assert.equal(isStableBrewData(stable), true);
assert.equal(toBrewProfilesTransport(stable).schemaVersion, 2);
const schema = JSON.parse(await readFile(new URL('../contracts/luckybean-brew-data.schema.json', import.meta.url), 'utf8'));
assert.deepEqual(schema.required, ['bean', 'brew', 'water', 'environment', 'targets']);
assert.equal(schema.not.anyOf[0].required[0], 'schemaVersion');
console.log('v1.2.4 stable cross-project data format and boundary adapter checks passed');

