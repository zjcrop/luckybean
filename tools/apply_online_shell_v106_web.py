from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'missing {label} in {path}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


# ---------------------------------------------------------------------------
# Database mutation notifications drive the debounced native snapshot.
# ---------------------------------------------------------------------------
db = ROOT / 'src/db.js'
db_text = db.read_text(encoding='utf-8')
if 'function notifyDataChanged' not in db_text:
    marker = 'let privacySecretPromise;\n'
    if marker not in db_text:
        raise SystemExit('db privacy marker not found')
    db_text = db_text.replace(marker, marker + '''
function notifyDataChanged(name, operation) {
  if (['codebookCache', 'syncMetadata'].includes(name)) return;
  queueMicrotask(() => globalThis.dispatchEvent?.(new CustomEvent('luckybean:data-changed', {
    detail: { store: name, operation, at: Date.now() }
  })));
}
''', 1)

old_put = '''export async function put(name, value) {
  return core.put(name, await prepareWrite(name, value));
}

export async function bulkPut(name, values) {
  if (!Array.isArray(values)) throw new Error('批量写入数据必须是数组');
  return core.bulkPut(name, await Promise.all(values.map(value => prepareWrite(name, value))));
}
'''
new_put = '''export async function put(name, value) {
  const result = await core.put(name, await prepareWrite(name, value));
  notifyDataChanged(name, 'put');
  return result;
}

export async function bulkPut(name, values) {
  if (!Array.isArray(values)) throw new Error('批量写入数据必须是数组');
  const result = await core.bulkPut(name, await Promise.all(values.map(value => prepareWrite(name, value))));
  if (values.length) notifyDataChanged(name, 'bulkPut');
  return result;
}

export async function remove(name, key) {
  const result = await core.remove(name, key);
  notifyDataChanged(name, 'remove');
  return result;
}
'''
if old_put not in db_text:
    raise SystemExit('db put/bulkPut block not found')
db_text = db_text.replace(old_put, new_put, 1)
old_clear = '''export async function clearAll() {
  privacySecretPromise = undefined;
  return core.clearAll();
}
'''
new_clear = '''export async function clearAll() {
  privacySecretPromise = undefined;
  const result = await core.clearAll();
  notifyDataChanged('*', 'clearAll');
  return result;
}
'''
if old_clear not in db_text:
    raise SystemExit('db clearAll block not found')
db_text = db_text.replace(old_clear, new_clear, 1)
db.write_text(db_text, encoding='utf-8')

# ---------------------------------------------------------------------------
# Brew engine: merge the authenticated private catalog and use server plans.
# ---------------------------------------------------------------------------
brew = ROOT / 'src/brew-engine.js'
brew_text = brew.read_text(encoding='utf-8')
import_marker = "} from './brew-optimizer-v097.js';\n"
service_import = '''} from './brew-optimizer-v097.js';
import {
  getSyncedBrewProfiles,
  getBrewProfileSyncStatus,
  isSyncedBrewProfile,
  requestSyncedBrewPlan,
  syncBrewProfileCatalog
} from './v106-brew-profile-service.js';
'''
if "from './v106-brew-profile-service.js'" not in brew_text:
    if import_marker not in brew_text:
        raise SystemExit('brew optimizer import marker not found')
    brew_text = brew_text.replace(import_marker, service_import, 1)

old_list = '''export function listBrewProfiles() {
  return [...core.listBrewProfiles().map(profile => ({ ...profile })), ...EXTRA_PROFILES.map(profile => ({ ...profile }))];
}
'''
new_list = '''const LOCAL_PROFILE_IDS = new Set([
  ...core.listBrewProfiles().map(profile => profile.id),
  ...EXTRA_PROFILES.map(profile => profile.id)
]);

export function listBrewProfiles() {
  const merged = new Map();
  for (const profile of [...core.listBrewProfiles(), ...EXTRA_PROFILES]) merged.set(profile.id, { ...profile, localFallback: true });
  for (const profile of getSyncedBrewProfiles()) merged.set(profile.id, { ...(merged.get(profile.id) || {}), ...profile, remote: true });
  const values = [...merged.values()];
  const recommended = values.find(profile => profile.id === 'recommended');
  const rest = values.filter(profile => profile.id !== 'recommended').sort((a, b) => {
    const aCompetition = (a.tags || []).includes('competition-reference') ? 1 : 0;
    const bCompetition = (b.tags || []).includes('competition-reference') ? 1 : 0;
    if (aCompetition !== bCompetition) return aCompetition - bCompetition;
    return String(a.label || a.id).localeCompare(String(b.label || b.id), 'zh-CN');
  });
  return recommended ? [recommended, ...rest] : rest;
}

export async function syncBrewProfiles(options = {}) {
  return syncBrewProfileCatalog(options);
}

export function brewProfileSyncStatus() {
  return getBrewProfileSyncStatus();
}
'''
if old_list not in brew_text:
    raise SystemExit('brew profile list block not found')
brew_text = brew_text.replace(old_list, new_list, 1)

request_pattern = re.compile(r'''export async function requestPrivatePlan\(endpoint, input, timeoutMs = 9000\) \{.*?\n\}''', re.S)
request_match = request_pattern.search(brew_text)
if not request_match:
    raise SystemExit('brew requestPrivatePlan block not found')
new_request = '''export async function requestPrivatePlan(endpoint, input, timeoutMs = 9000) {
  const selected = explicitProfileId(input);
  if (selected) {
    if (!isSyncedBrewProfile(selected)) await syncBrewProfileCatalog().catch(() => null);
    if (isSyncedBrewProfile(selected)) {
      try {
        const remote = await requestSyncedBrewPlan(input, selected, Math.max(timeoutMs, 15000));
        core.validatePlan(remote);
        return attachLegacyTrajectory(remote);
      } catch (error) {
        if (!LOCAL_PROFILE_IDS.has(selected)) {
          error.code = error.code || 'REMOTE_PROFILE_UNAVAILABLE';
          error.noFallback = true;
          error.message = `冲煮法“${profileDefinition(selected).label || selected}”必须连接闭源 brew-profiles 服务：${error.message}`;
          throw error;
        }
        console.warn('私有冲煮服务不可用，使用已审核的本地兼容方案', error);
      }
    }
  }
  if (selected && CORE_PROFILE_ALIAS[selected]) return computeOptimizedPlan(input, { forceProfile: selected });
  const normalized = normalizeExplicitInput(input);
  const privatePlan = await core.requestPrivatePlan(endpoint, normalized, timeoutMs);
  const semanticPlan = normalizeStageSemantics(privatePlan, selected);
  let optimized = optimizeBrewPlan(normalized, semanticPlan);
  optimized = normalizeStageSemantics(optimized, selected);
  assertProfileIntegrity(normalized, optimized);
  return attachLegacyTrajectory(optimized);
}'''
brew_text = brew_text[:request_match.start()] + new_request + brew_text[request_match.end():]
brew.write_text(brew_text, encoding='utf-8')

# ---------------------------------------------------------------------------
# Application lifecycle, profile selector and automatic restore.
# ---------------------------------------------------------------------------
app = ROOT / 'src/app.js'
app_text = app.read_text(encoding='utf-8')
old_import = "import { computeFallbackPlan, requestPrivatePlan, validatePlan, FALLBACK_ENGINE_VERSION, buildCorrectedPlan, listBrewProfiles } from './brew-engine.js';"
new_import = "import { computeFallbackPlan, requestPrivatePlan, validatePlan, FALLBACK_ENGINE_VERSION, buildCorrectedPlan, listBrewProfiles, syncBrewProfiles, brewProfileSyncStatus } from './brew-engine.js';\nimport { restoreNativeBackupIfNeeded, installNativeBackupBridge } from './v106-native-backup.js';"
if old_import not in app_text:
    raise SystemExit('app brew-engine import not found')
app_text = app_text.replace(old_import, new_import, 1)

state_marker = 'let toastTimer;\nlet toastCleanupTimer;\n'
state_addition = '''let toastTimer;
let toastCleanupTimer;
let brewProfileSyncPromise = null;
let brewProfileSyncAttemptAt = 0;

globalThis.__LUCKYBEAN_SCHEMA_VERSION = SCHEMA_VERSION;

function queueBrewProfileSync({ force = false, notify = false } = {}) {
  const status = brewProfileSyncStatus();
  if (!status.authenticated) return Promise.resolve({ ...status, updated: false, reason: 'auth-required' });
  if (brewProfileSyncPromise) return brewProfileSyncPromise;
  if (!force && Date.now() - brewProfileSyncAttemptAt < 60000 && !status.stale) return Promise.resolve(status);
  brewProfileSyncAttemptAt = Date.now();
  brewProfileSyncPromise = syncBrewProfiles({ force }).then(result => {
    if (notify) toast(result.updated ? `冲煮法已同步：${result.count}项` : `冲煮法已是最新：${result.count}项`, 'status-good');
    if (state.page === 'brew') renderBrew();
    return result;
  }).catch(error => {
    if (notify) toast(`冲煮法同步失败：${error.message}`, 'status-bad');
    return { updated: false, error: error.message };
  }).finally(() => { brewProfileSyncPromise = null; });
  return brewProfileSyncPromise;
}
'''
if state_marker not in app_text:
    raise SystemExit('app toast state marker not found')
app_text = app_text.replace(state_marker, state_addition, 1)

enter_old = '''  switchPage('beans');
  bindControlStates(document);
}'''
enter_new = '''  switchPage('beans');
  bindControlStates(document);
  setTimeout(() => queueBrewProfileSync(), 350);
}'''
if enter_old not in app_text:
    raise SystemExit('enterApp tail not found')
app_text = app_text.replace(enter_old, enter_new, 1)

render_marker = '''  const customWaterLabel = currentWater === 'custom' ? '自定义' : '';
  container.innerHTML = `'''
render_replacement = '''  const customWaterLabel = currentWater === 'custom' ? '自定义' : '';
  const brewProfiles = listBrewProfiles();
  const profileSync = brewProfileSyncStatus();
  const profileSyncText = profileSync.syncing ? '同步中…' : profileSync.count ? `私有库 ${profileSync.count} 项` : profileSync.authenticated ? '等待同步' : '登录后同步';
  container.innerHTML = `'''
if render_marker not in app_text:
    raise SystemExit('renderBrew custom water marker not found')
app_text = app_text.replace(render_marker, render_replacement, 1)
app_text = app_text.replace(
    "${listBrewProfiles().map(profile=>`<option value=\"${profile.id}\"${settings.profileId===profile.id?' selected':''}>${profile.label}</option>`).join('')}",
    "${brewProfiles.map(profile=>`<option value=\"${esc(profile.id)}\"${settings.profileId===profile.id?' selected':''}>${esc(profile.label)}${profile.remote ? ` · ${esc(profile.version || '云端')}` : ''}</option>`).join('')}"
)
old_profile_field = '''<label class="field"><span>冲煮法</span><select id="brewProfile" class="control">'''
new_profile_field = '''<label class="field brew-profile-field"><span>冲煮法 <button id="syncBrewProfilesBtn" class="inline-link" type="button">同步</button></span><select id="brewProfile" class="control">'''
if old_profile_field not in app_text:
    raise SystemExit('brew profile field marker not found')
app_text = app_text.replace(old_profile_field, new_profile_field, 1)
old_profile_close = '''</select></label><label class="field"><span>分段方式</span><select id="brewSegments"'''
new_profile_close = '''</select><small id="brewProfileSyncStatus" class="muted">${esc(profileSyncText)}</small></label><label class="field"><span>分段方式</span><select id="brewSegments"'''
if old_profile_close not in app_text:
    raise SystemExit('brew profile close marker not found')
app_text = app_text.replace(old_profile_close, new_profile_close, 1)

handler_marker = '''  $('#brewBean')?.addEventListener('change', event => { state.selectedBeanId = event.target.value; state.currentPlan = null; renderBrew(); });
  $('#generatePlanBtn')?.addEventListener('click', generatePlan);'''
handler_replacement = '''  $('#brewBean')?.addEventListener('change', event => { state.selectedBeanId = event.target.value; state.currentPlan = null; renderBrew(); });
  $('#brewProfile')?.addEventListener('change', async event => {
    state.settings.brew.profileId = event.target.value;
    state.currentPlan = null;
    await saveSettings();
  });
  $('#brewSegments')?.addEventListener('change', async event => {
    state.settings.brew.segmentMode = event.target.value;
    state.currentPlan = null;
    await saveSettings();
  });
  $('#syncBrewProfilesBtn')?.addEventListener('click', () => queueBrewProfileSync({ force: true, notify: true }));
  $('#generatePlanBtn')?.addEventListener('click', generatePlan);'''
if handler_marker not in app_text:
    raise SystemExit('renderBrew handler marker not found')
app_text = app_text.replace(handler_marker, handler_replacement, 1)

fallback_old = '''    try { plan = await requestPrivatePlan(state.settings.brew.apiEndpoint, input); }
    catch (error) { apiError = error.message; plan = await computeFallbackPlan(input); }'''
fallback_new = '''    try { plan = await requestPrivatePlan(state.settings.brew.apiEndpoint, input); }
    catch (error) {
      if (error?.noFallback || error?.code === 'REMOTE_PROFILE_UNAVAILABLE') throw error;
      apiError = error.message;
      plan = await computeFallbackPlan(input);
    }'''
if fallback_old not in app_text:
    raise SystemExit('generatePlan fallback block not found')
app_text = app_text.replace(fallback_old, fallback_new, 1)

init_old = '''  if (await handleSharedHash()) return;
  await refreshData(); await migrateLegacyFlavorCodes(); bindGlobalEvents();
  if (state.settings.identity.publicId) enterApp();'''
init_new = '''  if (await handleSharedHash()) return;
  const nativeRestore = await restoreNativeBackupIfNeeded().catch(error => ({ restored: false, error: error.message }));
  await refreshData(); await migrateLegacyFlavorCodes(); bindGlobalEvents();
  installNativeBackupBridge();
  if (nativeRestore?.restored) toast(`已从系统备份恢复：豆卡 ${nativeRestore.counts?.beans || 0}，冲煮 ${nativeRestore.counts?.brewSessions || 0}，品鉴 ${nativeRestore.counts?.sensoryRecords || 0}`, 'status-good');
  if (state.settings.identity.publicId) enterApp();
  setTimeout(() => queueBrewProfileSync(), 1200);'''
if init_old not in app_text:
    raise SystemExit('app init data block not found')
app_text = app_text.replace(init_old, init_new, 1)
app.write_text(app_text, encoding='utf-8')

required = {
    db: ['luckybean:data-changed', "operation: 'put'"],
    brew: ['syncBrewProfileCatalog', 'requestSyncedBrewPlan', 'REMOTE_PROFILE_UNAVAILABLE'],
    app: ['restoreNativeBackupIfNeeded', 'syncBrewProfilesBtn', 'queueBrewProfileSync']
}
for path, markers in [(db, required['db']), (brew, required['brew']), (app, required['app'])]:
    value = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in value:
            raise SystemExit(f'missing v106 marker {marker} in {path}')

print('Applied LuckyBean v1.0.6 Web profile sync and native backup lifecycle.')
