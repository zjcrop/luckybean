import { optionalMeasurement } from '../water/water-analysis.js';

export const EXTRACTION_ASSESSMENT_CONTRACT = 'luckybean-extraction-assessment/1.0';

export function assessExtractionMeasurements({ measurements = {}, brew = {} } = {}) {
  for (const [name, value] of [['measurements', measurements], ['brew', brew]]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name}须为对象`);
  }
  const beverageTdsPct = optionalMeasurement(measurements.beverageTdsPct, '饮品TDS质量百分比', { max: 100 });
  const beverageMassG = optionalMeasurement(measurements.beverageMassG, '实际饮品产出g', { max: 1000000, positive: true });
  const hasMeasuredDose = measurements.doseG !== undefined;
  const doseG = optionalMeasurement(hasMeasuredDose ? measurements.doseG : brew.doseG, '实际投粉g', { max: 10000, positive: true });
  const missingInputs = Object.entries({ beverageTdsPct, beverageMassG, doseG }).filter(([, value]) => value === null).map(([name]) => name);
  const complete = missingInputs.length === 0;
  const dissolvedSolidsMassG = beverageTdsPct !== null && beverageMassG !== null ? beverageTdsPct / 100 * beverageMassG : null;
  const extractionYieldPct = complete ? beverageTdsPct * beverageMassG / doseG : null;
  return {
    contract: EXTRACTION_ASSESSMENT_CONTRACT,
    status: complete ? 'measured-mass-balance' : 'insufficient-measurements',
    beverageTdsPct,
    beverageMassG,
    doseG,
    doseSource: hasMeasuredDose ? 'measurement-input' : doseG !== null ? 'brew-input' : 'unknown',
    dissolvedSolidsMassG,
    extractionYieldPct,
    interpretation: 'apparent-beverage-solids-yield',
    waterBlankCorrectionApplied: false,
    sourceWaterTdsSubtracted: false,
    missingInputs,
    assumptions: [
      ...(!hasMeasuredDose && doseG !== null ? ['brew.doseG按实际称量的投粉量解释；若它只是自动方案建议，请填写实测粉量或将measurements.doseG留为null。'] : []),
      '饮品TDS、饮品产出和粉量对应同一次冲煮；未校正原水光学空白。'
    ],
    warnings: [
      ...(!complete ? ['缺少配对的饮品TDS、实际饮品产出或实际投粉量，不能计算萃取率；总注水量不作为杯中产出。'] : []),
      ...(extractionYieldPct !== null && extractionYieldPct > 100 ? ['表观产率超过100%，请核对单位、投粉量、产出和饮品TDS是否来自同一次测量。'] : []),
      '该结果为杯中回收可溶物的表观产率，未作经验证的水样光学空白校正，不等同于纯咖啡固形物真值或全浸泡总萃取率。',
      '粉量须为实际称量，饮品TDS与产出须对应同一份最终饮品；稀释或加冰后应重新配对测量。',
      '未从饮品折光TDS中盲扣原水EC换算ppm，未用固定吸水率推算饮品产出。'
    ]
  };
}
