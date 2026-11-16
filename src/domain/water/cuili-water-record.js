/** A local-use record consumer. No recipe, heated-ion, or brew-stage calculation. */
export const CUILI_WATER_LOCAL_KEY = 'luckybean.cuili-water.local-record';
export const MAX_CUILI_WATER_JSON_BYTES = 65536;
const PREFIX = '萃离用水提示：';
const contexts = new Set(['kettle','espresso-boiler','unknown']);
const statuses = new Set(['single-heat-use','history-incomplete','post-heat-check-advised','outside-kettle-scope','context-unconfirmed']);
const concentrations = ['calciumMgL','magnesiumMgL','sodiumMgL','potassiumMgL','bicarbonateMgL','chlorideMgL','sulfateMgL','alkalinityMgLAsCaCO3','tdsMgL'];
const own = (value,key) => Object.hasOwn(value,key);
function record(value,label) {
  if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new TypeError(`${label}须为JSON对象`);
  return value;
}
function text(value,label,max=200) {
  if(typeof value!=='string'||!value.trim()||value.length>max)throw new TypeError(`${label}须为非空文本（最多${max}字）`);
  return value.trim();
}
function numeric(value,label,min=0,max=10000,nullable=true) {
  if(nullable&&(value===null||value===undefined))return null;
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new TypeError(`${label}须为${min}–${max}的数值，未知请用null或省略`);
  return value;
}
function safeJson(value,depth=0) {
  if(depth>18)throw new Error('水样JSON层级过深');
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('水样JSON含非有限数值');return;}
  if(Array.isArray(value)){if(value.length>1000)throw new Error('水样数组过长');value.forEach(item=>safeJson(item,depth+1));return;}
  record(value,'水样字段');
  for(const [key,item]of Object.entries(value)){
    if(['__proto__','prototype','constructor'].includes(key))throw new Error('水样JSON包含不允许的字段');
    safeJson(item,depth+1);
  }
}
function nullableBoolean(value,label){if(value===undefined||value===null)return null;if(typeof value!=='boolean')throw new TypeError(`${label}须为布尔值或null`);return value;}

export function parseCuiLiWaterRecord(input) {
  if(typeof input==='string'){
    if(new TextEncoder().encode(input).length>MAX_CUILI_WATER_JSON_BYTES)throw new Error('水样JSON超过64KiB限制');
    try{input=JSON.parse(input);}catch(error){throw new Error('无法读取水样JSON：'+error.message);}
  }
  safeJson(input);
  if(new TextEncoder().encode(JSON.stringify(input)).length>MAX_CUILI_WATER_JSON_BYTES)throw new Error('水样JSON超过64KiB限制');
  const root=record(input,'导入内容'),water=record(root.water,'water');
  if(water.concentrationBasis!=='pre-heating-calculated')throw new Error('只接收明确标注pre-heating-calculated的加热前配方计算记录');
  const out={profileId:text(water.profileId,'水型ID',120),source:text(water.source,'水样来源',200),recipeVolumeL:numeric(water.recipeVolumeL,'配制体积L',.000001,100000,false),concentrationBasis:'pre-heating-calculated'};
  out.ionicAccountingComplete=nullableBoolean(water.ionicAccountingComplete,'离子账本完整性');
  for(const key of concentrations)if(own(water,key))out[key]=numeric(water[key],key);
  if(own(water,'pH'))out.pH=numeric(water.pH,'水样pH',0,14);
  if(own(water,'pHSource'))out.pHSource=text(water.pHSource,'pH来源',100);
  const heat=record(water.heatingAssessment,'heatingAssessment');
  if(heat.scenario!=='single-heating')throw new Error('当前仅接收single-heating单次加热记录');
  if(!contexts.has(heat.context))throw new Error('加热场景context无效');
  if(!statuses.has(heat.status))throw new Error('加热评估status无法识别');
  const history=record(heat.history,'加热历史');
  if(history.context!==heat.context)throw new Error('加热历史与评估context不一致');
  if(history.heatingCycles!==1)throw new Error('单次加热记录的heatingCycles必须为1');
  if((history.holdMinutes??0)!==0||(history.reheatCount??0)!==0)throw new Error('导入记录超出当前单次加热范围');
  numeric(history.heatingTemperatureC,'加热温度°C',0,heat.context==='kettle'?100:150);
  const evaporation=numeric(history.evaporationFraction,'蒸发比例',0,1);
  if(evaporation===1)throw new Error('蒸发比例不能为1');
  nullableBoolean(history.visiblePrecipitate,'可见沉积');numeric(history.pHMeasured,'实测pH',0,14);
  const adjustment=record(heat.brewAdjustment,'冲煮调整边界');
  if(adjustment.automatic!==false||adjustment.temperatureDeltaC!==0||adjustment.timeDeltaSec!==0)throw new Error('水样不得携带自动改变冲煮温度或时间的指令');
  if(own(heat,'advice')){
    if(!Array.isArray(heat.advice)||heat.advice.length>40||heat.advice.some(item=>typeof item!=='string'||item.length>1200))throw new Error('加热建议须为有限长度的文本列表');
  }
  if(own(heat,'ionsMgL')){
    const ions=record(heat.ionsMgL,'加热前离子账本');
    for(const key of ['Ca','Mg','HCO3','CO3'])numeric(ions[key],`ionsMgL.${key}`);
    for(const [ion,field]of [['Ca','calciumMgL'],['Mg','magnesiumMgL'],['HCO3','bicarbonateMgL']])if(ions[ion]!=null&&out[field]!=null&&Math.abs(ions[ion]-out[field])>0.0001)throw new Error(`${field}与热史账本不一致`);
  }
  if(own(heat,'measurements')){
    const measurements=record(heat.measurements,'前后实测');
    for(const key of ['preHeatGHmgLAsCaCO3','postHeatGHmgLAsCaCO3','preHeatAlkalinitymgLAsCaCO3','postHeatAlkalinitymgLAsCaCO3'])numeric(measurements[key],key);
  }
  if(own(heat,'predictions')){
    const predictions=record(heat.predictions,'预测边界');
    for(const key of ['heatedCalciumMgL','calciumLossMgL','permanentHardnessIncreaseMgL'])if(predictions[key]!==null&&predictions[key]!==undefined)throw new Error('不接收把热后钙镁或硬度变化当作已知值的预测');
  }
  out.heatingAssessment=structuredClone(heat);
  return {water:out};
}

export function describeCuiLiWaterRecord(value) {
  if(!value)return '尚未附加萃离水样记录';
  const {water}=parseCuiLiWaterRecord(value),h=water.heatingAssessment.history;
  return `${water.source} · ${water.profileId} · 单次加热${h.heatingTemperatureC===null||h.heatingTemperatureC===undefined?'（温度未测）':`至${h.heatingTemperatureC}°C`}；离子为加热前计算值，热后浓度未知。`;
}

export function cuiLiWaterWarnings(value) {
  if(!value)return [];
  const {water}=parseCuiLiWaterRecord(value),heat=water.heatingAssessment,h=heat.history;
  const warnings=[`${PREFIX}所附离子是加热前配方计算值，不是加热后的实测浓度；未知的热后钙镁不按零处理。`];
  if(water.ionicAccountingComplete===false)warnings.push(`${PREFIX}这份已知离子账本不完整，可能含未明确的硅载体等成分；不能据此计算完整电荷或总碱度。`);
  if(heat.context==='espresso-boiler')warnings.push(`${PREFIX}这条记录超出开放式水壶单次加热用途，不能用于意式锅炉进水、结垢或腐蚀判断。`);
  else if(heat.context==='unknown')warnings.push(`${PREFIX}设备场景未确认，请确认开放式水壶用途后再比较。`);
  else warnings.push(`${PREFIX}按当前方案需要的水量单次加热后使用，保留原冲煮参数作对照。`);
  if(h.heatingTemperatureC==null||h.evaporationFraction==null||h.visiblePrecipitate==null)warnings.push(`${PREFIX}单次加热的温度、蒸发或沉积记录尚不完整，请按实际情况补测。`);
  if(h.evaporationFraction>0)warnings.push(`${PREFIX}记录了${+(h.evaporationFraction*100).toFixed(2)}%蒸发；核对最终水量，不按同一倍率推算热后Ca/Mg/HCO₃⁻。`);
  if(h.visiblePrecipitate===true)warnings.push(`${PREFIX}单次加热后观察到沉积，请按实际使用条件复测硬度与总碱度，不将沉积量直接换算成钙损失。`);
  const measurements=heat.measurements||{};
  if(measurements.postHeatGHmgLAsCaCO3!=null||measurements.postHeatAlkalinitymgLAsCaCO3!=null)warnings.push(`${PREFIX}已附热后硬度或碱度实测记录；硬度不能单独反推出钙离子损失。`);
  warnings.push(`${PREFIX}仅增加本地用水提示，不自动改变当前方案的温度、时间或分段。`);
  return warnings;
}

export function withCuiLiWaterWarnings(plan,localWaterRecord=null) {
  const original=plan.warnings||[],kept=original.filter(item=>typeof item!=='string'||!item.startsWith(PREFIX));
  if(!localWaterRecord&&kept.length===original.length)return plan;
  const warnings=cuiLiWaterWarnings(localWaterRecord);
  if(localWaterRecord){
    const heat=parseCuiLiWaterRecord(localWaterRecord).water.heatingAssessment;
    const highest=heat.history.heatingTemperatureC;
    const stageTemperatures=(plan.stages||[]).flatMap(stage=>[stage.temperatureC,stage.pourTemperature]).filter(value=>typeof value==='number'&&Number.isFinite(value));
    if(heat.context==='kettle'&&typeof highest==='number'&&stageTemperatures.length&&highest<Math.max(...stageTemperatures))warnings.push(`${PREFIX}记录最高加热温度${highest}°C低于方案注水${Math.max(...stageTemperatures)}°C，请核对本次加热与实际注水温度；未自动改动方案。`);
  }
  return {...plan,warnings:[...new Set([...kept,...warnings])]};
}

/** Explicit allow-list: local records must not leak through customProfile. */
export function customWaterProfileForTransport(custom={}) {
  return Object.fromEntries(['name','tds','tendency','note'].filter(key=>own(custom,key)).map(key=>[key,structuredClone(custom[key])]));
}
