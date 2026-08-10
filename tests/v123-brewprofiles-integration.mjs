import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const competitionIds = [
  'cbrc-2026-01-zhong-jingjing',
  'cbrc-2026-02-liang-baoyi',
  'cbrc-2026-03-wu-minwei',
  'cbrc-2026-04-yang-xiao',
  'cbrc-2026-05-zhang-xiaobo',
  'cbrc-2026-06-qu-yongxiang'
];

test('professional brew API has a persistent installation identity and no cloud-account dependency', async () => {
  const client = await read('src/services/brew-api-client.js');
  const analysis = await read('src/services/brew-analysis-service.js');
  assert.match(client, /x-installation-id/);
  assert.match(client, /luckybean\.installation\.id\.v1/);
  assert.match(client, /brew-analyze-v2/);
  assert.doesNotMatch(analysis, /LuckyBeanCloudAuth|access_token|authorization:\s*`Bearer/);
  assert.match(analysis, /brewApiJson/);
});

test('catalog is authoritative, cached, and includes all six competition profiles', async () => {
  const source = await read('src/services/brew-profile-catalog-service.js');
  const engine = await read('src/brew-engine.js');
  assert.match(source, /brew-profile-catalog\/1\.0/);
  assert.match(source, /brew-profiles-authoritative/);
  assert.match(source, /catalogHash/);
  for (const id of competitionIds) {
    assert.match(source, new RegExp(id));
    assert.match(engine, new RegExp(id), `${id} must remain visible during Android cold start`);
  }
});

test('ratio defaults to profile recommendation while preserving explicit manual override', async () => {
  const app = await read('src/app.js');
  assert.match(app, /ratioMode: 'auto'/);
  assert.match(app, /方案推荐（生成后返回）/);
  assert.match(app, /ratioMode = ratioSelection === 'auto' \? 'auto' : 'manual'/);
});

test('absolute tail cooling accepts 60°C and is transported to BrewProfiles', async () => {
  const app = await read('src/app.js');
  assert.match(app, /const minimum = first \? 70 : 50/);
  assert.match(app, /tailCoolingMode: \$\('#tailCoolingMode'\)/);
  assert.match(app, /tailTemperatureC: Number\(state\.settings\.brew\.tailTemperatureC\)/);
});

test('client rejects empty or incomplete target geometry', async () => {
  const analysis = await read('src/services/brew-analysis-service.js');
  for (const id of ['acidity', 'floral', 'fruity', 'sweetness', 'bitterness', 'astringency']) {
    assert.match(analysis, new RegExp(`'${id}'`));
  }
  assert.match(analysis, /target\.points\.length < 12/);
});

test('new plan generation never converts an API failure into a fake successful 3D scene', async () => {
  const app = await read('src/app.js');
  const renderer = await read('src/renderers/brew-spatial-controller.js');
  assert.doesNotMatch(app, /plan\.visualization3d\s*=\s*plan\.analysisSnapshot\.trajectory/);
  assert.doesNotMatch(app, /plan\.trajectory\s*=\s*plan\.analysisSnapshot\.trajectory/);
  assert.match(renderer, /REQUIRED_TARGET_IDS/);
  assert.match(renderer, /专业靶区/);
});

test('profile resolver accepts catalog IDs instead of a fixed explicit-profile whitelist', async () => {
  const engine = await read('src/brew-engine.js');
  assert.match(engine, /listCachedBrewProfiles/);
  assert.match(engine, /listBrewProfiles\(\)\.some\(profile => profile\.id === raw\)/);
  assert.match(engine, /next\.brew\.brewStyle = profileId/);
});
