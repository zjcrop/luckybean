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
const expectedTargets = {
  acidity: 2,
  floral: 2.5,
  fruity: 1.5,
  sweetness: 2.25,
  bitterness: 2,
  astringency: 1.75
};
const headers = {
  apikey: key,
  'content-type': 'application/json',
  'x-client-info': 'luckybean-v123-live-test',
  'x-installation-id': installationId,
  'x-request-id': crypto.randomUUID()
};

function buildBrewInput(profileId = 'recommended', dripperMaterial = 'plastic') {
  return {
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
      dripperMaterial,
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
    targets: { ...expectedTargets }
  };
}

for (const material of ['glass', 'ceramic', 'plastic', 'titanium']) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { ...headers, 'x-request-id': crypto.randomUUID() },
    body: JSON.stringify(buildBrewInput('recommended', material))
  });
  const analysis = await response.json();
  assert.equal(response.status, 200, `${material}: ${JSON.stringify(analysis)}`);
  assert.equal(analysis.input.brew.dripperMaterial, material);
  assert.equal(analysis.plan.input.brew.dripperMaterial, material);
}

const androidPreflight = await fetch(endpoint, {
  method: 'OPTIONS',
  headers: {
    Origin: 'https://app.luckybean.local',
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'content-type,apikey,x-installation-id,x-request-id'
  }
});
assert.equal(androidPreflight.status, 204, await androidPreflight.text());
assert.equal(androidPreflight.headers.get('access-control-allow-origin'), '*');

const autoCoolingInput = buildBrewInput('three-pulse');
autoCoolingInput.brew.ratioMode = 'auto';
const customCoolingInput = buildBrewInput('three-pulse');
customCoolingInput.brew.ratio = 17;
customCoolingInput.brew.ratioMode = 'manual';
customCoolingInput.brew.tailCoolingMode = 'custom';
customCoolingInput.brew.tailTemperatureC = 60;
const [autoCoolingResponse, customCoolingResponse] = await Promise.all([
  fetch(endpoint, {
    method: 'POST', headers: { ...headers, Origin: 'https://app.luckybean.local', 'x-request-id': crypto.randomUUID() },
    body: JSON.stringify(autoCoolingInput)
  }),
  fetch(endpoint, {
    method: 'POST', headers: { ...headers, Origin: 'https://app.luckybean.local', 'x-request-id': crypto.randomUUID() },
    body: JSON.stringify(customCoolingInput)
  })
]);
const [autoCooling, customCooling] = await Promise.all([autoCoolingResponse.json(), customCoolingResponse.json()]);
assert.equal(autoCoolingResponse.status, 200, JSON.stringify(autoCooling));
assert.equal(customCoolingResponse.status, 200, JSON.stringify(customCooling));
const customTail = customCooling.plan.stages.at(-1);
assert.equal(Number(customTail.temperatureC ?? customTail.pourTemperature), 60);
assert.equal(customCooling.plan.input.tailCoolingMode, 'custom');
assert.equal(customCooling.plan.input.tailTemperatureC, 60);
assert.equal(customCooling.plan.summary.ratio, 17);
assert.notEqual(customCooling.metadata.planFingerprint, autoCooling.metadata.planFingerprint);
assert.notDeepEqual(customCooling.trajectory.path, autoCooling.trajectory.path);

const invalidKeyResponse = await fetch(`${endpoint}?mode=profiles`, {
  headers: { ...headers, apikey: 'not-a-valid-publishable-key', 'x-request-id': crypto.randomUUID() }
});
assert.equal(invalidKeyResponse.status, 401, await invalidKeyResponse.text());

const headersWithoutInstallation = { ...headers };
delete headersWithoutInstallation['x-installation-id'];
const missingInstallationResponse = await fetch(`${endpoint}?mode=profiles`, {
  headers: { ...headersWithoutInstallation, 'x-request-id': crypto.randomUUID() }
});
assert.equal(missingInstallationResponse.status, 400, await missingInstallationResponse.text());

const catalogResponse = await fetch(`${endpoint}?mode=profiles`, { headers });
const catalog = await catalogResponse.json();
assert.equal(catalogResponse.status, 200, JSON.stringify(catalog));
assert.equal(catalog.contract, 'brew-profile-catalog/1.0');
const catalogProfiles = new Map(catalog.profiles.map(profile => [profile.id, profile]));
const catalogVersions = new Map(catalog.profiles.map(profile => [profile.id, profile.version]));
assert.ok(catalogVersions.size >= 23, `catalog contains only ${catalogVersions.size} profiles`);
for (const id of competitionIds) assert.ok(catalogVersions.has(id), `catalog missing ${id}`);

const versionedInputResponse = await fetch(endpoint, {
  method: 'POST',
  headers: { ...headers, 'x-request-id': crypto.randomUUID() },
  body: JSON.stringify({ schemaVersion: 2, ...buildBrewInput() })
});
const versionedError = await versionedInputResponse.json();
assert.equal(versionedInputResponse.status, 400, JSON.stringify(versionedError));
assert.equal(versionedError.error, 'BUSINESS_VERSION_FIELD_FORBIDDEN:schemaVersion');

const bodyTargetResponse = await fetch(endpoint, {
  method: 'POST',
  headers: { ...headers, 'x-request-id': crypto.randomUUID() },
  body: JSON.stringify({ ...buildBrewInput(), targets: { ...expectedTargets, body: 1 } })
});
const bodyTargetError = await bodyTargetResponse.json();
assert.equal(bodyTargetResponse.status, 400, JSON.stringify(bodyTargetError));
assert.equal(bodyTargetError.error, 'TARGET_BODY_FORBIDDEN');

for (const profileId of catalogVersions.keys()) {
  const profileInput = buildBrewInput(profileId);
  profileInput.brew.serveMode = catalogProfiles.get(profileId)?.serveMode || 'hot';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { ...headers, 'x-request-id': crypto.randomUUID() },
    body: JSON.stringify(profileInput)
  });
  const analysis = await response.json();
  assert.equal(response.status, 200, `${profileId}: ${JSON.stringify(analysis)}`);
  assert.equal(analysis.contract, 'brew-analysis/2.1');
  assert.match(analysis.analysisFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.match(analysis.metadata.inputFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(typeof analysis.metadata.planFingerprint, 'string');
  assert.ok(analysis.metadata.planFingerprint.length > 0);
  assert.equal(analysis.trajectory.planFingerprint, analysis.metadata.planFingerprint);
  assert.equal(analysis.metadata.requestedProfileId, profileId);
  assert.equal(analysis.metadata.resolvedProfileId, profileId);
  assert.equal(analysis.metadata.resolvedProfileVersion, catalogVersions.get(profileId));
  assert.equal(analysis.input.brew.profileId, profileId);
  for (const field of ['schemaVersion', 'appVersion', 'engineVersion', 'profileVersion']) {
    assert.equal(Object.hasOwn(analysis.input, field), false, `${profileId}: business input leaked ${field}`);
  }
  assert.deepEqual(analysis.input.targets, expectedTargets);
  assert.equal(Object.hasOwn(analysis.input.targets, 'body'), false);
  for (const field of ['profile', 'input', 'recommendation', 'summary', 'stages', 'models', 'warnings', 'integration', 'options']) {
    assert.ok(Object.hasOwn(analysis.plan, field), `${profileId}: plan missing ${field}`);
  }
  assert.ok(Array.isArray(analysis.plan.stages) && analysis.plan.stages.length > 0, `${profileId}: stages missing`);
  assert.equal(analysis.plan.input.brewStyle, profileId);
  assert.equal(analysis.plan.input.water.tds, 80);
  assert.equal(typeof analysis.plan.input.grinder, 'object');
  assert.equal(analysis.plan.models.environment.ambientTemperature, 25);
  assert.equal(analysis.trajectory.schemaVersion, 'brew-spatial/1.3');
  assert.equal(analysis.trajectory.flavorState?.schemaVersion, 'brew-flavor-state/1.0');
  assert.equal(analysis.trajectory.flavorState?.brewEffectVector?.length, 8);
  assert.ok(analysis.trajectory.path.length > 20, `${profileId}: path too short`);
  const returnedTargets = new Set(analysis.trajectory.targets.map(target => target.id));
  for (const id of targetIds) assert.ok(returnedTargets.has(id), `${profileId}: missing target ${id}`);
}

console.log(`Verified BrewProfiles 2.1 / spatial 1.3 / flavor-state 1.0, Android-origin CORS, absolute 60°C tail cooling, manual/auto ratio, all four dripper materials and all ${catalogVersions.size} workbook profiles.`);
