import assert from 'node:assert/strict';

const endpoint = 'https://vaxwncdcuvbpvdbbketb.supabase.co/functions/v1/brew-analyze-v2';
const key = process.env.BREWPROFILES_API_KEY || 'sb_publishable_MsB0RFoxxf5zJbbT9PPBjQ_WP7GBMMn';
const headers = {
  apikey: key,
  'content-type': 'application/json',
  'x-client-info': 'luckybean-v126-live-test',
  'x-installation-id': `lb-v126-${crypto.randomUUID()}`
};

function input(profileId = 'three-pulse', temperatureTune = 0) {
  return {
    bean: { countryCode: 'PA', varietyCode: 'GEISHA', processCode: 'washed', roastCode: 'RL-L1', roastColor: 92, altitude: 1900 },
    brew: {
      mode: 'professional', method: 'pourover', doseG: 15, ratio: 15, profileId,
      segmentMode: 'auto', segments: 4, dripperCode: 'cone', dripperMaterial: 'plastic',
      filterPaper: 'fast', grinder: 'test-grinder', firstCoolingMode: 'auto', firstTemperatureC: 88,
      tailCoolingMode: 'auto', tailTemperatureC: 86, lowTempFirst: true,
      temperatureTune, grindTune: 0, bloomTune: 0, repeatability: false
    },
    water: { profileId: 'balanced', recipeVolumeL: 5, tdsMgL: 80 },
    environment: { ambientTemperatureC: 25, relativeHumidityPct: 50, initialBedTemperatureC: 25 },
    targets: { acidity: 2, floral: 2.5, fruity: 2, sweetness: 2.25, bitterness: 1, astringency: 2 }
  };
}

async function post(body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { ...headers, 'x-request-id': crypto.randomUUID() },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  return { response, payload };
}

const baseline = await post(input('three-pulse', 0));
const tuned = await post(input('three-pulse', 3));
assert.equal(baseline.response.status, 200, JSON.stringify(baseline.payload));
assert.equal(tuned.response.status, 200, JSON.stringify(tuned.payload));
const baseTemps = baseline.payload.plan.stages.map(stage => Number(stage.temperatureC ?? stage.pourTemperature));
const tunedTemps = tuned.payload.plan.stages.map(stage => Number(stage.temperatureC ?? stage.pourTemperature));
assert.ok(tunedTemps.some((value, index) => Math.abs(value - baseTemps[index]) >= 2.9), `temperatureTune did not propagate: ${baseTemps} -> ${tunedTemps}`);
assert.notEqual(tuned.payload.metadata.planFingerprint, baseline.payload.metadata.planFingerprint);
assert.notDeepEqual(tuned.payload.trajectory.path, baseline.payload.trajectory.path, 'temperatureTune must change the authoritative 3D trajectory');

const currentMatching = {
  contract: 'luckybean-match/1.1', schema_ver: 1, axis_set: 'flavor_core_v1', dim: 8,
  signature_type: 'match_only', signature: 'LMS1-FC1-X564C58260C5C124B-Q82',
  match_vector: [86, 76, 88, 38, 12, 92, 18, 75],
  target_vector: [90, 82, 92, 40, 10, 92, 15, 80], confidence: 82,
  model_versions: { bean_model_ver: 'bean-vector/1.0', gear_model_ver: 'gear-correction/1.1', target_model_ver: 'target-vector/1.0' }
};
const matchingInput = input('recommended', 0);
matchingInput.matching = currentMatching;
const matched = await post(matchingInput);
assert.equal(matched.response.status, 200, JSON.stringify(matched.payload));
assert.equal(matched.payload.matching.contract, 'luckybean-match/1.1');
assert.equal(matched.payload.matching.selectedProfileId, matched.payload.metadata.effectiveProfileId);
assert.equal(matched.payload.plan.matching.selectedProfileId, matched.payload.matching.selectedProfileId);
assert.equal(matched.payload.matching.brewEffectVector.length, 8);
assert.equal(matched.payload.matching.cupVector.length, 8);
assert.equal(matched.payload.matching.targetVector.length, 8);
assert.ok(Number.isFinite(matched.payload.matching.score));
assert.ok(Array.isArray(matched.payload.matching.candidates) && matched.payload.matching.candidates.length >= 3);
assert.ok(matched.payload.matching.candidates.every(item => Array.isArray(item.brewEffectVector) && item.brewEffectVector.length === 8));
assert.ok(matched.payload.matching.candidates.every((item, index, list) => index === 0 || list[index - 1].score >= item.score));

const legacyInput = input('recommended', 0);
legacyInput.matching = {
  ...currentMatching,
  contract: 'luckybean-match/1.0',
  signature: 'LMS1-FC1-D08-X564C58260C5C124B-Q82',
  model_versions: { ...currentMatching.model_versions, gear_model_ver: 'gear-correction/1.0' }
};
const legacyMatched = await post(legacyInput);
assert.equal(legacyMatched.response.status, 200, JSON.stringify(legacyMatched.payload));
assert.equal(legacyMatched.payload.matching.contract, 'luckybean-match/1.1');
assert.equal(legacyMatched.payload.matching.brewEffectVector.length, 8);

const invalid = input('recommended', 0);
invalid.matching = { ...currentMatching, signature: 'LBS1-FC1-X564C58260C5C124B-Q82' };
const rejected = await post(invalid);
assert.equal(rejected.response.status, 400, JSON.stringify(rejected.payload));
assert.equal(rejected.payload.error, 'MATCH_SIGNATURE_INVALID');

function physicalDripper(overrides = {}) {
  return {
    contract:'gear-physics/1.0', kind:'dripper', group:'cone', angleDeg:60,
    outletClass:'large', outletIndex:1.08, drainageClass:'medium', drainageIndex:1,
    bypassClass:'low', bypassFraction:0.035, contactAreaIndex:0.94,
    materialKey:'asResin', materialClass:'plastic', massG:90, preheated:true,
    confidence:0.86, ...overrides
  };
}
const physicalPaper = {
  contract:'gear-physics/1.0', kind:'filter-paper', shape:'cone', flowClass:'medium',
  flowIndex:1, bypassTendency:'low', bypassFraction:0.025, confidence:0.8
};
function physicalInput(physical = physicalDripper(), paper = physicalPaper, dripperId = 'identity-a', dripperCode = 'cone') {
  const next = input('three-pulse', 0);
  Object.assign(next.brew, {
    ratioMode:'manual', dripperId, dripperCode, dripperMaterial:physical.materialClass,
    dripperPhysical:structuredClone(physical), filterPaperId:'paper-identity',
    filterPaper:paper.flowClass === 'high' ? 'fast' : paper.flowClass === 'low' ? 'slow' : 'medium',
    filterPaperPhysical:structuredClone(paper), gearPhysicsConfidence:Math.min(physical.confidence, paper.confidence)
  });
  return next;
}
async function physicalPost(body) {
  const result = await post(body);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.ok(Array.isArray(result.payload.trajectory?.path) && result.payload.trajectory.path.length > 10);
  return result.payload;
}

const plasticGear = await physicalPost(physicalInput());
const ceramicGear = await physicalPost(physicalInput(physicalDripper({ materialKey:'ceramic', materialClass:'ceramic', massG:280 })));
assert.notDeepEqual(ceramicGear.trajectory.path, plasticGear.trajectory.path, 'plastic and ceramic must not have identical thermal trajectories');
assert.notEqual(ceramicGear.trajectory.trajectoryModel?.material, plasticGear.trajectory.trajectoryModel?.material);

const flatGear = await physicalPost(physicalInput(physicalDripper({ group:'flat', angleDeg:75, outletIndex:1.22, drainageClass:'high', drainageIndex:1.18, bypassFraction:0.07, contactAreaIndex:1.04 }), physicalPaper, 'flat-identity', 'flat'));
assert.notDeepEqual(flatGear.trajectory.path, plasticGear.trajectory.path, 'geometry and hydraulics must change trajectory');

const slowPaper = { ...physicalPaper, flowClass:'low', flowIndex:0.76, bypassFraction:0.015 };
const paperGear = await physicalPost(physicalInput(physicalDripper(), slowPaper));
assert.notDeepEqual(paperGear.trajectory.path, plasticGear.trajectory.path, 'paper resistance must change trajectory');

const renamedGear = await physicalPost(physicalInput(physicalDripper(), physicalPaper, '完全不同的品牌与商品名-仅身份字段', 'cone'));
assert.deepEqual(renamedGear.trajectory.path, plasticGear.trajectory.path, 'identity-only name/id must not change physics');

console.log(`v126 live verified: tuning/matching plus physical gear sensitivity; identity-only rename is invariant; selected ${matched.payload.matching.selectedProfileId} at score ${matched.payload.matching.score}.`);
