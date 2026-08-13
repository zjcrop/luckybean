export const MATCH_CONTRACT = 'luckybean-match/1.1';
export const MATCH_SCHEMA_VERSION = 1;
export const MATCH_AXIS_SET = 'flavor_core_v1';
export const MATCH_AXES = Object.freeze(['acidity', 'sweetness', 'aroma', 'body', 'bitterness', 'clean', 'fermentation', 'aftertaste']);
export const MATCH_DIM = MATCH_AXES.length;
export const GEAR_PHYSICS_CONTRACT = 'gear-physics/1.0';
export const DRIPPER_CATALOG_VERSION = 'dripper-catalog/1.0.0';
export const FILTER_PAPER_CATALOG_VERSION = 'filter-paper-catalog/1.0.0';

const DEFAULT_BEAN_VECTOR = Object.freeze([65, 68, 70, 55, 35, 65, 25, 60]);
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const add = (vector, delta) => vector.map((value, index) => clamp(value + Number(delta[index] || 0)));
const sumDelta = (vector, delta) => vector.map((value, index) => Number(value || 0) + Number(delta[index] || 0));
const textOf = (...values) => values.filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase('zh-CN');

const sourceConfidence = Object.freeze({
  'user-measured': 0.98,
  manufacturer: 0.95,
  'manufacturer-qualitative': 0.78,
  'catalog-peer-median': 0.62,
  'catalog-family-estimate': 0.55,
  'group-prior': 0.38,
  'material-prior': 0.34,
  'application-default': 0.30,
  unknown: 0
});
const sourceScore = source => sourceConfidence[source] ?? 0.25;
const physicalField = (value, source = 'manufacturer') => Object.freeze({ value, source });
const manufacturer = value => physicalField(value, 'manufacturer');
const qualitative = value => physicalField(value, 'manufacturer-qualitative');
const missing = () => physicalField(null, 'unknown');

/**
 * Brand/name/aliases/modelCode are identity metadata only. They may be used to
 * search or identify a product but are forbidden from physics calculations.
 * Missing manufacturer data intentionally stays null until Parameter Resolver.
 */
export const DRIPPER_CATALOG = Object.freeze([
  Object.freeze({ id:'hario-v60-02-plastic', familyId:'hario-v60-02', brand:'HARIO', name:'V60 02 Plastic', aliases:['V60','V60 02','Hario V60','哈里欧V60','V60塑料'], modelCode:'VDR-02', physics:Object.freeze({ group:manufacturer('cone'), angleDeg:manufacturer(60), outletAreaMm2:missing(), outletClass:qualitative('large'), drainageClass:qualitative('high'), bypassClass:missing(), materialKey:manufacturer('asResin'), massG:missing(), preheatedDefault:physicalField(true,'application-default'), valveControl:manufacturer(false), ribPattern:qualitative('spiral') }) }),
  Object.freeze({ id:'hario-v60-02-ceramic', familyId:'hario-v60-02', brand:'HARIO', name:'V60 02 Ceramic', aliases:['V60 Ceramic','V60陶瓷','V60瓷','Hario V60 Ceramic'], modelCode:'VDC-02', physics:Object.freeze({ group:manufacturer('cone'), angleDeg:manufacturer(60), outletAreaMm2:missing(), outletClass:qualitative('large'), drainageClass:qualitative('high'), bypassClass:missing(), materialKey:manufacturer('porcelain'), massG:missing(), preheatedDefault:physicalField(true,'application-default'), valveControl:manufacturer(false), ribPattern:qualitative('spiral') }) }),
  Object.freeze({ id:'hario-switch-02-glass', familyId:'hario-switch-02', brand:'HARIO', name:'V60 SWITCH Glass 02', aliases:['Switch','Hario Switch','V60 Switch','聪明杯Switch'], modelCode:'SSD-200-B', physics:Object.freeze({ group:manufacturer('hybrid'), angleDeg:qualitative(60), outletAreaMm2:missing(), outletClass:manufacturer('valve'), drainageClass:manufacturer('controllable'), bypassClass:qualitative('low'), materialKey:manufacturer('borosilicateGlass'), massG:missing(), preheatedDefault:physicalField(true,'application-default'), valveControl:manufacturer(true), ribPattern:qualitative('spiral') }) }),
  Object.freeze({ id:'hario-switch-02-ceramic', familyId:'hario-switch-02', brand:'HARIO', name:'V60 SWITCH Ceramic 02', aliases:['Switch Ceramic','Hario Switch Ceramic','V60 Switch陶瓷'], modelCode:'SSDC-200', physics:Object.freeze({ group:manufacturer('hybrid'), angleDeg:qualitative(60), outletAreaMm2:missing(), outletClass:manufacturer('valve'), drainageClass:manufacturer('controllable'), bypassClass:qualitative('low'), materialKey:manufacturer('porcelain'), massG:missing(), preheatedDefault:physicalField(true,'application-default'), valveControl:manufacturer(true), ribPattern:qualitative('spiral') }) }),
  Object.freeze({ id:'kalita-wave-155-stainless', familyId:'kalita-wave-155', brand:'Kalita', name:'Wave 155 Stainless', aliases:['Kalita 155','Wave 155','卡丽塔155','Kalita Wave 155'], modelCode:'Wave155', physics:Object.freeze({ group:manufacturer('flat'), angleDeg:missing(), outletAreaMm2:missing(), outletClass:qualitative('medium'), drainageClass:qualitative('high'), bypassClass:qualitative('low'), materialKey:manufacturer('stainlessSteel'), massG:missing(), preheatedDefault:physicalField(true,'application-default'), valveControl:manufacturer(false), outletPattern:manufacturer('three-hole') }) }),
  Object.freeze({ id:'kalita-wave-185-stainless', familyId:'kalita-wave-185', brand:'Kalita', name:'Wave 185 Stainless', aliases:['Kalita 185','Wave 185','卡丽塔185','Kalita Wave 185'], modelCode:'Wave185', physics:Object.freeze({ group:manufacturer('flat'), angleDeg:missing(), outletAreaMm2:missing(), outletClass:qualitative('medium'), drainageClass:qualitative('high'), bypassClass:qualitative('low'), materialKey:manufacturer('stainlessSteel'), massG:missing(), preheatedDefault:physicalField(true,'application-default'), valveControl:manufacturer(false), outletPattern:manufacturer('three-hole') }) }),
  Object.freeze({ id:'timemore-b75-pctg', familyId:'timemore-b75', brand:'TIMEMORE', name:'Crystal Eye B75', aliases:['B75','泰摩B75','Timemore B75','晶钻B75'], modelCode:'B75', physics:Object.freeze({ group:manufacturer('flat'), angleDeg:manufacturer(75), outletAreaMm2:missing(), outletClass:qualitative('large'), drainageClass:manufacturer('high'), bypassClass:qualitative('low'), materialKey:manufacturer('pctg'), massG:missing(), preheatedDefault:physicalField(true,'application-default'), valveControl:manufacturer(false), ribPattern:manufacturer('20-channel') }) }),
  Object.freeze({ id:'april-plastic', familyId:'april-flat', brand:'April', name:'Plastic Brewer', aliases:['April Plastic','April塑料滤杯'], modelCode:'April-Plastic', physics:Object.freeze({ group:manufacturer('flat'), angleDeg:missing(), outletAreaMm2:missing(), outletClass:missing(), drainageClass:manufacturer('high'), bypassClass:missing(), materialKey:manufacturer('polycarbonate'), massG:missing(), preheatedDefault:physicalField(true,'application-default'), valveControl:manufacturer(false) }) }),
  Object.freeze({ id:'april-ceramic', familyId:'april-flat', brand:'April', name:'Porcelain Brewer', aliases:['April Ceramic','April陶瓷滤杯','April Porcelain'], modelCode:'April-Ceramic', physics:Object.freeze({ group:manufacturer('flat'), angleDeg:missing(), outletAreaMm2:missing(), outletClass:missing(), drainageClass:manufacturer('medium'), bypassClass:missing(), materialKey:manufacturer('porcelain'), massG:missing(), preheatedDefault:physicalField(true,'application-default'), valveControl:manufacturer(false) }) }),
  Object.freeze({ id:'april-glass', familyId:'april-flat', brand:'April', name:'Glass Brewer', aliases:['April Glass','April玻璃滤杯'], modelCode:'April-Glass', physics:Object.freeze({ group:manufacturer('flat'), angleDeg:missing(), outletAreaMm2:missing(), outletClass:missing(), drainageClass:manufacturer('low'), bypassClass:missing(), materialKey:manufacturer('glass'), massG:missing(), preheatedDefault:physicalField(true,'application-default'), valveControl:manufacturer(false) }) }),
  Object.freeze({ id:'april-hybrid', familyId:'april-hybrid', brand:'April', name:'Hybrid Brewer', aliases:['April Hybrid','April浸泡滤杯'], modelCode:'April-Hybrid', physics:Object.freeze({ group:manufacturer('hybrid'), angleDeg:missing(), outletAreaMm2:missing(), outletClass:manufacturer('valve'), drainageClass:manufacturer('controllable'), bypassClass:qualitative('low'), materialKey:qualitative('glassComposite'), massG:missing(), preheatedDefault:physicalField(true,'application-default'), valveControl:manufacturer(true) }) }),
  Object.freeze({ id:'origami-air-s', familyId:'origami-s', brand:'ORIGAMI', name:'Dripper Air S', aliases:['Origami Air S','折纸Air S','Origami S塑料'], modelCode:'Air-S', physics:Object.freeze({ group:manufacturer('cone'), angleDeg:missing(), outletAreaMm2:manufacturer(Math.PI * 12.5 * 12.5), outletClass:manufacturer('open'), drainageClass:qualitative('high'), bypassClass:missing(), materialKey:manufacturer('asResin'), massG:manufacturer(64), preheatedDefault:physicalField(true,'application-default'), valveControl:manufacturer(false), ribPattern:manufacturer('20-rib') }) }),
  Object.freeze({ id:'orea-v4-narrow-fast', familyId:'orea-v4-narrow', brand:'OREA', name:'V4 Narrow / FAST', aliases:['OREA V4 Narrow','V4 Narrow FAST','OREA窄版V4'], modelCode:'V4-Narrow-FAST', physics:Object.freeze({ group:manufacturer('flat'), angleDeg:manufacturer(73), outletAreaMm2:missing(), outletClass:qualitative('large'), drainageClass:manufacturer('high'), bypassClass:qualitative('low'), materialKey:manufacturer('polypropylene'), massG:missing(), preheatedDefault:manufacturer(false), valveControl:manufacturer(false), bottomVariant:manufacturer('FAST') }) }),
  Object.freeze({ id:'orea-v4-wide-fast', familyId:'orea-v4-wide', brand:'OREA', name:'V4 Wide / FAST', aliases:['OREA V4 Wide','V4 Wide FAST','OREA宽版V4'], modelCode:'V4-Wide-FAST', physics:Object.freeze({ group:manufacturer('flat'), angleDeg:manufacturer(65), outletAreaMm2:missing(), outletClass:qualitative('large'), drainageClass:qualitative('high'), bypassClass:qualitative('low'), materialKey:manufacturer('polypropylene'), massG:missing(), preheatedDefault:manufacturer(false), valveControl:manufacturer(false), bottomVariant:manufacturer('FAST') }) }),
  Object.freeze({ id:'nextlevel-pulsar', familyId:'nextlevel-pulsar', brand:'NextLevel', name:'Pulsar', aliases:['Pulsar','NextLevel Pulsar','脉冲星滤杯'], modelCode:'Pulsar', physics:Object.freeze({ group:manufacturer('lowBypass'), angleDeg:missing(), outletAreaMm2:missing(), outletClass:manufacturer('valve'), drainageClass:manufacturer('controllable'), bypassClass:manufacturer('none'), materialKey:manufacturer('tritan'), massG:missing(), preheatedDefault:qualitative(false), valveControl:manufacturer(true), noBypass:manufacturer(true) }) })
]);

export const FILTER_PAPER_CATALOG = Object.freeze([
  Object.freeze({ id:'hario-v60-02-white', brand:'HARIO', name:'V60 02 White Paper', aliases:['Hario 02','V60 02滤纸','Hario V60 Paper 02'], physics:Object.freeze({ shape:manufacturer('cone'), flowClass:missing(), bypassTendency:missing(), materialKey:qualitative('paper') }) }),
  Object.freeze({ id:'kalita-wave-155-paper', brand:'Kalita', name:'Wave Filter 155', aliases:['Wave 155滤纸','Kalita 155 Filter'], physics:Object.freeze({ shape:manufacturer('wave-flat'), flowClass:qualitative('high'), bypassTendency:qualitative('low'), materialKey:qualitative('paper') }) }),
  Object.freeze({ id:'kalita-wave-185-paper', brand:'Kalita', name:'Wave Filter 185', aliases:['Wave 185滤纸','Kalita 185 Filter'], physics:Object.freeze({ shape:manufacturer('wave-flat'), flowClass:qualitative('high'), bypassTendency:qualitative('low'), materialKey:qualitative('paper') }) }),
  Object.freeze({ id:'cafec-abaca-plus-cone', brand:'CAFEC', name:'Abaca+ Cone', aliases:['Abaca+','CAFEC Abaca Plus','阿巴卡Plus'], physics:Object.freeze({ shape:manufacturer('cone'), flowClass:manufacturer('high'), bypassTendency:missing(), materialKey:manufacturer('abaca-paper') }) }),
  Object.freeze({ id:'cafec-abaca-cone', brand:'CAFEC', name:'Abaca Cone', aliases:['CAFEC Abaca','阿巴卡滤纸'], physics:Object.freeze({ shape:manufacturer('cone'), flowClass:qualitative('high'), bypassTendency:missing(), materialKey:manufacturer('abaca-paper') }) }),
  Object.freeze({ id:'cafec-t83', brand:'CAFEC', name:'T-83 Medium-Dark Roast', aliases:['CAFEC T83','T-83'], physics:Object.freeze({ shape:manufacturer('cone'), flowClass:qualitative('variable-braking'), bypassTendency:missing(), materialKey:qualitative('paper') }) }),
  Object.freeze({ id:'sibarist-cone-fast', brand:'SIBARIST', name:'CONE FAST', aliases:['Sibarist FAST Cone','FAST锥形'], physics:Object.freeze({ shape:manufacturer('cone'), flowClass:manufacturer('high'), bypassTendency:qualitative('low'), materialKey:qualitative('specialty-paper') }) }),
  Object.freeze({ id:'sibarist-cone-b3', brand:'SIBARIST', name:'CONE B3', aliases:['Sibarist B3 Cone','B3锥形'], physics:Object.freeze({ shape:manufacturer('cone'), flowClass:qualitative('medium'), bypassTendency:manufacturer('low'), materialKey:qualitative('specialty-paper') }) }),
  Object.freeze({ id:'sibarist-flat-fast', brand:'SIBARIST', name:'FLAT FAST', aliases:['Sibarist FAST Flat','FAST平底'], physics:Object.freeze({ shape:manufacturer('flat'), flowClass:manufacturer('high'), bypassTendency:manufacturer('none'), materialKey:qualitative('specialty-paper') }) }),
  Object.freeze({ id:'sibarist-flat-b3', brand:'SIBARIST', name:'FLAT B3', aliases:['Sibarist B3 Flat','B3平底'], physics:Object.freeze({ shape:manufacturer('flat'), flowClass:qualitative('medium'), bypassTendency:manufacturer('none'), materialKey:qualitative('specialty-paper') }) }),
  Object.freeze({ id:'april-paper-s', brand:'April', name:'Paper Filter S', aliases:['April S Filter','April小滤纸'], physics:Object.freeze({ shape:manufacturer('flat'), flowClass:missing(), bypassTendency:missing(), materialKey:manufacturer('wood-pulp') }) }),
  Object.freeze({ id:'april-paper-l', brand:'April', name:'Paper Filter L', aliases:['April L Filter','April大滤纸'], physics:Object.freeze({ shape:manufacturer('flat'), flowClass:missing(), bypassTendency:missing(), materialKey:manufacturer('wood-pulp') }) }),
  Object.freeze({ id:'nextlevel-pulsar-paper', brand:'NextLevel', name:'Pulsar Paper Filters', aliases:['Pulsar滤纸','NextLevel Pulsar Filter'], physics:Object.freeze({ shape:manufacturer('disc-flat'), flowClass:qualitative('medium'), bypassTendency:manufacturer('none'), materialKey:qualitative('paper') }) })
]);

const GROUP_PRIORS = Object.freeze({
  cone: { angleDeg:60, outletClass:'large', drainageClass:'medium', bypassClass:'medium', contactAreaIndex:0.92 },
  flat: { angleDeg:75, outletClass:'medium', drainageClass:'medium', bypassClass:'low', contactAreaIndex:1.04 },
  hybrid: { angleDeg:65, outletClass:'valve', drainageClass:'controllable', bypassClass:'low', contactAreaIndex:1.02 },
  lowBypass: { angleDeg:88, outletClass:'medium', drainageClass:'medium', bypassClass:'none', contactAreaIndex:1.08 },
  immersion: { angleDeg:90, outletClass:'valve', drainageClass:'controllable', bypassClass:'none', contactAreaIndex:1.12 }
});
const MATERIAL_MASS_PRIORS = Object.freeze({
  genericPlastic:90, asResin:85, pctg:90, polycarbonate:95, polypropylene:90, tritan:120,
  porcelain:280, ceramic:280, glass:240, borosilicateGlass:240, glassComposite:240,
  stainlessSteel:170, titanium:75
});
const OUTLET_INDEX = Object.freeze({ small:0.62, medium:0.82, large:1.02, open:1.18, valve:0.86 });
const DRAINAGE_INDEX = Object.freeze({ low:0.78, medium:1, high:1.22, controllable:1 });
const FILTER_FLOW_INDEX = Object.freeze({ low:0.82, medium:1, high:1.20, 'variable-braking':0.94 });
const BYPASS_FRACTION = Object.freeze({ none:0, low:0.03, medium:0.07, high:0.12 });
const LEGACY_GROUP = Object.freeze({ '锥形滤杯':'cone', '平底滤杯':'flat', '混合式滤杯':'hybrid', '低旁路滤杯':'lowBypass', '浸泡式滤杯':'immersion' });

function fieldValue(value) { return value && typeof value === 'object' && Object.hasOwn(value, 'value') ? value.value : value; }
function fieldSource(value, fallback = 'user-measured') { return value && typeof value === 'object' && value.source ? value.source : fallback; }
function catalogItem(rows, id) { return rows.find(item => String(item.id) === String(id || '')) || null; }
export function dripperCatalogItem(id) { return catalogItem(DRIPPER_CATALOG, id); }
export function filterPaperCatalogItem(id) { return catalogItem(FILTER_PAPER_CATALOG, id); }

function normalizeGroup(value) {
  const key = String(value || '').trim();
  if (Object.hasOwn(GROUP_PRIORS, key)) return key;
  return LEGACY_GROUP[key] || '';
}
function normalizeMaterialKey(value) {
  const key = String(value || '').trim();
  const aliases = { plastic:'genericPlastic', ceramic:'ceramic', glass:'glass', titanium:'titanium', porcelain:'porcelain', pctg:'pctg', polycarbonate:'polycarbonate', polypropylene:'polypropylene', tritan:'tritan', stainless:'stainlessSteel', stainlessSteel:'stainlessSteel', asResin:'asResin', borosilicateGlass:'borosilicateGlass', glassComposite:'glassComposite' };
  return aliases[key] || key || 'genericPlastic';
}
export function legacyMaterialClass(materialKey) {
  const key = normalizeMaterialKey(materialKey);
  if (['porcelain','ceramic'].includes(key)) return 'ceramic';
  if (['glass','borosilicateGlass','glassComposite'].includes(key)) return 'glass';
  if (key === 'titanium') return 'titanium';
  return 'plastic';
}
function normalizeBypassClass(value) {
  const key = String(value || '').toLowerCase();
  if (['none','无','0'].includes(key)) return 'none';
  if (['low','少','1'].includes(key)) return 'low';
  if (['high','多','3'].includes(key)) return 'high';
  return key === 'medium' || key === '中' || key === '2' ? 'medium' : '';
}
function normalizeFlowClass(value) {
  const key = String(value || '').toLowerCase();
  if (['low','低'].includes(key)) return 'low';
  if (['high','高'].includes(key)) return 'high';
  if (key === 'variable-braking') return key;
  return key === 'medium' || key === '中' ? 'medium' : '';
}
function normalizeOutletClass(value) {
  const key = String(value || '').toLowerCase();
  return Object.hasOwn(OUTLET_INDEX, key) ? key : '';
}
function numericField(...values) {
  for (const entry of values) {
    const value = Number(fieldValue(entry));
    if (Number.isFinite(value)) return { value, source:fieldSource(entry) };
  }
  return null;
}
function stringField(...values) {
  for (const entry of values) {
    const value = String(fieldValue(entry) ?? '').trim();
    if (value) return { value, source:fieldSource(entry) };
  }
  return null;
}
function booleanField(...values) {
  for (const entry of values) {
    const value = fieldValue(entry);
    if (typeof value === 'boolean') return { value, source:fieldSource(entry) };
  }
  return null;
}
function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a,b) => a-b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function peerMass(materialKey, group) {
  const samples = DRIPPER_CATALOG.filter(item => {
    const m = normalizeMaterialKey(fieldValue(item.physics.materialKey));
    const g = normalizeGroup(fieldValue(item.physics.group));
    return m === materialKey && g === group && Number.isFinite(Number(fieldValue(item.physics.massG)));
  }).map(item => Number(fieldValue(item.physics.massG)));
  const value = median(samples);
  return value == null ? null : { value, source:'catalog-peer-median', sampleCount:samples.length };
}
function overallConfidence(fields) {
  const scores = Object.values(fields).map(item => sourceScore(item?.source || 'unknown')).filter(Number.isFinite);
  return scores.length ? Math.round(100 * scores.reduce((a,b) => a+b, 0) / scores.length) / 100 : 0;
}

export function resolveDripperPhysics(record = {}, match = {}) {
  const template = dripperCatalogItem(record.catalogId || record.physicsTemplateId);
  const p = template?.physics || {};
  const custom = record.physics || {};
  const groupField = stringField(custom.group, p.group, normalizeGroup(record.group || record.type));
  const group = normalizeGroup(groupField?.value) || 'flat';
  const prior = GROUP_PRIORS[group] || GROUP_PRIORS.flat;
  const groupSource = groupField?.source || 'group-prior';
  const materialField = stringField(custom.materialKey, p.materialKey, record.materialKey, match.materialKey, record.material, match.material);
  const materialKey = normalizeMaterialKey(materialField?.value);
  const angle = numericField(custom.angleDeg, p.angleDeg, match.angleDeg, record.angleDeg) || { value:prior.angleDeg, source:'group-prior' };
  const outletArea = numericField(custom.outletAreaMm2, p.outletAreaMm2, record.outletAreaMm2);
  const outletClassField = stringField(custom.outletClass, p.outletClass, record.outletClass);
  const outletClass = normalizeOutletClass(outletClassField?.value) || prior.outletClass;
  const outletSource = outletArea?.source || outletClassField?.source || 'group-prior';
  const outletIndex = outletArea
    ? clamp(Math.sqrt(Math.max(1, outletArea.value) / 180), 0.55, 1.25)
    : OUTLET_INDEX[outletClass] || 0.82;
  const drainageField = stringField(custom.drainageClass, p.drainageClass, record.drainageClass, match.drainageClass);
  const drainageClass = normalizeFlowClass(drainageField?.value) || (drainageField?.value === 'controllable' ? 'controllable' : prior.drainageClass);
  const bypassField = stringField(custom.bypassClass, p.bypassClass, record.bypassClass, match.bypass, record.bypass);
  const bypassClass = normalizeBypassClass(bypassField?.value) || prior.bypassClass;
  const explicitMass = numericField(custom.massG, p.massG, record.massG, match.massG);
  const peer = explicitMass ? null : peerMass(materialKey, group);
  const mass = explicitMass || peer || { value:MATERIAL_MASS_PRIORS[materialKey] || MATERIAL_MASS_PRIORS.genericPlastic, source:'material-prior' };
  const preheated = booleanField(custom.preheated, p.preheatedDefault, record.preheated, match.preheated) || { value:true, source:'application-default' };
  const valve = booleanField(custom.valveControl, p.valveControl, record.valveControl) || { value:false, source:'group-prior' };
  const contact = numericField(custom.contactAreaIndex, record.contactAreaIndex) || { value:prior.contactAreaIndex, source:'group-prior' };
  const provenance = {
    group:{ source:groupSource }, materialKey:{ source:materialField?.source || 'material-prior' }, angleDeg:{ source:angle.source },
    outlet:{ source:outletSource }, drainageClass:{ source:drainageField?.source || 'group-prior' }, bypassClass:{ source:bypassField?.source || 'group-prior' },
    massG:{ source:mass.source, ...(mass.sampleCount ? { sampleCount:mass.sampleCount } : {}) }, preheated:{ source:preheated.source }, contactAreaIndex:{ source:contact.source }
  };
  return {
    contract:GEAR_PHYSICS_CONTRACT, kind:'dripper', catalogVersion:DRIPPER_CATALOG_VERSION,
    catalogId:template?.id || null, familyId:template?.familyId || null,
    group, angleDeg:Math.round(clamp(angle.value, 25, 95) * 10) / 10,
    outletAreaMm2:outletArea ? Math.round(Math.max(0, outletArea.value) * 100) / 100 : null,
    outletClass, outletIndex:Math.round(outletIndex * 1000) / 1000,
    drainageClass, drainageIndex:DRAINAGE_INDEX[drainageClass] || 1,
    bypassClass, bypassFraction:BYPASS_FRACTION[bypassClass] ?? BYPASS_FRACTION.medium,
    materialKey, materialClass:legacyMaterialClass(materialKey), massG:Math.round(clamp(mass.value, 10, 1000)),
    preheated:Boolean(preheated.value), valveControl:Boolean(valve.value), contactAreaIndex:Math.round(clamp(contact.value, 0.65, 1.35) * 1000) / 1000,
    provenance, confidence:overallConfidence(provenance)
  };
}

export function resolveFilterPaperPhysics(record = {}, match = {}) {
  const template = filterPaperCatalogItem(record.catalogId || record.physicsTemplateId);
  const p = template?.physics || {};
  const custom = record.physics || {};
  const shapeField = stringField(custom.shape, p.shape, record.shape);
  const shape = shapeField?.value || 'unknown';
  const flowField = stringField(custom.flowClass, p.flowClass, record.flowClass, match.speed, record.speed);
  const flowClass = normalizeFlowClass(flowField?.value) || 'medium';
  const bypassField = stringField(custom.bypassTendency, p.bypassTendency, record.bypassTendency);
  const bypassTendency = normalizeBypassClass(bypassField?.value) || (shape.includes('flat') ? 'low' : 'medium');
  const provenance = {
    shape:{ source:shapeField?.source || 'group-prior' },
    flowClass:{ source:flowField?.source || 'group-prior' },
    bypassTendency:{ source:bypassField?.source || 'group-prior' }
  };
  return {
    contract:GEAR_PHYSICS_CONTRACT, kind:'filter-paper', catalogVersion:FILTER_PAPER_CATALOG_VERSION,
    catalogId:template?.id || null, shape, flowClass, flowIndex:FILTER_FLOW_INDEX[flowClass] || 1,
    bypassTendency, bypassFraction:BYPASS_FRACTION[bypassTendency] ?? BYPASS_FRACTION.medium,
    provenance, confidence:overallConfidence(provenance)
  };
}

function findById(rows, id) {
  if (!Array.isArray(rows) || !id) return null;
  return rows.find(row => String(row?.id || '') === String(id)) || null;
}

export function resolveGearPhysics(settings = {}, brewInput = {}) {
  const matching = settings?.matchingGear || {};
  const gear = settings?.gear || {};
  const brew = brewInput?.brew || {};
  const dripperId = String(brew.dripperId || '');
  const paperId = String(brew.filterPaperId || '');
  const dripper = findById(gear.drippers, dripperId) || {};
  const paper = findById(gear.filters, paperId) || {};
  const dripperPhysics = resolveDripperPhysics(dripper, matching.drippers?.[dripperId] || matching.defaultDripper || {});
  const paperPhysics = resolveFilterPaperPhysics(paper, matching.papers?.[paperId] || matching.defaultPaper || {});
  return {
    contract:GEAR_PHYSICS_CONTRACT,
    dripper:dripperPhysics,
    paper:paperPhysics,
    confidence:Math.round(((dripperPhysics.confidence * 0.72) + (paperPhysics.confidence * 0.28)) * 100) / 100
  };
}

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
  if (/spice|香料|肉桂|丁香|胡椒|豆蔻/.test(key)) { delta[2] += 3; delta[7] += 2; }
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
function bypassKey(value) { return normalizeBypassClass(value) || 'medium'; }
function speedKey(value) { return normalizeFlowClass(value) || 'medium'; }

export function buildGearCorrection(settings = {}, brewInput = {}) {
  const matching = settings?.matchingGear || {};
  const gear = settings?.gear || {};
  const dripperId = String(brewInput?.brew?.dripperId || brewInput?.brew?.dripperCode || 'default');
  const paperId = String(brewInput?.brew?.filterPaperId || 'default');
  const gearDripper = findById(gear.drippers, dripperId) || {};
  const matchDripper = matching.drippers?.[dripperId] || matching.defaultDripper || {};
  const snapshotDripper = brewInput?.brew?.dripperSnapshot || brewInput?.brew?.dripperPhysical || {};
  const dripper = { ...gearDripper, ...matchDripper, ...snapshotDripper };
  const gearPaper = findById(gear.filters, paperId) || {};
  const matchPaper = matching.papers?.[paperId] || matching.defaultPaper || {};
  const snapshotPaper = brewInput?.brew?.filterPaperSnapshot || brewInput?.brew?.filterPaperPhysical || {};
  const paper = { ...gearPaper, ...matchPaper, ...snapshotPaper };
  const bypass = bypassKey(dripper.bypassClass || dripper.bypass);
  const speed = speedKey(paper.flowClass || paper.speed);
  let vector = angleCorrection(dripper.angleDeg);
  const bypassMap = { none:[1,1,0,3,2,1,0,1], low:[1,1,0,2,1,1,0,1], medium:Array(MATCH_DIM).fill(0), high:[-2,-1,-1,-3,-2,-1,0,-1] };
  vector = sumDelta(vector, bypassMap[bypass] || bypassMap.medium);
  const speedMap = { low:[-1,1,-1,2,2,-2,0,1], medium:Array(MATCH_DIM).fill(0), high:[2,-1,2,-2,-1,2,0,-1], 'variable-braking':[-1,1,0,1,1,-1,0,1] };
  vector = sumDelta(vector, speedMap[speed] || speedMap.medium);
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
    contract:MATCH_CONTRACT, schema_ver:MATCH_SCHEMA_VERSION, axis_set:MATCH_AXIS_SET, dim:MATCH_DIM,
    signature_type:'match_only', signature:encodeMatchSignature(matchVector, base.confidence), match_vector:matchVector, target_vector:targetVector, confidence:base.confidence,
    model_versions:{ bean_model_ver:'bean-vector/1.1', gear_model_ver:'gear-correction/1.3', gear_physics_ver:GEAR_PHYSICS_CONTRACT, target_model_ver:'target-vector/1.0' }
  };
}
