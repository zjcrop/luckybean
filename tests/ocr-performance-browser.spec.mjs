import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import net from 'node:net';

test.use({serviceWorkers:'block'});
const base='http://127.0.0.1:4173';
let isolatedBase,isolatedServer;
test.beforeAll(async()=>{
  const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  isolatedBase=`http://127.0.0.1:${port}`;
  isolatedServer=spawn(process.execPath,['scripts/ci-static-server.mjs',String(port)],{env:{...process.env,LUCKYBEAN_TEST_COI:'1'},stdio:'ignore',windowsHide:true});
  for(let attempt=0;attempt<30;attempt++){try{const r=await fetch(`${isolatedBase}/release.json`);if(r.ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));}
  throw Error('Isolated OCR test server did not start');
});
test.afterAll(()=>{isolatedServer?.kill();});

async function loadProvider(page,{isolated=false,baseline=false}={}) {
  if(isolated)await page.addInitScript(()=>{
    Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});
    Object.defineProperty(navigator,'deviceMemory',{get:()=>8});
    Object.defineProperty(navigator,'gpu',{get:()=>undefined});
  });
  if(baseline){const source=execFileSync('git',['show','b925f4ea78b4f16abe8d62119e629dfe61236acf:src/recognition-paddle-ocr-fast.js'],{encoding:'utf8'});
    await page.route(/\/src\/recognition-paddle-ocr-fast\.js(?:\?.*)?$/,route=>route.fulfill({body:source,contentType:'text/javascript'}));}
  await page.addInitScript(()=>localStorage.setItem('luckybean.onboarding.v2',JSON.stringify({stage:'existing-user'})));
  await page.goto(`${isolated?isolatedBase:base}/`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(globalThis.LuckyBeanPaddleOCR));
}

test('isolated browser actually runs OCR with the selected multi-thread runtime',async({page})=>{
  test.setTimeout(120000);await loadProvider(page,{isolated:true});
  const result=await page.evaluate(async()=>{const diagnostics=[];globalThis.__LUCKYBEAN_RECOGNITION_DIAGNOSTICS__={record(entry){diagnostics.push(entry);}};
    const api=globalThis.LuckyBeanPaddleOCR;const canvas=document.createElement('canvas');canvas.width=900;canvas.height=300;
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,300);ctx.fillStyle='black';ctx.font='bold 62px Arial';ctx.fillText('ETHIOPIA WASHED',25,150);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));await api.beginSession();
    const result=await api.recognizeCoffeeBag([{id:'threaded',blob,width:900,height:300}]);const acceleration=api.acceleration;
    await api.endSession();await api.dispose(true);return {isolated:crossOriginIsolated,acceleration,text:result.fullText,diagnostics};});
  console.log('THREAD_OCR_VALIDATION',JSON.stringify(result));
  expect(result.isolated).toBe(true);expect(result.acceleration.numThreads).toBeGreaterThan(1);expect(result.text).toMatch(/ETHIOPIA|WASHED/i);
});

const photos=JSON.parse(process.env.LUCKYBEAN_LOCAL_OCR_PHOTOS || '[]');
for(let index=0;index<photos.length;index++)test(`private photo ${index+1}: original and optimized OCR`,async({browser})=>{
  test.setTimeout(240000);const results=[];
  for(const baseline of [true,false]){
    const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();
    await page.route(`${base}/__private_photo.jpg`,route=>route.fulfill({body:fs.readFileSync(photos[index]),contentType:'image/jpeg'}));
    await loadProvider(page,{baseline});
    results.push(await page.evaluate(async()=>{const api=globalThis.LuckyBeanPaddleOCR;const blob=await fetch('/__private_photo.jpg').then(r=>r.blob());
      const bitmap=await createImageBitmap(blob);const image={id:'private-photo',blob,width:bitmap.width,height:bitmap.height};bitmap.close();
      const begin=performance.now();await api.beginSession();const first=await api.recognizeCoffeeBag([image]);const coldMs=performance.now()-begin;
      await api.endSession();const next=performance.now();await api.beginSession();const repeated=await api.recognizeCoffeeBag([image]);const nextBagMs=performance.now()-next;
      const acceleration=api.acceleration || {backend:'wasm',numThreads:1};await api.endSession();await api.dispose(true);
      const {createRecognitionDocument}=await import('/src/domain/recognition/recognition-document.js');
      const {analyzeRecognitionDocument}=await import('/src/domain/recognition/recognition-pipeline.js');
      const {classifyRecognitionDates}=await import('/src/domain/recognition/recognition-date-classifier.js');
      const book=await fetch('/public/fallback-codebook.json').then(r=>r.json());
      const doc=createRecognitionDocument({images:[{id:image.id,role:'front'}],blocks:first.blocks,engine:first.engine,fullText:first.fullText});
      const firstAnalysis=performance.now();const analysis=analyzeRecognitionDocument(doc,book);const analysisMs=performance.now()-firstAnalysis;
      const reuseAnalysis=performance.now();analyzeRecognitionDocument(doc,book);const cachedAnalysisMs=performance.now()-reuseAnalysis;
      const fields={country:analysis.parsed.countryCode,variety:analysis.parsed.varietyCode,process:analysis.parsed.processCode,
        weight:analysis.parsed.initialWeight,roastDate:classifyRecognitionDates(doc).roastDate};
      return {coldMs,nextBagMs,text:first.fullText,repeatText:repeated.fullText,acceleration,fields,analysisMs,cachedAnalysisMs};}));
    await context.close();
  }
  console.log('PRIVATE_OCR_COMPARISON',JSON.stringify({index:index+1,baseline:results[0],optimized:results[1]}));
  const important=index===0?['巴拿马','瑰夏','水洗','15']:['ETHIOPIA','Washed','Wolisho','Dega','1900','2000'];
  for(const word of important){if(results[0].text.toLowerCase().includes(word.toLowerCase()))expect(results[1].text.toLowerCase()).toContain(word.toLowerCase());}
  expect(results[1].text.length).toBeGreaterThan(0);
  expect(results[1].fields.country).toBe(results[0].fields.country);
  expect(results[1].fields.process).toBe(results[0].fields.process);
  expect(results[1].fields.weight).toBe(results[0].fields.weight);
  if(index===0)expect(results[1].fields.roastDate).toBe('2026-09-20');
});
