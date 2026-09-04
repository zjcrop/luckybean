import assert from 'node:assert/strict';

const endpoint = 'https://vaxwncdcuvbpvdbbketb.supabase.co/functions/v1/brew-analyze-v2';
const key = process.env.BREWPROFILES_API_KEY || 'sb_publishable_MsB0RFoxxf5zJbbT9PPBjQ_WP7GBMMn';
const installation = `lb-124p-clever-${crypto.randomUUID()}`;
const headers = {
  apikey: key,
  'content-type': 'application/json',
  'x-client-info': 'luckybean-1.24p-clever-production-gate/1.0',
  'x-installation-id': installation
};

async function getProfiles() {
  const response = await fetch(`${endpoint}?mode=profiles`, {
    headers: { ...headers, 'x-request-id': crypto.randomUUID() }
  });
  const data = await response.json().catch(() => null);
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.ok(Array.isArray(data?.profiles), 'production profile catalog missing');
  return data.profiles;
}

async function analyze(brew) {
  const body = {
    bean: {
      countryCode: 'CO',
      varietyCode: 'GEISHA',
      processCode: 'washed',
      roastCode: 'RL-L1',
      roastColor: 92,
      altitude: 1850
    },
    brew: {
      mode: 'professional',
      method: 'pourover',
      doseG: 15,
      doseMode: 'manual',
      ratio: 16,
      ratioMode: 'manual',
      segmentMode: 'auto',
      segments: 2,
      dripperCode: 'clever',
      dripperMaterial: 'plastic',
      dripperPreheated: true,
      filterPaper: 'standard',
      grinder: 'test-grinder',
      firstCoolingMode: 'off',
      tailCoolingMode: 'off',
      lowTempFirst: false,
      temperatureTune: 0,
      grindTune: 0,
      bloomTune: 0,
      repeatability: false,
      ...brew
    },
    water: { profileId: 'balanced', recipeVolumeL: 5, tdsMgL: 90 },
    environment: { ambientTemperatureC: 25, relativeHumidityPct: 50, initialBedTemperatureC: 25 },
    targets: { acidity: 2, floral: 3, fruity: 3, sweetness: 2.5, bitterness: 2, astringency: 2 }
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { ...headers, 'x-request-id': crypto.randomUUID() },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}

const profiles = await getProfiles();
assert.equal(profiles.length, 42, `expected 42 production profiles, got ${profiles.length}`);
const cleverCatalog = profiles.find(profile => profile.id === 'clever-immersion-release');
assert.ok(cleverCatalog, 'Clever production profile missing');
assert.equal(cleverCatalog.category, 'engineered-profile');
assert.equal(cleverCatalog.autoRecommend, true);
assert.ok(cleverCatalog.compatibleDripperGroups?.includes('immersion'));

const explicit = await analyze({ profileId: 'clever-immersion-release' });
assert.equal(explicit.contract, 'brew-analysis/2.1');
assert.equal(explicit.plan?.profile?.id, 'clever-immersion-release');
assert.equal(explicit.plan?.stages?.length, 2);
assert.equal(Number(explicit.plan.stages[0].pour), 240);
assert.equal(Number(explicit.plan.stages[0].cumulative), 240);
assert.equal(Number(explicit.plan.stages[1].pour), 0);
assert.equal(Number(explicit.plan.stages[1].cumulative), 240);
assert.match(String(explicit.plan.stages[0].method || ''), /浸泡/);
assert.match(String(explicit.plan.stages[1].method || ''), /开阀|释放/);
assert.match(String(explicit.plan.stages[1].method || ''), /不再注水/);
assert.ok(!explicit.plan.executionActions?.some(action => action.type === 'hot-pour' && Number(action.amountG) <= 0), 'zero-water stage leaked into pour action');
assert.doesNotMatch(JSON.stringify(explicit), /Excel/i, 'internal Excel wording leaked into LuckyBean production response');
assert.equal(explicit.trajectory?.schemaVersion, 'brew-spatial/1.3');
assert.ok(Array.isArray(explicit.trajectory?.path) && explicit.trajectory.path.length > 10, 'Clever spatial trajectory missing');

const recommended = await analyze({ profileId: 'recommended' });
assert.equal(recommended.plan?.profile?.id, 'clever-immersion-release', `Clever brewer auto-selected ${recommended.plan?.profile?.id}`);

console.log(JSON.stringify({
  ok: true,
  profileCount: profiles.length,
  cleverProfile: explicit.plan.profile.id,
  automaticProfile: recommended.plan.profile.id,
  releaseStage: {
    pour: explicit.plan.stages[1].pour,
    cumulative: explicit.plan.stages[1].cumulative,
    method: explicit.plan.stages[1].method
  },
  excelCopyAbsent: true,
  spatialPathPoints: explicit.trajectory.path.length
}, null, 2));
