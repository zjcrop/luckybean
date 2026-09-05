import assert from 'node:assert/strict';

const endpoint='https://vaxwncdcuvbpvdbbketb.supabase.co/functions/v1/recognition-ai-v1';
const controller=new AbortController();
const timer=setTimeout(()=>controller.abort(),10000);
try{
  const response=await fetch(endpoint,{headers:{accept:'application/json'},cache:'no-store',signal:controller.signal});
  const text=await response.text();
  let payload=null; try{payload=JSON.parse(text)}catch{}
  assert.equal(response.status,200,`recognition AI health HTTP ${response.status}: ${text.slice(0,300)}`);
  assert.equal(payload?.service,'recognition-ai-v1');
  assert.equal(payload?.contract,'ai-enrichment-result/1.0');
  assert.equal(payload?.configured,true,'Zhipu provider secret is not configured for recognition-ai-v1');
  assert.ok(String(payload?.model||'').length>0);
  console.log(`Recognition AI live contract ready with ${payload.model}`);
} finally { clearTimeout(timer); }
