import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const flow = read('src/ui/p3-ux-flow-controller.js');
const flowCss = read('src/ui/p3-ux-flow.css');
const interaction = read('src/ui/recognition-interaction-controller.js');
const brewInteractionCss = read('src/ui/brew-interaction-emphasis.css');
const progress = read('src/features/recognition-batch-progress-controller.js');
const sync = read('src/services/cloud-sync-service.js');
const capture = read('src/package-capture-controller.js');

assert.match(interaction, /import '\.\/p3-ux-flow-controller\.js'/, 'P3 UX controller must be loaded by an existing boot module');
assert.match(flow, /\[data-brew-bean\]/, 'bean-card brew action must be observed');
assert.match(flow, /button\.click\(\)/, 'bean-card brew action must auto-trigger plan generation');
assert.match(flow, /replace\(\/\^\(热冲\|冰冲\)方案\/, '冲煮方案'\)/, 'hot/cold generated heading must be normalized');
assert.match(flow, /planHost\.insertBefore\(tendency, generated\)/, 'brew tendency must sit above generated plan');
assert.match(flowCss, /\.brew-mode-field\{display:none!important\}/, 'top hot/cold control must be removed from layout');
assert.match(flowCss, /#startBrewBtn,#planToSensoryBtn/, 'legacy action geometry must remain compatible');
assert.match(brewInteractionCss, /#pageBrew #generatedPlan #planToSensoryBtn\{display:none!important;\}/, 'duplicate lower direct-tasting action must be removed from the visible UI');
assert.match(brewInteractionCss, /#pageBrew #generatedPlan > \.row\.menu-row/, 'the remaining timer action must own the centered lower row');

assert.match(flow, /targetWidth = view\.canvas\.width \* 0\.88/, '3D scene must fit most of the available width');
assert.match(flow, /targetHeight = view\.canvas\.height \* 0\.76/, '3D scene must fit the useful fullscreen height');
assert.match(flow, /\$\$\('\.spatial-fullscreen-overlay'\)\.forEach\(node => node\.remove\(\)\)/, 'fullscreen overlay must be physically removed on exit');
assert.match(flow, /document\.body\.classList\.remove\('spatial-fullscreen-open'\)/, 'fullscreen body state must be cleared');

for (const label of ["camera.textContent = '拍摄'", "gallery.textContent = '上传'", "handoff.textContent = '确认'"]) {
  assert.ok(flow.includes(label), `capture action rename missing: ${label}`);
}
assert.match(flow, /#bagManualBtn[^\n]*\.remove\(\)/, 'duplicate manual paste action must be removed');
assert.match(flowCss, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, 'capture footer must expose only capture, upload and confirmation actions');
assert.match(flowCss, /position:fixed!important/, 'capture actions must stay fixed at viewport bottom');
assert.match(capture, /luckybean:package-auto-recognition-start/, 'successful image entry must own automatic OCR start');
assert.match(capture, /void runRecognition\(\)/, 'automatic OCR must call the authoritative recognition path directly');
assert.doesNotMatch(capture, /bagRecognizeBtn/, 'package capture must not render a manual recognition control');
assert.match(flow, /button && !button\.disabled\) button\.click\(\)/, 'successful recognition must auto-handoff into ambiguity/Foundation flow');

assert.doesNotMatch(progress, /正在识别 \$\{current\}/, 'standalone recognition status copy must be removed');
assert.doesNotMatch(progress, /task\.taskId.*识别中/, 'task status text must not be rendered as a separate row');
assert.match(progress, /className='lb-image-progress'/, 'recognition progress must live inside image cards');
assert.match(progress, /addEventListener\('luckybean:ocr-progress'/, 'image progress must consume real OCR provider milestones');
assert.match(progress, /rawProgress>=100\?90/, 'a completed engine pass must stay below final image completion while an adaptive detail pass may follow');
assert.match(progress, /progressByTask\.set\(key,Math\.max\(previous,progress\)\)/, 'provider progress must stay monotonic across fast/detail passes');
assert.match(progress, /task\?\.status==='completed'\)return 100/, 'only completed outer image task may expose 100%');
assert.doesNotMatch(progress, /setInterval\(/, 'recognition progress must not be driven by a synthetic timer');

assert.ok(flow.includes(".replace(/(\\d+(?:\\.\\d+)?)g豆/g, '$1g')"), 'homepage consumed-bean unit must be compacted');
assert.match(flow, /\\u00a0\/\\u00a0/, 'homepage separators must stay attached during wrapping');
assert.match(flowCss, /\.v099f-freshness-note,.v099i-freshness-note\{display:none!important\}/, 'group algorithm prose must not be shown');

assert.match(sync, /sync_completed_at \|\| manifest\?\.uploaded_at/, 'server-authored sync timestamp must outrank device time');
assert.match(sync, /client_architecture: 'manifest-diff-v4'/, 'new sync architecture must be explicit');
assert.match(sync, /bean_index: beanIndex/, 'manifest must carry the lightweight bean index');
assert.match(sync, /logical_key: descriptor\.logicalKey/, 'manifest chunks must retain logical identity');
assert.match(sync, /chunk_id=in\.\(\$\{filter\}\)/, 'downloads must request only selected chunks');
assert.match(sync, /neededMetas = remoteMetas\.filter/, 'unchanged local chunks must be skipped before network download');
assert.match(sync, /key\.endsWith\(':meta'\) \|\| key\.startsWith\('global:bean-mutations:'\)/, 'bean list and tombstones must download before detail/history chunks');
assert.match(sync, /luckybean:cloud-list-restored/, 'list-first restore must have an observable UI event');
assert.match(sync, /skippedUnchangedPackets/, 'sync diagnostics must record skipped unchanged packets');
assert.match(sync, /field_revisions: bean\.map\(fieldFingerprint\)/, 'manifest must expose per-field revision fingerprints for diff planning');
assert.match(sync, /revision: 'cloud-sync-service-v4-manifest-diff'/, 'runtime sync revision must identify the manifest-first implementation');

console.log('P3 UX, automatic OCR, real OCR progress, 3D fullscreen and manifest-first sync contracts passed');
