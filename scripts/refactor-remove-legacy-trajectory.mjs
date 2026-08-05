import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/v098-feature-fixes.js';
let source = await readFile(path, 'utf8');

const start = source.indexOf('function parseNumber(text, fallback = 0) {');
const end = source.indexOf('function radarValues(key) {', start);
if (start >= 0 && end > start) source = source.slice(0, start) + source.slice(end);
source = source.replace(/\n\s*\$\$\('\.trajectory-chart\.detailed'\)\.forEach\(v17Trajectory\);/, '');
source = source.replace(
  "new MutationObserver(queueUi).observe(document.documentElement, { childList: true, subtree: true });",
  `const uiObserver = new MutationObserver(queueUi);
['#beanGroups','#brewContent','#sensoryContent','#overlayRoot'].forEach(selector => {
  const root = document.querySelector(selector);
  if (root) uiObserver.observe(root, { childList: true, subtree: true });
});`
);

for (const forbidden of ['stageDataFromPlan', 'function v17Trajectory', "querySelector(`.trajectory-series", "$('.trajectory-chart.detailed')"]) {
  if (source.includes(forbidden)) throw new Error(`legacy trajectory logic remains: ${forbidden}`);
}
if (source.includes('observe(document.documentElement')) throw new Error('global document observer remains in feature controller');

await writeFile(path, source);
console.log('Legacy DOM trajectory parsing removed from feature controller.');
