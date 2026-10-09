import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fetchResource } from '../scripts/fetch-with-retry.mjs';
import { selectSuccessfulMainRun,verifyPagesReceipt } from '../scripts/verify-release-gates.mjs';

test('HTTP retry includes a stalled body, retries transient failures, and rejects access failures without retry',async()=>{
  let calls=0;
  const result=await fetchResource('https://example.test/data',{
    timeoutMs:15,sleep:async()=>{},fetchImpl:async()=>{
      calls++;
      if(calls===1)return {ok:true,text:()=>new Promise(()=>{})};
      if(calls===2)return new Response('',{status:503});
      return Response.json({ok:true});
    }
  });
  assert.deepEqual(result,{ok:true}); assert.equal(calls,3);
  calls=0;
  await assert.rejects(fetchResource('https://example.test/private',{
    sleep:async()=>{},fetchImpl:async()=>{calls++;return new Response('',{status:403});}
  }),/HTTP 403/);
  assert.equal(calls,1);
  await assert.rejects(fetchResource('https://example.test/always-stalled',{
    timeoutMs:10,attempts:2,sleep:async()=>{},fetchImpl:async()=>({ok:true,text:()=>new Promise(()=>{})})
  }),/deadline/);
});

test('release gate retains same-SHA success after cancellation but blocks a newer failure or running validation',()=>{
  const sourceSha='a'.repeat(40);
  const success={id:10,head_sha:sourceSha,head_branch:'main',event:'push',status:'completed',conclusion:'success'};
  assert.equal(selectSuccessfulMainRun([{...success,id:11,conclusion:'cancelled'},success],sourceSha),success);
  assert.equal(selectSuccessfulMainRun([{...success,id:11,conclusion:'failure'},success],sourceSha),null);
  assert.equal(selectSuccessfulMainRun([{...success,id:11,status:'in_progress',conclusion:null},success],sourceSha),null);
  assert.equal(selectSuccessfulMainRun([{...success,event:'pull_request'},{...success,head_sha:'b'.repeat(40)}],sourceSha),null);
  const receipt={source_sha:sourceSha,revision:'1.24P-main.9',verified:true,browser_smoke:true,same_sha_main_tests:true};
  verifyPagesReceipt(receipt,sourceSha,receipt.revision);
  assert.throws(()=>verifyPagesReceipt({...receipt,source_sha:'b'.repeat(40)},sourceSha,receipt.revision),/SHA/);
  assert.throws(()=>verifyPagesReceipt({...receipt,verified:'true'},sourceSha,receipt.revision),/verified/);
});

test('service worker caches an independent response body while the caller consumes the original, with cache failure isolated',async()=>{
  const source=fs.readFileSync('sw.js','utf8');
  const handlers={}; const tasks=[]; let cached='';
  let releaseOpen;
  const opened=new Promise(resolve=>{releaseOpen=resolve;});
  const context={URL,Request,Response,self:{location:{origin:'https://example.test'},addEventListener:(name,handler)=>handlers[name]=handler},
    fetch:async()=>new Response('complete OCR model payload'),caches:{open:()=>opened,match:async()=>null}};
  vm.runInNewContext(source,context);
  let result;
  handlers.fetch({request:new Request('https://example.test/model.tar'),respondWith:value=>result=value,waitUntil:value=>tasks.push(value)});
  const response=await result;
  assert.equal(await response.text(),'complete OCR model payload');
  assert.equal(tasks.length,1);
  releaseOpen({put:async(_request,copy)=>{cached=await copy.text();}});
  await Promise.all(tasks); assert.equal(cached,'complete OCR model payload');
  context.caches.open=async()=>{throw Error('quota exhausted');};
  handlers.fetch({request:new Request('https://example.test/worker.js'),respondWith:value=>result=value,waitUntil:value=>tasks.push(value)});
  assert.equal(await (await result).text(),'complete OCR model payload');
  await Promise.all(tasks);
});

test('production prediction recovery uses the same image once in compatibility mode and stops if the retry also times out',async()=>{
  const source=fs.readFileSync('src/recognition-paddle-ocr-fast.js','utf8').replace(/\r\n/g,'\n');
  const start=source.indexOf('async function predictWithRuntimeRecovery('),end=source.indexOf('\nasync function predict(images)',start);
  assert.ok(start>=0 && end>start);
  const timeout=Object.assign(new Error('timed out'),{name:'RecognitionTimeoutError'});
  const image={blob:new Blob(['same image'])};
  async function exercise(secondFails,sticky=false) {
    const predictions=[]; let engines=0; const events=[];
    const context={WEBKIT:false,forceCompatibility:sticky,PREDICT_TIMEOUT_MS:45000,engineMode:'worker-simd-fastpath',
      ensureEngine:async()=>{engines++;return {predict:(blob)=>{predictions.push(blob);return engines===1 || secondFails ? Promise.reject(timeout) : Promise.resolve('recognized');}};},
      predictOptions:()=>({}),withTimeout:promise=>promise,looksLikeCompatibilityFailure:()=>false,
      diagnosticNow:()=>0,recordDiagnostic:(phase)=>events.push(phase),detachEngine:()=>{},releaseWorkerBundle:()=>{},emit:()=>{},delay:async()=>{}};
    vm.runInNewContext(source.slice(start,end)+'\nglobalThis.runRecovery=predictWithRuntimeRecovery;',context);
    if(secondFails||sticky)await assert.rejects(context.runRecovery(image,0,1),/timed out/);
    else assert.equal(await context.runRecovery(image,0,1),'recognized');
    assert.equal(engines,sticky?1:2); assert.ok(predictions.every(blob=>blob===image.blob));
    assert.equal(events.includes('predict-runtime-recovery-success'),!secondFails&&!sticky);
  }
  await exercise(false); await exercise(true); await exercise(true,true);
});
