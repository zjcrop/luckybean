import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { runtimeAcceleration, detectionLimit, needsDetectionDetail, preferDetailedRecognition, OCR_PERFORMANCE_POLICY } from '../src/domain/recognition/recognition-performance-policy.js';
import { recognizeCoffeeBag } from '../src/recognition-bridge.js';
import { analyzeRecognitionDocument } from '../src/domain/recognition/recognition-pipeline.js';
import { recognitionDocumentFromText } from '../src/domain/recognition/recognition-document.js';

test('threads require isolation and shared memory; GPU never overrides constrained compatibility', () => {
  assert.deepEqual(runtimeAcceleration({cores:8}),{backend:'wasm',numThreads:1});
  assert.deepEqual(runtimeAcceleration({cores:8,isolated:true,sharedMemory:true}),{backend:'wasm',numThreads:4});
  assert.deepEqual(runtimeAcceleration({cores:4,isolated:true,sharedMemory:true,gpu:true}),{backend:'webgpu',numThreads:1});
  assert.deepEqual(runtimeAcceleration({webkit:true,gpu:true,isolated:true,sharedMemory:true,cores:8}),{backend:'wasm',numThreads:1});
  assert.deepEqual(runtimeAcceleration({lowMemory:true,gpu:true,isolated:true,sharedMemory:true,cores:8}),{backend:'wasm',numThreads:1});
});

test('adaptive detection preserves unknown geometry and uses full precision for small or weak text', () => {
  const image={width:1200,height:2200};
  assert.equal(detectionLimit({},2200),2200);
  assert.equal(detectionLimit(image,2200),1600);
  assert.equal(detectionLimit(image,2200,{detail:true}),2200);
  const item={text:'瑰夏水洗',score:.98,poly:[[0,0],[400,0],[400,60],[0,60]]};
  assert.equal(needsDetectionDetail([item],image,1600,2200),false);
  assert.equal(needsDetectionDetail([{...item,score:.6}],image,1600,2200),true);
  assert.equal(needsDetectionDetail([{...item,poly:[[0,0],[100,0],[100,20],[0,20]]}],image,1600,2200),true);
  const first=[{items:[item]}], worse=[{items:[{...item,text:'瑰',score:.6}]}];
  assert.equal(preferDetailedRecognition(first,worse),first);
});

test('incremental recognition reuses successes, respects roles, and invalidates changed blobs or locale', async () => {
  const previous=globalThis.LuckyBeanPaddleOCR;
  let calls=0;
  globalThis.LuckyBeanPaddleOCR={browserSafe:true,primaryIsolation:'module-worker',recognizeCoffeeBag:async ([image])=>{
    calls++;return {engine:'test-ocr',blocks:[{text:image.id,confidence:.99,imageId:image.id}]};
  }};
  try {
    const cache=new Map(), a={id:'a',role:'front',blob:new Blob(['a'])}, b={id:'b',role:'back',blob:new Blob(['b'])};
    const first=await recognizeCoffeeBag([a],{resultCache:cache});first.blocks[0].text='mutated';
    const second=await recognizeCoffeeBag([{...a,role:'date'},b],{resultCache:cache});
    assert.equal(calls,2);assert.equal(second.blocks[0].text,'a');assert.equal(second.blocks[0].imageRole,'date');
    assert.equal(second.batch.tasks[0].reused,true);
    await recognizeCoffeeBag([{...a,blob:new Blob(['changed'])}],{resultCache:cache});assert.equal(calls,3);
    await recognizeCoffeeBag([b],{resultCache:cache,locale:'en'});assert.equal(calls,4);
  } finally {globalThis.LuckyBeanPaddleOCR=previous;}
});

test('analysis cache does not share edited fields and invalidates corrected raw text', () => {
  const book=JSON.parse(fs.readFileSync('public/fallback-codebook.json','utf8'));
  const doc=recognitionDocumentFromText('国家：哥斯达黎加\n豆种：瑰夏\n处理法：水洗');
  const first=analyzeRecognitionDocument(doc,book);const expected=first.parsed.countryCode;
  first.parsed.countryCode='edited';
  assert.equal(analyzeRecognitionDocument(doc,book).parsed.countryCode,expected);
  doc.fullText='国家：巴拿马\n豆种：瑰夏\n处理法：水洗';
  assert.notEqual(analyzeRecognitionDocument(doc,book).parsed.countryCode,expected);
});

const providerSource=fs.readFileSync('src/recognition-paddle-ocr-fast.js','utf8').replace(/\r\n/g,'\n').replace(/^import .*;\n/m,'')
  .replaceAll('import.meta.url',"'https://example.test/src/recognition-paddle-ocr-fast.js'")
  .replace(/async function loadModule\(\) \{[\s\S]*?\n\}\nfunction supportsPreloadedBlobWorker/, 'async function loadModule() { return testSdk; }\nfunction supportsPreloadedBlobWorker');

function providerHarness({gpu=false,isolated=false,failGpu=false,failThreads=false}={}) {
  const calls=[],timers=new Map();let nextTimer=0;
  const context={Blob,URL,SharedArrayBuffer,performance,console,structuredClone,
    runtimeAcceleration,detectionLimit,needsDetectionDetail,preferDetailedRecognition,OCR_PERFORMANCE_POLICY,
    crossOriginIsolated:isolated,navigator:{userAgent:'Chrome',deviceMemory:8,hardwareConcurrency:8,
      ...(gpu?{gpu:{requestAdapter:async()=>({info:{vendor:'test-hardware'}})}}:{})},
    document:{hidden:false,documentElement:{dataset:{}},addEventListener(){}},
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},dispatchEvent(){},addEventListener(){},
    setTimeout(fn,ms){const id=++nextTimer;if(ms===0)queueMicrotask(fn);else timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
    testSdk:{PaddleOCR:{create:async options=>{calls.push(options.ortOptions);
      if(failThreads&&options.ortOptions.numThreads>1)throw Error('WebAssembly threading unavailable');
      return {dispose:async()=>{},predict:async()=>{if(failGpu&&options.ortOptions.backend==='webgpu')throw Error('GPU device lost');
        return [{items:[{text:'ETHIOPIA',score:.99,poly:[[0,0],[300,0],[300,60],[0,60]]}]}];}};
    }}}};
  vm.runInNewContext(providerSource,context);
  return {api:context.LuckyBeanPaddleOCR,calls,timers};
}

test('model survives capture completion and is released by the idle timer',async()=>{
  const h=providerHarness();const first=await h.api.beginSession();await h.api.endSession();
  assert.equal(await h.api.beginSession(),first);assert.equal(h.calls.length,1);await h.api.endSession();
  const idle=[...h.timers.values()].find(t=>t.ms===120000);assert.ok(idle);idle.fn();
  await Promise.resolve();await h.api.beginSession();assert.equal(h.calls.length,2);await h.api.dispose(true);
});

test('GPU inference failure retries the same model on CPU and remembers the fallback',async()=>{
  const h=providerHarness({gpu:true,failGpu:true});await h.api.beginSession();
  const result=await h.api.recognizeCoffeeBag([{id:'photo',blob:new Blob(['image'])}]);
  assert.equal(result.blocks[0].text,'ETHIOPIA');assert.deepEqual(h.calls.map(c=>c.backend),['webgpu','wasm']);
  assert.equal(h.api.acceleration.gpuDisabled,true);await h.api.dispose(true);
});

test('thread startup failure retains SIMD and falls back to one thread',async()=>{
  const h=providerHarness({isolated:true,failThreads:true});await h.api.beginSession();
  assert.deepEqual(h.calls.map(c=>c.numThreads),[4,1]);assert.equal(h.calls[1].simd,true);await h.api.dispose(true);
});
