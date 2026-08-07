import { readFile, writeFile } from 'node:fs/promises';

async function patchApp() {
  const path = 'src/app.js';
  let source = await readFile(path, 'utf8');
  const marker = "import './renderers/brew-spatial-controller.js';\n";
  const line = "import './ui/brew-trend-panel.js';\n";
  if (!source.includes(line)) {
    if (!source.includes(marker)) throw new Error('spatial controller import marker missing');
    source = source.replace(marker, marker + line);
  }
  await writeFile(path, source);
}

async function patchStyles() {
  const path = 'styles.css';
  let source = await readFile(path, 'utf8');
  const statement = "@import url('./src/ui/brew-trend-panel.css');\n";
  if (!source.includes(statement)) source = statement + source;
  await writeFile(path, source);
}

async function patchServiceWorker() {
  const path = 'sw.js';
  let source = await readFile(path, 'utf8');
  const marker = "  './src/domain/history/history-service.js?v=1.1.0-test',\n";
  const additions = [
    "  './src/domain/history/history-comparison.js?v=1.1.0-test',",
    "  './src/ui/brew-trend-panel.js?v=1.1.0-test',",
    "  './src/ui/brew-trend-panel.css?v=1.1.0-test',"
  ].join('\n') + '\n';
  if (!source.includes('brew-trend-panel.js?v=1.1.0-test')) {
    if (!source.includes(marker)) throw new Error('history service-worker marker missing');
    source = source.replace(marker, marker + additions);
  }
  await writeFile(path, source);
}

await patchApp();
await patchStyles();
await patchServiceWorker();
console.log('Directional brew trend UI integrated.');
