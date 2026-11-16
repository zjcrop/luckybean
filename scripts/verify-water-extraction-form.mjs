import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'@playwright/test');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const app=(await fs.readFile(path.join(root,'src/app.js'),'utf8')).replace(/\r\n/g,'\n');
function sourceFunction(name){
  const match=new RegExp('^(?:async )?function '+name+'\\(','m').exec(app);
  if(!match)throw new Error('Missing function '+name);
  const rest=app.slice(match.index+match[0].length),end=/\n(?:async )?function /.exec(rest);
  if(!end)throw new Error('Missing end for '+name);
  return app.slice(match.index,match.index+match[0].length+end.index);
}
const fixture=JSON.parse(await fs.readFile(path.join(root,'test/fixtures/cuili-water-record.single-heating.json'),'utf8'));
const basePlan={beanId:'bean-1',analysisContract:'brew-analysis/2.1',engineVersion:'test/1.0',profileVersion:'fixture/1.0',executionSource:'brew-profiles-authoritative',analysisFingerprint:'sha256:water-form-unchanged',metadata:{fingerprint:'water-plan'},profile:{id:'three-pulse',label:'验证方案'},stages:[{index:1,name:'主体',stageWaterG:240,cumulativeWaterG:240,temperatureC:93,durationSec:120,flowGPerSec:2,method:'圆周注水',notice:'',advanceSpeech:''}],totals:{doseG:15,ratio:16,waterG:240,targetTimeSec:120},warnings:['原模型提示']};
basePlan.stages[0].name='第一段·主体';
basePlan.executionActions=[{id:'prepare',type:'prepare',phase:'before-timer',speech:'请准备好滤杯、滤纸、分享壶和热水。第一段是第一段·主体，注水240克，水温93度，用时120秒，圆周注水准备完成后开始计时。'}];
const html=[
  '<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px system-ui;padding:16px}button,input,select,textarea{font:inherit;padding:8px}label{display:block}details{padding:10px}.grid-2{display:grid;grid-template-columns:1fr 1fr}textarea{width:90%}</style></head><body><div id="brewHeadingBean"></div><div id="brewContent"></div><div id="overlayRoot"></div><script type="module">',
  "import {measurementPanelHtml,readBrewMeasurements,clearBrewMeasurementFields,measurementsForEngine,waterForEngine,measurementPreview,waterExtractionResultHtml} from '/src/ui/water-extraction-panel.js';",
  "import {parseCuiLiWaterRecord,describeCuiLiWaterRecord,withCuiLiWaterWarnings,customWaterProfileForTransport,CUILI_WATER_LOCAL_KEY,MAX_CUILI_WATER_JSON_BYTES} from '/src/domain/water/cuili-water-record.js';",
  "import {BrewCalculationCoordinator} from '/src/services/brew-calculation-coordinator.js';",
  "import {analyzeSourceWater} from '/src/domain/water/water-analysis.js';",
  "import {assessExtractionMeasurements} from '/src/domain/brew/extraction-assessment.js';",
  "import {sanitizeExecutionPlanText} from '/src/services/execution-text-sanitizer.js';",
  "import {listWaterProfiles} from '/src/water-profiles.js';",
  "import {validatePlan} from '/src/brew-engine-core.js';",
  "import {formatStageSpeech,normalizePreparationSpeech} from '/src/domain/brew/timer-presentation.js';",
  'const basePlan='+JSON.stringify(basePlan)+';',
  'const $=(id,root=document)=>root.querySelector(id),esc=value=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll(String.fromCharCode(34),"&quot;"),parseNumber=(v,d)=>String(v).trim()===""?d:Number(v),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),formatSeconds=s=>s+"秒";',
  'const flavorTargets={acidity:1.5,floral:2,fruity:2,sweetness:2,bitterness:2,astringency:2};',
  'const DEFAULT_SETTINGS={brew:{waterProfileId:"plain",customWater:{name:"我的水型",tds:85,tendency:{}},flavorTargets,ratio:16,doseG:15,doseMode:"manual",environment:{ambientTemperatureC:25},firstCoolingMode:"auto",tailCoolingMode:"auto"}};',
  'const state={settings:structuredClone(DEFAULT_SETTINGS),localWaterRecord:null,brewMeasurements:null,beans:[{id:"bean-1",name:"豆1",remainingWeight:100},{id:"bean-2",name:"豆2",remainingWeight:100}],selectedBeanId:"bean-1",brewSessions:[],currentPlan:null,currentBrewInput:null};',
  'let received=[],lastToast="";const toast=message=>{lastToast=message;},saveSettings=async()=>{},bindPlanActions=()=>{},bindControlStates=()=>{},planRemainingBeanDoses=()=>null,beanDisplayName=b=>b.name;',
  'const dripper={id:"dripper-1",type:"V60",name:"V60",material:"ceramic"},filter={id:"filter-1",type:"滤纸",brand:"测试"};',
  'const gearDrippers=()=>[dripper],gearFilters=()=>[filter],brewProfileSelection=()=>state.brewProfileOverride||"recommended",recommendedDripperForBrew=()=>dripper,selectedDripperItem=()=>dripper,selectedFilterItem=()=>filter,normalizeDripperMaterial=value=>value,resolvedSegmentCount=()=>3,selectedProfileReferenceDose=()=>15,resolvedDoseLabel=()=>"15g",coolingModeText=()=>"自动";',
  'const listBrewProfiles=()=>[{id:"recommended",label:"自动"},{id:"three-pulse",label:"三段"}],brewProfileCatalogStatus=()=>({available:true,profileCount:2,competitionProfileCount:0});',
  'const openDoseModeDialog=()=>{},openFlavorTargetDialog=()=>{},openBrewTuneDialog=()=>{},openBrewEnvironmentDialog=()=>{},openCoolingModeMenu=()=>{},openSensoryModeChooser=()=>{},sessionRecordHtml=()=>"",loadBrewSession=()=>{};',
  'const authoritativePlanReference=plan=>plan?.analysisFingerprint||"",dialogHeader=(title,subtitle)=>"<h2>"+esc(title)+"</h2><p>"+esc(subtitle)+"</p>";',
  'const showOverlay=content=>{$("#overlayRoot").innerHTML="<div>"+content+"</div>";return $("#overlayRoot").firstChild;},closeOverlay=()=>$("#overlayRoot").replaceChildren(),bindClose=()=>{};',
  'const brewCalculationCoordinator=new BrewCalculationCoordinator(async(_endpoint,input)=>{received.push(structuredClone(input));return {...structuredClone(basePlan),beanId:state.selectedBeanId,waterAnalysis:analyzeSourceWater({water:input.water,referenceProfile:input.water.customProfile||{}}),extractionAssessment:assessExtractionMeasurements({measurements:input.measurements,brew:input.brew})};});',
  ...['buildBrewInput','renderBrew','waterDirectionOptions','openCustomWaterDialog','generatePlan','planHtml','preparationSpeech'].map(sourceFunction),
  'renderBrew();globalThis.waterFormHarness={state,render:renderBrew,build:()=>buildBrewInput(state.beans.find(b=>b.id===state.selectedBeanId)),received:()=>received,lastToast:()=>lastToast};',
  '</script></body></html>'
].join('\n');
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://local');
    if(url.pathname==='/__water-form'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});return res.end(html);}
    if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
    const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    const body=await fs.readFile(target);res.writeHead(200,{'content-type':target.endsWith('.js')?'text/javascript;charset=utf-8':'text/plain'});res.end(body);
  }catch{res.writeHead(404);res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const errors=[],checks=[];
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',message=>{if(message.type()==='error')console.error('Water form console:',message.text());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/__water-form');
  await page.waitForFunction(()=>!!globalThis.waterFormHarness,null,{timeout:5000});
  let input=await page.evaluate(()=>waterFormHarness.build());
  assert.equal(input.water.tdsMgL,null);assert.deepEqual(input.measurements,{doseG:null,beverageTdsPct:null,beverageMassG:null});
  await page.selectOption('#brewWaterProfile','custom');await page.waitForSelector('#customWaterTds');await page.fill('#customWaterTds','0');await page.click('#saveCustomWaterBtn');
  input=await page.evaluate(()=>waterFormHarness.build());assert.equal(input.water.tdsMgL,null);assert.equal(input.water.customProfile.tds,0);
  await page.selectOption('#brewWaterProfile','custom');await page.waitForSelector('#customWaterTds');assert.equal(await page.inputValue('#customWaterTds'),'0');await page.click('#saveCustomWaterBtn');
  checks.push('actual form/buildBrewInput keeps unknown TDS null and reference TDS zero without fallback to 85');
  await page.locator('#brewMeasurementsPanel > summary').click();
  for(const [id,value]of [['sourceWaterTdsReading','0'],['measuredCoffeeDose','15'],['measuredBeverageMass','210'],['measuredBeverageTds','1.35']])await page.fill('#'+id,value);
  assert.match(await page.locator('#brewMeasurementsPreview').textContent(),/18\.90%/);
  await page.click('#generatePlanBtn');await page.waitForSelector('.water-extraction-result',{timeout:5000});
  const result=await page.evaluate(()=>({input:waterFormHarness.received().at(-1),plan:waterFormHarness.state.currentPlan}));
  assert.equal(result.input.water.tdsMgL,0);assert.ok(Math.abs(result.plan.extractionAssessment.extractionYieldPct-18.9)<1e-10);
  assert.match(await page.locator('.water-extraction-result').textContent(),/18\.90%/);
  const planPreparation=await page.locator('#planResult .brew-preparation-card').textContent();
  assert.ok(!planPreparation.includes('第一段是第一段'));assert.match(planPreparation,/第1段，主体/);
  assert.deepEqual(result.plan.stages,basePlan.stages);assert.equal(result.plan.analysisFingerprint,basePlan.analysisFingerprint);
  checks.push('15g/210g/1.35% previews and renders 18.90 through actual generatePlan/coordinator/planHtml');
  checks.push('actual planHtml preparation card normalizes the legacy server-generated action instead of displaying duplicate ordinals');
  await page.fill('#sourceWaterTdsReading','-1');assert.match(await page.locator('#brewMeasurementsPreview').textContent(),/范围/);
  const callsBefore=await page.evaluate(()=>waterFormHarness.received().length);await page.click('#generatePlanBtn');
  assert.equal(await page.evaluate(()=>waterFormHarness.state.currentPlan),null);assert.match(await page.locator('#planResult').textContent(),/范围/);
  assert.equal(await page.evaluate(()=>waterFormHarness.received().length),callsBefore);assert.equal(await page.locator('#generatePlanBtn').isEnabled(),true);
  checks.push('invalid input clears old result, shows field error and never reaches the calculation request');
  await page.selectOption('#brewBean','bean-2');assert.equal(await page.inputValue('#sourceWaterTdsReading'),'');assert.equal(await page.inputValue('#measuredCoffeeDose'),'');
  await page.locator('#brewMeasurementsPanel > summary').click();await page.fill('#sourceWaterTdsReading','25');await page.fill('#measuredCoffeeDose','15');
  await page.evaluate(()=>{waterFormHarness.state.selectedBeanId='bean-1';waterFormHarness.render();});
  assert.equal(await page.inputValue('#sourceWaterTdsReading'),'');assert.equal(await page.inputValue('#measuredCoffeeDose'),'');
  await page.locator('#brewMeasurementsPanel > summary').click();await page.fill('#sourceWaterTdsReading','25');await page.fill('#measuredCoffeeDose','15');
  await page.selectOption('#brewWaterProfile','plain');assert.equal(await page.inputValue('#sourceWaterTdsReading'),'');assert.equal(await page.inputValue('#measuredCoffeeDose'),'');
  assert.equal((await page.evaluate(()=>waterFormHarness.build())).water.tdsMgL,null);
  checks.push('bean dropdown, other bean-entry rendering and water-profile changes clear measurements instead of carrying them into another cup');
  await page.selectOption('#brewWaterProfile','custom');await page.locator('#overlayRoot details > summary').click();
  await page.fill('#cuiLiWaterJson',JSON.stringify(fixture));await page.click('#importCuiLiWaterBtn');await page.click('#saveCustomWaterBtn');
  input=await page.evaluate(()=>waterFormHarness.build());
  assert.equal(input.water.ionsMgL.Ca,fixture.water.calciumMgL);assert.equal(input.water.ionsMgL.Mg,fixture.water.magnesiumMgL);
  assert.equal(input.water.concentrationBasis,'pre-heating-calculated');assert.equal(input.water.tdsMgL,null);
  assert.ok(!JSON.stringify(input).includes('heatingAssessment'));assert.ok(!JSON.stringify(input).includes('heatedCalcium'));
  await page.click('#generatePlanBtn');await page.waitForSelector('.water-extraction-result');
  const imported=await page.evaluate(()=>({received:waterFormHarness.received().at(-1),plan:waterFormHarness.state.currentPlan}));
  assert.deepEqual(imported.received.water.ionsMgL,input.water.ionsMgL);assert.ok(!JSON.stringify(imported.received).includes('heatingAssessment'));
  assert.ok(imported.plan.warnings.some(w=>w.includes('观察到沉积')));assert.equal(imported.plan.waterAnalysis.postHeatIonsMgL,null);
  assert.deepEqual(imported.plan.stages,basePlan.stages);assert.equal(imported.plan.analysisFingerprint,basePlan.analysisFingerprint);
  assert.match(await page.locator('.water-extraction-result').textContent(),/热后实际浓度未知/);
  checks.push('CuiLi explicit pre-heat ions reach diagnostics; heat history remains local and heated-ion predictions remain unknown');
  assert.deepEqual(errors,[]);
  const report={passed:true,scope:'actual renderBrew, input bindings, buildBrewInput, custom-water dialog, generatePlan, coordinator and planHtml; authority transport and unrelated storage/gear adapters stubbed',checks,browser:'Microsoft Edge headless'};
  await fs.mkdir(path.join(root,'test-results'),{recursive:true});await fs.writeFile(path.join(root,'test-results/water-extraction-form.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
