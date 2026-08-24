import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const appearance = read('src/ui/appearance-controller.js');
const voice = read('src/ui/voice-settings-controller.js');
const sensory = read('src/sensory-professional-controller.js');
const app = read('src/app.js');
const styles = read('styles.css');
const layout = read('src/ui/app-layout.css');
const sensoryCss = read('src/ui/professional-sensory.css');
const sensoryActionsCss = read('src/ui/sensory-wizard-actions.css');

assert.match(read('src/utils.js'), /APP_VERSION = '1\.24B'/, 'the locked app version must be 1.24B');

assert.match(appearance, /theme === 'dark' \? '☀️' : '🌙'/, 'dark mode must offer the sun action and light mode the moon action');
assert.match(appearance, /screen\.dataset\.splashVariant = normalized/, 'the persisted splash choice must restore its matching background after refresh');
assert.match(appearance, /function enforceSingleOpen[\s\S]*other\.open = false/, 'appearance settings must join single-open behavior');
assert.doesNotMatch(appearance, /MutationObserver/, 'appearance settings must be event-driven');
const chooseSplash = appearance.match(/function chooseSplash\(value\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.doesNotMatch(chooseSplash, /queueSettingsPanel|renderSettingsPanel/, 'choosing a splash must not rebuild and collapse its panel');
assert.match(chooseSplash, /classList\.toggle\('selected'/, 'splash selection should update in place');
assert.match(voice, /function enforceSingleOpen[\s\S]*other\.open = false/, 'voice settings must close every other settings category');
assert.doesNotMatch(voice, /MutationObserver/, 'voice settings must be event-driven');

assert.match(sensory, /const SCORE_STEP = STEPS\.length \+ 1/, 'professional cupping must include a dedicated score step');
assert.match(sensory, /打分总结/, 'the score summary UI must be present');
assert.match(sensory, /data-v095-cancel>取消品鉴/, 'cancel must remain available throughout the workflow');
assert.match(sensory, /data-v095-cancel>[\s\S]*data-v095-prev[\s\S]*>上一步<[\s\S]*data-v095-next/, 'every professional step must keep cancel, previous and next in semantic order');
assert.match(sensoryActionsCss, /\[data-v095-prev\]\s*\{[\s\S]*?grid-column:\s*2/, 'previous must occupy the centered action column');
assert.match(sensoryActionsCss, /\[data-v095-next\]\s*\{[\s\S]*?grid-column:\s*3/, 'next must occupy the rightmost action column');
const defectHandler = sensory.match(/\$\$\('\[data-v095-defect-group\]'[\s\S]*?\n  \}\)\);/)?.[0] || '';
assert.ok(defectHandler, 'defect interaction handler must exist');
assert.doesNotMatch(defectHandler, /renderWizard\(\)/, 'defect selection must not rebuild the overlay and jump its scroll position');
assert.match(sensory, /startMode\('professional', record\)/, 'professional edits must reload the original workflow');
assert.match(sensory, /LONG_PRESS_MS = 480/);
assert.match(sensory, /DRAG_CANCEL_DISTANCE = 8/);
assert.match(sensory, /data-v120-drag-handle/);
assert.match(sensory, /handle\.addEventListener\('pointerdown'/);
assert.doesNotMatch(sensory, /chip\.addEventListener\('pointerdown'/, 'the entire chip must not steal page scrolling');
assert.match(app, /function editSensoryRecordInFlow/, 'record editing must re-enter a sensory workflow');
assert.match(app, /luckybean:edit-professional-sensory/, 'professional records must be handed back to the professional workflow');
assert.doesNotMatch(app, /sensoryRecordEditorHtml/, 'the flat result-only editor must stay removed');

assert.match(sensoryCss, /\.v120-selected-tag-list, \.v095-tag-grid \{[\s\S]*gap:\s*\.5em 1em/, 'cupping tags must use one-em columns and half-em rows');
assert.match(sensoryCss, /\[data-v095-score-delta-input\]/, 'professional subjective score control must be themed');
assert.match(layout, /\.v095-professional-overlay,[\s\S]*\.v098-radar-return[\s\S]*overflow:\s*hidden !important/, 'professional and radar-return overlays must not create a second scroller');
assert.match(layout, /\.v098-radar-return > \.v098-radar-dialog[\s\S]*overflow-y:\s*auto !important/, 'radar-return dialog must own vertical scrolling');
assert.match(layout, /\.v095-radar-stage svg,[\s\S]*\.v098-radar-return svg \{ touch-action: pan-y/, 'radar blank areas must allow vertical page panning');
assert.match(layout, /\.v120-radar-node,[\s\S]*\.v098-radar-handle \{ touch-action: none/, 'only interactive radar handles may capture gestures');
assert.match(app, /dripperMaterial:\s*normalizeDripperMaterial\(/, 'LuckyBean must send the selected dripper material to BrewProfiles');
assert.match(app, /data-add-bean-option="regions"/, 'region must retain a local add-option action');
assert.match(app, /data-add-bean-option="entities"/, 'estate and processing-station must retain a local add-option action');

console.log('LuckyBean 1.24B canonical settings and sensory regression contracts passed');
