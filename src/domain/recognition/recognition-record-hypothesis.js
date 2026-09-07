import { groupRecognitionRecordCandidates } from './recognition-record-segmenter.js';

export const RECOGNITION_RECORD_HYPOTHESIS_SCHEMA = 'recognition-record-hypothesis/1.0';

const ENTRY_HEADING = /^\s*(?:(?:样品|豆|咖啡|coffee|bean|sample)\s*[#№]?\s*(?:\d+|[A-Z]|[一二三四五六七八九十]+)|(?:\d{1,2}|[A-Z])\s*[.)、])\s*[:：\-–—]?\s*/iu;
const COUNTRY_ANCHOR = /^\s*(?:国家|产国|原产国|country|country of origin)\s*[:：=|｜]/iu;
const COFFEE_SIGNAL = /(?:国家|产国|原产国|产地|产区|庄园|农场|处理法|品种|豆种|烘焙日期|海拔|风味|净重|批次|烘焙商|\b(?:country|origin|region|farm|estate|process(?:ing)?|variety|varietal|roast(?:ed)?|altitude|elevation|tasting notes?|flavo(?:u)?r|net weight|lot|roaster)\b)/giu;

function clamp01(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}
function clean(value) { return String(value || '').replace(/\r/g, '').trim(); }
function linesOf(document) { return clean(document?.rawFullText || document?.fullText).split('\n').map(clean).filter(Boolean); }
function signalCount(text) {
  const found = new Set();
  for (const match of String(text || '').matchAll(COFFEE_SIGNAL)) found.add(String(match[0]).toLocaleLowerCase('zh-CN'));
  return found.size;
}
function explicitCount(document) {
  const entries = document?.extensions?.entries;
  return Array.isArray(entries) ? entries.map(item => clean(typeof item === 'string' ? item : item?.text || item?.fullText)).filter(Boolean).length : 0;
}
function headingCount(lines) { return lines.filter(line => ENTRY_HEADING.test(line)).length; }
function countryAnchorCount(lines) { return lines.filter(line => COUNTRY_ANCHOR.test(line)).length; }
function paragraphCount(document) {
  if (Number(document?.images?.length || 0) > 1) return 0;
  const groups = clean(document?.rawFullText || document?.fullText).split(/\n\s*\n+/).map(clean).filter(Boolean);
  if (groups.length < 2) return 0;
  return groups.every(group => group.length >= 12 && signalCount(group) >= 2) ? groups.length : 0;
}
function tableRowCount(lines, document) {
  if (Number(document?.images?.length || 0) > 1) return 0;
  const rows = lines.filter(line => /\t|\s\|\s|｜/.test(line));
  if (rows.length < 2) return 0;
  const viable = rows.filter(row => row.length >= 12 && (signalCount(row) >= 1 || /(?:washed|natural|honey|水洗|日晒|蜜处理|厌氧|anaerobic)/iu.test(row)));
  return viable.length === rows.length ? rows.length : 0;
}
function addScore(scoreByCount, count, amount) {
  const normalized = Math.max(1, Math.min(12, Math.trunc(Number(count) || 1)));
  scoreByCount.set(normalized, (scoreByCount.get(normalized) || 0) + Number(amount || 0));
}
function softmax(scoreByCount) {
  const rows = [...scoreByCount.entries()].sort((a, b) => a[0] - b[0]);
  const max = Math.max(...rows.map(([, score]) => score));
  const weighted = rows.map(([recordCount, score]) => ({ recordCount, score, exp:Math.exp(score - max) }));
  const total = weighted.reduce((sum, row) => sum + row.exp, 0) || 1;
  return weighted.map(row => ({ recordCount:row.recordCount, score:Number(row.score.toFixed(4)), probability:Number((row.exp / total).toFixed(4)) }))
    .sort((a, b) => b.probability - a.probability || a.recordCount - b.recordCount);
}

export function buildRecognitionRecordHypothesis(document, options = {}) {
  const lines = linesOf(document);
  const imageCount = Number(document?.images?.length || 0);
  const explicit = explicitCount(document);
  const headings = headingCount(lines);
  const countries = countryAnchorCount(lines);
  const paragraphs = paragraphCount(document);
  const tableRows = tableRowCount(lines, document);
  const geometry = groupRecognitionRecordCandidates(document, options.geometry || {});
  const geometryCount = geometry.grouped ? Number(geometry.candidates?.length || 0) : 0;
  const geometryConfidence = geometryCount >= 2
    ? geometry.candidates.reduce((sum, item) => sum + clamp01(item?.confidence), 0) / geometryCount
    : 0;

  // Relative evidence scores only: geometry by itself must not overrule the single-record prior.
  const scoreByCount = new Map([[1, 2.2]]);
  const evidence = [{ source:'prior', recordCount:1, weight:2.2, authority:'prior' }];
  if (imageCount > 1) {
    addScore(scoreByCount, 1, 1.35);
    evidence.push({ source:'multi-image-single-record-prior', recordCount:1, weight:1.35, imageCount, authority:'prior' });
  }
  if (explicit >= 2) {
    addScore(scoreByCount, explicit, 5.4);
    evidence.push({ source:'producer-explicit-entries', recordCount:explicit, weight:5.4, authority:'producer-structure' });
  }
  if (headings >= 2) {
    addScore(scoreByCount, headings, 3.25);
    evidence.push({ source:'entry-headings', recordCount:headings, weight:3.25, authority:'text-structure' });
  }
  if (countries >= 2) {
    addScore(scoreByCount, countries, 2.8);
    evidence.push({ source:'repeated-country-anchor', recordCount:countries, weight:2.8, authority:'text-structure' });
  }
  if (paragraphs >= 2) {
    addScore(scoreByCount, paragraphs, 1.7);
    evidence.push({ source:'single-image-paragraphs', recordCount:paragraphs, weight:1.7, authority:'text-structure' });
  }
  if (tableRows >= 2) {
    addScore(scoreByCount, tableRows, 1.85);
    evidence.push({ source:'table-rows', recordCount:tableRows, weight:1.85, authority:'text-structure' });
  }
  if (geometryCount >= 2) {
    const weight = 1.2 + geometryConfidence * 0.7;
    addScore(scoreByCount, geometryCount, weight);
    evidence.push({
      source:'geometry-record-candidates', recordCount:geometryCount, weight:Number(weight.toFixed(4)),
      confidence:Number(geometryConfidence.toFixed(4)), method:String(geometry.method || ''),
      candidateIds:(geometry.candidates || []).map(item => String(item?.id || '')).filter(Boolean),
      authority:'evidence-only'
    });
  }

  const hypotheses = softmax(scoreByCount);
  const first = hypotheses[0] || { recordCount:1, probability:1 };
  const second = hypotheses[1] || { probability:0 };
  const margin = Math.max(0, Number(first.probability || 0) - Number(second.probability || 0));
  const competingMultiEvidence = evidence.some(item => item.recordCount >= 2 && item.source !== 'producer-explicit-entries');
  const producerExplicit = explicit >= 2 && first.recordCount === explicit;
  const ambiguous = !producerExplicit && (first.probability < 0.72 || margin < 0.24 || (first.recordCount === 1 && competingMultiEvidence));
  const shouldInvokeAi = !producerExplicit && competingMultiEvidence && (ambiguous || first.recordCount >= 2);

  return Object.freeze({
    schemaVersion:RECOGNITION_RECORD_HYPOTHESIS_SCHEMA,
    authority:'hypothesis-only', calibration:'relative-evidence-softmax-v1',
    hypotheses:Object.freeze(hypotheses.map(item => Object.freeze(item))),
    recommendedRecordCount:Number(first.recordCount || 1), confidence:Number(first.probability || 0),
    margin:Number(margin.toFixed(4)), ambiguous:Boolean(ambiguous), shouldInvokeAi:Boolean(shouldInvokeAi), imageCount,
    evidence:Object.freeze(evidence.map(item => Object.freeze(item))),
    geometry:Object.freeze({
      grouped:Boolean(geometry.grouped), method:String(geometry.method || 'none'),
      candidates:Object.freeze((geometry.candidates || []).map(item => Object.freeze({
        id:String(item?.id || ''), confidence:clamp01(item?.confidence),
        blockIds:Object.freeze([...(item?.blockIds || [])].map(String)), imageIds:Object.freeze([...(item?.imageIds || [])].map(String))
      })))
    })
  });
}
