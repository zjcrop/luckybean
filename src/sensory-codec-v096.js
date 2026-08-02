export const SENSORY_STORAGE_FORMAT = 'LB-SENSORY-2';

const NODE_IDS = Object.freeze(['floral', 'fruit', 'other', 'sweet', 'acid', 'bitter', 'mouthfeel', 'negative']);
const NODE_TO_CODE = new Map(NODE_IDS.map((value, index) => [value, index]));

const LABELS = Object.freeze([
  '无','白花','花香','茉莉','玫瑰','橙花','紫罗兰','洋甘菊','果香','柑橘','柠檬','莓果','桃子','苹果','葡萄','热带水果','干果',
  '茶感','红茶','乌龙茶','香料','坚果','可可','巧克力','酒香','发酵感','草本','谷物','烘烤','烟熏','豆腐/豆味',
  '蜂蜜','蔗糖','红糖','焦糖','枫糖','糖浆','太妃糖','果糖感','成熟水果','甜感清晰','甜感弱','无明显甜感',
  '低','中','强','高','适中','微酸','圆润舒适','尖锐','醋酸','柑橘酸','苹果酸','酒石酸','醋酸感','发酵酸','明亮','活泼','柔和',
  '轻盈','丝滑','顺滑','圆润','奶油感','饱满','厚重','多汁','茶汤感','粗糙','干涩','收敛',
  '干净','持久','短促','甜感延续','果香延续','茶感延续','苦感','涩感','干燥','杂味',
  '偏高','焦苦','纸味','木质','土味','霉味','发酵过度','药感','橡胶','金属感'
]);
const LABEL_TO_CODE = new Map(LABELS.map((value, index) => [value, index]));

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function base64UrlEncode(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlDecode(text) {
  const base64 = String(text || '').replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - String(text || '').length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function encodeLabel(value) {
  const text = String(value || '').trim();
  if (LABEL_TO_CODE.has(text)) return LABEL_TO_CODE.get(text);
  return `~${text.slice(0, 32)}`;
}

function decodeLabel(value) {
  if (typeof value === 'number') return LABELS[value] || '';
  const text = String(value || '');
  return text.startsWith('~') ? text.slice(1) : text;
}

function encodeAnswers(answers = {}) {
  return Object.entries(answers).map(([node, groups]) => [
    NODE_TO_CODE.has(node) ? NODE_TO_CODE.get(node) : `~${String(node).slice(0, 20)}`,
    Object.entries(groups || {}).map(([index, values]) => [Number(index), (values || []).map(encodeLabel)])
  ]);
}

function decodeAnswers(rows = []) {
  const answers = {};
  for (const [nodeCode, groups] of rows || []) {
    const node = typeof nodeCode === 'number' ? NODE_IDS[nodeCode] : String(nodeCode || '').replace(/^~/, '');
    if (!node) continue;
    answers[node] = {};
    for (const [index, values] of groups || []) answers[node][index] = (values || []).map(decodeLabel).filter(Boolean);
  }
  return answers;
}

function summaryFromAnswers(answers = {}) {
  const labels = { floral: '花香', fruit: '果香', other: '其他', sweet: '甜', acid: '酸', bitter: '苦', mouthfeel: '口感', negative: '负面' };
  const rows = [];
  for (const node of NODE_IDS) {
    const values = Object.values(answers[node] || {}).flat().map(String).filter(value => value && value !== '无');
    if (values.length) rows.push(`${labels[node]}:${[...new Set(values)].join('/')}`);
  }
  return rows;
}

function compactProfessional(meta = {}) {
  if (!meta || typeof meta !== 'object') return null;
  const selections = Object.entries(meta.selections || {}).map(([key, values]) => [key, (values || []).map(encodeLabel)]);
  return {
    m: String(meta.mode || 'professional').slice(0, 16),
    q: selections,
    i: Object.entries(meta.intensities || {}).map(([key, value]) => [key, Math.round(Number(value || 0) * 10)]),
    r: meta.radar ? {
      a: (meta.radar.aroma || []).map(value => Math.round(Number(value || 0) * 10)),
      s: (meta.radar.style || []).map(value => Math.round(Number(value || 0) * 10))
    } : null,
    f: Object.entries(meta.affective || {}).map(([key, value]) => [key, Number(value || 0)]),
    z: Math.round(Number(meta.mappedScore || 0) * 10)
  };
}

function expandProfessional(row) {
  if (!row) return null;
  return {
    mode: row.m || 'professional',
    selections: Object.fromEntries((row.q || []).map(([key, values]) => [key, (values || []).map(decodeLabel).filter(Boolean)])),
    intensities: Object.fromEntries((row.i || []).map(([key, value]) => [key, Number(value || 0) / 10])),
    radar: row.r ? { aroma: (row.r.a || []).map(value => Number(value || 0) / 10), style: (row.r.s || []).map(value => Number(value || 0) / 10) } : null,
    affective: Object.fromEntries(row.f || []),
    mappedScore: Number(row.z || 0) / 10
  };
}

export function consumePendingSensoryMeta(record = {}) {
  const pending = globalThis.LuckyBeanPendingSensoryMeta;
  if (!pending || pending.beanId !== record.beanId) return record.professional || null;
  delete globalThis.LuckyBeanPendingSensoryMeta;
  return pending.professional || pending;
}

export function compactSensoryRecord(record = {}) {
  const professional = record.professional || consumePendingSensoryMeta(record);
  const note = String(record.naturalNote || '').trim().slice(0, 300);
  return {
    v: 2,
    i: record.id || '',
    b: record.beanId || '',
    r: record.brewSessionId || '',
    d: record.createdAt || new Date().toISOString(),
    e: record.updatedAt || record.createdAt || new Date().toISOString(),
    g: [record.engineVersion || '', record.profileVersion || ''],
    s: [Math.round(Number(record.autoScore || 0) * 10), Math.round(Number(record.subjectiveScore ?? record.score ?? 0) * 10), Math.round(Number(record.scoreDelta || 0) * 10)],
    q: encodeAnswers(record.answers || {}),
    n: note,
    p: compactProfessional(professional),
    t: (record.preferenceTags || []).map(encodeLabel),
    c: record.correctedPlanId || ''
  };
}

export function expandSensoryRecord(row = {}) {
  const answers = decodeAnswers(row.q || []);
  const subjectiveScore = Number(row.s?.[1] || 0) / 10;
  const professional = expandProfessional(row.p);
  const summary = summaryFromAnswers(answers);
  if (professional?.selections) {
    for (const [stage, tags] of Object.entries(professional.selections)) {
      if (tags.length) summary.push(`${stage}:${tags.join('/')}`);
    }
  }
  return {
    id: row.i || '',
    beanId: row.b || '',
    brewSessionId: row.r || '',
    createdAt: row.d || '',
    updatedAt: row.e || row.d || '',
    engineVersion: row.g?.[0] || '',
    profileVersion: row.g?.[1] || '',
    autoScore: Number(row.s?.[0] || 0) / 10,
    subjectiveScore,
    score: subjectiveScore,
    scoreDelta: Number(row.s?.[2] || 0) / 10,
    answers,
    naturalNote: String(row.n || '').slice(0, 300),
    professional,
    preferenceTags: (row.t || []).map(decodeLabel).filter(Boolean),
    correctedPlanId: row.c || '',
    summary,
    storageFormat: SENSORY_STORAGE_FORMAT
  };
}

async function compress(bytes) {
  if (!globalThis.CompressionStream) return { format: 'raw', bytes };
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return { format: 'deflate-raw', bytes: new Uint8Array(await new Response(stream).arrayBuffer()) };
  } catch {
    return { format: 'raw', bytes };
  }
}

async function decompress(bytes, format) {
  if (format !== 'deflate-raw') return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function importKey(secret) {
  return crypto.subtle.importKey('raw', secret, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function sealSensoryRecord(record, secret) {
  const compact = compactSensoryRecord(record);
  const packed = await compress(textEncoder.encode(JSON.stringify(compact)));
  if (!crypto?.subtle || !secret) {
    return {
      id: record.id,
      beanId: record.beanId,
      brewSessionId: record.brewSessionId || '',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt || record.createdAt,
      storageFormat: SENSORY_STORAGE_FORMAT,
      compression: packed.format,
      compact: base64UrlEncode(packed.bytes)
    };
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey(secret);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, packed.bytes));
  return {
    id: record.id,
    beanId: record.beanId,
    brewSessionId: record.brewSessionId || '',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt || record.createdAt,
    storageFormat: SENSORY_STORAGE_FORMAT,
    compression: packed.format,
    encryption: 'AES-GCM-256',
    iv: base64UrlEncode(iv),
    cipher: base64UrlEncode(cipher)
  };
}

export async function openSensoryRecord(stored, secret) {
  if (!stored || stored.storageFormat !== SENSORY_STORAGE_FORMAT) return stored;
  let bytes;
  if (stored.cipher) {
    if (!crypto?.subtle || !secret) throw new Error('当前环境无法解密品鉴记录');
    const key = await importKey(secret);
    bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlDecode(stored.iv) }, key, base64UrlDecode(stored.cipher)));
  } else bytes = base64UrlDecode(stored.compact || '');
  const raw = await decompress(bytes, stored.compression);
  return expandSensoryRecord(JSON.parse(textDecoder.decode(raw)));
}

export function sensoryTagLabels(record = {}) {
  const tags = [];
  for (const value of Object.values(record.answers || {}).flatMap(groups => Object.values(groups || {}).flat())) {
    if (value && value !== '无') tags.push(String(value));
  }
  for (const values of Object.values(record.professional?.selections || {})) tags.push(...values);
  return [...new Set(tags)].slice(0, 40);
}
