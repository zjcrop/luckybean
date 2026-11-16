export const WATER_ANALYSIS_CONTRACT = 'luckybean-water-analysis/1.0';
const IONS = Object.freeze(['Ca', 'Mg', 'Na', 'K', 'HCO3', 'CO3', 'Cl', 'SO4']);

export function optionalMeasurement(value, name, { min = 0, max = 10000, positive = false } = {}) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (positive && value === 0)) {
    throw new TypeError(`${name}须为${positive ? '正' : '非负'}有限数字${positive ? '' : '或零'}，未知请留空`);
  }
  return value;
}

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name}须为对象`);
  return value;
}

export function analyzeSourceWater({ water = {}, referenceProfile = {} } = {}) {
  object(water, 'water');
  object(referenceProfile, 'referenceProfile');
  const concentrationBasis = water.concentrationBasis ?? 'provided-unspecified';
  if (!['provided-unspecified', 'pre-heating-calculated', 'source-water-measured', 'post-heating-measured'].includes(concentrationBasis)) throw new TypeError('水样浓度来源无效');
  const tdsMgL = optionalMeasurement(water.tdsMgL, '原水TDS mg/L');
  const suppliedIons = water.ionsMgL == null ? {} : object(water.ionsMgL, 'water.ionsMgL');
  for (const ion of Object.keys(suppliedIons)) if (!IONS.includes(ion)) throw new TypeError(`不支持的离子：${ion}`);
  const ionsMgL = Object.fromEntries(IONS.map(ion => [ion, optionalMeasurement(suppliedIons[ion], `${ion} mg/L`)]));
  const alkalinityMgLAsCaCO3 = optionalMeasurement(water.alkalinityMgLAsCaCO3, '总碱度 mg/L as CaCO3');
  const rawReference = referenceProfile.referenceTdsRangeMgL ?? referenceProfile.tds;
  const rawRange = typeof rawReference === 'number' ? [rawReference, rawReference] : rawReference;
  let referenceTdsRangeMgL = null;
  if (rawRange != null) {
    if (!Array.isArray(rawRange) || rawRange.length !== 2) throw new TypeError('参考TDS须为两个端点的区间');
    const range = rawRange.map(value => optionalMeasurement(value, '参考TDS mg/L'));
    if (range.some(value => value === null) || range[1] < range[0]) throw new TypeError('参考TDS区间无效');
    referenceTdsRangeMgL = range;
  }
  const referenceTdsMgL = referenceTdsRangeMgL ? (referenceTdsRangeMgL[0] + referenceTdsRangeMgL[1]) / 2 : null;
  const generalHardnessMgLAsCaCO3 = ionsMgL.Ca !== null && ionsMgL.Mg !== null
    ? 100.0869 * (ionsMgL.Ca / 40.078 + ionsMgL.Mg / 24.305) : null;
  const carbonateAlkalinityMgLAsCaCO3 = ionsMgL.HCO3 !== null && ionsMgL.CO3 !== null
    ? (100.0869 / 2) * (ionsMgL.HCO3 / 61.017 + 2 * ionsMgL.CO3 / 60.008) : null;
  return {
    contract: WATER_ANALYSIS_CONTRACT,
    concentrationBasis,
    postHeatIonsMgL: concentrationBasis === 'post-heating-measured' ? { ...ionsMgL } : null,
    tdsMgL,
    tdsSource: tdsMgL === null ? 'unknown' : 'provided',
    referenceTdsMgL,
    referenceTdsRangeMgL,
    ionsMgL,
    alkalinityMgLAsCaCO3,
    generalHardnessMgLAsCaCO3,
    carbonateAlkalinityMgLAsCaCO3,
    automaticBrewAdjustment: false,
    ionInferenceApplied: false,
    warnings: [
      ...(tdsMgL === null ? ['原水TDS未知；预设参考值未当作实际水样读数。'] : []),
      '原水TDS不能唯一确定钙镁、碱度或咖啡萃取效果；当前模型不据此自动增减温度、时间或萃取率。',
      '硬度和碳酸盐碱度贡献只按明确输入的离子计算，不能替代实际水样或热后测量；有机缓冲未作总碱度推算。',
      'EC换算的ppm依赖仪表系数及组成；原水mg/L不是饮品折光TDS质量百分比。'
    ]
  };
}
