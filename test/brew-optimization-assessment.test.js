import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessTastingForOptimization,
  applyPersonalSensitivityToScene,
  buildPersonalSensitivityProfile
} from '../src/domain/sensory/brew-optimization-assessment.js';
import { deriveSensoryFeedback } from '../src/brew-optimizer-v097.js';

const completedBrew={id:'brew-1',execution:{deviations:[]}};

test('总分低于预测分不会单独触发冲煮优化',()=>{
  const result=assessTastingForOptimization({id:'s-1',brewSessionId:'brew-1',autoScore:92,subjectiveScore:70,naturalNote:'整体正常'},completedBrew);
  assert.equal(result.triggered,false);
  assert.equal(result.totalScoreUsedAsTrigger,false);
  assert.deepEqual(result.issues,[]);
});

test('品鉴后的具体负面维度触发可解释优化',()=>{
  const result=assessTastingForOptimization({id:'s-2',brewSessionId:'brew-1',naturalNote:'尾段焦苦并且有干涩感'},completedBrew);
  assert.equal(result.triggered,true);
  assert.deepEqual(result.issues.map(issue=>issue.key),['bitternessHigh','astringencyHigh']);
  assert.ok(result.issues.every(issue=>issue.planAdjustable));
});

test('雷达轴只比较同组平均且无完成冲煮时不提示优化',()=>{
  const professionalData={radar:{aroma:[5,5,5,5,5],style:[5,5,5,2,5,5,5,5]}};
  const linked=assessTastingForOptimization({id:'s-3',brewSessionId:'brew-1',professionalData},completedBrew);
  assert.equal(linked.triggered,true);
  assert.ok(linked.issues.some(issue=>issue.key==='sweetnessLow'));
  const feedback=deriveSensoryFeedback({professionalData,optimizationAssessment:linked},completedBrew);
  assert.equal(feedback.flags.lowSweet,true);
  assert.ok(feedback.controls.midWeight>0);
  const unlinked=assessTastingForOptimization({id:'s-4',professionalData},null);
  assert.equal(unlinked.triggered,false);
  assert.equal(unlinked.linkedToCompletedBrew,false);
});

test('实际执行明显偏离方案时不把负面结果归因于方案',()=>{
  const result=assessTastingForOptimization({id:'s-5',brewSessionId:'brew-1',naturalNote:'焦苦'},
    {id:'brew-1',execution:{deviations:[{type:'流速异常'}]}});
  assert.equal(result.triggered,false);
  assert.equal(result.executionReliable,false);
  assert.match(result.reason,/无法把负面结果可靠归因于方案/);
});

test('个人靶区至少三次证据后才改变，标准靶区保持不变',()=>{
  const records=Array.from({length:3},(_,index)=>({id:`s-${index}`,brewSessionId:`b-${index}`,naturalNote:'酸感过强'}));
  const profile=buildPersonalSensitivityProfile(records);
  assert.ok(profile.stats.acidity.scale>1);
  const scene={schemaVersion:'brew-spatial/1.3',targets:[{id:'acidity',points:[[0,1,2],[2,3,4]]}]};
  const applied=applyPersonalSensitivityToScene(scene,profile);
  assert.deepEqual(applied.targets,scene.targets);
  assert.notDeepEqual(applied.personalTargets,scene.targets);
  assert.equal(applied.hasPersonalAdjustment,true);
});
