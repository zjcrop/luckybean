import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : '@playwright/test');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const app=(await fs.readFile(path.join(root,'src/app.js'),'utf8')).replace(/\r\n/g,'\n');
const timerSource=app.slice(app.indexOf('function stopSpeech('),app.indexOf('function promptRecordConsumption('));
assert.ok(timerSource.includes('function startTimer()'));
const plan={
  analysisFingerprint:'sha256:timer-fixture-unchanged',
  totals:{targetTimeSec:80},
  stages:[
    {name:'第一段·闷蒸',durationSec:35,stageWaterG:45,cumulativeWaterG:45,temperatureC:90,method:'中心注水润湿',notice:'',advanceSpeech:''},
    {name:'第二段·主体萃取',durationSec:45,stageWaterG:120,cumulativeWaterG:165,temperatureC:93,method:'中心向外绕圈',notice:'',advanceSpeech:''}
  ]
};
const html=[
  '<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px system-ui;padding:20px}button{padding:12px;margin:4px}.timer-clock{font-size:48px}.timer-stage-grid{display:grid;grid-template-columns:repeat(4,1fr)}.timer-stage-grid span{display:block}</style></head><body><button id="start">开始计时</button><div id="overlayRoot"></div><script type="module">',
  "import {sanitizeExecutionText,sanitizeExecutionPlanText} from '/src/services/execution-text-sanitizer.js';",
  "import {formatStageLabel,formatStageSpeech,normalizePreparationSpeech,canAnnounceNextStage,canAnnounceStageCountdown} from '/src/domain/brew/timer-presentation.js';",
  "import {TIMER_STATUS,transitionBrewTimerState} from '/src/domain/brew/timer-state-machine.js';",
  'const initialPlan='+JSON.stringify(plan)+';',
  'const state={currentPlan:structuredClone(initialPlan),currentBrewInput:{brew:{serveMode:"hot"}},timer:{status:TIMER_STATUS.READY,stageIndex:0,remaining:0,paused:false},currentExecution:null};',
  'const spoken=[],calls=[],intervals=new Map();let nextInterval=1;',
  'globalThis.setInterval=callback=>{const id=nextInterval++;intervals.set(id,callback);return id;};globalThis.clearInterval=id=>intervals.delete(id);',
  'Object.defineProperty(globalThis,"speechSynthesis",{value:{cancel(){},speak:utterance=>spoken.push(utterance.text)}});',
  'const $=(selector,root=document)=>root.querySelector(selector),esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));',
  'const dialogHeader=(title,subtitle)=>"<h2>"+esc(title)+"</h2><p>"+esc(subtitle)+"</p>";',
  'const showOverlay=(content,{id}={})=>{$("#overlayRoot").innerHTML="<div data-overlay="+id+">"+content+"</div>";return $("#overlayRoot").firstChild;},closeOverlay=()=>$("#overlayRoot").replaceChildren();',
  'const switchPage=()=>{},toast=()=>{},promptRecordConsumption=reason=>calls.push({method:"record",reason});',
  'function transitionTimer(event){state.timer.status=transitionBrewTimerState(state.timer.status,event);}',
  'function timerStatusLabel(){return ({READY:"待开始",PREPARING:"准备中",STEP_ACTIVE:"本段计时中",STEP_WAITING:"已暂停",DRAINING:"等待滴滤",FINISHED:"冲煮完成"})[state.timer.status];}',
  'const nativeMode=new URL(location.href).searchParams.has("native");',
  'if(nativeMode){globalThis.__LUCKYBEAN_ANDROID__=true;globalThis.LuckyBeanNative=Object.fromEntries(["prepareBrewExecution","startBrewExecution","announceBrewPreparation","pauseBrewExecution","resumeBrewExecution","cancelBrewExecution"].map(method=>[method,(...args)=>calls.push({method,args})]));await import("/src/ui/brew-native-execution-controller.js");}',
  timerSource,
  '$("#start").onclick=startTimer;',
  'globalThis.timerHarness={state,spoken,calls,tick(n=1){for(let i=0;i<n;i++){const cb=intervals.get(state.timer.interval);if(cb)cb();}},reset(plan=initialPlan){clearInterval(state.timer.interval);closeOverlay();state.currentPlan=structuredClone(plan);state.timer={status:TIMER_STATUS.READY,stageIndex:0,remaining:0,paused:false};spoken.length=0;calls.length=0;},intervalCount:()=>intervals.size};',
  '</script></body></html>'
].join('\n');
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://local');
    if(url.pathname==='/__timer-harness'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});return res.end(html);}
    const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    const body=await fs.readFile(target);res.writeHead(200,{'content-type':target.endsWith('.js')?'text/javascript;charset=utf-8':'text/plain'});res.end(body);
  }catch{res.writeHead(404);res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const errors=[],checks=[];
const frame=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  const base='http://127.0.0.1:'+server.address().port+'/__timer-harness';
  await page.goto(base);await page.waitForFunction(()=>!!globalThis.timerHarness);
  await page.click('#start');
  const preparation=await page.locator('.brew-preparation-card').textContent();
  assert.match(preparation,/第1段，闷蒸/);assert.ok(!preparation.includes('第一段是第一段'));
  assert.equal(await page.evaluate(()=>timerHarness.intervalCount()),0);
  checks.push('preparation text and speech contain one stage ordinal; preparation does not start the clock');
  await page.click('#confirmBrewPreparedBtn');
  assert.equal(await page.locator('#timerStageName').textContent(),'第1段 · 闷蒸');
  assert.equal(await page.locator('#timerClock').textContent(),'00:35');
  assert.equal(await page.locator('.timer-countdown-label').textContent(),'本段剩余');
  assert.match(await page.locator('#timerNextCue').textContent(),/^下一段：第2段 · 主体萃取/);
  const webStart=await page.evaluate(()=>timerHarness.spoken.at(-1));
  assert.match(webStart,/^开始第1段，闷蒸，注水45克/);
  await page.click('#timerPauseBtn');assert.equal(await page.locator('#timerStatusLabel').textContent(),'已暂停');
  await page.evaluate(()=>timerHarness.tick(2));assert.equal(await page.locator('#timerClock').textContent(),'00:35');
  await page.click('#timerPauseBtn');assert.equal(await page.locator('#timerStatusLabel').textContent(),'本段计时中');
  assert.equal(await page.evaluate(()=>timerHarness.intervalCount()),1);
  checks.push('start, next label, remaining-time label and pause/resume use the actual timer DOM and state machine');
  await page.evaluate(()=>timerHarness.tick(35));
  assert.equal(await page.locator('#timerStageName').textContent(),'第2段 · 主体萃取');
  const webAdvance=await page.evaluate(()=>timerHarness.spoken.at(-1));
  assert.match(webAdvance,/^进入第2段，主体萃取/);
  const spoken=await page.evaluate(()=>timerHarness.spoken);
  assert.ok(spoken.some(s=>s.startsWith('下一段：第2段')));
  assert.deepEqual(spoken.filter(s=>['3','2','1'].includes(s)),['3','2','1']);
  await page.click('#timerPrevBtn');assert.equal(await page.locator('#timerStageName').textContent(),'第1段 · 闷蒸');
  assert.match(await page.evaluate(()=>timerHarness.spoken.at(-1)),/^切换到第1段，闷蒸/);
  assert.deepEqual(await page.evaluate(()=>timerHarness.state.currentPlan.stages),plan.stages);
  checks.push('automatic and manual transitions use array positions when stage.index is absent; stages remain unchanged');
  await page.click('#timerEndBtn');
  const shortPlan=structuredClone(plan);shortPlan.stages[0].durationSec=2;shortPlan.totals.targetTimeSec=47;
  await page.evaluate(plan=>timerHarness.reset(plan),shortPlan);
  await page.click('#start');await page.click('#confirmBrewPreparedBtn');
  await page.evaluate(()=>timerHarness.tick(2));
  assert.equal(await page.locator('#timerStageName').textContent(),'第2段 · 主体萃取');
  const shortSpoken=await page.evaluate(()=>timerHarness.spoken);
  assert.ok(!shortSpoken.some(s=>['3','2','1'].includes(s)||s.startsWith('下一段：')));
  checks.push('two-second web stage advances without stacked preparation or countdown speech');
  const nativePage=await browser.newPage();nativePage.on('pageerror',e=>errors.push(e.message));
  await nativePage.goto(base+'?native=1');await nativePage.waitForFunction(()=>!!globalThis.timerHarness);
  await nativePage.click('#start');await nativePage.click('#confirmBrewPreparedBtn');await frame(nativePage);
  let nativeCalls=await nativePage.evaluate(()=>timerHarness.calls);
  const started=JSON.parse(nativeCalls.find(c=>c.method==='startBrewExecution').args[0]);
  assert.equal(started.speech.events.find(e=>e.id==='stage-0').text,webStart);
  assert.equal(started.speech.events.find(e=>e.id==='stage-1').text,webAdvance);
  assert.equal(started.planFingerprint,plan.analysisFingerprint);
  await nativePage.click('#timerNextBtn');await frame(nativePage);
  nativeCalls=await nativePage.evaluate(()=>timerHarness.calls);
  const switched=JSON.parse(nativeCalls.filter(c=>c.method==='startBrewExecution').at(-1).args[0]);
  assert.match(switched.speech.events[0].text,/^切换到第2段，主体萃取/);
  const starts=nativeCalls.filter(c=>c.method==='startBrewExecution').length;
  await nativePage.click('#timerPauseBtn');await frame(nativePage);
  await nativePage.click('#timerPauseBtn');await frame(nativePage);
  nativeCalls=await nativePage.evaluate(()=>timerHarness.calls);
  assert.equal(nativeCalls.filter(c=>c.method==='pauseBrewExecution').length,1);
  assert.equal(nativeCalls.filter(c=>c.method==='resumeBrewExecution').length,1);
  assert.equal(nativeCalls.filter(c=>c.method==='startBrewExecution').length,starts);
  checks.push('actual Android bridge payload matches web speech and rebase position; pause/resume do not restart native execution');
  await nativePage.click('#timerEndBtn');await frame(nativePage);
  await nativePage.evaluate(plan=>timerHarness.reset(plan),shortPlan);
  await nativePage.click('#start');await nativePage.click('#confirmBrewPreparedBtn');await frame(nativePage);
  const shortNative=await nativePage.evaluate(()=>JSON.parse(timerHarness.calls.find(c=>c.method==='startBrewExecution').args[0]));
  assert.deepEqual(shortNative.speech.events.filter(e=>e.atMs===0).map(e=>e.id),['stage-0']);
  assert.ok(!shortNative.speech.events.some(e=>e.id==='prepare-stage-1'||e.id==='countdown-stage-1'));
  checks.push('two-second native stage has only its start event at zero, with no full three-second countdown');
  await page.click('#timerEndBtn');
  const legacyPlan=structuredClone(plan);
  legacyPlan.executionActions=[{id:'prepare',type:'prepare',phase:'before-timer',speech:'请在分享壶中加入100克冰块。第一段是第一段·闷蒸，注水45克，水温90度，用时35秒，中心注水润湿准备完成后开始计时。'}];
  await page.evaluate(plan=>timerHarness.reset(plan),legacyPlan);await page.click('#start');
  const legacyPreparation=await page.locator('.brew-preparation-card').textContent();
  assert.ok(!legacyPreparation.includes('第一段是第一段'));assert.match(legacyPreparation,/第1段，闷蒸/);assert.match(legacyPreparation,/100克冰块/);
  assert.ok(!(await page.evaluate(()=>timerHarness.spoken.at(-1))).includes('第一段是第一段'));
  checks.push('actual legacy server prepare action cannot bypass normalized preparation text or speech; ice instructions survive');
  assert.deepEqual(errors,[]);
  const result={passed:true,scope:'real timer functions, state machine, formatter and native controller in an isolated DOM harness; speech and Android bridge recorded, no auth or Android device playback',checks,preparation,webStart,webAdvance,shortNativeEvents:shortNative.speech.events,browser:'Microsoft Edge headless'};
  await fs.mkdir(path.join(root,'test-results'),{recursive:true});
  await fs.writeFile(path.join(root,'test-results/brew-timer-dialog.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
