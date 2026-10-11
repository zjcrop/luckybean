import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseNaturalLanguage } from '../src/codebook.js';
import { repairRecognitionSemanticText } from '../src/domain/recognition/recognition-semantic-repair.js';
import { analyzeRecognitionDocument } from '../src/domain/recognition/recognition-pipeline.js';
import { recognitionDocumentFromText } from '../src/domain/recognition/recognition-document.js';
const book=JSON.parse(fs.readFileSync(new URL('../public/fallback-codebook.json',import.meta.url)));

test('camera capture contains only the visible guide for square and landscape cover previews', async () => {
  const source = fs.readFileSync(new URL('../src/direct-camera-controller.js', import.meta.url), 'utf8');
  for (const [preview, frame, expected] of [
    [{ left:100, top:40, width:400, height:400 }, { left:140, top:80, width:320, height:320 }, [528,108,864,864]],
    [{ left:100, top:40, width:640, height:360 }, { left:164, top:76, width:512, height:288 }, [192,108,1536,864]]
  ]) {
    let drawn;
    const canvas = { width:0, height:0, getContext:() => ({ drawImage:(...args) => { drawn = args; } }), toBlob:callback => callback(new Blob(['camera-frame'], { type:'image/jpeg' })) };
    const context = vm.createContext({ document:{ addEventListener() {}, createElement:() => canvas }, window:{ addEventListener() {} }, Blob,
      ImageCapture:class { constructor() { throw new Error('separate still-camera stream must not be used'); } } });
    vm.runInContext(`${source}\nstream = { getVideoTracks:() => [{}] }; globalThis.captureFrame = takeFrame;`, context);
    const guide = { clientLeft:0, clientTop:0, clientWidth:frame.width, clientHeight:frame.height, getBoundingClientRect:() => frame };
    const video = { videoWidth:1920, videoHeight:1080, getBoundingClientRect:() => preview, parentElement:{ querySelector:() => guide } };
    const result = await context.captureFrame(video);
    assert.equal(drawn[0], video);
    assert.equal(drawn.length, 9);
    expected.forEach((value, index) => assert.ok(Math.abs(drawn[index + 1] - value) < 0.001));
    assert.equal(result.width, expected[2]);
    assert.equal(result.height, expected[3]);
    assert.equal(canvas.width, 1, 'release the capture raster after encoding');
  }
});
test('altitude ranges preserve both endpoints and require review instead of silently choosing minimum',()=>{
  for(const separator of ['-','–','—','至','~']) {
    const raw='海拔:1500'+separator+'1700M';const parsed=parseNaturalLanguage(raw,book);
    assert.equal(parsed.altitude,undefined);assert.equal(parsed.parseMetadata.altitude.minimum,1500);assert.equal(parsed.parseMetadata.altitude.maximum,1700);
    const analysis=analyzeRecognitionDocument(recognitionDocumentFromText(raw),book);
    assert.equal(analysis.fields.find(row=>row.field==='altitude')?.status,'review');assert.match(analysis.fields.find(row=>row.field==='altitude')?.rawValue,/1500/);
  }
  assert.equal(parseNaturalLanguage('海拔:1500M',book).altitude,1500);
});
test('leading explicit crop season is parsed without consuming bag identity or creating a harvest date',()=>{
  const raw='26产季 巴拿马 波奎特 精品级\n烘焙时间:26.9.20\n净重:15g';
  const repaired=repairRecognitionSemanticText(raw,book);assert.match(repaired,/产季: 26/);assert.match(repaired,/巴拿马 波奎特 精品级/);
  const document=recognitionDocumentFromText(raw);
  const before=structuredClone(document);
  const analysis=analyzeRecognitionDocument(document,book);
  assert.equal(analysis.parsed.harvestYear,2026);assert.equal(analysis.parsed.initialWeight,15);assert.equal(analysis.parsed.roastDate,'2026-09-20');
  assert.deepEqual(document,before);
  assert.equal(document.rawFullText,raw);
});

test('explicit leading season survives OCR removing whitespace after the label',()=>{
 for(const raw of ['26产季巴拿马波奎特精品级','26產季巴拿馬波奎特精品級','2026产季:巴拿马波奎特']){
  const repaired=repairRecognitionSemanticText(raw,book);
  assert.match(repaired,/产季: (26|2026)/);
  const analysis=analyzeRecognitionDocument(recognitionDocumentFromText(raw),book);
  assert.equal(analysis.parsed.harvestYear,2026);
  assert.equal(analysis.parsed.harvestDate,undefined);
 }
});
