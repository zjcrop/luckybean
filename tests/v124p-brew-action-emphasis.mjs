import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('src/app.js', 'utf8');
const css = fs.readFileSync('src/ui/brew-action-emphasis.css', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

assert.match(index, /brew-action-emphasis\.css\?v=1\.24P-main\.1/);
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

console.log('1.24P brew calculation, automatic selection, timer start and preparation actions are visually emphasized');
