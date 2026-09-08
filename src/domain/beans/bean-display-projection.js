function clean(value) { return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim(); }
function compactWeight(value) {
  const n = Math.max(0, Number(value || 0));
  return `${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)}g`;
}
export function compactVarietyLabel(value) {
  let label = clean(value);
  if (!label) return '';
  const jarc = label.match(/^(?:JARC\s*)?(\d{4,6})$/i);
  if (jarc) return jarc[1];
  label = label.replace(/^(?:埃塞俄比亚|埃塞俄比亞|衣索比亞|埃塞)\s*(?:原生种|原生種)$/u, '原生种');
  label = label.replace(/^(?:Ethiopia(?:n)?\s+)?Landrace$/i, 'Landrace');
  return label;
}
export function compactHarvestSeasonLabel(value) {
  const raw = clean(value);
  if (!raw) return '';
  const source = raw
    .replace(/\s*(?:产季|產季|crop(?:\s*year)?|harvest(?:\s*year)?|season)\s*$/i, '')
    .trim();
  let match = source.match(/^(20)?(\d{2})\s*[-–—/]\s*(?:20)?(\d{2})$/);
  if (match) return `${match[2]}/${match[3]}产季`;
  match = source.match(/^(?:20)?(\d{2})$/);
  if (match) return `${match[1]}产季`;
  return /产季$/.test(raw) ? raw : `${raw}产季`;
}
function compactDisplayDate(value) {
  const raw = clean(value);
  const match = raw.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[1]}-${Number(match[2])}-${Number(match[3])}`;
}
function processingStationLabel(bean = {}, facts = {}) {
  const explicit = clean(bean.processingStation);
  if (explicit) return /(?:处理站|處理站|washing\s+station)$/i.test(explicit) ? explicit : `${explicit}处理站`;
  return clean(facts.entity || bean.entityName || bean.entity || bean.farmName || bean.farm || bean.estateName || bean.estate);
}
export function buildBeanCardProjection(bean = {}, facts = {}) {
  const country = clean(facts.country || bean.countryName || bean.country || bean.countryCode);
  const origin = clean(facts.entity || bean.entityName || bean.entity || bean.processingStation || facts.region || bean.regionName || bean.region || bean.regionCode);
  const variety = compactVarietyLabel(facts.variety || bean.varietyName || bean.variety || bean.varietyCode);
  const roast = clean(facts.roast || bean.roastName || bean.roast || bean.roastCode);
  const process = clean(facts.process || bean.processName || bean.process || bean.processCode);
  return {
    left: [country, origin, variety].filter(Boolean),
    right: [roast, process, compactWeight(bean.remainingWeight)].filter(Boolean),
    country, origin, variety, roast, process, remaining:compactWeight(bean.remainingWeight)
  };
}
export function buildBeanDetailProjection(bean = {}, facts = {}) {
  const card = buildBeanCardProjection(bean, facts);
  const roaster = clean(bean.roasterName || bean.roaster);
  const product = clean(bean.productName || bean.product || bean.commercialName);
  const region = clean(facts.region || bean.regionName || bean.region || bean.regionCode);
  const station = processingStationLabel(bean, facts);
  const harvest = compactHarvestSeasonLabel(bean.harvestSeason || bean.harvestYear);
  const roastDate = compactDisplayDate(bean.roastDate);
  const roastColor = clean(bean.roastColor || bean.agtron || bean.colorValue);
  return {
    primary:[card.country, card.variety].filter(Boolean),
    secondary:[roaster, product].filter(Boolean),
    origin:[region, station, card.process, harvest].filter(Boolean),
    roast:[roastDate, card.roast, roastColor].filter(Boolean)
  };
}
