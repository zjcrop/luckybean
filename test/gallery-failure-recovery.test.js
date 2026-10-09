import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/package-capture-controller.js',import.meta.url),'utf8');
const failure=source.match(/function galleryFailure\([\s\S]*?\n}/)[0];
const addGallery=source.match(/async function addGalleryFiles\([\s\S]*?\n}/)[0];

test('gallery failure preserves original files for retry and never turns an error into OCR evidence',async()=>{
  const file={type:'image/jpeg',bytes:'same-original'};
  const state={images:[],busy:false,ocrText:'',ocrError:'',blocks:[],analysis:null};
  const processed=[]; let calls=0;
  const context=vm.createContext({captureState:state,MAX_IMAGES:4,operationGeneration:0,pendingGalleryFiles:[],render:()=>{},CustomEvent:class{},document:{dispatchEvent:()=>{}},addFiles:async files=>processed.push(...files),LuckyBeanGalleryImagePreprocess:{preprocessFiles:async files=>{calls++;if(calls===1)throw new Error('相册快速预处理超时');assert.equal(files[0],file);return files;}}});
  vm.runInContext(failure+'\n'+addGallery,context);
  await context.addGalleryFiles([file]);
  assert.match(state.ocrError,/预处理超时/); assert.equal(state.ocrText,'');
  assert.equal(state.busy,false); assert.equal(context.pendingGalleryFiles[0],file);
  await context.addGalleryFiles(context.pendingGalleryFiles);
  assert.equal(calls,2); assert.equal(processed[0],file);
  assert.equal(context.pendingGalleryFiles.length,0); assert.equal(state.ocrError,'');
});

test('late gallery completion cannot populate a capture that the user already closed',async()=>{
  let finish; let added=0;
  const context=vm.createContext({captureState:{images:[],busy:false},MAX_IMAGES:4,operationGeneration:0,pendingGalleryFiles:[],render:()=>{},CustomEvent:class{},document:{dispatchEvent:()=>{}},addFiles:async()=>added++,LuckyBeanGalleryImagePreprocess:{preprocessFiles:()=>new Promise(resolve=>finish=resolve)}});
  vm.runInContext(failure+'\n'+addGallery,context);
  const operation=context.addGalleryFiles([{type:'image/jpeg'}]);
  context.operationGeneration++; context.pendingGalleryFiles=[];
  finish([{type:'image/jpeg'}]); await operation;
  assert.equal(added,0); assert.equal(context.pendingGalleryFiles.length,0);
});
