import assert from 'node:assert/strict';

const endpoint='https://vaxwncdcuvbpvdbbketb.supabase.co/functions/v1/recognition-ai-v1';
const publicKey='sb_publishable_MsB0RFoxxf5zJbbT9PPBjQ_WP7GBMMn';

async function fetchWithTimeout(url,options={},timeoutMs=20000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...options,signal:controller.signal});}
  finally{clearTimeout(timer);}
}

async function structureRequest(structureSamples,attempt){
  const response=await fetchWithTimeout(endpoint,{
    method:'POST',cache:'no-store',
    headers:{accept:'application/json','content-type':'application/json',apikey:publicKey,'x-client-info':'luckybean-ci-recognition-ai/1.1','x-installation-id':`luckybean-ci-live-recognition-structure-${attempt}`},
    body:JSON.stringify({
      contract:'luckybean-recognition-ai/1.1',task:'structure',locale:'zh-CN',samples:structureSamples,
      hypothesis:{
        schemaVersion:'recognition-record-hypothesis/1.0',recommendedRecordCount:2,confidence:0.86,ambiguous:true,
        hypotheses:[{recordCount:2,probability:0.86},{recordCount:1,probability:0.14}],
        evidence:[{source:'entry-headings',recordCount:2,authority:'text-structure'}],
        geometry:{method:'none',candidates:[]}
      }
    })
  },22000);
  const text=await response.text();
  let payload=null;try{payload=JSON.parse(text)}catch{}
  return{response,text,payload};
}

const health=await fetchWithTimeout(endpoint,{headers:{accept:'application/json'},cache:'no-store'},10000);
const healthText=await health.text();
let healthPayload=null;try{healthPayload=JSON.parse(healthText)}catch{}
assert.equal(health.status,200,`recognition AI health HTTP ${health.status}: ${healthText.slice(0,300)}`);
assert.equal(healthPayload?.service,'recognition-ai-v1');
assert.equal(healthPayload?.contract,'ai-enrichment-result/1.0','legacy review contract must remain the default health contract');
assert.equal(healthPayload?.contracts?.review,'ai-enrichment-result/1.0');
assert.equal(healthPayload?.contracts?.structure,'ai-structure-result/1.0');
assert.equal(healthPayload?.configured,true,'Zhipu provider secret is not configured for recognition-ai-v1');
assert.ok(String(healthPayload?.model||'').length>0);

const inference=await fetchWithTimeout(endpoint,{
  method:'POST',cache:'no-store',
  headers:{accept:'application/json','content-type':'application/json',apikey:publicKey,'x-client-info':'luckybean-ci-recognition-ai/1.0','x-installation-id':'luckybean-ci-live-recognition-ai'},
  body:JSON.stringify({
    contract:'luckybean-recognition-ai/1.0',locale:'zh-CN',unresolvedFields:['country','process'],
    samples:[
      {evidenceRef:'ci:1',text:'ORIGIN ETHIOPIA SIDAMA'},
      {evidenceRef:'ci:2',text:'PROCESS NATURAL / 74110'}
    ]
  })
},22000);
const inferenceText=await inference.text();
let payload=null;try{payload=JSON.parse(inferenceText)}catch{}
assert.equal(inference.status,200,`recognition AI inference HTTP ${inference.status}: ${inferenceText.slice(0,500)}`);
assert.equal(payload?.ok,true,`recognition AI inference failed: ${inferenceText.slice(0,500)}`);
assert.equal(payload?.result?.schemaVersion,'ai-enrichment-result/1.0');
assert.equal(payload?.result?.policy?.authority,'advisory');
assert.equal(payload?.result?.policy?.mayOverwriteFact,false);
assert.ok(Array.isArray(payload?.result?.candidates));
assert.ok(String(payload?.result?.inputFingerprint||'').startsWith('sha256:'));
assert.ok(payload.result.candidates.every(candidate=>Array.isArray(candidate.evidenceRefs)&&candidate.evidenceRefs.every(ref=>['ci:1','ci:2'].includes(ref))));

const structureSamples=[
  {evidenceRef:'block:a1',text:'SAMPLE A / ETHIOPIA GUJI'},
  {evidenceRef:'block:a2',text:'VARIETY GESHA'},
  {evidenceRef:'block:a3',text:'PROCESS WASHED'},
  {evidenceRef:'block:b1',text:'SAMPLE B / COLOMBIA HUILA'},
  {evidenceRef:'block:b2',text:'VARIETY PINK BOURBON'},
  {evidenceRef:'block:b3',text:'PROCESS HONEY'},
  {evidenceRef:'block:note',text:'ROASTER CATALOG PAGE 2026'}
];

let structureAttempt;
for(let attempt=1;attempt<=2;attempt+=1){
  try{
    structureAttempt=await structureRequest(structureSamples,attempt);
  }catch(error){
    if(attempt===1&&(error?.name==='AbortError'||error instanceof TypeError))continue;
    throw error;
  }
  const transientTimeout=structureAttempt.response.status===502&&structureAttempt.payload?.error==='AI_TIMEOUT';
  if(transientTimeout&&attempt===1)continue;
  break;
}
const structure=structureAttempt?.response;
const structureText=structureAttempt?.text||'';
const structurePayload=structureAttempt?.payload;
assert.ok(structure,'recognition AI structure request produced no response');
assert.equal(structure.status,200,`recognition AI structure HTTP ${structure.status}: ${structureText.slice(0,500)}`);
assert.equal(structurePayload?.ok,true,`recognition AI structure failed: ${structureText.slice(0,500)}`);
const result=structurePayload?.result;
assert.equal(result?.schemaVersion,'ai-structure-result/1.0');
assert.equal(result?.task,'structure');
assert.equal(result?.policy?.authority,'advisory');
assert.equal(result?.policy?.mayOverwriteFact,false);
assert.equal(result?.policy?.mayCreateFacts,false);
assert.ok([1,2].includes(Number(result?.recordCount)),`unexpected structure recordCount: ${result?.recordCount}`);
assert.ok(Number.isFinite(Number(result?.confidence))&&Number(result.confidence)>=0&&Number(result.confidence)<=1);
assert.ok(String(result?.inputFingerprint||'').startsWith('sha256:'));
assert.ok(Array.isArray(result?.groups));
assert.ok(Array.isArray(result?.unassignedEvidenceRefs),'structure contract must expose explicit unassigned evidence');

const allowedRefs=new Set(structureSamples.map(item=>item.evidenceRef));
assert.equal(new Set(result.unassignedEvidenceRefs).size,result.unassignedEvidenceRefs.length,'unassigned evidence must be unique');
assert.ok(result.unassignedEvidenceRefs.every(ref=>allowedRefs.has(ref)),`structure result invented unassigned evidence: ${JSON.stringify(result.unassignedEvidenceRefs)}`);

if(Number(result.recordCount)===1){
  assert.equal(result.groups.length,0,'single-record structure result must not fabricate groups');
}else{
  assert.equal(result.groups.length,2);
  const assigned=[];
  for(const group of result.groups){
    assert.ok(Array.isArray(group.evidenceRefs)&&group.evidenceRefs.length>=2);
    assert.ok(group.evidenceRefs.every(ref=>allowedRefs.has(ref)),`structure result invented evidenceRef: ${JSON.stringify(group.evidenceRefs)}`);
    assigned.push(...group.evidenceRefs);
  }
  assert.equal(new Set(assigned).size,assigned.length,'structure result reused one evidenceRef across records');
  assert.ok(assigned.length/structureSamples.length>=0.6,'structure evidence coverage fell below the server contract');
  assert.ok(result.unassignedEvidenceRefs.every(ref=>!assigned.includes(ref)),'assigned and unassigned evidence must not overlap');
  const partition=new Set([...assigned,...result.unassignedEvidenceRefs]);
  assert.equal(partition.size,structureSamples.length,'assigned + unassigned evidence must cover the whole submitted page');
  assert.ok(structureSamples.every(item=>partition.has(item.evidenceRef)),'structure evidence partition omitted an input reference');
}
console.log(`Recognition AI live contracts passed with ${structurePayload.model||payload.model||healthPayload.model}; reviewCandidates=${payload.result.candidates.length}; structureCount=${result.recordCount}; unassigned=${result.unassignedEvidenceRefs.length}`);
