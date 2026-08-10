import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const appearance = read('src/ui/appearance-controller.js');
const voice = read('src/ui/voice-settings-controller.js');
const sensory = read('src/sensory-professional-controller.js');
const app = read('src/app.js');
const styles = read('styles.css');
const layoutGuard = read('src/ui/layout-guard.css');

assert.match(read('src/utils.js'), /APP_VERSION = '1\.23D'/, 'the locked app version must remain 1.23D');

assert.match(appearance, /theme === 'dark' \? '☀️' : '🌙'/, 'dark mode must offer the sun action and light mode the moon action');
assert.match(appearance, /screen\.dataset\.splashVariant = normalized/, 'the persisted splash choice must restore its matching background after refresh');
assert.match(appearance, /function enforceSingleOpen[\s\S]*other\.open = false/, 'dynamic appearance settings must join single-open behavior');
const chooseSplash = appearance.match(/function chooseSplash\(value\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.doesNotMatch(chooseSplash, /queueSettingsPanel|renderSettingsPanel/, 'choosing a splash must not rebuild and collapse its panel');
assert.match(chooseSplash, /classList\.toggle\('selected'/, 'splash selection should update in place');
assert.match(voice, /section\.addEventListener\('toggle'[\s\S]*other\.open = false/, 'voice settings must close every other settings category');

assert.match(sensory, /const SCORE_STEP = STEPS\.length \+ 1/, 'professional cupping must include a dedicated score step');
assert.match(sensory, /打分总结/, 'the score summary UI must be present');
assert.match(sensory, /data-v095-cancel>取消品鉴/, 'cancel must remain available throughout the workflow');
const defectHandler = sensory.match(/\$\$\('\[data-v095-defect-group\]'[\s\S]*?\n  \}\)\);/)?.[0] || '';
assert.ok(defectHandler, 'defect interaction handler must exist');
assert.doesNotMatch(defectHandler, /renderWizard\(\)/, 'defect selection must not rebuild the overlay and jump its scroll position');
assert.match(sensory, /startMode\('professional', record\)/, 'professional edits must reload the original workflow');
assert.match(app, /function editSensoryRecordInFlow/, 'record editing must re-enter a sensory workflow');
assert.match(app, /luckybean:edit-professional-sensory/, 'professional records must be handed back to the professional workflow');
assert.doesNotMatch(app, /sensoryRecordEditorHtml/, 'the flat result-only editor must stay removed');

assert.match(styles, /\.v095-tag-grid,[\s\S]*column-gap:\s*1em;[\s\S]*row-gap:\s*\.5em;/, 'cupping tags must use one-em columns and half-em rows');
assert.match(styles, /\.v095-score-stage \[data-v095-score-delta-input\][\s\S]*width:\s*100% !important;[\s\S]*writing-mode:\s*horizontal-tb !important;/, 'professional subjective score axis must be a wide horizontal control');
assert.match(layoutGuard, /\.v095-professional-overlay,[\s\S]*\.v098-radar-return[\s\S]*overflow-y:\s*auto !important/, 'mobile cupping and radar overlays must scroll vertically');
assert.match(layoutGuard, /\.v098-radar-return > \.v098-radar-dialog[\s\S]*max-height:\s*none !important;[\s\S]*overflow:\s*visible !important/, 'radar dialog must expose its full content to the overlay scroller');
assert.match(app, /dripperMaterial:\s*normalizeDripperMaterial\(/, 'LuckyBean must send the selected dripper material to BrewProfiles');
assert.match(app, /data-add-bean-option="regions"/, 'region must retain a local add-option action');
assert.match(app, /data-add-bean-option="entities"/, 'estate and processing-station must retain a local add-option action');

console.log('LuckyBean 1.23D settings and sensory regression contracts passed');
