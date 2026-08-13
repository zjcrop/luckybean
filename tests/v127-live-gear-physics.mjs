import assert from 'node:assert/strict';

const endpoint = 'https://vaxwncdcuvbpvdbbketb.supabase.co/functions/v1/brew-analyze-v2';
const key = process.env.BREWPROFILES_API_KEY || 'sb_publishable_MsB0RFoxxf5zJbbT9PPBjQ_WP7GBMMn';
const headers = {
  apikey: key,
  'content-type': 'application/json',
  'x-client-info': 'luckybean-v127-gear-physics-live',
  'x-installation-id': `lb-v127-${crypto.randomUUID()}`
};

const paperMedium = Object.freeze({
  contract:'gear-physics/1.0', kind:'filter-paper', shape:'cone', flowClass:'medium',
  flowIndex:1, bypassTendency:'low', bypassFraction:0.025, confidence:0.8
});

function dripper(overrides = {}) {
  return {
    contract:'gear-physics/1.0', kind:'dripper', group:'cone', angleDeg:60,
    outletClass:'large', outletIndex:1.08, drainageClass:'medium', drainageIndex:1,
    bypassClass:'low', bypassFraction:0.035, contactAreaIndex:0.94,
    materialKey:'asResin', materialClass:'plastic', massG:90, preheated:true,
    confidence:0.86, ...overrides
  };
}

function makeInput({ physical=dripper(), paper=paperMedium, dripperId='identity-a', dripperCode='cone' } = {}) {
  return {
    bean: { countryCode:'PA', varietyCode:'GEISHA', processCode:'washed', roastCode:'RL-L1', roastColor:92, altitude:1900 },
    brew: {
      mode:'professional', method:'pourover', doseG:15, ratio:15, ratioMode:'manual', profileId:'three-pulse',
      segmentMode:'auto', segments:4, dripperId, dripperCode,
      dripperMaterial:physical.materialClass, dripperPhysical:structuredClone(physical),
      filterPaperId:'paper-identity', filterPaper:paper.flowClass === 'high' ? 'fast' : paper.flowClass === 'low' ? 'slow' : 'medium',
      filterPaperPhysical:structuredClone(paper), gearPhysicsConfidence:Math.min(physical.confidence, paper.confidence),
      grinder:'test-grinder', firstCoolingMode:'auto', firstTemperatureC:88,
      tailCoolingMode:'auto', tailTemperatureC:86, lowTempFirst:true,
      temperatureTune:0, grindTune:0, bloomTune:0, repeatability:false
    },
    water: { profileId:'balanced', recipeVolumeL:5, tdsMgL:80 },
    environment: { ambientTemperatureC:25, relativeHumidityPct:50, initialBedTemperatureC:25 },
    targets: { acidity:2, floral:2.5, fruity:2, sweetness:2.25, bitterness:1, astringency:2 }
  };
}

async function post(input) {
  const response = await fetch(endpoint, { method:'POST', headers:{...headers, 'x-request-id':crypto.randomUUID()}, body:JSON.stringify(input) });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.ok(Array.isArray(payload.trajectory?.path) && payload.trajectory.path.length > 10, 'authoritative thermal path missing');
  return payload;
}

const plastic = await post(makeInput());
const ceramic = await post(makeInput({ physical:dripper({ materialKey:'ceramic', materialClass:'ceramic', massG:280 }) }));
assert.notDeepEqual(ceramic.trajectory.path, plastic.trajectory.path, 'plastic and ceramic must not have identical thermal trajectories');
assert.notEqual(ceramic.trajectory.trajectoryModel?.material, plastic.trajectory.trajectoryModel?.material, 'thermal model must resolve material family');

const flat = await post(makeInput({
  physical:dripper({ group:'flat', angleDeg:75, outletClass:'large', outletIndex:1.22, drainageClass:'high', drainageIndex:1.18, bypassFraction:0.07, contactAreaIndex:1.04 }),
  dripperCode:'flat'
}));
assert.notDeepEqual(flat.trajectory.path, plastic.trajectory.path, 'geometry/hydraulics must change the thermal trajectory');

const slowPaper = { ...paperMedium, flowClass:'low', flowIndex:0.76, bypassFraction:0.015 };
const paperChanged = await post(makeInput({ paper:slowPaper }));
assert.notDeepEqual(paperChanged.trajectory.path, plastic.trajectory.path, 'filter-paper hydraulic resistance must change the thermal trajectory');

const renamed = await post(makeInput({ dripperId:'完全不同的品牌与商品名-仅身份字段' }));
assert.deepEqual(renamed.trajectory.path, plastic.trajectory.path, 'identity-only dripper names/ids must never change physics');

const p10 = plastic.trajectory.trajectoryModel?.sampleTemperaturesC?.['10'];
const c10 = ceramic.trajectory.trajectoryModel?.sampleTemperaturesC?.['10'];
console.log(`v127 gear physics live verified: plastic/ceramic, geometry and paper resistance change trajectory; identity rename is invariant; T10 plastic=${p10}, ceramic=${c10}.`);
