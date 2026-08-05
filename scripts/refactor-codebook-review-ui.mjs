import { readFile, writeFile } from 'node:fs/promises';

async function patchStyles() {
  const path = 'styles.css';
  let source = await readFile(path, 'utf8');
  const statement = "@import url('./src/ui/codebook-reconciliation-screen.css');\n";
  if (!source.includes(statement)) source = statement + source;
  await writeFile(path, source);
}

async function patchServiceWorker() {
  const path = 'sw.js';
  let source = await readFile(path, 'utf8');
  const marker = "  './src/ui/provider-status-panel.js?v=1.1.0-test',\n";
  const additions = [
    "  './src/ui/codebook-reconciliation-screen.js?v=1.1.0-test',",
    "  './src/ui/codebook-reconciliation-screen.css?v=1.1.0-test',"
  ].join('\n') + '\n';
  if (!source.includes('codebook-reconciliation-screen.js?v=1.1.0-test')) {
    if (!source.includes(marker)) throw new Error('provider status service-worker marker missing');
    source = source.replace(marker, marker + additions);
  }
  await writeFile(path, source);
}

await patchStyles();
await patchServiceWorker();
console.log('Custom code reconciliation review UI integrated.');
