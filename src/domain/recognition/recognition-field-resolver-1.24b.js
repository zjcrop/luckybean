// Lucky Bean 1.24B multi-image field arbitration.
// Processing order never determines field precedence.

const clean = value => String(value ?? '').normalize('NFKC').replace(/\s+/g,' ').trim();
const comparable = value => clean(value).toLocaleLowerCase('zh-CN').replace(/[\s·•,，;；:：/_-]+/g,'');

function explicitRelation(relation={}) {
  const mode=String(relation.mode||'').toLowerCase();
  return Boolean(clean(relation.label)) || /label|key|pair|colon|same[-_ ]?line|adjacent|explicit/.test(mode);
}

function candidateScore(candidate) {
  // Explicit semantic relation is strongest. Confidence comes next, then agreement across images.
  // Weak inference only contributes a small amount and cannot beat a conflicting explicit label.
  return (candidate.explicit ? 4 : 0)
    + Math.max(0,Math.min(1,candidate.confidence))*2.2
    + Math.min(3,candidate.imageCount)*0.55
    + (candidate.explicit ? 0 : 0.15);
}

export function resolveRecognitionRelations(relations=[]) {
  const groups=new Map();
  for(const relation of relations||[]) {
    const value=clean(relation?.value);
    if(!value) continue;
    const key=comparable(value);
    if(!key) continue;
    const current=groups.get(key)||{
      value,
      normalized:key,
      explicit:false,
      confidence:0,
      imageIds:new Set(),
      sources:[]
    };
    current.explicit ||= explicitRelation(relation);
    current.confidence=Math.max(current.confidence,Number(relation?.score||0));
    if(relation?.imageId) current.imageIds.add(String(relation.imageId));
    current.sources.push({...relation});
    groups.set(key,current);
  }
  const candidates=[...groups.values()].map(candidate=>({
    ...candidate,
    imageIds:[...candidate.imageIds],
    imageCount:candidate.imageIds.size,
    score:candidateScore({...candidate,imageCount:candidate.imageIds.size})
  })).sort((a,b)=>b.score-a.score || b.confidence-a.confidence || b.imageCount-a.imageCount);

  if(!candidates.length) return {winner:null,candidates:[],conflict:false,reason:'none'};
  const winner=candidates[0];
  const runner=candidates[1]||null;
  let conflict=false;
  let reason='single';
  if(runner) {
    const bothExplicit=winner.explicit&&runner.explicit;
    const bothStrong=winner.confidence>=0.72&&runner.confidence>=0.72;
    const close=Math.abs(winner.score-runner.score)<0.9;
    const competingConsensus=winner.imageCount>=2&&runner.imageCount>=2;
    conflict=(bothExplicit&&(bothStrong||close)) || (bothStrong&&close) || competingConsensus;
    reason=conflict?'conflicting-high-confidence-candidates':'ranked';
  }
  return {winner,candidates,conflict,reason};
}

export function resolverPriorityDescription() {
  return 'explicit-label > confidence > multi-image-consensus > weak-inference';
}
