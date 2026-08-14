const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

export const BREW_OPTIMIZATION_ASSESSMENT_CONTRACT = 'brew-optimization-assessment/1.0';
export const PERSONAL_SENSITIVITY_CONTRACT = 'brew-personal-sensitivity/1.0';

const STYLE_AXES = Object.freeze(['flavor', 'aftertaste', 'acidity', 'sweetness', 'body', 'cleanliness', 'consistency', 'balance']);
const AROMA_AXES = Object.freeze(['floral', 'fruity', 'tea', 'nutty', 'ferment']);
const ISSUE_DEFINITIONS = Object.freeze({
  aromaLow: { label:'香气不足', targetIds:['floral','fruity'], direction:'low', adjustment:'强化前中段香气表达' },
  aromaExcess: { label:'香气过强', targetIds:['floral','fruity'], direction:'high', adjustment:'降低前段刺激强度' },
  sweetnessLow: { label:'甜感不足', targetIds:['sweetness'], direction:'low', adjustment:'提高中段甜感覆盖' },
  aftertasteLow: { label:'余韵不足', targetIds:['sweetness'], direction:'low', adjustment:'改善中后段连续性' },
  acidityLow: { label:'酸质不足', targetIds:['acidity'], direction:'low', adjustment:'保留明亮酸质表达' },
  acidityHigh: { label:'酸感过强或尖锐', targetIds:['acidity'], direction:'high', adjustment:'降低尖锐酸感出现概率' },
  bitternessHigh: { label:'苦味偏高', targetIds:['bitterness'], direction:'high', adjustment:'降低尾段苦味暴露' },
  astringencyHigh: { label:'涩感或收敛感偏高', targetIds:['astringency'], direction:'high', adjustment:'降低尾段涩感暴露' },
  bodyLow: { label:'醇厚度不足', targetIds:['sweetness'], direction:'low', adjustment:'提高中段结构和醇厚度' },
  cleanlinessLow: { label:'干净度不足', targetIds:['bitterness','astringency'], direction:'low', adjustment:'减少杂味及不均匀萃取风险' },
  balanceLow: { label:'平衡度不足', targetIds:['acidity','sweetness','bitterness'], direction:'low', adjustment:'缩小酸甜苦之间的偏差' }
});

function flattenAnswers(record = {}) {
  return Object.values(record.answers || {}).flatMap(groups => Object.values(groups || {}).flat()).map(String);
}

function evidenceText(record = {}) {
  const professional = record.professionalData || record.professional || {};
  const selections = Object.values(professional.selections || {}).flat().map(String);
  return [...flattenAnswers(record), ...selections, ...(record.summary || []), record.naturalNote || ''].join(' ').toLowerCase();
}

function addIssue(map, key, severity, evidence, source = 'explicit') {
  const definition = ISSUE_DEFINITIONS[key];
  if (!definition) return;
  const normalizedSeverity = clamp(severity, 0.1, 1);
  const previous = map.get(key);
  if (previous && previous.severity >= normalizedSeverity) return;
  map.set(key, { key, ...definition, severity:normalizedSeverity, evidence:String(evidence || definition.label), source, planAdjustable:true });
}

function lowAxisIssues(values, labels, map, mapping, source) {
  if (!Array.isArray(values) || values.length !== labels.length) return;
  const finite = values.map(Number).filter(Number.isFinite);
  if (!finite.length) return;
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  labels.forEach((axis, index) => {
    const value = Number(values[index]);
    const key = mapping[axis];
    if (!key || !Number.isFinite(value)) return;
    const gap = mean - value;
    if ((value <= 4.5 || gap >= 1) && value <= 6.5) {
      addIssue(map, key, Math.max((6.5 - value) / 4, gap / 3), `${ISSUE_DEFINITIONS[key].label}：${value.toFixed(1)}，本组平均${mean.toFixed(1)}`, source);
    }
  });
}

export function assessTastingForOptimization(record = {}, previousPlan = null) {
  const issues = new Map();
  const text = evidenceText(record);
  const professional = record.professionalData || record.professional || {};
  lowAxisIssues(professional.radar?.aroma, AROMA_AXES, issues, { floral:'aromaLow', fruity:'aromaLow' }, 'professional-radar');
  lowAxisIssues(professional.radar?.style, STYLE_AXES, issues, {
    aftertaste:'aftertasteLow', acidity:'acidityLow', sweetness:'sweetnessLow', body:'bodyLow', cleanliness:'cleanlinessLow', balance:'balanceLow'
  }, 'professional-radar');

  if (/香气弱|花香弱|果香弱|香气不足|香味不足|香气不够|低香/.test(text)) addIssue(issues,'aromaLow',.85,'明确反馈香气不足');
  if (/香气过强|香味过多|香气太重|香味太重/.test(text)) addIssue(issues,'aromaExcess',.85,'明确反馈香气过强');
  if (/甜感弱|甜不足|不甜|无明显甜感/.test(text)) addIssue(issues,'sweetnessLow',.9,'明确反馈甜感不足');
  if (/余韵短|短促|余韵不足/.test(text)) addIssue(issues,'aftertasteLow',.75,'明确反馈余韵不足');
  if (/酸质不足|酸感不足|不够明亮/.test(text)) addIssue(issues,'acidityLow',.75,'明确反馈酸质不足');
  if (/尖锐|过酸|酸尖|酸感过强|酸味过强|醋酸感|发酵酸/.test(text)) addIssue(issues,'acidityHigh',.95,'明确反馈酸感尖锐或过强');
  if (/焦苦|苦重|苦味偏高|过苦|苦感过强/.test(text)) addIssue(issues,'bitternessHigh',.95,'明确反馈苦味偏高');
  if (/干涩|收敛|涩感|轻微涩|干燥/.test(text)) addIssue(issues,'astringencyHigh',.95,'明确反馈涩感或收敛感');
  if (/单薄|水感|轻薄|醇厚不足/.test(text)) addIssue(issues,'bodyLow',.8,'明确反馈醇厚度不足');
  if (/不干净|杂味|浑浊|混浊|纸味|木质/.test(text)) addIssue(issues,'cleanlinessLow',.9,'明确反馈干净度不足');
  if (/不平衡|失衡/.test(text)) addIssue(issues,'balanceLow',.8,'明确反馈平衡度不足');
  if (professional.defects?.major?.length) addIssue(issues,'cleanlinessLow',1,`明缺陷：${professional.defects.major.join('、')}`,'professional-defect');
  if (professional.defects?.minor?.length) addIssue(issues,'astringencyHigh',.7,`暗缺陷：${professional.defects.minor.join('、')}`,'professional-defect');

  const list = [...issues.values()].sort((a,b) => b.severity - a.severity).slice(0,3);
  const linked = Boolean(record.brewSessionId && previousPlan);
  const executionDeviations = previousPlan?.execution?.deviations || [];
  const executionReliable = !executionDeviations.some(item => /堵塞|偏离|失败|温度|水量|流速异常/.test(String(item?.type || item?.message || item)));
  const confidence = !linked ? 'insufficient-context' : !executionReliable ? 'low' : list.some(item => item.source === 'professional-radar') ? 'medium-high' : 'medium';
  return {
    contract:BREW_OPTIMIZATION_ASSESSMENT_CONTRACT,
    sourceSensoryId:String(record.id || ''), sourceBrewId:String(record.brewSessionId || ''),
    evaluatedAt:new Date().toISOString(), linkedToCompletedBrew:linked, executionReliable,
    triggered:linked && executionReliable && list.length > 0, issues:list, confidence,
    totalScoreUsedAsTrigger:false,
    summary:list.map(item => item.label),
    reason:!executionReliable ? '本次执行存在明显偏差，无法把负面结果可靠归因于方案；建议先按原方案复刻。' : list.length ? `检测到${list.map(item => item.label).join('、')}，按具体维度生成待验证调整。` : '未检测到超过阈值的具体维度，不生成冲煮优化。'
  };
}

function emptySensitivityStat() { return { evidence:0, count:0, scale:1, confidence:'insufficient' }; }

export function buildPersonalSensitivityProfile(records = []) {
  const stats = Object.fromEntries(['acidity','floral','fruity','sweetness','bitterness','astringency'].map(id => [id, emptySensitivityStat()]));
  for (const record of records) {
    if (!record?.brewSessionId) continue;
    const assessment = record.optimizationAssessment || assessTastingForOptimization(record, { execution:{ deviations:[] } });
    for (const issue of assessment.issues || []) {
      const sign = issue.direction === 'high' ? 1 : -1;
      for (const targetId of issue.targetIds || []) {
        if (!stats[targetId]) continue;
        stats[targetId].evidence += sign * clamp(issue.severity, .1, 1);
        stats[targetId].count += 1;
      }
    }
  }
  for (const stat of Object.values(stats)) {
    if (stat.count < 3) continue;
    stat.scale = Number(clamp(1 + stat.evidence / Math.max(6, stat.count * 2.5), .84, 1.16).toFixed(3));
    stat.confidence = stat.count >= 8 ? 'high' : stat.count >= 5 ? 'medium' : 'developing';
  }
  return { contract:PERSONAL_SENSITIVITY_CONTRACT, generatedAt:new Date().toISOString(), stats };
}

function scaleTarget(target, scale) {
  const points = (target.points || []).map(point => point.map(Number));
  if (!points.length || scale === 1) return structuredClone(target);
  const center = [0,1,2].map(index => points.reduce((sum, point) => sum + Number(point[index] || 0), 0) / points.length);
  return { ...structuredClone(target), points:points.map(point => point.map((value,index) => Number((center[index] + (value - center[index]) * scale).toFixed(6)))), personalScale:scale };
}

export function applyPersonalSensitivityToScene(scene, profile) {
  if (!scene || !Array.isArray(scene.targets) || profile?.contract !== PERSONAL_SENSITIVITY_CONTRACT) return scene;
  const personalTargets = scene.targets.map(target => scaleTarget(target, profile.stats?.[target.id]?.scale || 1));
  const hasPersonalAdjustment=personalTargets.some(target=>Number(target.personalScale||1)!==1);
  return { ...structuredClone(scene), personalTargets, hasPersonalAdjustment, personalSensitivity:structuredClone(profile) };
}
