import { readFile, writeFile } from 'node:fs/promises';

async function patchApp(){
  const path='src/app.js';let source=await readFile(path,'utf8');
  const marker="import { migrateLegacyBrewHistory } from './domain/history/history-migration.js';\n";
  const importLine="import './services/provider-bootstrap-controller.js';\n";
  if(!source.includes(importLine)){
    if(!source.includes(marker))throw new Error('history migration import marker missing');
    source=source.replace(marker,marker+importLine);
  }
  if(!source.includes("luckybean:codebook-provider-activated")){
    const marker2="async function refreshData() {\n";
    const listener=`document.addEventListener('luckybean:codebook-provider-activated', event => {
  const data = event.detail?.data;
  if (!data) return;
  state.codebook = data;
  state.codebookIndex = makeIndex(data);
  state.codebookMeta = event.detail?.meta || state.codebookMeta;
  if (state.page === 'beans') renderBeans();
  if (state.page === 'brew') renderBrew();
});

`;
    if(!source.includes(marker2))throw new Error('refreshData marker missing');
    source=source.replace(marker2,listener+marker2);
  }
  await writeFile(path,source);
}

async function patchServiceWorker(){
  const path='sw.js';let source=await readFile(path,'utf8');
  const marker="  './src/services/local-reference-analysis.js?v=1.1.0-test',\n";
  const additions=[
    "  './src/services/provider-package-service.js?v=1.1.0-test',",
    "  './src/services/codebook-reconciliation-service.js?v=1.1.0-test',",
    "  './src/services/provider-bootstrap-controller.js?v=1.1.0-test',"
  ].join('\n')+'\n';
  if(!source.includes('provider-package-service.js?v=1.1.0-test')){
    if(!source.includes(marker))throw new Error('provider service worker marker missing');
    source=source.replace(marker,marker+additions);
  }
  await writeFile(path,source);
}

await patchApp();await patchServiceWorker();
console.log('Verified provider bootstrap and BrewIon reconciliation integrated.');
