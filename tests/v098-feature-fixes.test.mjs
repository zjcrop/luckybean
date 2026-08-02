import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { computeFallbackPlan, listBrewProfiles, resolveRequestedProfileId } from '../src/brew-engine.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const input = (profileId, segmentMode = 'auto') => ({
  schemaVersion: 2,
  bean: { countryCode: 'CO-ET', varietyCode: 'VA-GE', processCode: 'PR-WA', roastCode: 'RL-L1', roastColor: 88, altitude: 1950, roastDate: '2026-07-20' },
  brew: {
    method: 'pourover', doseG: 16, ratio: 15, ratioLocked: true,
    profileId, segmentMode, segments: Number(segmentMode) || 3,
    lowTempFirst: true, dripperCode: 'V60 02', filterPaperCode: '快流滤纸', grinder: 'C40'
  },
  water: { profileId: 'geisha', recipeVolumeL: 5, tdsMgL: 90 },
  targets: { floral: 3, acidity: 2.8, sweetness: 2.2, body: 1.8, bitterness: 2.8 }
});

test('segment numbers mean total stages including bloom', async () => {
  assert.equal(resolveRequestedProfileId(input('recommended', '2')), 'two-pulse');
  assert.equal(resolveRequestedProfileId(input('recommended', '3')), 'three-pulse');
  assert.equal(resolveRequestedProfileId(input('recommended', '4')), 'four-stage');
  assert.equal(resolveRequestedProfileId(input('recommended', '5')), 'five-pulse');

  const expected = [
    ['two-pulse', 2], ['three-pulse', 3], ['four-stage', 4], ['five-pulse', 5]
  ];
  for (const [profileId, count] of expected) {
    const plan = await computeFallbackPlan(input(profileId));
    assert.equal(plan.profile.id, profileId);
    assert.equal(plan.stages.length, count, `${profileId} total stages`);
    assert.equal(plan.stages[0].index, 1);
    assert.match(plan.stages[0].name, /闷蒸|润湿/);
    assert.equal(plan.profileIntegrity.countIncludesBloom, true);
  }
});

test('improved 4:6 profile uses exact scaled 33666 split and two bloom-temperature stages', async () => {
  assert.ok(listBrewProfiles().some(profile => profile.id === 'four-six-33666'));
  const plan = await computeFallbackPlan(input('four-six-33666'));
  assert.equal(plan.profile.id, 'four-six-33666');
  assert.equal(plan.stages.length, 5);
  assert.deepEqual(plan.stages.map(stage => stage.stageWaterG), [30, 30, 60, 60, 60]);
  assert.equal(plan.stages[0].temperatureC, plan.stages[1].temperatureC);
  assert.match(plan.stages[0].name, /闷蒸/);
  assert.match(plan.stages[1].name, /闷蒸/);
  assert.match(plan.stages[1].notice, /闷蒸温度/);
  assert.equal(plan.stages.at(-1).cumulativeWaterG, 240);
});

test('v098 runtime and styles contain grouping, selected-card, radar, archive and flavor-record fixes', async () => {
  const [runtime, css, html, sw] = await Promise.all([
    read('src/v098-feature-fixes.js'), read('styles-v098-fixes.css'), read('index.html'), read('sw.js')
  ]);
  for (const marker of [
    "groupMode = localStorage.getItem(GROUP_KEY) || 'roast'",
    'freshness-state', 'remaining-50', 'FRESHNESS_ORDER',
    'v098-segments-hidden', 'FIXED_PROFILE_STAGES',
    'v17Trajectory', 'v098-temp-line', 'v098-flow-line',
    'min = \'1\'', 'max = \'9\'', 'bypassAffectiveStep',
    'openProfessionalRadarReturn', 'rebuyBean', 'permanentlyDeleteBean',
    "['高温', 'H']", "['中温', 'W']", "['低温', 'C']"
  ]) assert.ok(runtime.includes(marker), marker);
  for (const marker of [
    '#2d2e30', '#ddddda', 'rgba(190, 38, 38, .50)',
    '.v098-segments-hidden', '.v098-temp-line', '.v098-flow-line',
    '.v098-affective-bypass', '.v098-radar-return'
  ]) assert.ok(css.includes(marker), marker);
  assert.match(html, /styles-v098-fixes\.css\?v=098a/);
  assert.match(html, /src\/v098-feature-fixes\.js\?v=098a/);
  assert.match(sw, /luckybean-v0\.9\.8-feature-fix-a/);
  assert.match(sw, /styles-v098-fixes\.css/);
  assert.match(sw, /src\/v098-feature-fixes\.js/);
});
