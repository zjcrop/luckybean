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
  const estate = clean(bean.farmName || bean.farm || bean.estateName || bean.estate || bean.entityName || bean.entity || bean.processingStation);
  const altitude = Number(bean.altitude || bean.elevation || 0) > 0 ? `${Number(bean.altitude || bean.elevation)}m` : '';
  const roastDate = clean(bean.roastDate);
  const roastColor = clean(bean.roastColor || bean.agtron || bean.colorValue);
  const roastDisplay = [card.roast, roastColor].filter(Boolean).join(' / ');
  const notes = clean(bean.notes || bean.note || bean.remark || bean.remarks);
  return {
    primary:[card.country, card.variety].filter(Boolean),
    secondary:[roaster, product].filter(Boolean),
    origin:[region, estate, card.process, altitude].filter(Boolean),
    roast:[roastDate, roastDisplay].filter(Boolean),
    notes
  };
}
