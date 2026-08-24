import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const write=(p,s)=>fs.writeFileSync(path.join(ROOT,p),s);
const replace=(p,a,b,{required=true}={})=>{let s=read(p);if(required&&!s.includes(a))throw new Error(`${p}: missing expected text ${a}`);s=s.split(a).join(b);write(p,s);};

// Final resource revision: product version stays 1.24B, all current web/android resources move together.
const files=[
  'index.html','sw.js','src/core/startup-controller.js','src/ui/appearance-controller.js','src/features/runtime-features.js','src/app.js',
  '.github/workflows/build-main.yml','.github/workflows/deploy-main.yml','.github/workflows/full-integration-pr.yml','DEVELOPMENT_STATUS.md'
];
for(const file of files) if(fs.existsSync(path.join(ROOT,file))) replace(file,'1.24B-main.2','1.24B-main.3',{required:false});
for(const file of fs.readdirSync(path.join(ROOT,'tests')).filter(x=>x.endsWith('.mjs'))) replace(`tests/${file}`,'1.24B-main.2','1.24B-main.3',{required:false});
replace('sw.js','const CACHE_NAME = `${CACHE_PREFIX}main-2`;','const CACHE_NAME = `${CACHE_PREFIX}main-3`;');
for(const file of fs.readdirSync(path.join(ROOT,'tests')).filter(x=>x.endsWith('.mjs'))) replace(`tests/${file}`,'CACHE_NAME = `\\$\\{CACHE_PREFIX\\}main-2`','CACHE_NAME = `\\$\\{CACHE_PREFIX\\}main-3`',{required:false});

// Offline graph must contain the final new modules.
let sw=read('sw.js');
if(!sw.includes("release-1.24b-freshness-detail.js")) sw=sw.replace(
  "  versioned('./src/features/release-1.24b-polish.js'),",
  "  versioned('./src/features/release-1.24b-polish.js'),\n  versioned('./src/features/release-1.24b-freshness-detail.js'),"
);
if(!sw.includes("recognition-field-resolver-1.24b.js")) sw=sw.replace(
  "  versioned('./src/domain/recognition/recognition-pipeline.js'),",
  "  versioned('./src/domain/recognition/recognition-pipeline.js'),\n  versioned('./src/domain/recognition/recognition-field-resolver-1.24b.js'),"
);
write('sw.js',sw);

// Multi-image OCR UI: show actual serial task state while the underlying bridge persists per-image results.
let capture=read('src/package-capture-controller.js');
if(!capture.includes("batchProgress: null")) capture=capture.replace(
  "  analysis: null\n};",
  "  analysis: null,\n  batchProgress: null\n};"
);
if(!capture.includes('function renderBatchProgress()')) capture=capture.replace(
  "function renderRecognitionPanel() {",
  `function renderBatchProgress() {\n  const p=captureState.batchProgress;\n  if(!p||!p.total)return '';\n  const rows=Array.from({length:p.total},(_,index)=>{\n    const order=index+1,taskId=\`IMG-\${String(order).padStart(3,'0')}\`;\n    const state=p.tasks?.[order]||'pending';\n    const label=state==='completed'?'✓':state==='processing'?'识别中':state==='failed'?'失败':'等待';\n    return \`<span class=\"\${state==='completed'?'done':state==='processing'?'active':''}\">\${taskId} \${label}</span>\`;\n  }).join('');\n  return \`<div class=\"lb-batch-progress\" data-lb-batch-progress><strong>正在识别 \${Math.min(p.current||1,p.total)}/\${p.total}</strong><div>\${rows}</div></div>\`;\n}\n\nfunction updateBatchProgress(detail={}) {\n  const total=Number(detail.total||captureState.images.length||0);\n  captureState.batchProgress ||= {total,current:1,tasks:{}};\n  captureState.batchProgress.total=total;\n  captureState.batchProgress.current=Number(detail.order||captureState.batchProgress.current||1);\n  if(detail.order)captureState.batchProgress.tasks[detail.order]=detail.status||'pending';\n  const node=document.querySelector('[data-lb-batch-progress]');\n  if(node){const holder=document.createElement('div');holder.innerHTML=renderBatchProgress();node.replaceWith(holder.firstElementChild);}\n}\n\nfunction renderRecognitionPanel() {`
);
if(!capture.includes('${renderBatchProgress()}')) capture=capture.replace(
  "        <div class=\"bag-photo-list\">${renderImageCards()}</div>",
  "        ${renderBatchProgress()}\n        <div class=\"bag-photo-list\">${renderImageCards()}</div>"
);
const oldCall="const result = await recognizeCoffeeBag(captureState.images, { locale: 'zh-CN' });";
if(capture.includes(oldCall)) capture=capture.replace(oldCall,"captureState.batchProgress={total:captureState.images.length,current:1,tasks:{}};\n    for(let i=1;i<=captureState.images.length;i+=1)captureState.batchProgress.tasks[i]='pending';\n    render();\n    const result = await recognizeCoffeeBag(captureState.images, { locale: 'zh-CN', onProgress:updateBatchProgress });");
write('src/package-capture-controller.js',capture);

// Keep active About asset on the final revision.
replace('src/app.js','Luckybean-END.webp?v=1.24B-main.2','Luckybean-END.webp?v=1.24B-main.3',{required:false});

console.log('LuckyBean 1.24B main.3 completion migration applied');
