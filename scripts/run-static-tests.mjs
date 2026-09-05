import { spawnSync } from 'node:child_process';

const tests = [
  'tests/v110-local-first-sync-static.mjs',
  'tests/v120-core-contracts-static.mjs',
  'tests/v120-requirements-static.mjs',
  'tests/v122-cloud-sync-safety.mjs',
  'tests/v123-brewprofiles-integration.mjs',
  'tests/v123d-main-parity.mjs',
  'tests/v124-stable-data-format.mjs',
  'tests/foundation-contract-regression.mjs',
  'tests/v125-root-state-models.mjs',
  'tests/v124p-release-contract.mjs',
  'tests/v124p-startup-auth-hotfix-static.mjs',
  'tests/v124p-auth-ocr-ai-hotfix-static.mjs',
  'tests/v124p-local-first-data-architecture.mjs',
  'tests/v124p-execution-copy-regression.mjs',
  'tests/v124p-brew-action-emphasis.mjs',
  'tests/v124p-pour-guide-regression.mjs',
  'tests/v123d-ui-sensory-regressions.mjs',
  'tests/v123e-batch-onboarding-static.mjs',
  'tests/v126-full-integration-static.mjs',
  'tests/v127-user-regressions-static.mjs',
  'tests/v123e-cloud-gear-sync.mjs',
  'tests/v123e-plan-contract-regression.mjs',
  'tests/v123e-freshness-timeline-regression.mjs',
  'tests/v123e-interaction-repair-static.mjs',
  'tests/v123e-gear-matching-regression.mjs',
  'tests/v123e-android-gallery-uri-regression.mjs',
  'tests/v123e-small-brew-five-row-regression.mjs',
  'tests/v123e-ui-stability-static.mjs',
  'tests/v123e-navigation-back-static.mjs',
  'tests/v123e-brew-optimization-regression.mjs',
  'tests/v123e-recognition-pipeline-static.mjs',
  'tests/v124b-lifecycle-ocr-storage-regression.mjs',
  'tests/v124b-ocr-worker-freeze-regression.mjs',
  'tests/v124b-ui-policy-regression.mjs',
  'tests/v124b-recommendation-prompt-regression.mjs'
];

function annotation(text) {
  return String(text || 'unknown failure').replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').slice(0, 7000);
}

for (const file of tests) {
  process.stdout.write(`\n[static] ${file}\n`);
  const result = spawnSync(process.execPath, [file], { encoding: 'utf8', env: process.env });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    const detail = `${result.stderr || ''}\n${result.stdout || ''}`.trim();
    console.error(`::error file=${file},title=Static regression failed::${annotation(detail)}`);
    process.exit(result.status || 1);
  }
}

process.stdout.write('\n[static] npm run test:recognition\n');
const recognition = spawnSync('npm', ['run', 'test:recognition'], { encoding:'utf8', env:process.env, shell:process.platform === 'win32' });
if (recognition.stdout) process.stdout.write(recognition.stdout);
if (recognition.stderr) process.stderr.write(recognition.stderr);
if (recognition.status !== 0) {
  const detail = `${recognition.stderr || ''}\n${recognition.stdout || ''}`.trim();
  console.error(`::error file=test,title=Recognition regression failed::${annotation(detail)}`);
  process.exit(recognition.status || 1);
}

console.log('\nAll LuckyBean static and recognition regression checks passed');
