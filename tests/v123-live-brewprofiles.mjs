import assert from 'node:assert/strict';

const endpoint = 'https://vaxwncdcuvbpvdbbketb.supabase.co/functions/v1/brew-analyze-v2';
const key = process.env.BREWPROFILES_API_KEY || 'sb_publishable_MsB0RFoxxf5zJbbT9PPBjQ_WP7GBMMn';
const installationId = `lb-ci-${crypto.randomUUID()}`;
const competitionIds = [
  'cbrc-2026-01-zhong-jingjing',
  'cbrc-2026-02-liang-baoyi',
  'cbrc-2026-03-wu-minwei',
  'cbrc-2026-04-yang-xiao',
  'cbrc-2026-05-zhang-xiaobo',
  'cbrc-2026-06-qu-yongxiang'
];
const targetIds = ['acidity', 'floral', 'fruity', 'sweetness', 'bitterness', 'astringency'];
const headers = {
  apikey: key,
  'content-type': 'application/json',
  'x-client-info': 'luckybean-v123-live-test',
  'x-installation-id': installationId,
  'x-request-id': crypto.randomUUID()
};

const invalidKeyResponse = await fetch(`${endpoint}?mode=profiles`, {
  headers: { ...headers, apikey: 'not-a-valid-publishable-key', 'x-request-id': crypto.randomUUID() }
});
assert.equal(invalidKeyResponse.status, 401, await invalidKeyResponse.text());

const catalogResponse = await fetch(`${endpoint}?mode=profiles`, { headers });
const catalog = await catalogResponse.json();
assert.equal(catalogResponse.status, 200, JSON.stringify(catalog));
assert.equal(catalog.contract, 'brew-profile-catalog/1.0');
const catalogVersions = new Map(catalog.profiles.map(profile => [profile.id, profile.version]));
for (const id of competitionIds) assert.ok(catalogVersions.has(id), `catalog missing ${id}`);

for (const profileId of competitionIds) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { ...headers, 'x-request-id': crypto.randomUUID() },
    body: JSON.stringify({
      bean: {
        countryCode: 'PA',
        varietyCode: 'GEISHA',
        processCode: 'washed',
        roastCode: 'RL-L1',
        roastColor: 92,
        altitude: 1900
      },
      brew: {
        mode: 'professional',
        method: 'pourover',
        doseG: 15,
        ratio: 15,
        profileId,
        segmentMode: 'auto',
        segments: 4,
        dripperCode: 'cone',
        filterPaper: 'fast',
        grinder: 'test-grinder',
        firstCoolingMode: 'auto',
        firstTemperatureC: 88,
        tailCoolingMode: 'auto',
        tailTemperatureC: 86,
        lowTempFirst: true,
        temperatureTune: 0,
        grindTune: 0,
        bloomTune: 0,
        repeatability: false
      },
      water: { profileId: 'balanced', recipeVolumeL: 5, tdsMgL: 80 },
      environment: { ambientTemperatureC: 25, relativeHumidityPct: 50, initialBedTemperatureC: 25 },
      targets: { acidity: 2, floral: 2.5, fruity: 1.5, sweetness: 2.25, bitterness: 2, astringency: 1.75 }
    })
  });
  const analysis = await response.json();
  assert.equal(response.status, 200, `${profileId}: ${JSON.stringify(analysis)}`);
  assert.equal(analysis.contract, 'brew-analysis/2.0');
  assert.match(analysis.analysisFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.match(analysis.metadata.inputFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(typeof analysis.metadata.planFingerprint, 'string');
  assert.ok(analysis.metadata.planFingerprint.length > 0);
  assert.equal(analysis.trajectory.planFingerprint, analysis.metadata.planFingerprint);
  assert.equal(analysis.metadata.requestedProfileId, profileId);
  assert.equal(analysis.metadata.resolvedProfileId, profileId);
  assert.equal(analysis.metadata.resolvedProfileVersion, catalogVersions.get(profileId));
  assert.deepEqual(analysis.input.brew.profileId, profileId);
  for (const key of ['schemaVersion', 'appVersion', 'engineVersion', 'profileVersion']) {
    assert.equal(Object.hasOwn(analysis.input, key), false, `${profileId}: business input leaked ${key}`);
  }
  assert.deepEqual(analysis.input.targets, {
    acidity: 2,
    floral: 2.5,
    fruity: 1.5,
    sweetness: 2.25,
    bitterness: 2,
    astringency: 1.75
  });
  assert.equal(Object.hasOwn(analysis.input.targets, 'body'), false);
  for (const field of ['profile','input','recommendation','summary','stages','models','warnings','integration','options']) {
    assert.ok(Object.hasOwn(analysis.plan, field), `${profileId}: plan missing ${field}`);
  }
  assert.ok(Array.isArray(analysis.plan.stages) && analysis.plan.stages.length > 0, `${profileId}: stages missing`);
  assert.equal(analysis.plan.input.brewStyle, profileId);
  assert.equal(analysis.plan.input.water.tds, 80);
  assert.equal(typeof analysis.plan.input.grinder, 'object');
  assert.equal(analysis.plan.models.environment.ambientTemperature, 25);
  assert.equal(analysis.trajectory.schemaVersion, 'brew-spatial/1.1');
  assert.ok(analysis.trajectory.path.length > 20, `${profileId}: path too short`);
  const returnedTargets = new Set(analysis.trajectory.targets.map(target => target.id));
  for (const id of targetIds) assert.ok(returnedTargets.has(id), `${profileId}: missing target ${id}`);
}

console.log(`Verified ${competitionIds.length} database competition profiles with complete spatial target geometry.`);
