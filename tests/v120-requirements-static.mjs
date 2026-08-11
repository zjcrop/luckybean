import fs from 'node:fs';
import assert from 'node:assert/strict';
import { listBrewProfiles, computeFallbackPlan } from '../src/brew-engine.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const index = read('index.html');
const app = read('src/app.js');
const runtime = read('src/features/runtime-features.js');
const sw = read('sw.js');
const account = read('src/ui/account-sync-panel.js');
const cloudSafety = read('src/services/cloud-sync-safety.js');
const cloudSync = read('src/services/cloud-sync-service.js');
const auth = read('src/services/cloud-auth-service.js');
const sync = read('src/services/cloud-sync-service.js');
const startup = read('src/core/startup-controller.js');
const sensory = read('src/sensory-professional-controller.js');
const spatial = read('src/renderers/brew-spatial-controller.js');
const analysis = read('src/services/brew-analysis-service.js');
const layoutController = read('src/ui-layout-controller.js');
const voice = read('src/ui/voice-settings-controller.js');

assert.doesNotMatch(index, /id="loginScreen"|id="guestBtn"|id="emailIdentityBtn"|id="wechatIdentityBtn"/);
assert.equal((index.match(/id="brewSpatialMount"/g) || []).length, 1);
assert.doesNotMatch(runtime, /settings-screen-controller/);
assert.doesNotMatch(sw, /settings-screen-controller/);
assert.equal(fs.existsSync(new URL('../src/settings-screen-controller.js', import.meta.url)), false);
assert.doesNotMatch(app, /saveIdentityBtn|settingsNickname|settingsPhone|settingsWechat|settingsQq/);
assert.match(app, /data-settings-key="account"/);
assert.match(account, /replaceChildren\(section\)/);
assert.match(account, /removeLegacyAccountUi/);
assert.match(account, /dataset\.singleSyncAccount/);
assert.match(account, /登录服务器同步/);
assert.match(account, /自动同步始终启用/);
assert.doesNotMatch(account, /type=\"checkbox\"|data-cloud-register|\.setEnabled\?\./);
assert.match(account, /\.syncNow\?\./);
assert.match(account, /\.pullNow\?\./);
assert.doesNotMatch(auth, /persistIdentity|getSetting|setSetting/);
assert.match(auth, /唯一的服务器同步账号/);
assert.match(sync, /function ensureAutomatic/);
assert.doesNotMatch(sync, /ENABLE_KEY|setEnabled|reason: 'disabled'|emit\('disabled'/);
assert.doesNotMatch(startup, /ensureLocalIdentity|LB-LOCAL-|getSetting|setSetting/);
assert.match(sw, /CACHE_PREFIX = 'luckybean-main-v123e-'/);
assert.match(sw, /LEGACY_CACHE_PREFIXES = \['luckybean-main-v123d-', 'luckybean-main-v123-', 'luckybean-v120-test-', 'luckybean-v121-account-test-', 'luckybean-v122-cloud-safety-test-'/);
assert.match(sw, /1\.23E/);
assert.match(startup, /serviceWorker\.register\('\.\/sw\.js\?v=1\.23E-main-sync\.1', \{ updateViaCache: 'none' \}\)/);
assert.match(spatial, /#brewSpatialMount/);
assert.match(sensory, /data-v120-radar-node/);
assert.match(sensory, /pointermove/);
assert.match(sensory, /data-v120-selected-tag/);
assert.match(sensory, /luckybean:professional-sensory-complete/);
assert.doesNotMatch(analysis, /专业冲煮分析需要登录云端账号/);
assert.doesNotMatch(layoutController, /PROFILE_TO_SEGMENT|SEGMENT_TO_PROFILE|synchronizeBrewControls|enforceBrewSelection|v097ExplicitProfile/);
assert.match(index, /voice-settings-controller\.js/);
assert.match(voice, /LuckyBeanVoiceSettings/);
assert.match(sw, /voice-settings-controller\.js/);

const baseInput = {
  schemaVersion: 2,
  bean: { countryCode: 'CO-ET', varietyCode: 'VA-GE', processCode: 'PR-WA', roastCode: 'RL-L1', roastDate: '2026-08-01', altitude: 1900 },
  brew: { mode: 'professional', method: 'pourover', doseG: 15, ratio: 16, segmentMode: 'auto', segments: 4, dripperCode: '锥形滤杯', filterPaper: '', filterPaperId: '', grinder: '', firstCoolingMode: 'auto', firstTemperatureC: 87, tailCoolingMode: 'auto', tailTemperatureC: 86, temperatureTune: 0, grindTune: 0, bloomTune: 0, repeatability: false, waterProfileId: 'floral' },
  water: { profileId: 'floral', recipeVolumeL: 5, tdsMgL: 85 },
  environment: { ambientTemperatureC: 25, relativeHumidityPct: null, initialBedTemperatureC: 25 },
  targets: { floral: 2, acidity: 1.5, sweetness: 2, body: 1, bitterness: 2 }
};

for (const profile of listBrewProfiles()) {
  if (profile.id === 'recommended') continue;
  if (profile.tags?.includes('competition')) continue;
  const input = structuredClone(baseInput);
  input.brew.profileId = profile.id;
  const plan = await computeFallbackPlan(input);
  assert.equal(plan.profile?.id, profile.id, `profile selection was not preserved: ${profile.id}`);
  assert.ok(Array.isArray(plan.stages) && plan.stages.length > 0, `profile generated no stages: ${profile.id}`);
}

console.log('LuckyBean 1.23E single server account, mandatory automatic sync and all-profile checks passed');
