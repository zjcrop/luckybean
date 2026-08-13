const UI_KEY = 'luckybean.ui.v095';
const LEGACY_UI_KEY = 'luckybean.ui.v094';
const RELEASE_REVISION = document.body?.dataset.releaseRevision || document.querySelector('meta[name="release-revision"]')?.content || '1.23E-main-sync.4';
const asset = path => `${path}?v=${encodeURIComponent(RELEASE_REVISION)}`;
const SPLASH = Object.freeze({ red: asset('./public/splash-art-red.webp'), white: asset('./public/splash-art-light.webp') });
let renderQueued = false;

function safeParse(value) { try { return JSON.parse(value || '{}'); } catch { return {}; } }
function readPreference() {
  return { theme:'dark', splash:'red', ...safeParse(localStorage.getItem(LEGACY_UI_KEY)), ...safeParse(localStorage.getItem(UI_KEY)) };
}
function writePreference(next) {
  const normalized = { theme:next.theme === 'light' ? 'light' : 'dark', splash:next.splash === 'white' ? 'white' : 'red' };
  const value = JSON.stringify(normalized);
  try { localStorage.setItem(UI_KEY, value); localStorage.setItem(LEGACY_UI_KEY, value); }
  catch (error) { console.warn('外观偏好无法持久化，当前会话继续使用。', error); }
  return normalized;
}
function icon(theme) { return theme === 'dark' ? '☀️' : '🌙'; }
function applyTheme(theme = readPreference().theme) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  const root = document.documentElement;
  root.dataset.theme = normalized;
  root.classList.toggle('theme-light', normalized === 'light');
  root.style.colorScheme = normalized;
  document.body?.classList.toggle('theme-light', normalized === 'light');
  const button = document.querySelector('#themeToggleBtn');
  if (button) {
    button.textContent = icon(normalized);
    button.dataset.appearanceTheme = normalized;
    button.setAttribute('aria-label', normalized === 'dark' ? '切换到白色模式' : '切换到黑色模式');
    button.title = normalized === 'dark' ? '白色模式' : '黑色模式';
  }
  const settingButton = document.querySelector('[data-appearance-theme]');
  if (settingButton) settingButton.textContent = icon(normalized);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = normalized === 'dark' ? '#080909' : '#ececea';
  document.dispatchEvent(new CustomEvent('luckybean:theme-changed', { detail:{ theme:normalized } }));
}
function applySplash(splash = readPreference().splash) {
  const normalized = splash === 'white' ? 'white' : 'red';
  const screen = document.querySelector('#splashScreen');
  if (screen) screen.dataset.splashVariant = normalized;
  const image = document.querySelector('#splashImage');
  if (!image) return;
  const expected = SPLASH[normalized];
  if (image.getAttribute('src') !== expected) image.src = expected;
  image.alt = normalized === 'white' ? '富贵盒子白色启动画面' : '富贵盒子红色启动画面';
}
function toggleTheme() {
  const current = readPreference(); current.theme = current.theme === 'light' ? 'dark' : 'light';
  const next = writePreference(current); applyTheme(next.theme);
}
function chooseSplash(value) {
  const current = readPreference(); current.splash = value === 'white' ? 'white' : 'red';
  const next = writePreference(current); applySplash(next.splash);
  document.querySelectorAll('[data-appearance-splash]').forEach(button => {
    const selected = button.dataset.appearanceSplash === next.splash;
    button.classList.toggle('selected', selected); button.setAttribute('aria-checked', String(selected));
  });
}
function enforceSingleOpen(section) {
  section.addEventListener('toggle', () => {
    if (!section.open) return;
    document.querySelectorAll('#settingsContent .settings-category').forEach(other => { if (other !== section) other.open = false; });
  });
}
function renderSettingsPanel() {
  renderQueued = false;
  const root = document.querySelector('#settingsContent .settings-categories');
  if (!root) return;
  root.querySelector('[data-settings-key="appearance"]')?.remove();
  const pref = readPreference();
  const details = document.createElement('details');
  details.id = 'appearanceSettings'; details.className = 'settings-category'; details.dataset.settingsKey = 'appearance';
  details.innerHTML = `<summary><span>界面</span><small>显示模式与启动图</small></summary><div class="settings-category-body"><div class="v095-setting-line"><span>显示模式</span><button class="button" type="button" data-appearance-theme aria-label="${pref.theme === 'dark' ? '黑色模式' : '白色模式'}">${icon(pref.theme)}</button></div><div class="v095-splash-choice" role="radiogroup" aria-label="启动页图片"><button type="button" data-appearance-splash="red" data-splash-variant="red" class="${pref.splash === 'red' ? 'selected' : ''}"><img src="${SPLASH.red}" alt="红色启动页"><span>红色版本（默认）</span></button><button type="button" data-appearance-splash="white" data-splash-variant="white" class="${pref.splash === 'white' ? 'selected' : ''}"><img src="${SPLASH.white}" alt="白色启动页"><span>白色版本</span></button></div></div>`;
  root.prepend(details);
  enforceSingleOpen(details);
  details.querySelector('[data-appearance-theme]')?.addEventListener('click', toggleTheme);
  details.querySelectorAll('[data-appearance-splash]').forEach(button => button.addEventListener('click', () => chooseSplash(button.dataset.appearanceSplash)));
  applyTheme(pref.theme);
}
function queueSettingsPanel() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(renderSettingsPanel);
}
function bind() {
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('#themeToggleBtn') : null;
    if (!target) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); toggleTheme();
  }, true);
  document.addEventListener('luckybean:app-refreshed', queueSettingsPanel);
  document.addEventListener('luckybean:settings-rendered', queueSettingsPanel);
  document.addEventListener('luckybean:local-app-ready', queueSettingsPanel);
  window.addEventListener('storage', () => { const pref = readPreference(); applyTheme(pref.theme); applySplash(pref.splash); queueSettingsPanel(); });
  applyTheme(); applySplash(); queueSettingsPanel();
}

bind();
globalThis.LuckyBeanAppearanceController = { readPreference, applyTheme, applySplash, toggleTheme, chooseSplash, revision:RELEASE_REVISION };
document.documentElement.dataset.appearanceController = 'ready';
