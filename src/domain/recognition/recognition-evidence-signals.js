import fixture from './recognition-evidence-fixture.js';
import { foldRecognitionTraditional } from './recognition-pre-semantic-normalizer.js';

export const RECOGNITION_EVIDENCE_SIGNAL_CONTRACT='recognition-evidence-signals/1.0';
const identityAnchors=new Set(['country','origin','region','farm','producer','station','cooperative','variety','species']);
const normalize=value=>foldRecognitionTraditional(value).normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g,' ').trim();
const tableStarts={countries:1,regions:2,entities:3,varieties:1,processes:1};
const statuses=new Set(['active','candidate','deprecated','estate_or_farm','washing_station']);
function bookSignals(book) {
  if(!book||!Object.keys(tableStarts).every(table=>Array.isArray(book[table])))return null;
  const signals={identity:[],process:[]}, codes=new Map();
  for(const [table,start] of Object.entries(tableStarts)) {
    const kind=table==='processes'?'process':'identity';
    for(const row of book[table]) {
      if(!Array.isArray(row)||!row[0])continue;
      codes.set(String(row[0]),kind);
      for(const value of row.slice(start)) if(typeof value==='string'&&!statuses.has(value)) signals[kind].push(...value.split(/[\\/、,，;；|]/));
    }
  }
  for(const row of Array.isArray(book.aliases)?book.aliases:[]) if(Array.isArray(row)&&codes.has(String(row[0]))&&typeof row[1]==='string') signals[codes.get(String(row[0]))].push(row[1]);
  return signals;
}
function matches(text,alias) {
  let offset=0;
  while((offset=text.indexOf(alias,offset))!==-1) {
    const before=text[offset-1]||'',after=text[offset+alias.length]||'';
    if((!/[a-z0-9]/i.test(alias[0])||!/[a-z0-9]/i.test(before))&&(!/[a-z0-9]/i.test(alias.at(-1))||!/[a-z0-9]/i.test(after)))return true;
    offset+=Math.max(1,alias.length);
  }
  return false;
}
/** Consumes Knowledge/BrewIon matching rows; emits hints, never canonical identities. */
export function createRecognitionEvidenceSignalProvider({book}={}) {
  const supplied=bookSignals(book);
  const signals={};
  for(const kind of ['identity','process']) signals[kind]=Object.freeze([...new Set([...(supplied?.[kind]||[]),...fixture.signals[kind]].map(normalize).filter(v=>v.length>=2&&v.length<=160))].slice(0,10000));
  const source=Object.freeze({kind:supplied?'knowledge-codebook+offline-fixture':'offline-fixture',codebookVersion:supplied?String(book.version||''):'',knowledgeVersion:String(book?.coffeeKnowledgeClient?.version||''),fixtureSources:Object.freeze(fixture.sources.map(item=>Object.freeze({...item})))});
  return Object.freeze({
    contract:RECOGNITION_EVIDENCE_SIGNAL_CONTRACT,authority:'segmentation-only',source,
    evaluate(blocks=[]) {
      const safeBlocks=(Array.isArray(blocks)?blocks:[]).slice(0,2000);
      const text=safeBlocks.map(block=>normalize(block?.text)).join(' ').slice(0,32768);
      const anchors=[...new Set(safeBlocks.map(block=>String(block?.fieldAnchor||'')).filter(Boolean))];
      return {process:anchors.includes('process')||signals.process.some(alias=>matches(text,alias)),identity:anchors.some(anchor=>identityAnchors.has(anchor))||signals.identity.some(alias=>matches(text,alias)),anchors};
    }
  });
}
export const defaultRecognitionEvidenceSignalProvider=createRecognitionEvidenceSignalProvider();
export function recognitionEvidenceProvider(options={}) {
  const provider=options.evidenceSignalProvider;
  if(provider?.contract===RECOGNITION_EVIDENCE_SIGNAL_CONTRACT&&provider.authority==='segmentation-only'&&typeof provider.evaluate==='function')return provider;
  return options.book?createRecognitionEvidenceSignalProvider({book:options.book}):defaultRecognitionEvidenceSignalProvider;
}
