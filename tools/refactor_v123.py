from pathlib import Path
import json

VERSION = '1.2.3-brewprofiles-integration-test'


def replace_once(path, old, new):
    target = Path(path)
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'{path}: source block not found: {old[:120]!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


# BrewProfiles owns the runtime profile catalog. The embedded profiles are retained
# solely as a cold-start/offline fallback until a verified catalog has been cached.
replace_once(
    'src/brew-engine.js',
    "import { requestAuthoritativePlan } from './services/brew-analysis-service.js';\n",
    "import { requestAuthoritativePlan } from './services/brew-analysis-service.js';\nimport { listCachedBrewProfiles, refreshBrewProfileCatalog } from './services/brew-profile-catalog-service.js';\n",
)
replace_once(
    'src/brew-engine.js',
    "export function listBrewProfiles() {\n  return [...core.listBrewProfiles().map(profile => ({ ...profile })), ...EXTRA_PROFILES.map(profile => ({ ...profile }))];\n}\n",
    "function localBrewProfiles() {\n  return [...core.listBrewProfiles().map(profile => ({ ...profile, source: 'luckybean-cold-start' })), ...EXTRA_PROFILES.map(profile => ({ ...profile, source: 'luckybean-cold-start' }))];\n}\n\nexport function listBrewProfiles() {\n  const catalog = listCachedBrewProfiles();\n  return catalog.length ? catalog : localBrewProfiles();\n}\n\nrefreshBrewProfileCatalog().catch(error => console.warn('BrewProfiles方案目录尚未更新，暂用本地启动目录', error));\n",
)
replace_once(
    'src/brew-engine.js',
    "  if (EXPLICIT_PROFILES.has(raw)) return raw;\n",
    "  if (EXPLICIT_PROFILES.has(raw) || listBrewProfiles().some(profile => profile.id === raw)) return raw;\n",
)
replace_once(
    'src/brew-engine.js',
    "  next.brew.profileId = profileId;\n",
    "  next.brew.profileId = profileId;\n  next.brew.brewStyle = profileId;\n",
)
replace_once(
    'src/brew-engine.js',
    "function profileDefinition(profileId) {\n  return EXTRA_PROFILE_MAP.get(profileId)\n    || core.listBrewProfiles().find(profile => profile.id === profileId)\n    || { id: profileId, label: profileId, tags: [], description: '' };\n}\n",
    "function profileDefinition(profileId) {\n  return listBrewProfiles().find(profile => profile.id === profileId)\n    || EXTRA_PROFILE_MAP.get(profileId)\n    || core.listBrewProfiles().find(profile => profile.id === profileId)\n    || { id: profileId, label: profileId, tags: [], description: '', source: 'unknown' };\n}\n",
)

# The app consumes the dynamic catalog and never manufactures a successful-looking,
# targetless 3D scene after a professional analysis request fails.
replace_once(
    'src/app.js',
    "import { computeFallbackPlan, requestPrivatePlan, validatePlan, FALLBACK_ENGINE_VERSION, buildCorrectedPlan, listBrewProfiles } from './brew-engine.js';\n",
    "import { computeFallbackPlan, requestPrivatePlan, validatePlan, FALLBACK_ENGINE_VERSION, buildCorrectedPlan, listBrewProfiles } from './brew-engine.js';\nimport { brewProfileCatalogStatus } from './services/brew-profile-catalog-service.js';\n",
)
replace_once(
    'src/app.js',
    "document.addEventListener('luckybean:request-app-refresh', async event => {\n",
    "document.addEventListener('luckybean:brew-profile-catalog-updated', () => {\n  if (state.page === 'brew') renderBrew();\n});\n\ndocument.addEventListener('luckybean:request-app-refresh', async event => {\n",
)
old_generate = """    let plan, apiError = '';
    try { plan = await requestPrivatePlan(state.settings.brew.apiEndpoint, input); }
    catch (error) { apiError = error.message; plan = await computeFallbackPlan(input); }
    plan.beanId = bean.id; plan.generatedAt = new Date().toISOString(); plan.input = input;
    if (apiError) {
      plan.warnings = [...(plan.warnings || []), '专业冲煮服务暂不可用，当前使用本地参考模型。'];
      plan.analysisSnapshot = await createLocalReferenceAnalysis(input, plan, apiError);
      plan.visualization3d = plan.analysisSnapshot.trajectory;
      plan.trajectory = plan.analysisSnapshot.trajectory;
      plan.analysisFingerprint = plan.analysisSnapshot.analysisFingerprint;
      plan.executionSource = 'local-reference';
    }
"""
new_generate = """    let plan;
    try {
      plan = await requestPrivatePlan(state.settings.brew.apiEndpoint, input);
    } catch (error) {
      const failure = new Error(`${error.message} 未生成本地替代三维图，避免将参考轨迹误认为专业靶区。`);
      failure.code = error.code || 'BREWPROFILES_UNAVAILABLE';
      failure.cause = error;
      throw failure;
    }
    plan.beanId = bean.id; plan.generatedAt = new Date().toISOString(); plan.input = input;
"""
replace_once('src/app.js', old_generate, new_generate)
replace_once(
    'src/app.js',
    "  const selectedFilterId = settings.filterPaperId || filters[0]?.id || '';\n",
    "  const selectedFilterId = settings.filterPaperId || filters[0]?.id || '';\n  const brewProfiles = listBrewProfiles();\n  const catalogStatus = brewProfileCatalogStatus();\n  const catalogLabel = catalogStatus.available\n    ? `BrewProfiles在线目录 · ${catalogStatus.profileCount}套方案 / ${catalogStatus.competitionProfileCount}套赛事方案`\n    : '正在连接BrewProfiles；当前显示本地启动目录';\n",
)
old_profile_row = """    <div class="brew-row two"><label class="field"><span>冲煮法</span><select id="brewProfile" class="control">${listBrewProfiles().map(profile=>`<option value="${profile.id}"${settings.profileId===profile.id?' selected':''}>${profile.label}</option>`).join('')}</select></label><label class="field"><span>分段方式</span><select id="brewSegments" class="control"><option value="auto"${settings.segmentMode==='auto'?' selected':''}>模型推荐：${recommendedSegments+1}段</option>${[1,2,3,4,5].map(value=>`<option value="${value}"${String(settings.segmentMode)===String(value)?' selected':''}>${value+1}段（含首段）</option>`).join('')}</select></label></div>
"""
new_profile_row = """    <div class="brew-row two"><label class="field"><span>冲煮法</span><select id="brewProfile" class="control">${brewProfiles.map(profile=>`<option value="${esc(profile.id)}"${settings.profileId===profile.id?' selected':''}>${esc(profile.label)}</option>`).join('')}</select><small class="profile-catalog-status">${esc(catalogLabel)}</small></label><label class="field"><span>分段方式</span><select id="brewSegments" class="control"><option value="auto"${settings.segmentMode==='auto'?' selected':''}>模型推荐：${recommendedSegments+1}段</option>${[1,2,3,4,5].map(value=>`<option value="${value}"${String(settings.segmentMode)===String(value)?' selected':''}>${value+1}段（含首段）</option>`).join('')}</select></label></div>
"""
replace_once('src/app.js', old_profile_row, new_profile_row)

Path('src/renderers/brew-spatial-controller.js').write_text(
    """import { brewSpatialView } from './brew-spatial-view.js';

const REQUIRED_TARGET_IDS = Object.freeze(['acidity', 'floral', 'fruity', 'sweetness', 'bitterness', 'astringency']);

function isProfessionalScene(scene) {
  if (!scene || scene.schemaVersion !== 'brew-spatial/1.1' || !Array.isArray(scene.path) || scene.path.length < 2) return false;
  if (!Array.isArray(scene.targets)) return false;
  const byId = new Map(scene.targets.map(target => [String(target?.id || ''), target]));
  return REQUIRED_TARGET_IDS.every(id => {
    const target = byId.get(id);
    return target && Array.isArray(target.points) && target.points.length >= 12;
  });
}

function sceneFromPlan(plan) {
  if (!plan || plan.executionSource === 'local-reference') return null;
  const candidates = [
    plan.visualization3d,
    plan.trajectory?.schemaVersion === 'brew-spatial/1.1' ? plan.trajectory : null,
    plan.analysisSnapshot?.trajectory
  ];
  return candidates.find(isProfessionalScene) || null;
}

function host() { return document.querySelector('#brewSpatialMount'); }

function unavailableMessage(plan) {
  if (plan?.executionSource === 'local-reference') {
    return '当前为本地参考方案，不包含可验证的专业靶区；未用参考轨迹替代专业三维图。';
  }
  return '当前没有可验证的专业靶区数据；六类靶向物质区域不完整时不会显示三维图。';
}

async function mount(plan) {
  const target = host();
  if (!target) return false;
  target.replaceChildren();
  const scene = sceneFromPlan(plan);
  if (!scene) {
    target.hidden = false;
    const note = document.createElement('p');
    note.className = 'muted small spatial-unavailable';
    note.textContent = unavailableMessage(plan);
    target.append(note);
    brewSpatialView.close();
    return false;
  }
  target.hidden = false;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return Boolean(brewSpatialView.mountPreview(target, scene));
}

function clear() {
  const target = host();
  if (!target) return;
  target.replaceChildren();
  target.hidden = true;
  brewSpatialView.close();
}

document.addEventListener('luckybean:plan-ready', event => mount(event.detail?.plan));
document.addEventListener('luckybean:history-plan-loaded', event => mount(event.detail?.plan));
document.addEventListener('luckybean:spatial-clear', clear);
document.addEventListener('luckybean:open-spatial-scene', event => {
  if (isProfessionalScene(event.detail?.scene) && brewSpatialView.setScene(event.detail.scene)) brewSpatialView.open();
});

globalThis.LuckyBeanSpatial = {
  revision: 'brew-spatial-view/1.3.0',
  mount,
  clear,
  open(scene) { if (isProfessionalScene(scene) && brewSpatialView.setScene(scene)) brewSpatialView.open(); },
  close() { brewSpatialView.close(); },
  validate: isProfessionalScene
};
""",
    encoding='utf-8',
)

package_path = Path('package.json')
package = json.loads(package_path.read_text(encoding='utf-8'))
package['version'] = VERSION
static = package['scripts']['test:static']
if 'tests/v123-brewprofiles-integration.mjs' not in static:
    package['scripts']['test:static'] = static + ' && node tests/v123-brewprofiles-integration.mjs'
package['scripts']['test:live-brewprofiles'] = 'node tests/v123-live-brewprofiles.mjs'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

replace_once(
    'src/utils.js',
    "export const APP_VERSION = '1.2.2-cloud-safety-test';",
    f"export const APP_VERSION = '{VERSION}';",
)

index_path = Path('index.html')
index_text = index_path.read_text(encoding='utf-8')
index_text = index_text.replace('1.2.2-cloud-safety-test', VERSION)
index_text = index_text.replace('1.2.1-account-single-sync', '1.2.3-brewprofiles-authoritative')
index_path.write_text(index_text, encoding='utf-8')

manifest_path = Path('manifest.webmanifest')
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
manifest['name'] = f'富贵盒子 {VERSION}'
manifest['start_url'] = f'./?v={VERSION}'
manifest['description'] = '富贵盒子 1.2.3：BrewProfiles动态方案目录、赛事方案、专业三维靶区与云同步账户完全解耦；本地数据仍保持离线可用。'
manifest['version'] = VERSION
for icon in manifest.get('icons', []):
    icon['src'] = f'./public/app-logo.webp?v={VERSION}'
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

sw_path = Path('sw.js')
sw_text = sw_path.read_text(encoding='utf-8')
sw_text = sw_text.replace(
    '// LuckyBean local-first sync test release: 1.2.2-cloud-safety-test',
    f'// LuckyBean BrewProfiles integration test release: {VERSION}',
)
sw_text = sw_text.replace(
    "const CACHE_PREFIX = 'luckybean-v122-cloud-safety-test-';",
    "const CACHE_PREFIX = 'luckybean-v123-brewprofiles-integration-test-';",
)
sw_text = sw_text.replace('1.2.2-cloud-safety-test', VERSION)
sw_text = sw_text.replace(
    "const LEGACY_CACHE_PREFIXES = ['luckybean-v120-test-', 'luckybean-v121-account-test-'];",
    "const LEGACY_CACHE_PREFIXES = ['luckybean-v120-test-', 'luckybean-v121-account-test-', 'luckybean-v122-cloud-safety-test-'];",
)
marker = f"  './src/services/brew-analysis-service.js?v={VERSION}',\n"
addition = marker + f"  './src/services/brew-api-client.js?v={VERSION}',\n  './src/services/brew-profile-catalog-service.js?v={VERSION}',\n"
if marker not in sw_text:
    raise SystemExit('sw.js brew analysis cache entry not found')
sw_text = sw_text.replace(marker, addition, 1)
sw_path.write_text(sw_text, encoding='utf-8')

styles_path = Path('styles.css')
styles = styles_path.read_text(encoding='utf-8')
style_block = """
.profile-catalog-status{display:block;margin-top:6px;color:var(--muted,#8f949b);font-size:11px;line-height:1.45}
.spatial-unavailable{margin:12px 0;padding:12px 14px;border:1px solid rgba(190,151,80,.28);border-radius:12px;background:rgba(190,151,80,.06)}
"""
if '.profile-catalog-status{' not in styles:
    styles_path.write_text(styles.rstrip() + '\n' + style_block, encoding='utf-8')

# Remove obsolete one-shot repair workflows inherited from earlier iterations.
workflow_dir = Path('.github/workflows')
obsolete_prefixes = (
    'build-v120-',
    'commit-v120-',
    'complete-v120-',
    'deliver-v120-',
    'diagnose-v120-',
    'finalize-',
    'fix-feature-',
    'implement-v120-',
    'refactor-',
    'resume-v120-',
    'submit-v120-',
)
for workflow in workflow_dir.glob('*.yml'):
    if workflow.name == 'refactor-v123-brewprofiles-integration.yml' or workflow.name.startswith(obsolete_prefixes):
        workflow.unlink()

Path('.github/workflows/v123-integration-ci.yml').write_text(
    """name: LuckyBean v1.2.3 integration CI

on:
  push:
    branches: [fix/v123-brewprofiles-integration]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-24.04
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci --ignore-scripts
      - run: find src -name '*.js' -print0 | xargs -0 -n1 node --check
      - run: npm run test:static
      - run: npm run test:live-brewprofiles
      - run: npx playwright install --with-deps chromium
      - run: npm run test:smoke
      - run: npm run test:core
      - run: npm run test:visual
""",
    encoding='utf-8',
)
