import { readFile, writeFile } from 'node:fs/promises';

for (const path of ['tests/v110-startup-smoke.spec.mjs','tests/v110-local-first-sync-static.mjs','tests/v120-core-contracts-static.mjs']) {
  let source = await readFile(path, 'utf8');
  source = source
    .replaceAll('runtimeFeatures-bundle', 'runtime-features')
    .replaceAll('runtimeFeatures\\-bundle', 'runtime\\-features')
    .replaceAll('runtimeFeatures-ready', 'runtime-features-ready')
    .replaceAll('src/features/runtimeFeatures', 'src/features/runtime-features')
    .replaceAll('LuckyBeanCompatibilityLayer', 'LuckyBeanRuntimeFeatures')
    .replaceAll('COMPATIBILITY_MODULES', 'RUNTIME_FEATURES');
  await writeFile(path, source);
}

const staticSource = await readFile('tests/v110-local-first-sync-static.mjs', 'utf8');
if (!/src\\\/features\\\/runtime-features\\\.js/.test(staticSource)) throw new Error('runtime feature index assertion not repaired');
if (staticSource.includes('compatibility-bundle') || staticSource.includes('runtimeFeatures-bundle')) throw new Error('obsolete bundle assertion remains');
console.log('Formal runtime feature tests repaired precisely.');
