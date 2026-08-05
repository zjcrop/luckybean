import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/feature-controller.js';
let source = await readFile(path, 'utf8');
source = source.replace(/\n\s*v17Trajectory,?/, '');
if (source.includes('v17Trajectory')) throw new Error('stale v17Trajectory reference remains');
await writeFile(path, source);

const testPath = 'tests/v120-core-contracts-static.mjs';
let test = await readFile(testPath, 'utf8');
const assertion = "assert.doesNotMatch(read('src/feature-controller.js'), /v17Trajectory|stageDataFromPlan|trajectory-series/);";
if (!test.includes(assertion)) {
  const markers = [
    "assert.doesNotMatch(runtimeFeatures, /v099-trajectory-signal-bridge|v099i-trajectory-space|v109-history-management/);",
    "assert.doesNotMatch(compatibility, /v099-trajectory-signal-bridge|v099i-trajectory-space|v109-history-management/);"
  ];
  const marker = markers.find(value => test.includes(value));
  if (!marker) throw new Error('trajectory test marker missing');
  test = test.replace(marker, `${marker}\n${assertion}`);
}
await writeFile(testPath, test);
console.log('Stale legacy trajectory export removed and guarded.');
