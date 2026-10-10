import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('src/recognition-paddle-ocr-fast.js','utf8').replace(/\r\n/g,'\n');
test('detection bounds the long edge and timeout retry reduces the pixel budget',()=>{
 const start=source.indexOf('function predictOptions('),end=source.indexOf('\nasync function predictWithRuntimeRecovery',start);
 for(const limit of [1600,2200]){
  const context={LIMIT_SIDE:limit,MAX_SIDE:2200};
  vm.runInNewContext(source.slice(start,end)+'\nglobalThis.options=predictOptions;',context);
  const primary=context.options(),retry=context.options({recovery:true});
  assert.equal(primary.textDetLimitType,'max');assert.equal(primary.textDetLimitSideLen,limit);
  assert.equal(retry.textDetLimitType,'max');assert.equal(retry.textDetLimitSideLen,1280);
  assert.ok(retry.textDetLimitSideLen<primary.textDetLimitSideLen);
 }
});
test('timeout recovery actually passes reduced options without changing the image',async()=>{
 const start=source.indexOf('async function predictWithRuntimeRecovery('),end=source.indexOf('\nasync function predict(images)',start);
 let calls=0;const inputs=[];const image={blob:new Blob(['original image'])};
 const context={WEBKIT:false,forceCompatibility:false,PREDICT_TIMEOUT_MS:45000,engineMode:'worker-simd-fastpath',
  ensureEngine:async()=>({predict:async(blob,options)=>{inputs.push({blob,options});if(++calls===1)throw Object.assign(Error('timeout'),{name:'RecognitionTimeoutError'});return 'recognized';}}),
  predictOptions:({recovery=false}={})=>({edge:recovery?1280:2200}),withTimeout:p=>p,
  detachEngine(){},releaseWorkerBundle(){},recordDiagnostic(){},diagnosticNow:()=>0,emit(){},delay:async()=>{},looksLikeCompatibilityFailure:()=>false};
 vm.runInNewContext(source.slice(start,end)+'\nglobalThis.recover=predictWithRuntimeRecovery;',context);
 assert.equal(await context.recover(image,0,1),'recognized');assert.equal(calls,2);
 assert.deepEqual(inputs.map(x=>x.options.edge),[2200,1280]);assert.ok(inputs.every(x=>x.blob===image.blob));
});
test('capture status does not mislabel every browser as Safari',()=>{
 const panel=fs.readFileSync('src/package-capture-controller.js','utf8');
 assert.ok(!panel.includes('Safari 按需低内存模式'));
});