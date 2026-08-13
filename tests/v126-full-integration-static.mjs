import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MATCH_CONTRACT,
  MATCH_AXIS_SET,
  MATCH_DIM,
  buildBeanVector,
  buildGearCorrection,
  combineMatchVector,
  buildTargetVector,
  encodeMatchSignature
} from '../src/domain/matching/flavor-vector.js';

assert.equal(MATCH_CONTRACT, 'luckybean-match/1.1');
assert.equal(MATCH_AXIS_SET, 'flavor_core_v1');
assert.equal(MATCH_DIM, 8);

const bean = buildBeanVector({ variety:'Geisha', process:'Washed', roastCode:'RL-L1', altitude:1900, flavorText:'茉莉 柑橘 蜂蜜' });
assert.equal(bean.vector.length, 8);
assert.ok(bean.vector.every(v => Number.isInteger(v) && v >= 0 && v <= 100));

const neutralGear = buildGearCorrection({ matchingGear:{ defaultDripper:{ angleDeg:60, bypass:'medium' }, defaultPaper:{ speed:'medium' } } }, { brew:{} });
const gear = buildGearCorrection({ matchingGear:{ defaultDripper:{ angleDeg:90, bypass:'low' }, defaultPaper:{ speed:'high' } } }, { brew:{} });
assert.equal(gear.length, 8);
assert.notDeepEqual(gear, neutralGear, 'dripper angle/bypass/paper speed must affect gear correction');
const match = combineMatchVector(bean.vector, gear);
assert.notDeepEqual(match, bean.vector);
const signature = encodeMatchSignature(match, bean.confidence);
assert.match(signature, /^LMS1-FC1-X[0-9A-F]{16}-Q\d{1,3}$/);
assert.doesNotMatch(signature, /-D\d{2}-/);
assert.equal(buildTargetVector({ acidity:2, sweetness:2, floral:2, fruity:2, bitterness:1, astringency:2 }).length, 8);

const history = fs.readFileSync(new URL('../src/domain/history/history-service.js', import.meta.url), 'utf8');
assert.ok(history.includes('remainingAfter < 5'));
assert.ok(history.includes('inventoryShortfallG'));

const controller = fs.readFileSync(new URL('../src/features/full-integration-controller-v3.js', import.meta.url), 'utf8');
for (const text of ['requestFullscreen','navigator.wakeLock.request(\'screen\')','prepareBrewExecution','startBrewExecution','validWindowMs','countdown_321','lb-one-line-bean']) {
  assert.ok(controller.includes(text), `missing ${text}`);
}
assert.doesNotMatch(controller, /injectGear|data-lb-batch-open|remove\('beans'|new MutationObserver\([^)]*document\.body/);

const gearUi = fs.readFileSync(new URL('../src/ui/gear-controller.js', import.meta.url), 'utf8');
for (const text of ['matchingGear.drippers','matchingGear.papers','滤杯角度','过滤速度']) assert.ok(gearUi.includes(text), `missing gear UI ${text}`);
assert.doesNotMatch(gearUi, /MutationObserver/);

const service = fs.readFileSync(new URL('../android/app/src/main/java/com/luckybean/app/BrewTimerService.java', import.meta.url), 'utf8');
for (const text of ['SystemClock.elapsedRealtime()','PARTIAL_WAKE_LOCK','TextToSpeech','synthesizeToFile','ExoPlayer','validWindowMs','USAGE_ASSISTANCE_NAVIGATION_GUIDANCE']) assert.ok(service.includes(text), `missing ${text}`);
const activity = fs.readFileSync(new URL('../android/app/src/main/java/com/luckybean/app/MainActivity.java', import.meta.url), 'utf8');
for (const text of ['FLAG_KEEP_SCREEN_ON','prepareBrewExecution','startBrewExecution','enterImmersiveMode','InputImage.fromFilePath(MainActivity.this, sourceUri)']) assert.ok(activity.includes(text));
const gradle = fs.readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
assert.ok(gradle.includes('androidx.media3:media3-exoplayer:1.8.1'));
const manifest = fs.readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
for (const text of ['FOREGROUND_SERVICE_MEDIA_PLAYBACK','WAKE_LOCK','android.intent.action.TTS_SERVICE','BrewTimerService']) assert.ok(manifest.includes(text));

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.ok(html.includes('full-integration-controller-v3.js'));
assert.ok(html.includes('app-layout.css'));
assert.ok(html.includes('app-components.css'));
assert.doesNotMatch(html, /gear-regression-fix-controller|legacy-timer-guard|full-integration\.css|interaction-repair\.css/);

console.log('v126 canonical full integration static checks passed');
