import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function walk(directory) {
  const rows = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const row of rows) {
    const path = join(directory, row.name).replaceAll('\\', '/');
    if (row.isDirectory()) files.push(...await walk(path));
    else if (row.isFile() && row.name.endsWith('.js')) files.push(path);
  }
  return files;
}

const files = await walk('src');
const patterns = [
  ['global-observer', /observe\(document\.documentElement/g],
  ['document-observer', /new MutationObserver[\s\S]{0,500}document\.documentElement/g],
  ['reload-state', /location\.reload\s*\(/g],
  ['dom-plan-reparse', /#generatedPlan[\s\S]{0,800}(?:textContent|querySelector|stage-cell)/g],
  ['native-monkey-patch', /(?:Element|Document|Node)\.prototype\.[A-Za-z_$][\w$]*\s*=/g],
  ['history-status-write', /(?:status\s*=\s*['"](?:planned|completed|terminated)|status:\s*['"](?:planned|completed|terminated))/g],
  ['legacy-runtime-file', /(?:^|\/)v0\d+[a-z0-9-]*\.js$/g]
];
const findings = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const [kind, regex] of patterns) {
    const target = kind === 'legacy-runtime-file' ? file : source;
    const matches = [...target.matchAll(regex)];
    if (matches.length) findings.push({ file, kind, count: matches.length, samples: matches.slice(0, 3).map(match => match[0].slice(0, 220).replace(/\s+/g, ' ')) });
  }
}
console.log(JSON.stringify({ scanned: files.length, findings }, null, 2));
if (findings.length) process.exitCode = 2;
