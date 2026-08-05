import { readFile, readdir } from 'node:fs/promises';

const entries = await readdir('src', { withFileTypes: true });
const files = entries.filter(entry => entry.isFile() && entry.name.endsWith('.js')).map(entry => `src/${entry.name}`);
const patterns = [
  ['global-observer', /observe\(document\.documentElement/g],
  ['document-observer', /new MutationObserver[\s\S]{0,500}document\.documentElement/g],
  ['reload-state', /location\.reload\s*\(/g],
  ['dom-plan-reparse', /#generatedPlan[\s\S]{0,800}(?:textContent|querySelector|stage-cell)/g],
  ['native-monkey-patch', /(?:Element|Document|Node)\.prototype\.[A-Za-z_$][\w$]*\s*=/g],
  ['history-status-write', /(?:status\s*=\s*['"](?:planned|completed|terminated)|status:\s*['"](?:planned|completed|terminated))/g]
];
const findings = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const [kind, regex] of patterns) {
    const matches = [...source.matchAll(regex)];
    if (matches.length) findings.push({ file, kind, count: matches.length, samples: matches.slice(0, 3).map(match => match[0].slice(0, 180).replace(/\s+/g, ' ')) });
  }
}
console.log(JSON.stringify({ scanned: files.length, findings }, null, 2));
if (findings.some(item => ['dom-plan-reparse','history-status-write'].includes(item.kind))) process.exitCode = 2;
