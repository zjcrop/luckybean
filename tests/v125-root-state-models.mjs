import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/app.js');
const professional = read('src/sensory-professional-controller.js');
const integrity = read('src/integrity-ui-controller.js');
const account = read('src/ui/account-sync-panel.js');
const runtime = read('src/features/runtime-features.js');
const sw = read('sw.js');
const androidBuild = read('android/app/build.gradle');
const androidBridge = read('android/native-bridge.js');
const dataContract = JSON.parse(read('contracts/luckybean-brew-data.schema.json'));

assert.match(app, /pendingSensoryContext/);
assert.match(app, /data-sensory-mode="note"/);
assert.match(app, /data-sensory-mode-host/);
assert.doesNotMatch(app, /id="startSensoryBtn"/);
assert.match(app, /source: 'direct-brew'/);
assert.match(app, /source: 'generated-plan'/);
assert.match(app, /function openSensoryModeChooser/);
assert.match(app, /data-brew-action="plan-sensory"/);
assert.match(app, /brewActionsBound/);
assert.doesNotMatch(app, /\$\('#planToSensoryBtn'\)\?\.addEventListener/);
assert.doesNotMatch(integrity, /enterSensoryChoice|#directSensoryBtn, #planToSensoryBtn|stopImmediatePropagation/);
assert.match(app, /authoritativePlanReference/);
assert.match(app, /data\.planReference|dataset\.planReference/);
assert.match(app, /id="saveSensoryNoteBtn"/);
assert.doesNotMatch(app, /evaluation\.nodeIndex = SENSORY_NODES\.findIndex/);
assert.match(app, /state\.pendingSensoryContext = \{ beanId: bean\.id, brewSessionId: saved\.record\.id/);
assert.match(app, /gear: \{ filters: \[\], drippers: \[\{[^\n]+\}\], grinders: \[\] \}/);
assert.match(app, /data-gear-kind="\$\{kind\}"/);
assert.match(app, /data-add-gear="grinder"/);
assert.doesNotMatch(app, /saveGearTextBtn|gearGrinders" class="control"/);
assert.match(app, /<span>账户<\/span>/);

assert.match(professional, /<strong>杯测品鉴<\/strong>/);
assert.match(professional, /\[data-sensory-mode-host\]/);
assert.match(professional, /host\.replaceChildren\(\)/);
assert.match(professional, /planReference/);
assert.match(professional, /profileId/);
assert.doesNotMatch(professional, /startSensoryBtn|v095-native-start/);
assert.match(professional, /const SCORE_STEP = STEPS\.length \+ 1/);
assert.match(professional, /const NOTE_STEP = STEPS\.length \+ 2/);
assert.match(professional, /data-v095-professional-note/);
assert.match(professional, /naturalNote: wizard\.naturalNote\.trim\(\)/);
assert.doesNotMatch(professional, /skipNativeToScore|injectProfessionalNote|startNative/);

assert.match(account, /<span>账户<\/span><small>唯一的登录与自动同步入口<\/small>/);
assert.doesNotMatch(runtime, /postbrew-sensory/);
assert.doesNotMatch(sw, /postbrew-sensory-controller/);
assert.match(androidBuild, /applicationId 'com\.luckybean\.app'/);
assert.match(androidBuild, /versionCode 102308/);
assert.match(androidBuild, /versionName '1\.23E'/);
assert.match(androidBridge, /https:\/\/zjcrop\.github\.io\/luckybean\//);
assert.doesNotMatch(androidBridge, /zjcrop\.github\.io\/(?:BrewIon\/luckybean|LuckyBean)\//);
assert.equal(dataContract.$id, 'https://zjcrop.github.io/luckybean/contracts/luckybean-brew-data.schema.json');

console.log('v1.2.5 independent sensory state machines and LuckyBean 1.23E Android package contracts passed');
