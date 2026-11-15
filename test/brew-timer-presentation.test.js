import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { formatStageLabel, formatStageSpeech, normalizePreparationSpeech, canAnnounceNextStage, canAnnounceStageCountdown } from '../src/domain/brew/timer-presentation.js';
import { sanitizeExecutionPlanText } from '../src/services/execution-text-sanitizer.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const native = fs.readFileSync(new URL('../src/ui/brew-native-execution-controller.js', import.meta.url), 'utf8');
const sourceFunction = (name, next) => app.slice(app.indexOf('function '+name+'('), app.indexOf('function '+next+'('));
const formatters = { formatStageLabel, formatStageSpeech, normalizePreparationSpeech, canAnnounceNextStage, canAnnounceStageCountdown };
const fixture = () => ({
  analysisFingerprint:'timer-fingerprint-unchanged',
  totals:{ targetTimeSec:80 },
  stages:[
    { name:'第一段·闷蒸', durationSec:35, stageWaterG:45, cumulativeWaterG:45, temperatureC:90, method:'中心注水润湿' },
    { name:'第二段·主体萃取', durationSec:45, stageWaterG:120, cumulativeWaterG:165, temperatureC:93, method:'中心向外绕圈' }
  ]
});
function nativePayload(plan, options = {}) {
  const source = native.slice(native.indexOf('function prefixDurationSec('), native.indexOf('function callNative(')).replace('export function ', 'function ');
  return JSON.parse(vm.runInNewContext(source+';buildNativeBrewExecutionPayload(plan, options)', { ...formatters, plan, options }));
}
function appHarness(plan) {
  const spoken = [];
  const state = { currentPlan:plan, timer:{ status:'STEP_ACTIVE', stageIndex:0, remaining:plan.stages[0].durationSec, actionCues:new Set() } };
  let tick;
  const context = vm.createContext({
    ...formatters, sanitizeExecutionPlanText, state, crypto:{randomUUID:()=> 'timer-test'},
    TIMER_STATUS:{ STEP_ACTIVE:'STEP_ACTIVE' }, transitionTimer(){}, renderTimerDialog(){}, renderTimerValues(){},
    speak:text=>spoken.push(text), $:()=>null, clearInterval(){}, setInterval:callback=>{tick=callback;return 1;}
  });
  for (const [name,next] of [['preparationSpeech','beginTimedBrew'],['beginTimedBrew','startTimer'],['startTimerInterval','renderTimerDialog'],['advanceTimerStage','moveTimerStage'],['moveTimerStage','promptRecordConsumption']]) vm.runInContext(sourceFunction(name,next), context);
  return { spoken, state, run:code=>vm.runInContext(code, context), tick:()=>tick() };
}

for (const [name, expected] of [
  ['第一段·闷蒸','第1段 · 闷蒸'], ['第 ９ 段：主体','第1段 · 主体'],
  ['第一段 · 第一段·闷蒸','第1段 · 闷蒸'], ['闷蒸','第1段 · 闷蒸'],
  ['第一段','第1段'], ['', '第1段'], ['保留第一段风味','第1段 · 保留第一段风味'],
  ['第一段，闷蒸','第1段 · 闷蒸'], ['第一段,闷蒸','第1段 · 闷蒸'],
  ['第一段（闷蒸）','第1段 · （闷蒸）'], ['第一段(闷蒸)','第1段 · (闷蒸)'],
  ['后半段','第1段 · 后半段'], ['闷蒸（第一段）','第1段 · 闷蒸（第一段）']
]) test('stage label: '+JSON.stringify(name), () => assert.equal(formatStageLabel({name,index:99}, 0), expected));

test('preparation, start, automatic and manual transitions use array positions exactly once', () => {
  const plan = fixture(), original = structuredClone(plan), h = appHarness(plan);
  assert.match(h.run('preparationSpeech(state.currentPlan)'), /第1段，闷蒸，注水45克，水温90度，用时35秒/);
  h.run('beginTimedBrew(); moveTimerStage(1,true); moveTimerStage(-1,false);');
  assert.equal(h.spoken[0], '开始第1段，闷蒸，注水45克，水温90度，中心注水润湿');
  assert.equal(h.spoken[1], '进入第2段，主体萃取，注水120克，水温93度，中心向外绕圈');
  assert.equal(h.spoken[2], '切换到第1段，闷蒸，注水45克，水温90度，中心注水润湿');
  assert.deepEqual(plan, original);
});
test('explicit preparation instructions remain intact', () => {
  const plan=fixture(); plan.executionActions=[{type:'prepare',speech:'先在分享壶内加入冰块。'}];
  assert.equal(appHarness(plan).run('preparationSpeech(state.currentPlan)'), '先在分享壶内加入冰块。');
});
test('actual server-generated preparation fragment is normalized without losing ice or equipment instructions', () => {
  const plan=fixture(), first=plan.stages[0];
  plan.executionActions=[{id:'prepare',type:'prepare',phase:'before-timer',requiresConfirmation:true,speech:'请在分享壶中加入100克冰块。第一段是'+first.name+'，注水45克，水温90度，用时35秒，中心注水润湿准备完成后开始计时。'}];
  const output=appHarness(plan).run('preparationSpeech(state.currentPlan)');
  assert.equal(output,'请在分享壶中加入100克冰块。第1段，闷蒸，注水45克，水温90度，用时35秒，中心注水润湿准备完成后开始计时。');
});
test('stage.speech cannot bypass the common timer formatter',()=>{
  const plan=fixture();plan.stages[0].speech='第一段是第一段·旧播报';
  const h=appHarness(plan);h.run('beginTimedBrew()');
  assert.ok(!h.spoken[0].includes('旧播报'));
  assert.equal(nativePayload(plan).speech.events.find(e=>e.id==='stage-0').text,h.spoken[0]);
});
test('missing measurements are not spoken as zero or NaN', () => {
  assert.equal(formatStageSpeech({name:'闷蒸',stageWaterG:null,temperatureC:undefined},0), '第1段，闷蒸');
});
test('native and web use identical start and advance speech, including notices', () => {
  const plan=fixture(); plan.stages[1].notice='注意液位。';
  const h=appHarness(plan); h.run('beginTimedBrew(); moveTimerStage(1,true)');
  const payload=nativePayload(plan);
  assert.equal(payload.speech.events.find(e=>e.id==='stage-0').text, h.spoken[0]);
  assert.equal(payload.speech.events.find(e=>e.id==='stage-1').text, h.spoken[1]);
});
test('two-second stages do not stack preparation or a full countdown at time zero', () => {
  const plan=fixture(); plan.stages[0].durationSec=2;
  const payload=nativePayload(plan);
  assert.deepEqual(payload.speech.events.filter(e=>e.atMs===0).map(e=>e.id), ['stage-0']);
  assert.ok(!payload.speech.events.some(e=>e.id==='prepare-stage-1'||e.id==='countdown-stage-1'));
  assert.equal(payload.speech.events.find(e=>e.id==='stage-1').atMs,2000);
  const h=appHarness(plan); h.run('beginTimedBrew()'); h.tick(); h.tick();
  assert.equal(h.spoken.length,2);
  assert.match(h.spoken[1],/^进入第2段/);
});
test('normal countdown and next-stage speech stay inside the preceding stage', () => {
  const plan=fixture(), payload=nativePayload(plan);
  assert.equal(payload.speech.events.find(e=>e.id==='prepare-stage-1').atMs,27000);
  assert.equal(payload.speech.events.find(e=>e.id==='countdown-stage-1').atMs,31800);
  const h=appHarness(plan); h.run('beginTimedBrew()');
  for(let i=0;i<35;i++) h.tick();
  assert.match(h.spoken[1],/^下一段：第2段，主体萃取/);
  assert.deepEqual(h.spoken.slice(2,5), ['3','2','1']);
  assert.match(h.spoken[5],/^进入第2段/);
});
test('rebasing preserves original stage positions and fingerprints without elapsed cues', () => {
  const plan=fixture(), original=structuredClone(plan);
  plan.executionActions=[{id:'early',type:'add-ice',phase:'timed',atSec:20,speech:'加冰'}];
  const payload=nativePayload(plan,{stageIndex:1,startCue:'switch'});
  assert.equal(payload.stages[0].name,'第2段 · 主体萃取');
  assert.equal(payload.speech.events[0].text,'切换到第2段，主体萃取，注水120克，水温93度，中心向外绕圈');
  assert.ok(!payload.speech.events.some(e=>e.id.startsWith('action-early')));
  assert.equal(payload.planFingerprint,original.analysisFingerprint);
  assert.deepEqual(plan.stages,original.stages);
});
