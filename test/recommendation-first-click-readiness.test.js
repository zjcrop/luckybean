import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/features/runtime-features.js',import.meta.url),'utf8');
const body=source.match(/const recommend = event.target.closest\?\.\('#fabRecommendBtn'\);([\s\S]*?)\n    if \(event.target.closest/)[0].replace(/\n    if \(event.target.closest$/,'');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const run=new AsyncFunction('event','isLoaded','loadMany',body);
test('first recommendation waits for both lazy selection and canonical group owner, even when selection is already ready',async()=>{
 for(const ready of [[],['selection'],['bean-groups']]){
  let clicks=0,prevented=0,replayedBeforeReady=false,release;
  const gate=new Promise(resolve=>{release=resolve;});
  const event={target:{closest:()=>({click(){clicks++;}})},preventDefault(){prevented++;},stopImmediatePropagation(){prevented++;}};
  const task=run(event,id=>ready.includes(id),async ids=>{assert.deepEqual(ids,['selection','bean-groups']);await gate;return true;});
  assert.equal(clicks,0);assert.equal(prevented,2);release();await task;assert.equal(clicks,1);
 }
});
test('failed required module load cannot replay into legacy recommendation fallback',async()=>{
 let clicks=0;
 await run({target:{closest:()=>({click(){clicks++;}})},preventDefault(){},stopImmediatePropagation(){}},()=>false,async()=>false);
 assert.equal(clicks,0);
});
