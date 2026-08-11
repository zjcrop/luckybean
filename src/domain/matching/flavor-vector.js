export const MATCH_CONTRACT = 'luckybean-match/1.1';
export const MATCH_SCHEMA_VERSION = 1;
export const MATCH_AXIS_SET = 'flavor_core_v1';
export const MATCH_AXES = Object.freeze(['acidity', 'sweetness', 'aroma', 'body', 'bitterness', 'clean', 'fermentation', 'aftertaste']);
export const MATCH_DIM = MATCH_AXES.length;

const DEFAULT_BEAN_VECTOR = Object.freeze([65, 68, 70, 55, 35, 65, 25, 60]);
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const add = (vector, delta) => vector.map((value, index) => clamp(value + Number(delta[index] || 0)));
const textOf = (...values) => values.filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase('zh-CN');

function roastDelta(value = '') {
  const key = String(value || '').toUpperCase();
  const map = {
    'RL-L0': [14, -2, 10, -14, -18, 10, 0, 2],
    'RL-L1': [11, 0, 9, -10, -15, 9, 0, 3],
    'RL-L2': [7, 3, 6, -5, -10, 6, 0, 5],
    'RL-L3': [1, 7, 1, 4, 0, 1, 0, 5],
    'RL-L4': [-7, 5, -4, 9, 9, -5, 0, 2],
    'RL-L5': [-13, 1, -9, 13, 17, -11, 0, -3],
    'RL-L6': [-18, -5, -14, 16, 24, -16, 0, -7]
  };
  return map[key] || Array(MATCH_DIM).fill(0);
}

function processDelta(value = '') {
  const key = textOf(value);
  if (/anaer|厌氧|发酵|carbonic|酵/.test(key)) return [3, 7, 11, 5, -1, -8, 17, 6];
  if (/natural|日晒|dry/.test(key)) return [2, 8, 9, 5, 0, -5, 6, 6];
  if (/honey|蜜/.test(key)) return [1, 9, 5, 5, -2, 1, 3, 6];
  if (/washed|水洗|wet/.test(key)) return [5, 1, 3, -2, -3, 10, -8, 4];
  return Array(MATCH_DIM).fill(0);
}

function varietyDelta(value = '') {
  const key = textOf(value);
  if (/geisha|gesha|瑰夏/.test(key)) return [8, 3, 12, -8, -5, 7, 0, 7];
  if (/sl28|sl-28/.test(key)) return [9, 2, 7, -5, -3, 5, 0, 6];
  if (/bourbon|波旁/.test(key)) return [3, 7, 4, 2, -2, 2, 0, 5];
  if (/typica|铁皮/.test(key)) return [4, 4, 4, -1, -2, 4, 0, 4];
  return Array(MATCH_DIM).fill(0);
}

function flavorTextDelta(value = '') {
  const key = textOf(value);
  const delta = Array(MATCH_DIM).fill(0);
  if (/floral|flower|花|茉莉|玫瑰|橙花/.test(key)) { delta[2] += 10; delta[0] += 3; delta[5] += 3; }
  if (/citrus|柑橘|柠檬|lime|orange|莓|berry|fruit|果/.test(key)) { delta[0] += 7; delta[2] += 6; delta[7] += 3; }
  if (/honey|sugar|caramel|甜|蜂蜜|焦糖|蔗糖/.test(key)) delta[1] += 9;
  if (/tea|茶/.test(key)) { delta[3] -= 5; delta[5] += 5; delta[7] += 4; }
  if (/chocolate|cacao|巧克力|可可|nut|坚果/.test(key)) { delta[3] += 6; delta[4] += 3; }
  if (/wine|酒|ferment|酵/.test(key)) { delta[6] += 9; delta[2] += 4; }
  return delta;
}

function ageDelta(roastDate) {
  if (!roastDate) return Array(MATCH_DIM).fill(0);
  const time = Date.parse(String(roastDate));
  if (!Number.isFinite(time)) return Array(MATCH_DIM).fill(0);
  const days = Math.max(0, (Date.now() - time) / 86400000);
  if (days <= 45) return Array(MATCH_DIM).fill(0);
  if (days <= 90) return [-1, -1, -4, 0, 0, -1, 0, -3];
  return [-3, -3, -9, -1, 2, -4, 0, -7];
}

export function buildBeanVector(bean = {}) {
  let vector = [...DEFAULT_BEAN_VECTOR];
  vector = add(vector, roastDelta(bean.roastCode || bean.roastLevel));
  vector = add(vector, processDelta(bean.processName || bean.processCode || bean.process));
  vector = add(vector, varietyDelta(bean.varietyName || bean.varietyCode || bean.variety));
  vector = add(vector, flavorTextDelta([bean.flavorText, bean.flavorNote, bean.notes, ...(bean.flavorCodes || [])].filter(Boolean).join(' ')));
  const altitude = Number(bean.altitude);
  if (Number.isFinite(altitude)) {
    if (altitude >= 1900) vector = add(vector, [7, 1, 5, -3, -3, 4, 0, 3]);
    else if (altitude >= 1600) vector = add(vector, [4, 1, 3, -2, -2, 2, 0, 2]);
    else if (altitude < 1100) vector = add(vector, [-3, 2, -2, 4, 2, -2, 0, 0]);
  }
  vector = add(vector, ageDelta(bean.roastDate));

  const evidence = [bean.countryCode || bean.country, bean.regionCode || bean.region, bean.varietyCode || bean.variety, bean.processCode || bean.process, bean.roastCode || bean.roastLevel, bean.roastColor, bean.altitude, bean.flavorText || bean.flavorNote || bean.notes || bean.flavorCodes?.length];
  const present = evidence.filter(value => value !== undefined && value !== null && value !== '').length;
  const confidence = Math.round(clamp(42 + present * 6.5, 42, 94));
  return { vector: vector.map(value => Math.round(clamp(value))), confidence };
}

function angleCorrection(value) {
  const angle = Number(value);
  if (!Number.isFinite(angle) || angle < 25 || angle > 95) return Array(MATCH_DIM).fill(0);
  const x = Math.max(-1, Math.min(1, (angle - 60) / 30));
  return [-1.5 * x, 1.0 * x, -1.5 * x, 2.0 * x, -0.5 * x, 0.5 * x, 0, 0.5 * x];
}

export function buildGearCorrection(settings = {}, brewInput = {}) {
  const matching = settings?.matchingGear || {};
  const dripperId = String(brewInput?.brew?.dripperId || brewInput?.brew?.dripperCode || 'default');
  const paperId = String(brewInput?.brew?.filterPaperId || 'default');
  const dripper = matching.drippers?.[dripperId] || matching.defaultDripper || {};
  const paper = matching.papers?.[paperId] || matching.defaultPaper || {};
  const bypass = String(dripper.bypass || 'medium');
  const speed = String(paper.speed || 'medium');
  let vector = angleCorrection(dripper.angleDeg);
  const bypassMap = {
    none: [1, 1, 0, 3, 2, 1, 0, 1],
    low: [1, 1, 0, 2, 1, 1, 0, 1],
    medium: Array(MATCH_DIM).fill(0),
    high: [-2, -1, -1, -3, -2, -1, 0, -1]
  };
  vector = add(vector, bypassMap[bypass] || bypassMap.medium);
  const speedMap = {
    low: [-1, 1, -1, 2, 2, -2, 0, 1],
    medium: Array(MATCH_DIM).fill(0),
    high: [2, -1, 2, -2, -1, 2, 0, -1]
  };
  vector = add(vector, speedMap[speed] || speedMap.medium);
  return vector.map(value => Math.round(clamp(value, -8, 8)));
}

export function buildTargetVector(targets = {}) {
  const t = key => clamp(Number(targets[key] ?? 1.5), 0, 3);
  const acidity = 48 + t('acidity') * 13;
  const sweetness = 48 + t('sweetness') * 14;
  const aroma = 45 + Math.max(t('floral'), t('fruity')) * 15;
  const body = 58;
  const bitterness = 48 - t('bitterness') * 11;
  const clean = 58 + t('astringency') * 11;
  const fermentation = 30;
  const aftertaste = 58 + Math.max(t('sweetness'), t('floral'), t('fruity')) * 8;
  return [acidity, sweetness, aroma, body, bitterness, clean, fermentation, aftertaste].map(value => Math.round(clamp(value)));
}

export function combineMatchVector(beanVector, ...corrections) {
  let vector = [...beanVector];
  for (const correction of corrections) vector = vector.map((value, index) => clamp(value + Number(correction?.[index] || 0)));
  return vector.map(value => Math.round(value));
}

export function encodeMatchSignature(matchVector, confidence = 75) {
  if (!Array.isArray(matchVector) || matchVector.length !== MATCH_DIM) throw new Error(`match_vector必须为${MATCH_DIM}维`);
  const hex = matchVector.map(value => Math.round(clamp(value)).toString(16).padStart(2, '0').toUpperCase()).join('');
  return `LMS1-FC1-X${hex}-Q${Math.round(clamp(confidence))}`;
}

export function buildMatchingEnvelope({ bean = {}, settings = {}, input = {}, userCorrection = [], sessionCorrection = [] } = {}) {
  const base = buildBeanVector(bean);
  const gearCorrection = buildGearCorrection(settings, input);
  const matchVector = combineMatchVector(base.vector, gearCorrection, userCorrection, sessionCorrection);
  const targetVector = buildTargetVector(input.targets || {});
  return {
    contract: MATCH_CONTRACT,
    schema_ver: MATCH_SCHEMA_VERSION,
    axis_set: MATCH_AXIS_SET,
    dim: MATCH_DIM,
    signature_type: 'match_only',
    signature: encodeMatchSignature(matchVector, base.confidence),
    match_vector: matchVector,
    target_vector: targetVector,
    confidence: base.confidence,
    model_versions: {
      bean_model_ver: 'bean-vector/1.0',
      gear_model_ver: 'gear-correction/1.1',
      target_model_ver: 'target-vector/1.0'
    }
  };
}
