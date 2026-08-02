import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { computeFallbackPlan, resolveRequestedProfileId } from '../src/brew-engine.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const baseInput = {
  schemaVersion: 2,
  bean: { countryCode: 'CO-ET', varietyCode: 'VA-GE', processCode: 'PR-WA', roastCode: 'RL-L1', roastColor: 88, altitude: 1950, roastDate: '2026-07-20' },
  brew: { method: 'pourover', doseG: 15, ratio: 15.5, profileId: 'recommended', segments: 3, lowTempFirst: true, dripperCode: 'V60 02', filterPaperCode: '快流滤纸', grinder: 'C40' },
  water: { profileId: 'geisha', recipeVolumeL: 5, tdsMgL: 90, customProfile: { ca: 22, mg: 41, hco3: 17, tds: 90 } },
  targets: { floral: 3, acidity: 2.4, sweetness: 2.4, body: 1.2, bitterness: 3 }
};

test('explicit segment selector constrains the optimizer while legacy count alone does not', async () => {
  assert.equal(resolveRequestedProfileId({ brew: { profileId: 'recommended', segmentMode: '3', segments: 3 } }), 'three-pulse');
  assert.equal(resolveRequestedProfileId({ brew: { profileId: 'recommended', segments: 3 } }), '');
  assert.equal(resolveRequestedProfileId({ brew: { profileId: 'recommended', brewStyle: '三段式' } }), 'three-pulse');
  const plan = await computeFallbackPlan({ ...baseInput, brew: { ...baseInput.brew, profileId: 'recommended', segmentMode: '3', segments: 3 } });
  assert.equal(plan.profile.id, 'three-pulse');
  assert.equal(plan.stages.length, 4);
  assert.equal(plan.profileIntegrity.requestedProfileId, 'three-pulse');
  assert.equal(plan.profileIntegrity.preserved, true);
  assert.equal(plan.optimizer.selectedBy, 'user-profile-constraint');
  assert.equal(plan.optimizer.candidateProfiles.length, 1);
});

test('v097 runtime preserves the original time-series trajectory and requested interactions', async () => {
  const [runtime, css, app, html, sw, fabGesture] = await Promise.all([
    read('src/v097-ui-fixes.js'),
    read('styles-v097-fixes.css'),
    read('src/app.js'),
    read('index.html'),
    read('sw.js'),
    read('src/v097-fab-gesture.js')
  ]);

  for (const marker of [
    'preserveTrajectoryChart',
    'enforceBrewSelection',
    'extractRecognitionEvidence',
    'brew-history-compact-v097',
    'brew-replay-label',
    '复刻',
    'luckybean.fab.position.v1',
    'LABEL_DEFINITIONS',
    'bestCandidateDecision',
    '.active-group-panel',
    '#brewProfile,#brewSegments'
  ]) assert.ok(runtime.includes(marker), marker);

  assert.ok(!runtime.includes("querySelectorAll('.trajectory-series.floral,.trajectory-series.acidity,.trajectory-series.sweetness,.trajectory-series.risk,.trajectory-window.positive')"));
  for (const marker of ['trajectory-series floral', 'trajectory-series acidity', 'trajectory-series sweetness', 'trajectory-series risk', 'trajectory-window ${window.kind']) assert.ok(app.includes(marker), marker);

  for (const marker of [
    'grid-template-columns:minmax(86px,auto) minmax(0,1fr)',
    'aspect-ratio:720/330!important',
    'stroke:#777!important',
    '.trajectory-series.floral',
    '.trajectory-series.risk',
    '.v095-sensory-modes',
    '#fabWrap.action-grid',
    'position:fixed!important',
    '.group-collapse-zone-v097',
    'min-height:96px!important'
  ]) assert.ok(css.includes(marker), marker);

  assert.ok(fabGesture.includes('drag-or-tap'));
  assert.match(html, /styles-v097-fixes\.css\?v=097c/);
  assert.match(html, /src\/v097-ui-fixes\.js\?v=097c/);
  assert.match(html, /src\/v097-fab-gesture\.js\?v=097c/);
  assert.match(sw, /luckybean-v0\.9\.6-ui-fix-h/);
  assert.match(sw, /styles-v097-fixes\.css/);
  assert.match(sw, /src\/v097-ui-fixes\.js/);
});

test('brew history abbreviation follows five-character rule', async () => {
  const runtime = await read('src/v097-ui-fixes.js');
  assert.match(runtime, /characters\.length\s*>\s*maximum/);
  assert.match(runtime, /characters\.slice\(0,\s*maximum\)/);
  assert.match(runtime, /……/);
});

test('recognition field splitter covers labeled Chinese and English package fields', async () => {
  const runtime = await read('src/v097-ui-fixes.js');
  for (const marker of ['COUNTRY', 'REGION', 'VARIETY', 'PROCESS', 'ROASTER', 'AGTRON', 'NET', 'WEIGHT', '烘焙日期', '初始克重']) {
    assert.ok(runtime.includes(marker), marker);
  }
  assert.ok(runtime.includes('updateRecognitionWarning'));
  assert.ok(runtime.includes("date.value = ''"));
});
