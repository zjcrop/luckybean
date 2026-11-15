import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emptyBrewMeasurements, clearBrewMeasurementFields, measurementPanelHtml, readBrewMeasurements, measurementsForEngine, waterForEngine, measurementPreview, waterExtractionResultHtml } from '../src/ui/water-extraction-panel.js';
import { parseCuiLiWaterRecord } from '../src/domain/water/cuili-water-record.js';

const ids=['sourceWaterTdsReading','measuredCoffeeDose','measuredBeverageTds','measuredBeverageMass'];
function documentWith(values={}) {
  const elements=Object.fromEntries(ids.map(id=>[id,{value:values[id]??'',validity:{badInput:false}}]));
  elements.brewMeasurementsPreview={textContent:''};
  return {elements,getElementById:id=>elements[id]??null};
}
test('empty form measurements remain unknown and no proposed dose is substituted',()=>{
  const result=readBrewMeasurements(documentWith());
  assert.deepEqual(result,emptyBrewMeasurements());
  assert.deepEqual(measurementsForEngine(result),{doseG:null,beverageTdsPct:null,beverageMassG:null});
  assert.deepEqual(waterForEngine({values:result}),{tdsMgL:null,tdsSource:'unknown'});
  assert.ok(!measurementPreview(result).includes('0.00%'));
});
test('a real zero water TDS remains zero instead of falling back to 85',()=>{
  const values=readBrewMeasurements(documentWith({sourceWaterTdsReading:'0'}));
  assert.equal(values.waterTdsMgL,0);
  assert.deepEqual(waterForEngine({values}),{tdsMgL:0,tdsSource:'user-entered'});
  assert.match(measurementPreview(values),/读数 0 mg\/L/);
});
test('15g dose, 210g beverage and 1.35 percent produce 18.90 percent apparent recovery',()=>{
  const values=readBrewMeasurements(documentWith({measuredCoffeeDose:'15',measuredBeverageMass:'210',measuredBeverageTds:'1.35'}));
  assert.match(measurementPreview(values),/18\.90%/);
  assert.equal(values.waterTdsMgL,null);
});
test('invalid, negative and zero-dose inputs are rejected with visible field-specific messages',()=>{
  for(const [id,value] of [['sourceWaterTdsReading','-1'],['sourceWaterTdsReading','5001'],['measuredCoffeeDose','0'],['measuredBeverageMass','0'],['measuredBeverageTds','21'],['measuredBeverageTds','bad']]) {
    assert.throws(()=>readBrewMeasurements(documentWith({[id]:value})),/范围|数值/);
  }
  const doc=documentWith();doc.elements.sourceWaterTdsReading.validity.badInput=true;
  assert.throws(()=>readBrewMeasurements(doc),/有效数值/);
});
test('changing cup clears every measured field and makes a fresh unknown record',()=>{
  const doc=documentWith(Object.fromEntries(ids.map(id=>[id,'1'])));
  assert.deepEqual(clearBrewMeasurementFields(doc),emptyBrewMeasurements());
  for(const id of ids)assert.equal(doc.elements[id].value,'');
  assert.match(doc.elements.brewMeasurementsPreview.textContent,/新的一杯/);
});
test('CuiLi supplies explicit pre-heat ions while all heat history stays out of engine input',()=>{
  const record=parseCuiLiWaterRecord(fs.readFileSync(new URL('./fixtures/cuili-water-record.single-heating.json',import.meta.url),'utf8'));
  const water=waterForEngine({values:emptyBrewMeasurements(),localWaterRecord:record});
  assert.equal(water.ionsMgL.Ca,record.water.calciumMgL);
  assert.equal(water.ionsMgL.Mg,record.water.magnesiumMgL);
  assert.equal(water.concentrationBasis,'pre-heating-calculated');
  assert.equal(water.tdsMgL,null);
  assert.equal(water.alkalinityMgLAsCaCO3,null);
  assert.ok(!JSON.stringify(water).includes('heatingAssessment'));
  assert.ok(!JSON.stringify(water).includes('heatedCalcium'));
});
test('measurement panel preserves a zero value but leaves all unknown fields blank',()=>{
  const html=measurementPanelHtml({waterTdsMgL:0});
  assert.match(html,/sourceWaterTdsReading[^>]+value="0"/);
  assert.match(html,/measuredCoffeeDose[^>]+value=""/);
});
test('result renderer identifies unknown measurements and pre-heat provenance without predicting heated ions',()=>{
  const html=waterExtractionResultHtml({waterAnalysis:{tdsMgL:null,referenceTdsMgL:0,concentrationBasis:'pre-heating-calculated'},extractionAssessment:{beverageTdsPct:1.35,beverageMassG:210,extractionYieldPct:18.9}});
  assert.match(html,/水TDS：未提供/);assert.match(html,/参考水TDS：0\.0/);
  assert.match(html,/18\.90%/);assert.match(html,/热后实际浓度未知/);
});
