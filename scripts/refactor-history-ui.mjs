import { readFile, writeFile } from 'node:fs/promises';

async function patchApp() {
  const path='src/app.js';
  let source=await readFile(path,'utf8');
  const marker="import './renderers/brew-spatial-controller.js';\n";
  const imports="import { openHistoryScreen } from './ui/history/history-screen.js';\nimport { migrateLegacyBrewHistory } from './domain/history/history-migration.js';\n";
  if(!source.includes("./ui/history/history-screen.js")){
    if(!source.includes(marker))throw new Error('spatial controller import marker missing');
    source=source.replace(marker,marker+imports);
  }
  source=source.replace(
    "$('#fabSearchBtn').addEventListener('click',openSearchDialog); $('#fabRecommendBtn').addEventListener('click',openRecommendMenu); $('#fabHistoryBtn').addEventListener('click',openHistory); $('#fabAddBtn').addEventListener('click',openAddMenu);",
    "$('#fabSearchBtn').addEventListener('click',openSearchDialog); $('#fabRecommendBtn').addEventListener('click',openRecommendMenu); $('#fabHistoryBtn').addEventListener('click',()=>openHistoryScreen()); $('#fabAddBtn').addEventListener('click',openAddMenu);"
  );
  if(!source.includes("luckybean:request-history-replay")){
    const marker2="document.addEventListener('click',event=>{\n";
    const listener="document.addEventListener('luckybean:request-history-replay', event => loadBrewSession(event.detail?.recordId));\n";
    if(!source.includes(marker2))throw new Error('document click binding marker missing');
    source=source.replace(marker2,listener+marker2);
  }
  if(!source.includes('migrateLegacyBrewHistory().catch')){
    const marker3="async function refreshData() {\n";
    const bootstrap="migrateLegacyBrewHistory().catch(error => console.error('冲煮历史迁移失败', error));\n\n";
    if(!source.includes(marker3))throw new Error('refreshData marker missing');
    source=source.replace(marker3,bootstrap+marker3);
  }
  await writeFile(path,source);
}

async function patchStyles(){
  const path='styles.css';
  let source=await readFile(path,'utf8');
  const statement="@import url('./src/ui/history/history-screen.css');\n";
  if(!source.includes(statement))source=statement+source;
  await writeFile(path,source);
}

async function patchCompatibility(){
  const path='src/features/compatibility-bundle.js';
  let source=await readFile(path,'utf8');
  source=source.replace("  '../v109-history-management.js?v=1.1.0-test',\n",'');
  if(source.includes('v109-history-management'))throw new Error('legacy history patch remains');
  await writeFile(path,source);
}

async function patchServiceWorker(){
  const path='sw.js';
  let source=await readFile(path,'utf8');
  const marker="  './src/domain/history/history-service.js?v=1.1.0-test',\n";
  const additions=[
    "  './src/domain/history/history-migration.js?v=1.1.0-test',",
    "  './src/ui/history/history-screen.js?v=1.1.0-test',",
    "  './src/ui/history/history-screen.css?v=1.1.0-test',"
  ].join('\n')+'\n';
  if(!source.includes('history-screen.js?v=1.1.0-test')){
    if(!source.includes(marker))throw new Error('history service worker marker missing');
    source=source.replace(marker,marker+additions);
  }
  source=source.replace("  './src/v109-history-management.js?v=1.1.0-test',\n",'');
  await writeFile(path,source);
}

await patchApp();await patchStyles();await patchCompatibility();await patchServiceWorker();
console.log('Formal completed-brew history UI integrated and v109 patch retired.');
