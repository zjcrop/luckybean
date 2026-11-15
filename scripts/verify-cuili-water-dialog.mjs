import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'@playwright/test');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const app=await fs.readFile(path.join(root,'src/app.js'),'utf8');
function sourceFunction(name){const match=new RegExp('^(?:async )?function '+name+'\\(','m').exec(app);if(!match)throw new Error('Missing function '+name);const rest=app.slice(match.index+match[0].length),end=/\n(?:async )?function /.exec(rest);if(!end)throw new Error('Missing end for '+name);return app.slice(match.index,match.index+match[0].length+end.index);}
const dialog=sourceFunction('openCustomWaterDialog','openFlavorTargetDialog');
const renderer=sourceFunction('planHtml','openXbloomEditor');
const fixture=await fs.readFile(path.join(root,'test/fixtures/cuili-water-record.single-heating.json'),'utf8');
const basicPlan={executionSource:'brew-profiles-authoritative',analysisFingerprint:'sha256:unchanged-browser',profile:{id:'three-pulse',label:'原三段'},stages:[{index:1,name:'原阶段',stageWaterG:240,cumulativeWaterG:240,temperatureC:93,durationSec:120,flowGPerSec:2,method:'原注水方法'}],totals:{doseG:15,waterG:240,targetTimeSec:120},warnings:['原模型提示']};
const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px system-ui;padding:16px}input,textarea,select,button{font:inherit;padding:6px;margin:4px}label{display:block}textarea{width:90%}.grid-2{display:grid;grid-template-columns:1fr 1fr}.status-warn{color:#855000}.status-bad{color:#a00000}</style></head><body><button id="open">打开水型</button><div id="overlayRoot"></div><div id="planResult"></div><script type="module">
import {parseCuiLiWaterRecord,describeCuiLiWaterRecord,withCuiLiWaterWarnings,customWaterProfileForTransport,CUILI_WATER_LOCAL_KEY,MAX_CUILI_WATER_JSON_BYTES} from '/src/domain/water/cuili-water-record.js';
import {BrewCalculationCoordinator} from '/src/services/brew-calculation-coordinator.js';
import {sanitizeExecutionPlanText} from '/src/services/execution-text-sanitizer.js';
import {waterExtractionResultHtml} from '/src/ui/water-extraction-panel.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.querySelector(id),parseNumber=(v,d)=>v.trim()===''?d:Number(v),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),formatSeconds=s=>s+'秒';
const DEFAULT_SETTINGS={brew:{customWater:{name:'我的水型',tds:85,tendency:{}}}};
const state={settings:structuredClone(DEFAULT_SETTINGS),localWaterRecord:null,currentPlan:${JSON.stringify(basicPlan)},currentBrewInput:{brew:{serveMode:'hot'}}};
const dialogHeader=(title,subtitle)=>'<h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p>';
const showOverlay=content=>{document.querySelector('#overlayRoot').innerHTML='<div>'+content+'</div>';return document.querySelector('#overlayRoot').firstChild;};
const bindClose=()=>{},closeOverlay=()=>document.querySelector('#overlayRoot').replaceChildren(),saveSettings=async()=>{},toast=message=>{globalThis.lastToast=message;},waterDirectionOptions=value=>[-2,-1,0,1,2].map(n=>'<option value="'+n+'"'+(n===Number(value)?' selected':'')+'>'+n+'</option>').join('');
const authoritativePlanReference=plan=>plan.analysisFingerprint||'';
function renderBrew(){document.querySelector('#planResult').innerHTML=planHtml(state.currentPlan);}
${renderer}
${dialog}
document.querySelector('#open').onclick=openCustomWaterDialog;renderBrew();
globalThis.cuiLiHarness={state,generate:async()=>{const input={brew:{profileId:'three-pulse'},water:{profileId:'custom',customProfile:customWaterProfileForTransport(state.settings.brew.customWater)}};let received;const coordinator=new BrewCalculationCoordinator(async(_endpoint,value)=>{received=structuredClone(value);return ${JSON.stringify(basicPlan)};});const result=await coordinator.calculate({input,localWaterRecord:state.localWaterRecord});state.currentPlan=result.plan;renderBrew();return {received,plan:result.plan};},key:CUILI_WATER_LOCAL_KEY};
</script></body></html>`;
const server=http.createServer(async(req,res)=>{
  try{if(req.url==='/__cuili-harness'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});return res.end(html);}
    const target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    const body=await fs.readFile(target);res.writeHead(200,{'content-type':target.endsWith('.js')?'text/javascript;charset=utf-8':target.endsWith('.json')?'application/json;charset=utf-8':'text/plain'});res.end(body);
  }catch{res.writeHead(404);res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  const executable=process.env.CUILI_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser=await chromium.launch({headless:true,executablePath:executable});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/__cuili-harness`);await page.waitForFunction(()=>!!globalThis.cuiLiHarness);
  await page.click('#open');await page.click('details > summary');await page.fill('#cuiLiWaterJson',fixture);await page.click('#importCuiLiWaterBtn');
  assert.match(await page.locator('#cuiLiWaterStatus').textContent(),/待点击确定保存/);await page.click('#saveCustomWaterBtn');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem(cuiLiHarness.key)));assert.equal(saved.water.heatingAssessment.scenario,'single-heating');
  assert.match(await page.locator('#planResult').textContent(),/观察到沉积/);assert.match(await page.locator('#planResult').textContent(),/5%蒸发/);
  const generated=await page.evaluate(()=>cuiLiHarness.generate());assert.deepEqual(generated.plan.stages,basicPlan.stages);assert.equal(generated.plan.analysisFingerprint,basicPlan.analysisFingerprint);assert.ok(!JSON.stringify(generated.received).includes('heatingAssessment'));
  await page.click('#open');await page.click('details > summary');await page.click('#clearCuiLiWaterBtn');await page.click('#saveCustomWaterBtn');
  assert.ok(!(await page.locator('#planResult').textContent()).includes('观察到沉积'));assert.equal(await page.evaluate(()=>localStorage.getItem(cuiLiHarness.key)),null);
  await page.click('#open');await page.click('details > summary');await page.setInputFiles('#cuiLiWaterFile',{name:'cuili-export.json',mimeType:'application/json',buffer:Buffer.from(fixture)});
  await page.waitForFunction(()=>document.querySelector('#cuiLiWaterStatus').textContent.includes('待点击确定保存'));await page.click('#saveCustomWaterBtn');assert.match(await page.locator('#planResult').textContent(),/单次加热/);
  await page.click('#open');await page.click('details > summary');await page.fill('#cuiLiWaterJson','{"water":{"recipeVolumeL":"5"}}');await page.click('#importCuiLiWaterBtn');assert.match(await page.locator('#cuiLiWaterStatus').textContent(),/未导入/);
  assert.deepEqual(errors,[]);
  const result={passed:true,scope:'isolated browser harness using actual openCustomWaterDialog and planHtml source; auth and application storage adapters stubbed',checks:['paste import','file import','strict invalid import feedback','confirm persists localStorage','existing-plan warnings update on import and removal','actual planHtml renders warning','authoritative coordinator request excludes local fields','stages and fingerprint unchanged'],browser:'Microsoft Edge headless'};
  await fs.mkdir(path.join(root,'test-results'),{recursive:true});await fs.writeFile(path.join(root,'test-results/cuili-water-dialog.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
