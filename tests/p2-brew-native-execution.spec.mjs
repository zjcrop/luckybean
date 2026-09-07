import { test, expect } from '@playwright/test';

const BASE_URL='http://127.0.0.1:4173';

const PLAN={
  generatedAt:'2026-09-07T00:00:00.000Z',
  stages:[
    {name:'闷蒸',durationSec:35,stageWaterG:45,temperatureC:90,method:'中心注水润湿'},
    {name:'主萃',durationSec:45,stageWaterG:120,temperatureC:93,method:'中心向外绕圈'},
    {name:'尾段',durationSec:40,stageWaterG:75,temperatureC:91,method:'快速收束'}
  ],
  executionActions:[
    {id:'ice-mid',phase:'timed',type:'add-ice',atSec:70,amountG:50,speech:'加入50克冰块'}
  ]
};

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    globalThis.__LUCKYBEAN_ANDROID__=true;
    globalThis.__nativeCalls=[];
    const save=(method,...args)=>globalThis.__nativeCalls.push({method,args});
    globalThis.LuckyBeanNative={
      prepareBrewExecution(payload){save('prepareBrewExecution',payload);},
      startBrewExecution(payload){save('startBrewExecution',payload);},
      announceBrewPreparation(text){save('announceBrewPreparation',text);},
      pauseBrewExecution(){save('pauseBrewExecution');},
      resumeBrewExecution(){save('resumeBrewExecution');},
      cancelBrewExecution(){save('cancelBrewExecution');},
      setBrewScreenAwake(value){save('setBrewScreenAwake',value);}
    };
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/,route=>route.abort('failed'));
  await page.goto(`${BASE_URL}/?p2-native-brew=1`,{waitUntil:'domcontentloaded'});
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({timeout:15000});
  await page.waitForFunction(()=>Boolean(globalThis.LuckyBeanNativeBrewExecution),null,{timeout:15000});
});

test('preparation and timer transition wire the authoritative plan into Android BrewTimerService bridge',async({page})=>{
  const result=await page.evaluate(async plan=>{
    globalThis.__nativeCalls.length=0;
    document.dispatchEvent(new CustomEvent('luckybean:brew-preparation',{detail:{plan,speech:'准备器具并预热滤杯'}}));
    await new Promise(resolve=>requestAnimationFrame(resolve));
    document.querySelector('#overlayRoot').innerHTML='<div data-overlay="timer"><span id="timerStageCounter">1/3</span></div>';
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return globalThis.__nativeCalls.map(call=>({method:call.method,args:call.args}));
  },PLAN);

  expect(result.some(call=>call.method==='announceBrewPreparation'&&call.args[0]==='准备器具并预热滤杯')).toBe(true);
  const prepared=result.find(call=>call.method==='prepareBrewExecution');
  const started=result.find(call=>call.method==='startBrewExecution');
  expect(prepared).toBeTruthy();
  expect(started).toBeTruthy();
  const payload=JSON.parse(started.args[0]);
  expect(payload.contract).toBe('luckybean-native-brew-execution/1.0');
  expect(payload.speech.totalMs).toBe(120000);
  expect(payload.speech.events.some(event=>event.text.includes('加入50克冰块')&&event.atMs===70000)).toBe(true);
  expect(payload.speech.events.filter(event=>event.id.startsWith('stage-'))).toHaveLength(3);
});

test('rebasing from a manually selected stage removes elapsed cues and shifts remaining timed actions',async({page})=>{
  const payload=await page.evaluate(plan=>JSON.parse(globalThis.LuckyBeanNativeBrewExecution.buildPayload(plan,{stageIndex:1})),PLAN);
  expect(payload.stages).toHaveLength(2);
  expect(payload.stages[0].startMs).toBe(0);
  expect(payload.speech.totalMs).toBe(85000);
  const ice=payload.speech.events.find(event=>event.id==='action-ice-mid');
  expect(ice.atMs).toBe(35000);
  expect(payload.speech.events.some(event=>event.id==='stage-0')).toBe(false);
  expect(payload.speech.events.some(event=>event.id==='stage-1'&&event.atMs===0)).toBe(true);
});