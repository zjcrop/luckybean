import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('src/app.js', 'utf8');
const css = fs.readFileSync('src/ui/brew-action-emphasis.css', 'utf8');
const interactionCss = fs.readFileSync('src/ui/brew-interaction-emphasis.css', 'utf8');
const interaction = fs.readFileSync('src/ui/brew-interaction-emphasis.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const release = JSON.parse(fs.readFileSync('release.json', 'utf8'));
const revisionPattern = String(release.revision).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

assert.match(index, new RegExp(`brew-action-emphasis\\.css\\?v=${revisionPattern}`));
assert.match(index, new RegExp(`brew-interaction-emphasis\\.css\\?v=${revisionPattern}`));
assert.match(sw, /src\/ui\/brew-action-emphasis\.css/);
assert.match(sw, /src\/ui\/brew-interaction-emphasis\.css/);

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

for (const selector of ['#generatePlanBtn', '#directSensoryBtn', '#startBrewBtn', '.recommended-profile-option']) {
  assert.ok(interactionCss.includes(selector), `missing requested strong interaction selector ${selector}`);
}
for (const selector of ['#brewDose', '#brewRatio', '#brewDripper', '#brewFilterPaper', '#brewWaterProfile', '#openBrewTuneBtn', '#openFlavorTargetBtn', '#openEnvironmentBtn']) {
  assert.ok(interactionCss.includes(selector), `missing requested brew setting selector ${selector}`);
}
assert.match(interactionCss, /font-family:SimHei/);
assert.match(interactionCss, /font-family:SimSun/);
assert.match(interactionCss, /#pageBrew #generatedPlan #planToSensoryBtn\{display:none!important;\}/);
assert.match(interactionCss, /#pageBrew #generatedPlan > \.row\.menu-row\{[\s\S]*justify-content:center!important/);
assert.match(interaction, /textContent\.trim\(\) !== '方案微调'/);
assert.match(app, /id="openBrewTuneBtn"[^>]*>方案微调<\/button>/);

console.log(`1.24P ${release.revision} brew calculation, automatic selection, timer start and preparation actions are visually emphasized`);
