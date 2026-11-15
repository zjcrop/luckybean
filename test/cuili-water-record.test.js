import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCuiLiWaterRecord,cuiLiWaterWarnings,withCuiLiWaterWarnings,customWaterProfileForTransport} from '../src/domain/water/cuili-water-record.js';
import {BrewCalculationCoordinator} from '../src/services/brew-calculation-coordinator.js';
const actualExport=fs.readFileSync(new URL('./fixtures/cuili-water-record.single-heating.json',import.meta.url),'utf8');
const fixture=()=>JSON.parse(actualExport);
const plan=()=>({executionSource:'brew-profiles-authoritative',analysisFingerprint:'sha256:authoritative-unchanged',metadata:{fingerprint:'source-fingerprint'},profile:{id:'three-pulse'},stages:[{temperatureC:93,durationSec:30,stageWaterG:40,cumulativeWaterG:40},{temperatureC:92,durationSec:100,stageWaterG:200,cumulativeWaterG:240}],totals:{doseG:15,waterG:240,targetTimeSec:130},warnings:['原模型提示']});
test('real browser-exported water record retains pre-heat values and unknown post-heat predictions',()=>{
  const record=parseCuiLiWaterRecord(actualExport);
  assert.equal(record.water.heatingAssessment.scenario,'single-heating');assert.equal(record.water.heatingAssessment.history.heatingCycles,1);
  assert.equal(record.water.calciumMgL,fixture().water.calciumMgL);assert.ok(record.water.calciumMgL>0);
  assert.equal(record.water.heatingAssessment.predictions.heatedCalciumMgL,null);assert.equal(record.water.tdsMgL,null);
});
test('single-heating import rejects malformed, unsafe and overlarge JSON',()=>{
  for(const value of ['{bad','{"water":{"__proto__":{}}}',JSON.stringify({water:'x'.repeat(66000)})])assert.throws(()=>parseCuiLiWaterRecord(value));
});
test('strict concentrations and volume reject coercion or negative values',()=>{
  for(const [key,value]of [['calciumMgL',-1],['magnesiumMgL','8'],['recipeVolumeL',null],['pH',15],['ionicAccountingComplete',1]]){const record=fixture();record.water[key]=value;assert.throws(()=>parseCuiLiWaterRecord(record),key);}
});
test('only explicit pre-heating single-heating records are accepted',()=>{
  for(const update of [record=>record.water.concentrationBasis='post-heating-measured',record=>record.water.heatingAssessment.scenario='multiple-heating',record=>record.water.heatingAssessment.history.heatingCycles=2]){const record=fixture();update(record);assert.throws(()=>parseCuiLiWaterRecord(record));}
});
test('automatic brew modifications and known-looking heated calcium predictions are rejected',()=>{
  for(const update of [record=>record.water.heatingAssessment.brewAdjustment.automatic=true,record=>record.water.heatingAssessment.brewAdjustment.temperatureDeltaC=-3,record=>record.water.heatingAssessment.predictions.heatedCalciumMgL=0]){const record=fixture();update(record);assert.throws(()=>parseCuiLiWaterRecord(record));}
});
test('water and thermal ion ledgers must agree',()=>{
  const record=fixture();record.water.calciumMgL=99;assert.throws(()=>parseCuiLiWaterRecord(record),/不一致/);
});
test('incomplete ionic accounting survives import and produces a visible boundary warning',()=>{
  const record=fixture();record.water.ionicAccountingComplete=false;
  assert.equal(parseCuiLiWaterRecord(record).water.ionicAccountingComplete,false);assert.ok(cuiLiWaterWarnings(record).some(w=>w.includes('账本不完整')));
  delete record.water.ionicAccountingComplete;assert.equal(parseCuiLiWaterRecord(record).water.ionicAccountingComplete,null);
});
test('actual single-heating evaporation and sediment generate operation advice without dosage changes',()=>{
  const warnings=cuiLiWaterWarnings(actualExport);
  assert.ok(warnings.some(w=>w.includes('5%蒸发')));assert.ok(warnings.some(w=>w.includes('观察到沉积')));assert.ok(warnings.some(w=>w.includes('不自动改变')));
  assert.ok(!warnings.some(w=>/复烧|保温/.test(w)));
});
test('a changed local record replaces prior water warnings rather than keeping stale sediment advice',()=>{
  const original=withCuiLiWaterWarnings(plan(),fixture()),next=fixture();next.water.heatingAssessment.history.visiblePrecipitate=false;
  const revised=withCuiLiWaterWarnings(original,next);assert.ok(!revised.warnings.some(w=>w.includes('观察到沉积')));assert.ok(revised.warnings.includes('原模型提示'));
});
test('custom water transport explicitly excludes locally stored precise ions and heat history',()=>{
  const selected={name:'原水型',tds:85,tendency:{floral:1},note:'原备注',externalWaterRecord:fixture(),heatingAssessment:fixture().water.heatingAssessment};
  assert.deepEqual(customWaterProfileForTransport(selected),{name:'原水型',tds:85,tendency:{floral:1},note:'原备注'});
});
test('authoritative request input, stages, times, temperatures and fingerprints are unchanged',async()=>{
  const input={bean:{id:'bean'},brew:{profileId:'three-pulse'},water:{profileId:'custom',customProfile:{name:'原水型',tds:85}},targets:{acidity:1.5}},before=structuredClone(input),received=[];
  const coordinator=new BrewCalculationCoordinator(async(_endpoint,next)=>{received.push(structuredClone(next));return plan();});
  const baseline=await coordinator.calculate({input}),decorated=await coordinator.calculate({input,localWaterRecord:fixture()});
  assert.deepEqual(received[0],received[1]);assert.deepEqual(input,before);assert.ok(!JSON.stringify(received).includes('heatingAssessment'));
  for(const key of ['stages','totals','analysisFingerprint','metadata'])assert.deepEqual(decorated.plan[key],baseline.plan[key],key);
  assert.deepEqual(decorated.plan.contracts.brewPlan,baseline.plan.contracts.brewPlan);
  for(const key of ['physical','metadata','inputHash','flavor'])assert.deepEqual(decorated.plan.contracts.brewResult[key],baseline.plan.contracts.brewResult[key],key);
  assert.ok(decorated.plan.warnings.some(w=>w.includes('萃离用水提示')));assert.equal(decorated.plan.executionSource,'brew-profiles-authoritative');
});
test('local-reference path receives the same rendered plan warnings without mutating stages',async()=>{
  const local={...plan(),executionSource:'local-reference'};
  const coordinator=new BrewCalculationCoordinator(async()=>structuredClone(local));
  const result=await coordinator.calculate({input:{brew:{profileId:'three-pulse'}},localWaterRecord:fixture()});
  assert.equal(result.plan.executionSource,'local-reference');assert.deepEqual(result.plan.stages,local.stages);assert.ok(result.plan.warnings.some(w=>w.includes('单次加热')));
});
test('lower highest-heating temperature is flagged without assuming the higher temperature equals pour temperature',()=>{
  const record=fixture();record.water.heatingAssessment.history.heatingTemperatureC=85;
  const lower=withCuiLiWaterWarnings(plan(),record);assert.ok(lower.warnings.some(w=>w.includes('85°C低于方案注水93°C')));assert.deepEqual(lower.stages,plan().stages);
  const higher=withCuiLiWaterWarnings(plan(),fixture());assert.ok(!higher.warnings.some(w=>w.includes('低于方案注水')));
});
test('actual page renders plan warnings and passes local record outside the input object',()=>{
  const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/\(plan\.warnings\|\|\[\]\)\.map\(warning/);
  assert.match(app,/localWaterRecord:\$\('#brewWaterProfile'\)\?\.value === 'custom' \? state\.localWaterRecord : null/);
  assert.match(app,/id="cuiLiWaterJson"/);assert.match(app,/customWaterProfileForTransport\(customWater\)/);
});
test('actual local computeFallbackPlan adds advice without changing stages, totals or input hash',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('offline single-heating test: catalog network disabled');};
  try{
    const {computeFallbackPlan}=await import('../src/brew-engine.js');
    const input={bean:{roastCode:'RL-L1',processCode:'WA',varietyCode:'GE'},brew:{profileId:'one-pour',doseG:15,ratio:16,dripperCode:'V60'},water:{profileId:'custom',customProfile:{name:'既有水型',tds:85}},targets:{acidity:1.5,floral:2,fruity:2,sweetness:2,bitterness:2,astringency:2},environment:{ambientTemperatureC:25}};
    const baseline=await computeFallbackPlan(input),decorated=await computeFallbackPlan(input,{localWaterRecord:fixture()});
    assert.deepEqual(decorated.stages,baseline.stages);assert.deepEqual(decorated.totals,baseline.totals);assert.equal(decorated.inputHash,baseline.inputHash);
    assert.ok(decorated.warnings.some(w=>w.includes('萃离用水提示')));
  }finally{globalThis.fetch=originalFetch;}
});
