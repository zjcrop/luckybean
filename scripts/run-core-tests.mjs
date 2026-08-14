import { spawnSync } from 'node:child_process';

const specs = [
  'tests/v120-core-flow.spec.mjs',
  'tests/v120-history-integrity.spec.mjs',
  'tests/v120-requirements-ui.spec.mjs',
  'tests/v123d-bean-summary-ui.spec.mjs',
  'tests/v127-user-regressions-ui.spec.mjs',
  'tests/v123e-freshness-timeline-ui.spec.mjs',
  'tests/v123e-interaction-repair-ui.spec.mjs',
  'tests/v123e-gear-matching-ui.spec.mjs',
  'tests/v123e-gear-catalog-editor-ui.spec.mjs',
  'tests/v123e-sensory-actions-ui.spec.mjs'
];

function annotation(text) {
  return String(text || 'unknown Playwright failure')
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
    .slice(-7000);
}

const obsoleteGearEditorTitle = 'private gear uses three closed, aligned list editors';
const args = [
  'playwright', 'test', ...specs,
  '--grep-invert', obsoleteGearEditorTitle,
  '--browser=chromium', '--reporter=line', '--workers=1'
];
const result = spawnSync('npx', args, { encoding: 'utf8', env: process.env, maxBuffer: 16 * 1024 * 1024, shell: process.platform === 'win32' });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) {
  const detail = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  console.error(`::error file=tests,title=Core Playwright regression failed::${annotation(detail)}`);
  process.exit(result.status || 1);
}
console.log('All LuckyBean core Playwright checks passed');
