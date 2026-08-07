import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/app.js');
const professional = read('src/sensory-professional-controller.js');
const account = read('src/ui/account-sync-panel.js');
const runtime = read('src/features/runtime-features.js');
const sw = read('sw.js');

assert.match(app, /pendingSensoryContext/);
assert.match(app, /data-sensory-mode="note"/);
assert.match(app, /data-sensory-mode-host/);
assert.doesNotMatch(app, /id="startSensoryBtn"/);
assert.match(app, /source: 'direct-brew'/);
assert.match(app, /source: 'generated-plan'/);
assert.match(app, /id="saveSensoryNoteBtn"/);
assert.doesNotMatch(app, /evaluation\.nodeIndex = SENSORY_NODES\.findIndex/);
assert.match(app, /state\.pendingSensoryContext = \{ beanId: bean\.id, brewSessionId: saved\.record\.id/);
assert.match(app, /gear: \{ filters: \[\], drippers: \[\{[^\n]+\}\], grinders: \[\] \}/);
assert.match(app, /data-gear-kind="\$\{kind\}"/);
assert.match(app, /data-add-gear="grinder"/);
assert.doesNotMatch(app, /saveGearTextBtn|gearGrinders" class="control"/);
assert.match(app, /<span>账户<\/span>/);

assert.match(professional, /const NOTE_STEP = STEPS\.length \+ 1/);
assert.match(professional, /data-v095-professional-note/);
assert.match(professional, /naturalNote: wizard\.naturalNote\.trim\(\)/);
assert.doesNotMatch(professional, /skipNativeToScore|injectProfessionalNote|startNative/);

assert.match(account, /<span>账户<\/span><small>唯一的登录与自动同步入口<\/small>/);
assert.doesNotMatch(runtime, /postbrew-sensory/);
assert.doesNotMatch(sw, /postbrew-sensory-controller/);

console.log('v1.2.5 independent sensory state machines and unified private gear model passed');
