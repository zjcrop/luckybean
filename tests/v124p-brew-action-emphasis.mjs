import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('src/app.js', 'utf8');
const css = fs.readFileSync('src/ui/brew-action-emphasis.css', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const release = JSON.parse(fs.readFileSync('release.json', 'utf8'));
const escapedRevision = release.revision.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

assert.match(index, new RegExp(`brew-action-emphasis\\.css\\?v=${escapedRevision}`));
assert.match(sw, /versioned\('\.\/src\/ui\/brew-action-emphasis\.css'\)/);

for (const selector of ['#generatePlanBtn', '#brewProfile', '#startBrewBtn', '#confirmBrewPreparedBtn']) {
  assert.ok(css.includes(selector), `missing emphasized selector ${selector}`);
}
for (const selector of ['#repeatPreparationBtn', '#cancelPreparationBtn', '.timer-actions .button']) {
  assert.ok(css.includes(selector), `missing secondary emphasized selector ${selector}`);
}
assert.match(css, /font-weight:\s*800\s*!important/);
assert.match(css, /font-weight:\s*700\s*!important/);

for (const id of ['generatePlanBtn', 'brewProfile', 'startBrewBtn', 'repeatPreparationBtn', 'cancelPreparationBtn', 'confirmBrewPreparedBtn']) {
  assert.match(app, new RegExp(`id=\\"${id}\\"`));
}

console.log(`LuckyBean ${release.displayVersion} brew calculation, automatic selection, timer start and preparation actions are visually emphasized`);
