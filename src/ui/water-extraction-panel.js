import { assessExtractionMeasurements } from '../domain/brew/extraction-assessment.js';

const fields = [
  ['waterTdsMgL','sourceWaterTdsReading','水TDS读数 mg/L',0,5000,'0.1'],
  ['doseG','measuredCoffeeDose','本杯实际投粉 g',0.001,500,'0.1'],
  ['beverageTdsPct','measuredBeverageTds','咖啡液TDS %',0,20,'0.01'],
  ['beverageMassG','measuredBeverageMass','杯中饮料实际产出 g',0.001,10000,'0.1']
];
export function emptyBrewMeasurements(){return {waterTdsMgL:null,doseG:null,beverageTdsPct:null,beverageMassG:null};}
export function clearBrewMeasurementFields(document){
  for(const [,id]of fields){const input=document.getElementById(id);if(input)input.value='';}
  const preview=document.getElementById('brewMeasurementsPreview');if(preview)preview.textContent='新的一杯：未提供实测值。';
  return emptyBrewMeasurements();
}
export function measurementPanelHtml(values={},escape=String){
  return `<details class="panel" id="brewMeasurementsPanel"><summary>水与本杯实测（选填）</summary><p class="muted small">水TDS与咖啡液TDS是不同测量。水TDS笔为电导换算读数；咖啡液请使用咖啡折光仪，未测留空。本杯数据切换豆子或水型后会清空。</p><div class="grid-2">${fields.map(([key,id,label,min,max,step])=>`<label class="field"><span>${label}</span><input id="${id}" class="control" type="number" min="${min}" max="${max}" step="${step}" value="${values[key]===null||values[key]===undefined?'':escape(String(values[key]))}" placeholder="未测"></label>`).join('')}</div><p id="brewMeasurementsPreview" class="muted small" role="status"></p></details>`;
}
export function readBrewMeasurements(document){
  return Object.fromEntries(fields.map(([key,id,label,min,max])=>{
    const input=document.getElementById(id),raw=input?.value?.trim()||'';
    if(input?.validity?.badInput)throw new Error(label+'须为有效数值，未测请留空');
    if(raw==='')return [key,null];
    const n=Number(raw);
    if(!Number.isFinite(n)||n<min||n>max)throw new Error(label+'超出记录范围，未测请留空');
    return [key,n];
  }));
}
export function measurementsForEngine(values={}){
  return Object.fromEntries(['doseG','beverageTdsPct','beverageMassG'].map(key=>[key,values[key]??null]));
}
export function waterForEngine({values={},localWaterRecord=null}={}){
  const result={tdsMgL:values.waterTdsMgL??null,tdsSource:values.waterTdsMgL==null?'unknown':'user-entered'};
  if(localWaterRecord){
    const w=localWaterRecord.water;
    result.ionsMgL=Object.fromEntries(Object.entries({Ca:w.calciumMgL,Mg:w.magnesiumMgL,Na:w.sodiumMgL,K:w.potassiumMgL,HCO3:w.bicarbonateMgL,CO3:w.heatingAssessment?.ionsMgL?.CO3,Cl:w.chlorideMgL,SO4:w.sulfateMgL}).filter(([,value])=>value!==undefined));
    result.alkalinityMgLAsCaCO3=w.alkalinityMgLAsCaCO3??null;
    result.concentrationBasis=w.concentrationBasis;
    result.ionicAccountingComplete=w.ionicAccountingComplete;
  }
  return result;
}
export function measurementPreview(values={}){
  const a=assessExtractionMeasurements({measurements:measurementsForEngine(values),brew:{}});
  const source=values.waterTdsMgL==null?'水TDS未提供':`水TDS读数 ${values.waterTdsMgL} mg/L`;
  return a.extractionYieldPct==null?source+'；填写本杯实际投粉、产出与咖啡液TDS后核算表观回收率，不按注水量代替产出。':source+`；本杯表观回收率 ${a.extractionYieldPct.toFixed(2)}%。原水ppm未作为折光空白自动扣除。`;
}
export function waterExtractionResultHtml(plan={},escape=String){
  const w=plan.waterAnalysis,e=plan.extractionAssessment;
  if(!w&&!e)return '';
  const value=(v,d=2)=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(d):'未提供';
  const messages=[...(w?.warnings||[]),...(e?.warnings||[])];
  return `<section class="nested-settings water-extraction-result"><h3>用水与本杯核算</h3><p class="small">水TDS：${value(w?.tdsMgL,1)} mg/L；参考水TDS：${value(w?.referenceTdsMgL,1)} mg/L。参考值不代替实测或离子组成。</p>${w?.concentrationBasis==='pre-heating-calculated'?'<p class="small">离子来自萃离加热前投料计算，热后实际浓度未知。</p>':''}<p class="small">咖啡液TDS：${value(e?.beverageTdsPct)}%；实际产出：${value(e?.beverageMassG,1)} g；表观回收率：${value(e?.extractionYieldPct)}${e?.extractionYieldPct==null?'':'%'}。</p><p class="muted small">仅凭水TDS不自动改变冲煮温度、时间或推算矿物比例。表观回收率按实测饮料与投粉量核算。</p><details><summary>测量说明</summary>${[...new Set(messages)].map(text=>`<p class="muted small">${escape(text)}</p>`).join('')}</details></section>`;
}
