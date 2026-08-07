import { readFile, writeFile } from 'node:fs/promises';

const VERSION = '1.2.0-test';
const files = [
  'index.html', 'manifest.webmanifest', 'package.json', 'sw.js',
  'src/utils.js', 'src/core/startup-controller.js', 'src/features/runtime-features.js',
  'tests/v110-local-first-sync-static.mjs', 'tests/v110-startup-smoke.spec.mjs',
  'tests/v120-core-contracts-static.mjs', 'tests/v120-core-flow.spec.mjs',
  'tests/v120-visual-baseline.spec.mjs'
];

for (const path of files) {
  let source = await readFile(path, 'utf8');
  source = source
    .replaceAll('1.1.0-test', VERSION)
    .replaceAll('1\\.1\\.0-test', '1\\.2\\.0-test')
    .replaceAll('1\\\\.1\\\\.0-test', '1\\\\.2\\\\.0-test');
  if (path === 'src/utils.js') source = source.replace("export const SCHEMA_VERSION = 6;", "export const SCHEMA_VERSION = 7;");
  await writeFile(path, source);
}

const manifest = JSON.parse(await readFile('manifest.webmanifest', 'utf8'));
if (manifest.version !== VERSION) throw new Error('manifest version not updated');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (pkg.version !== VERSION) throw new Error('package version not updated');
const utils = await readFile('src/utils.js', 'utf8');
if (!utils.includes(`APP_VERSION = '${VERSION}'`) || !utils.includes('SCHEMA_VERSION = 7')) throw new Error('runtime version/schema not updated');
const sw = await readFile('sw.js', 'utf8');
if (!sw.includes(`luckybean-${VERSION}`) || sw.includes('luckybean-1.1.0-test')) throw new Error('service worker cache version not updated');
const startup = await readFile('src/core/startup-controller.js', 'utf8');
if (!startup.includes(`app.js?v=${VERSION}`)) throw new Error('startup app import version not updated');
for (const test of ['tests/v110-local-first-sync-static.mjs','tests/v110-startup-smoke.spec.mjs','tests/v120-core-contracts-static.mjs']) {
  const source = await readFile(test, 'utf8');
  if (source.includes('1\\.1\\.0-test') || source.includes('1.1.0-test')) throw new Error(`old version assertion remains in ${test}`);
}
console.log(`LuckyBean version finalized as ${VERSION}, schema 7.`);
