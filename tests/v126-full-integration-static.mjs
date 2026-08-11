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

assert.equal(MATCH_CONTRACT, 'luckybean-match/1.0');
assert.equal(MATCH_AXIS_SET, 'flavor_core_v1');
assert.equal(MATCH_DIM, 8);

const bean = buildBeanVector({
  variety: 'Geisha',
  process: 'Washed',
  roastCode: 'RL-L1',
  altitude: 1900,
  flavorText: '茉莉 柑橘 蜂蜜'
});
assert.equal(bean.vector.length, 8);
assert.ok(bean.vector.every(v => Number.isInteger(v) && v >= 0 && v <= 100));

const gear = buildGearCorrection({
  matchingGear: {
    defaultDripper: { shape: 'flat_bottom', bypass: 'low' },
    defaultPaper: { speed: 'high' }
  }
}, { brew: {} });
assert.equal(gear.length, 8);
const match = combineMatchVector(bean.vector, gear);
assert.notDeepEqual(match, bean.vector);
assert.match(encodeMatchSignature(match, bean.confidence), /^LMS1-FC1-D08-X[0-9A-F]{16}-Q\d{1,3}$/);
assert.equal(buildTargetVector({ acidity: 2, sweetness: 2, floral: 2, fruity: 2, bitterness: 1, astringency: 2 }).length, 8);

const history = fs.readFileSync(new URL('../src/domain/history/history-service.js', import.meta.url), 'utf8');
assert.ok(history.includes('remainingAfter < 5'));
assert.ok(history.includes('Math.max(0, Number((remainingBefore - amount).toFixed(3)))'));
assert.ok(history.includes('inventoryShortfallG'));

const controller = fs.readFileSync(new URL('../src/features/full-integration-controller-v3.js', import.meta.url), 'utf8');
for (const text of [
  'requestFullscreen',
  "navigator.wakeLock.request('screen')",
  'performance.now()',
  'prepareBrewExecution',
  'startBrewExecution',
  'validWindowMs',
  'countdown_321',
  'data-lb-batch-open',
  'lb-one-line-bean',
  'matchingGear'
]) assert.ok(controller.includes(text), `missing ${text}`);

const service = fs.readFileSync(new URL('../android/app/src/main/java/com/luckybean/app/BrewTimerService.java', import.meta.url), 'utf8');
for (const text of [
  'SystemClock.elapsedRealtime()',
  'PARTIAL_WAKE_LOCK',
  'TextToSpeech',
  'synthesizeToFile',
  'ExoPlayer',
  'validWindowMs',
  'USAGE_ASSISTANCE_NAVIGATION_GUIDANCE'
]) assert.ok(service.includes(text), `missing ${text}`);

const activity = fs.readFileSync(new URL('../android/app/src/main/java/com/luckybean/app/MainActivity.java', import.meta.url), 'utf8');
for (const text of ['FLAG_KEEP_SCREEN_ON', 'prepareBrewExecution', 'startBrewExecution', 'enterImmersiveMode']) assert.ok(activity.includes(text));

const gradle = fs.readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
assert.ok(gradle.includes('androidx.media3:media3-exoplayer:1.10.1'));
assert.ok(gradle.includes('globalThis.__LUCKYBEAN_ANDROID__ || !globalThis.speechSynthesis'));

const manifest = fs.readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
for (const text of ['FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'WAKE_LOCK', 'android.intent.action.TTS_SERVICE', 'BrewTimerService']) assert.ok(manifest.includes(text));

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.ok(html.includes('full-integration-controller-v3.js'));
assert.ok(html.includes('full-integration.css'));

console.log('v126 full integration static checks passed');
