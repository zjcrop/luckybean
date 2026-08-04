from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'missing {label} pattern in {path}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


def replace_regex(path: Path, pattern: str, replacement: str, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    if replacement.strip() in text:
        return
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'missing or ambiguous {label} pattern in {path}: {count}')
    path.write_text(updated, encoding='utf-8')


# 1. Direct sensory entry must always return to the three-mode chooser.
app = ROOT / 'src/app.js'
replace_once(
    app,
    "$('#directSensoryBtn')?.addEventListener('click', () => { if (!state.selectedBeanId) return; startEvaluation(state.selectedBeanId, { direct: true }); switchPage('sensory'); });",
    "$('#directSensoryBtn')?.addEventListener('click', () => { if (!state.selectedBeanId) return; state.evaluation = null; switchPage('sensory'); renderSensory(); });",
    'direct sensory reset'
)
replace_once(
    app,
    "$('#planToSensoryBtn')?.addEventListener('click', () => { if (!state.selectedBeanId) return; startEvaluation(state.selectedBeanId, { direct: true }); switchPage('sensory'); });",
    "$('#planToSensoryBtn')?.addEventListener('click', () => { if (!state.selectedBeanId) return; state.evaluation = null; switchPage('sensory'); renderSensory(); });",
    'plan sensory reset'
)
old_postbrew = "closeOverlay(); startEvaluation(bean.id, { brewSessionId: state.currentPlan?.id || '' }); switchPage('sensory', { preserveOverlay: true }); renderSensory();"
new_postbrew = "closeOverlay(); state.evaluation = null; state.selectedBeanId = bean.id; switchPage('sensory'); renderSensory();"
text = app.read_text(encoding='utf-8')
if old_postbrew in text:
    app.write_text(text.replace(old_postbrew, new_postbrew, 1), encoding='utf-8')
elif new_postbrew not in text:
    print('post-brew sensory pattern not present; leaving current implementation unchanged')

# 2. Remove stale note-flow flags that can leak into a later sensory session.
flow_guard = ROOT / 'src/v095-sensory-flow-guard.js'
flow_guard.write_text("""let simpleNoteRequested = false;
let observerQueued = false;
let resetTimer = 0;

function clearSimpleNoteFlow() {
  clearTimeout(resetTimer);
  simpleNoteRequested = false;
  document.documentElement.classList.remove('v095-native-bypass');
  delete document.documentElement.dataset.simpleNoteFlow;
}

function markMode(event) {
  const mode = event.target.closest?.('[data-v095-mode]')?.dataset.v095Mode;
  if (!mode) return;
  clearSimpleNoteFlow();
  if (mode !== 'note') return;
  simpleNoteRequested = true;
  document.documentElement.dataset.simpleNoteFlow = 'pending';
  resetTimer = window.setTimeout(clearSimpleNoteFlow, 10000);
}

function clearOnFreshEntry(event) {
  if (event.target.closest?.('#directSensoryBtn, #planToSensoryBtn, [data-page-target="sensory"]')) {
    clearSimpleNoteFlow();
  }
  if (event.target.closest?.('[data-page-target]:not([data-page-target="sensory"])')) clearSimpleNoteFlow();
}

function revealSimpleScore() {
  if (!simpleNoteRequested || !document.querySelector('#sensoryDeltaWheel')) return;
  document.documentElement.classList.remove('v095-native-bypass');
  document.documentElement.dataset.simpleNoteFlow = 'score-visible';
  simpleNoteRequested = false;
  clearTimeout(resetTimer);
}

function queueReveal() {
  if (observerQueued) return;
  observerQueued = true;
  requestAnimationFrame(() => {
    observerQueued = false;
    revealSimpleScore();
    const sensoryActive = document.querySelector('#pageSensory.page.active');
    const hasFlow = document.querySelector('.sensory-evaluation, #v095ProfessionalWizard, #sensoryDeltaWheel');
    if (!sensoryActive && !hasFlow) clearSimpleNoteFlow();
  });
}

document.addEventListener('click', markMode, true);
document.addEventListener('click', clearOnFreshEntry, true);
new MutationObserver(queueReveal).observe(document.documentElement, { childList: true, subtree: true });
addEventListener('pagehide', clearSimpleNoteFlow);
""", encoding='utf-8')

# 3. Make professional-mode loading and the score-to-note transition deterministic.
sensory = ROOT / 'src/v095-sensory-pro.js'
text = sensory.read_text(encoding='utf-8')
if 'let modeTransitionBusy = false;' not in text:
    text = text.replace('let transferBusy = false;', 'let transferBusy = false;\nlet modeTransitionBusy = false;', 1)
sensory.write_text(text, encoding='utf-8')

start_mode = r'''async function startMode\(mode\) \{.*?\n\}\n\nasync function startNative'''
start_replacement = '''async function startMode(mode) {
  if (modeTransitionBusy || transferBusy) return;
  const beanId = await selectedBeanId();
  if (!beanId) return;
  modeTransitionBusy = true;
  const buttons = $$('[data-v095-mode]');
  buttons.forEach(button => { button.disabled = true; });
  try {
    if (mode === 'player') {
      await startNative(beanId);
      return;
    }
    if (mode === 'note') {
      await startNative(beanId);
      await skipNativeToScore({}, { hidden: true });
      return;
    }
    const context = await Promise.race([
      beanContext(beanId),
      new Promise((_, reject) => setTimeout(() => reject(new Error('专业品鉴资料加载超时，请重试')), 8000))
    ]);
    wizard = {
      beanId,
      bean: context.bean,
      original: context.original,
      step: 0,
      selections: Object.fromEntries(STEPS.map(step => [step.id, []])),
      intensities: Object.fromEntries(STEPS.map(step => [step.id, 7.5])),
      radar: { aroma: [5, 5, 5, 5, 5], style: [5, 5, 5, 5, 5, 5, 5, 5] },
      defects: { major: [], minor: [] },
      selectedRadar: null,
      affective: Object.fromEntries(AFFECTIVE.map(label => [label, 5]))
    };
    renderWizard();
  } catch (error) {
    document.documentElement.classList.remove('v095-native-bypass');
    const toast = $('#toast');
    if (toast) {
      toast.textContent = error.message || '品鉴模式启动失败';
      toast.className = 'toast show error';
      setTimeout(() => { toast.className = 'toast'; }, 3600);
    } else alert(error.message || '品鉴模式启动失败');
  } finally {
    modeTransitionBusy = false;
    buttons.forEach(button => { button.disabled = false; });
  }
}

async function startNative'''
replace_regex(sensory, start_mode, start_replacement, 'sensory startMode')

finish_pattern = r'''async function finishProfessional\(\) \{.*?\n\}\n\nfunction queueSync'''
finish_replacement = '''async function finishProfessional() {
  if (!wizard || transferBusy || modeTransitionBusy) return;
  const beanId = wizard.beanId;
  const summary = professionalSummary();
  const targetScore = affectiveMappedScore();
  const preferences = nativePreferences();
  modeTransitionBusy = true;
  transferBusy = true;
  closeWizard();
  document.documentElement.classList.add('v095-native-bypass');
  try {
    await startNative(beanId);
    transferBusy = false;
    await skipNativeToScore(preferences, { hidden: true });
    const auto = Number($('#sensoryAutoScore')?.textContent || 0);
    const wheel = $('#sensoryDeltaWheel');
    if (!wheel) throw new Error('评分控件未出现');
    const delta = clamp(targetScore - auto, -15, 15);
    wheel.value = String(delta);
    wheel.dispatchEvent(new Event('input', { bubbles: true }));
    const next = $('#nextSensoryNodeBtn');
    if (!next) throw new Error('札记入口未出现');
    next.click();
    const note = await waitFor('#sensoryNaturalNote', 8000);
    injectProfessionalNote(summary);
    note.scrollIntoView({ block: 'center', behavior: 'smooth' });
    note.focus();
  } catch (error) {
    const toast = $('#toast');
    if (toast) {
      toast.textContent = error.message || '进入札记失败，请重试';
      toast.className = 'toast show error';
      setTimeout(() => { toast.className = 'toast'; }, 4200);
    } else alert(error.message || '进入札记失败，请重试');
  } finally {
    document.documentElement.classList.remove('v095-native-bypass');
    transferBusy = false;
    modeTransitionBusy = false;
  }
}

function queueSync'''
replace_regex(sensory, finish_pattern, finish_replacement, 'finishProfessional')

# 4. Keep exactly one account/cloud panel and rename password actions.
settings = ROOT / 'src/v099p-settings-rebuild.js'
settings_text = settings.read_text(encoding='utf-8')
settings_text = settings_text.replace(
    "document.querySelectorAll('[data-v099e-cloud-panel], .v099e-cloud-panel, [data-v099e-account-actions]').forEach(node => node.remove());",
    "document.querySelectorAll('[data-v099e-cloud-panel], .v099e-cloud-panel, [data-v099e-account-actions], [data-v099f-account-sync], .v099f-account-sync').forEach(node => node.remove());"
)
settings_text = settings_text.replace('解锁云端密码', '验证登录密码')
settings_text = settings_text.replace('云端密码已解锁', '登录密码验证通过')
settings_text = settings_text.replace('本次会话已解锁', '本次会话已验证')
settings_text = settings_text.replace(
    '默认只保存到本机。开启云端后，数据在本机编码、分包、压缩和AES-GCM加密后上传。',
    '默认只保存到本机。云端操作使用登录密码重新验证，不再设置独立云端密码；数据仍在本机加密后上传。'
)
settings_text = settings_text.replace(
    "try { cloudApi().unlock(); event.currentTarget.textContent = '本次会话已验证'; toast('登录密码验证通过', 'status-good'); }",
    "try { await cloudApi().unlock(); event.currentTarget.textContent = '本次会话已验证'; toast('登录密码验证通过', 'status-good'); }"
)
settings_text = settings_text.replace(
    "('[data-v099p-unlock]', panel)?.addEventListener('click', event => {",
    "('[data-v099p-unlock]', panel)?.addEventListener('click', async event => {"
)
# Above source includes the selector without an opening parenthesis in most revisions.
settings_text = settings_text.replace(
    "$('[data-v099p-unlock]', panel)?.addEventListener('click', event => {",
    "$('[data-v099p-unlock]', panel)?.addEventListener('click', async event => {"
)
settings.write_text(settings_text, encoding='utf-8')

# 5. Reauthenticate with the login password. No persistent secondary password UI.
cloud = ROOT / 'src/v099f-cloud-sync.js'
cloud_text = cloud.read_text(encoding='utf-8')
old_prompt = r'''  function promptPassphrase\(message = .*?\n  \}\n\n  async function remoteManifest'''
new_prompt = '''  async function verifyLoginPassword(password) {
    const active = authSession();
    const email = active?.user?.email || '';
    if (!active || !email) throw new Error('请先登录并完成邮箱激活');
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.access_token) throw new Error('登录密码验证失败');
    return password;
  }

  async function promptPassphrase(message = '重新输入登录密码以验证本次云端操作。') {
    const value = prompt(message) || '';
    if (value.length < 8) throw new Error('登录密码至少8位');
    const verified = await verifyLoginPassword(value);
    setSessionPassphrase(verified);
    return verified;
  }

  async function remoteManifest'''
updated, count = re.subn(old_prompt, new_prompt, cloud_text, count=1, flags=re.S)
if count != 1 and 'async function verifyLoginPassword' not in cloud_text:
    raise SystemExit('missing cloud password prompt block')
cloud_text = updated if count == 1 else cloud_text
cloud_text = cloud_text.replace('password = promptPassphrase();', 'password = await promptPassphrase();')
cloud_text = cloud_text.replace("password = promptPassphrase('输入云端数据密码以下载、解密并合并到本地。');", "password = await promptPassphrase('重新输入登录密码，以下载并合并旧记录。');")
# Download must always reauthenticate, even when upload was previously unlocked.
cloud_text = cloud_text.replace(
    "let password = sessionPassphrase();\n    if (!password && interactive) password = await promptPassphrase('重新输入登录密码，以下载并合并旧记录。');",
    "let password = interactive ? await promptPassphrase('重新输入登录密码，以下载并合并旧记录。') : sessionPassphrase();"
)
cloud_text = cloud_text.replace('解锁云端密码', '验证登录密码')
cloud_text = cloud_text.replace('本次会话已解锁', '本次会话已验证')
cloud_text = cloud_text.replace('云端数据密码已在本次会话中解锁', '登录密码已通过验证')
cloud_text = cloud_text.replace("promptPassphrase();\n        event.currentTarget.textContent", "await promptPassphrase();\n        event.currentTarget.textContent")
cloud_text = cloud_text.replace(
    "$('[data-v099f-unlock]', panel)?.addEventListener('click', event => {",
    "$('[data-v099f-unlock]', panel)?.addEventListener('click', async event => {"
)
cloud_text = cloud_text.replace(
    "  async function injectPanel() {\n    injectQueued = false;",
    "  async function injectPanel() {\n    injectQueued = false;\n    if (globalThis.__LuckyBeanV099pSettingsRebuildLoaded) {\n      $$('.v099f-account-sync,[data-v099f-account-sync]').forEach(node => node.remove());\n      return;\n    }"
)
cloud.write_text(cloud_text, encoding='utf-8')

# 6. Add selective local-resource interception and a native launch overlay.
main = ROOT / 'android/app/src/main/java/com/luckybean/app/MainActivity.java'
main_text = main.read_text(encoding='utf-8')
if 'private android.view.View launchOverlay;' not in main_text:
    main_text = main_text.replace(
        '    private WebView webView;',
        '    private WebView webView;\n    private android.view.View launchOverlay;'
    )
if 'new android.widget.FrameLayout(this)' not in main_text:
    main_text = main_text.replace(
        '        webView = new WebView(this);\n        webView.setBackgroundColor(Color.rgb(8, 9, 9));\n        setContentView(webView);',
        '''        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(8, 9, 9));
        android.widget.FrameLayout root = new android.widget.FrameLayout(this);
        root.addView(webView, new android.widget.FrameLayout.LayoutParams(-1, -1));
        android.widget.ImageView splash = new android.widget.ImageView(this);
        splash.setBackgroundColor(Color.rgb(8, 9, 9));
        splash.setImageResource(com.luckybean.app.R.drawable.app_logo);
        splash.setScaleType(android.widget.ImageView.ScaleType.CENTER_INSIDE);
        int pad = Math.round(getResources().getDisplayMetrics().density * 88f);
        splash.setPadding(pad, pad, pad, pad);
        root.addView(splash, new android.widget.FrameLayout.LayoutParams(-1, -1));
        launchOverlay = splash;
        setContentView(root);'''
    )
if 'LocalWebAssetCache.open' not in main_text:
    marker = '''        @Override
        public void onPageFinished(WebView view, String url) {'''
    interception = '''        @Override
        public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            android.webkit.WebResourceResponse local = LocalWebAssetCache.open(MainActivity.this, request.getUrl());
            return local != null ? local : super.shouldInterceptRequest(view, request);
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            super.onPageCommitVisible(view, url);
            if (launchOverlay != null) {
                launchOverlay.animate().alpha(0f).setDuration(180).withEndAction(() -> {
                    android.view.View overlay = launchOverlay;
                    launchOverlay = null;
                    if (overlay != null && overlay.getParent() instanceof android.view.ViewGroup parent) parent.removeView(overlay);
                }).start();
            }
        }

'''
    if marker not in main_text:
        raise SystemExit('missing OnlineAppClient onPageFinished marker')
    main_text = main_text.replace(marker, interception + marker, 1)
main.write_text(main_text, encoding='utf-8')

# 7. Generate a small APK-local web asset set during Android builds.
gradle = ROOT / 'android/app/build.gradle'
gradle_text = gradle.read_text(encoding='utf-8')
if 'generatedOnlineShellAssets' not in gradle_text:
    gradle_text += '''

def generatedOnlineShellAssets = layout.buildDirectory.dir('generated/onlineShellAssets')

tasks.register('copyOnlineShellCriticalAssets', Copy) {
    from(rootProject.projectDir.parentFile) {
        include 'public/app-logo.webp'
        include 'public/splash-art-red.webp'
        include 'public/splash-art-light.webp'
        include 'public/settings-mascot.webp'
        include 'src/app.js'
        include 'src/v095-sensory-bootstrap.js'
        include 'src/v095-sensory-pro.js'
        include 'src/v095-sensory-flow-guard.js'
        include 'src/v099f-cloud-sync.js'
        include 'src/v099p-settings-rebuild.js'
    }
    into(generatedOnlineShellAssets.map { it.dir('web-cache') })
}

android.sourceSets.main.assets.srcDir(generatedOnlineShellAssets)
tasks.named('preBuild').configure { dependsOn tasks.named('copyOnlineShellCriticalAssets') }
'''
gradle.write_text(gradle_text, encoding='utf-8')

print('Applied LuckyBean online-shell v1.0.3 test fixes.')
