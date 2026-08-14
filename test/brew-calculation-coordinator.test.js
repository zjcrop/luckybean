import test from 'node:test';
import assert from 'node:assert/strict';
import { BrewCalculationCoordinator } from '../src/services/brew-calculation-coordinator.js';

test('参数重算保留同一豆卡已经实际采用的方案',async()=>{
  let received;
  const coordinator=new BrewCalculationCoordinator(async(_endpoint,input)=>{received=input;return {id:'plan'};});
  const result=await coordinator.calculate({input:{brew:{profileId:'recommended'}},previousPlan:{beanId:'bean-1',profile:{id:'three-pulse'}},beanId:'bean-1'});
  assert.equal(received.brew.profileId,'three-pulse');
  assert.equal(result.input.calculation.mode,'parameter-recalculation');
});

test('不同豆卡或手动选择方案时不会沿用旧方案',async()=>{
  const seen=[];
  const coordinator=new BrewCalculationCoordinator(async(_endpoint,input)=>{seen.push(input.brew.profileId);return {};});
  await coordinator.calculate({input:{brew:{profileId:'recommended'}},previousPlan:{beanId:'old',profile:{id:'three-pulse'}},beanId:'new'});
  await coordinator.calculate({input:{brew:{profileId:'four-stage'}},previousPlan:{beanId:'new',profile:{id:'three-pulse'}},beanId:'new'});
  assert.deepEqual(seen,['recommended','four-stage']);
});

test('并发计算采用 latest-wins，旧结果不能覆盖新结果',async()=>{
  const waits=[];
  const coordinator=new BrewCalculationCoordinator((_endpoint,input)=>new Promise(resolve=>waits.push(()=>resolve({id:input.id}))));
  const first=coordinator.calculate({input:{id:'old',brew:{profileId:'recommended'}},beanId:'b'});
  const second=coordinator.calculate({input:{id:'new',brew:{profileId:'recommended'}},beanId:'b'});
  waits[1](); const newest=await second;
  waits[0](); const stale=await first;
  assert.equal(newest.latest,true);
  assert.equal(stale.latest,false);
});

