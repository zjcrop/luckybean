import { recognitionDocumentFromText } from './recognition-document.js';

export const MULTI_ENTRY_SCHEMA = 'recognition-multi-entry/1.0';

const COFFEE_FIELD_SIGNAL = /(?:国家|产国|原产国|产地|产区|地区|庄园|农场|处理法|处理方式|品种|豆种|烘焙日期|烘焙度|海拔|风味|净重|批次|等级|烘焙商|country|origin|region|farm|estate|process(?:ing)?|variety|varietal|roast(?:ed)?|altitude|elevation|tasting notes?|flavo(?:u)?r|net weight|lot|grade|roaster)\b/giu;
const ENTRY_HEADING = /^\s*(?:(?:样品|豆|咖啡|coffee|bean|sample)\s*[#№]?\s*(?:\d+|[A-Z]|[一二三四五六七八九十]+)|(?:\d{1,2}|[A-Z])\s*[.)、])\s*[:：\-–—]?\s*/iu;
const STRONG_START = /^\s*(?:国家|产国|原产国|country|country of origin)\s*[:：=|｜]/iu;

function clean(value) { return String(value || '').replace(/\r/g, '').trim(); }
function signalCount(text) {
  const unique = new Set();
  for (const match of String(text || '').matchAll(COFFEE_FIELD_SIGNAL)) unique.add(String(match[0]).toLocaleLowerCase('zh-CN'));
  return unique.size;
}
function viable(text) {
  const value = clean(text);
  return value.length >= 12 && signalCount(value) >= 2;
}
function splitByHeadings(text) {
  const lines = String(text || '').split('\n');
  const starts = [];
  lines.forEach((line, index) => { if (ENTRY_HEADING.test(line)) starts.push(index); });
  if (starts.length < 2) return [];
  const entries = starts.map((start, index) => lines.slice(start, starts[index + 1] ?? lines.length).join('\n').replace(ENTRY_HEADING, '').trim()).filter(viable);
  return entries.length >= 2 ? entries : [];
}
function splitByRepeatedStrongStart(text) {
  const lines = String(text || '').split('\n');
  const starts = [];
  lines.forEach((line, index) => { if (STRONG_START.test(line)) starts.push(index); });
  if (starts.length < 2) return [];
  const entries = starts.map((start, index) => lines.slice(start, starts[index + 1] ?? lines.length).join('\n').trim()).filter(viable);
  return entries.length >= 2 ? entries : [];
}
function splitSingleImageParagraphs(text, imageCount) {
  if (Number(imageCount || 0) > 1) return [];
  const groups = String(text || '').split(/\n\s*\n+/).map(clean).filter(Boolean);
  if (groups.length < 2 || !groups.every(viable)) return [];
  return groups;
}
function splitTableRows(text, imageCount) {
  if (Number(imageCount || 0) > 1) return [];
  const rows = String(text || '').split('\n').map(clean).filter(line => /\t|\s\|\s|｜/.test(line));
  if (rows.length < 2) return [];
  const viableRows = rows.filter(row => row.length >= 12 && (signalCount(row) >= 1 || /(?:washed|natural|honey|水洗|日晒|蜜处理|厌氧|anaerobic)/iu.test(row)));
  return viableRows.length >= 2 && viableRows.length === rows.length ? viableRows : [];
}
function explicitEntries(document) {
  const values = document?.extensions?.entries;
  if (!Array.isArray(values) || values.length < 2) return [];
  return values.map(item => clean(typeof item === 'string' ? item : item?.text || item?.fullText)).filter(viable);
}
function buildEntryDocument(text, parent, index, total, method) {
  const child = recognitionDocumentFromText(text);
  child.engine = String(parent?.engine || child.engine || 'unknown');
  child.extensions = {
    ...(child.extensions || {}),
    multiEntry: {
      schemaVersion:MULTI_ENTRY_SCHEMA,
      parentSchemaVersion:String(parent?.schemaVersion || ''),
      parentCreatedAt:String(parent?.createdAt || ''),
      index:index + 1,
      total,
      method,
      authority:'segmentation-only',
      requiresUserConfirmation:true
    }
  };
  return child;
}

export function splitRecognitionEntries(document) {
  const text = clean(document?.rawFullText || document?.fullText);
  if (!text) return { split:false, method:'none', documents:[document].filter(Boolean) };
  const candidates = [
    ['explicit-extension', explicitEntries(document)],
    ['entry-headings', splitByHeadings(text)],
    ['repeated-country-anchor', splitByRepeatedStrongStart(text)],
    ['single-image-paragraphs', splitSingleImageParagraphs(text, document?.images?.length)],
    ['single-image-table-rows', splitTableRows(text, document?.images?.length)]
  ];
  const [method, entries] = candidates.find(([, values]) => values.length >= 2) || ['none', []];
  if (entries.length < 2) return { split:false, method:'none', documents:[document] };
  const documents = entries.map((entry, index) => buildEntryDocument(entry, document, index, entries.length, method));
  return { split:true, method, documents, count:documents.length };
}
