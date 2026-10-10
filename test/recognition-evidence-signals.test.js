import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRecognitionEvidenceSignalProvider, recognitionEvidenceProvider } from '../src/domain/recognition/recognition-evidence-signals.js';
import fixture from '../src/domain/recognition/recognition-evidence-fixture.js';
import { applyCoffeeKnowledge } from '../src/services/coffee-knowledge-adapter.js';
import { createRecognitionDocument } from '../src/domain/recognition/recognition-document.js';
import { groupRecognitionRecordCandidates } from '../src/domain/recognition/recognition-record-segmenter.js';
import { buildRecognitionRecordHypothesis } from '../src/domain/recognition/recognition-record-hypothesis.js';
import { recoverRecognitionStructureLocal } from '../src/domain/recognition/recognition-structure-recovery.js';
const book=JSON.parse(fs.readFileSync(new URL('../public/fallback-codebook.json',import.meta.url)));
const evaluate=(provider,text)=>provider.evaluate([{text}]);
test('offline evidence aliases are generated deterministically from hashed owner sources',()=>{
  for(const source of fixture.sources)assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../'+source.path,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex'),source.sha256);
  execFileSync(process.execPath,['scripts/generate-recognition-evidence-fixture.mjs','--check']);
  assert.equal(fixture.authority,'segmentation-only');assert.equal(fixture.requiresUserConfirmation,true);
});
test('Knowledge localized alias refresh changes hints but never IDs, rows, or ownership',()=>{
  const original=structuredClone(book), base=createRecognitionEvidenceSignalProvider({book});
  assert.equal(evaluate(base,'新证据别名').identity,false);
  const augmented=applyCoffeeKnowledge(book,{_format:'coffee-knowledge-bundle',contract:'coffee-knowledge/1.0',version:'test-next',compatibility:{qrIndexesChanged:false},localizedAliases:[{targetCode:'CO-EA',alias:'新证据别名',language:'zh',confidence:0.98,nameType:'official'}]});
  const before=structuredClone(augmented), next=createRecognitionEvidenceSignalProvider({book:augmented});
  assert.equal(evaluate(next,'新证据别名').identity,true);assert.equal(next.source.knowledgeVersion,'test-next');
  assert.deepEqual(book,original);assert.deepEqual(augmented,before);assert.deepEqual(augmented.countries.map(row=>row[0]),book.countries.map(row=>row[0]));
  assert.deepEqual(Object.keys(evaluate(next,'新证据别名')).sort(),['anchors','identity','process']);
  assert.equal(evaluate(base,'新证据别名').identity,false,'provider snapshots do not mutate across updates');
});
test('hints ignore flavor aliases, Latin substrings and malformed codebooks',()=>{
  const provider=createRecognitionEvidenceSignalProvider({book});
  assert.equal(evaluate(provider,'chocolate blueberry').identity,false);
  assert.equal(evaluate(provider,'unnaturally nonethiopian').identity,false);
  assert.equal(evaluate(provider,'unnaturally').process,false);
  assert.equal(evaluate(provider,'ETHIOPIA WASHED').identity,true);
  assert.equal(evaluate(provider,'ETHIOPIA WASHED').process,true);
  assert.equal(createRecognitionEvidenceSignalProvider({book:{countries:[]}}).source.kind,'offline-fixture');
  assert.equal(recognitionEvidenceProvider({evidenceSignalProvider:{contract:'wrong',authority:'canonical',evaluate(){throw Error('untrusted')}}}).authority,'segmentation-only');
});
test('new aliases reach row and structure detectors while geometry never silently materializes records',()=>{
  const custom=structuredClone(book);custom.countries[0].push('新证据别名');custom.processes[0].push('新处理证据');
  const doc=createRecognitionDocument({images:[{id:'p'}],engine:'fixture',blocks:[0,1].map(i=>({id:'b'+i,imageId:'p',text:'新证据别名 新处理证据',polygon:[[10,10+i*100],[410,10+i*100],[410,35+i*100],[10,35+i*100]]}))});
  assert.equal(groupRecognitionRecordCandidates(doc).grouped,false);
  const result=groupRecognitionRecordCandidates(doc,{book:custom});assert.equal(result.grouped,true);assert.equal(result.method,'geometry-process-rows-v1');
  assert.ok(result.candidates.every(c=>c.requiresUserConfirmation));
  const hypothesis=buildRecognitionRecordHypothesis(doc,{book:custom});assert.equal(hypothesis.geometry.grouped,true);
  const recovery=recoverRecognitionStructureLocal(doc,{book:custom});assert.equal(recovery.split,false);assert.equal(recovery.requiresUserConfirmation,true);
});

test('offline owner fixtures and character normalization preserve Japanese, Korean and Traditional process hints',()=>{
 const provider=createRecognitionEvidenceSignalProvider();
 for(const text of ['ウォッシュド','워시드','ナチュラル','허니','日曬','厭氧發酵'])assert.equal(evaluate(provider,text).process,true,text);
 for(const text of ['哥倫比亞','巴拿馬','エチオピア','에티오피아'])assert.equal(evaluate(provider,text).identity,true,text);
});

test('bad optional aliases and non-array blocks cannot block local evidence fallback',()=>{
 const malformed=structuredClone(book);malformed.aliases={bad:true};
 const provider=createRecognitionEvidenceSignalProvider({book:malformed});
 assert.equal(provider.evaluate(null).identity,false);assert.equal(provider.evaluate({}).process,false);
 assert.equal(provider.evaluate([{text:'Ethiopia washed'}]).identity,true);
});
