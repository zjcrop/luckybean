import assert from 'node:assert/strict';

const endpoint='https://vaxwncdcuvbpvdbbketb.supabase.co/functions/v1/recognition-ai-v1';
const publicKey='sb_publishable_MsB0RFoxxf5zJbbT9PPBjQ_WP7GBMMn';
const controller=new AbortController();
const timer=setTimeout(()=>controller.abort(),25000);
try{
  const health=await fetch(endpoint,{headers:{accept:'application/json'},cache:'no-store',signal:controller.signal});
  const healthText=await health.text();
  let healthPayload=null; try{healthPayload=JSON.parse(healthText)}catch{}
  assert.equal(health.status,200,`recognition AI health HTTP ${health.status}: ${healthText.slice(0,300)}`);
  assert.equal(healthPayload?.service,'recognition-ai-v1');
  assert.equal(healthPayload?.contract,'ai-enrichment-result/1.0');
  assert.equal(healthPayload?.configured,true,'Zhipu provider secret is not configured for recognition-ai-v1');
  assert.ok(String(healthPayload?.model||'').length>0);

  const inference=await fetch(endpoint,{
    method:'POST', cache:'no-store', signal:controller.signal,
    headers:{accept:'application/json','content-type':'application/json',apikey:publicKey,'x-client-info':'luckybean-ci-recognition-ai/1.0','x-installation-id':'luckybean-ci-live-recognition-ai'},
    body:JSON.stringify({
      contract:'luckybean-recognition-ai/1.0', locale:'zh-CN', unresolvedFields:['country','process'],
      samples:[
        {evidenceRef:'ci:1',text:'ORIGIN ETHIOPIA SIDAMA'},
        {evidenceRef:'ci:2',text:'PROCESS NATURAL / 74110'}
      ]
    })
  });
  const inferenceText=await inference.text();
  let payload=null; try{payload=JSON.parse(inferenceText)}catch{}
  assert.equal(inference.status,200,`recognition AI inference HTTP ${inference.status}: ${inferenceText.slice(0,500)}`);
  assert.equal(payload?.ok,true,`recognition AI inference failed: ${inferenceText.slice(0,500)}`);
  assert.equal(payload?.result?.schemaVersion,'ai-enrichment-result/1.0');
  assert.equal(payload?.result?.policy?.authority,'advisory');
  assert.equal(payload?.result?.policy?.mayOverwriteFact,false);
  assert.ok(Array.isArray(payload?.result?.candidates));
  assert.ok(String(payload?.result?.inputFingerprint||'').startsWith('sha256:'));
  assert.ok(payload.result.candidates.every(candidate=>Array.isArray(candidate.evidenceRefs) && candidate.evidenceRefs.every(ref=>['ci:1','ci:2'].includes(ref))));
  console.log(`Recognition AI live inference passed with ${payload.model || healthPayload.model}; candidates=${payload.result.candidates.length}`);
} finally { clearTimeout(timer); }
