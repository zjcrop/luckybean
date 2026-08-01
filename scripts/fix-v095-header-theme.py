from pathlib import Path

js_path = Path('src/v095-ui.js')
css_path = Path('styles-v095.css')
test_path = Path('tests/v095.test.mjs')

js = js_path.read_text(encoding='utf-8')

old_save = """function saveUi() {
  const value = JSON.stringify(ui);
  localStorage.setItem(UI_KEY, value);
  localStorage.setItem(LEGACY_UI_KEY, value);
}
"""
new_save = """function saveUi() {
  const value = JSON.stringify(ui);
  try {
    localStorage.setItem(UI_KEY, value);
    localStorage.setItem(LEGACY_UI_KEY, value);
  } catch (error) {
    console.warn('界面偏好无法写入本地存储，当前会话仍继续生效。', error);
  }
}
"""

old_apply = """function applyTheme() {
  document.documentElement.dataset.theme = ui.theme;
  const button = q('#themeToggleBtn');
  if (button) {
    button.innerHTML = themeIcon(ui.theme);
    button.setAttribute('aria-label', ui.theme === 'dark' ? '切换到白色模式' : '切换到黑色模式');
    button.title = ui.theme === 'dark' ? '白色模式' : '黑色模式';
  }
  const setting = q('#v095ThemeSettingBtn');
  if (setting) setting.textContent = ui.theme === 'dark' ? '黑色模式' : '白色模式';
  const meta = q('meta[name=\"theme-color\"]');
  if (meta) meta.content = ui.theme === 'dark' ? '#080909' : '#ececea';
}
"""
new_apply = """function applyTheme() {
  document.documentElement.dataset.theme = ui.theme;
  const button = q('#themeToggleBtn');
  if (button) {
    if (button.dataset.v095ThemeIcon !== ui.theme) {
      button.innerHTML = themeIcon(ui.theme);
      button.dataset.v095ThemeIcon = ui.theme;
    }
    button.setAttribute('aria-label', ui.theme === 'dark' ? '切换到白色模式' : '切换到黑色模式');
    button.title = ui.theme === 'dark' ? '白色模式' : '黑色模式';
  }
  const setting = q('#v095ThemeSettingBtn');
  if (setting) setting.textContent = ui.theme === 'dark' ? '黑色模式' : '白色模式';
  const meta = q('meta[name=\"theme-color\"]');
  if (meta) meta.content = ui.theme === 'dark' ? '#080909' : '#ececea';
}
"""

old_bind = """function bindThemeButton() {
  const button = q('#themeToggleBtn');
  if (!button || button.dataset.v095Bound) return;
  button.dataset.v095Bound = '1';
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleTheme();
  }, true);
}
"""
new_bind = """function bindThemeButton() {
  const button = q('#themeToggleBtn');
  if (!button) return;
  button.dataset.v095Bound = '1';
  button.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    toggleTheme();
  };
}
"""

for old, new, label in [
    (old_save, new_save, 'saveUi'),
    (old_apply, new_apply, 'applyTheme'),
    (old_bind, new_bind, 'bindThemeButton'),
]:
    if old not in js:
        raise SystemExit(f'Expected {label} block not found; refusing an unsafe patch.')
    js = js.replace(old, new, 1)

js_path.write_text(js, encoding='utf-8')

css = css_path.read_text(encoding='utf-8')
marker = '/* v0.9.5 header single-row repair */'
if marker not in css:
    css += """

/* v0.9.5 header single-row repair */
.beans-page-heading .top-controls {
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
  display: flex !important;
  flex-flow: row nowrap !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 2ch !important;
  padding-top: 0 !important;
}
.beans-page-heading .top-controls > * {
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
  flex: 0 0 auto !important;
  margin: 0 !important;
}
.beans-page-heading .top-controls .small-control,
.beans-page-heading .top-controls .theme-toggle {
  display: inline-grid !important;
  place-items: center !important;
}
"""
css_path.write_text(css, encoding='utf-8')

tests = test_path.read_text(encoding='utf-8')
if "header controls remain horizontal and theme binding is stable" not in tests:
    tests += """

test('header controls remain horizontal and theme binding is stable', async () => {
  const [css, ui] = await Promise.all([read('styles-v095.css'), read('src/v095-ui.js')]);
  for (const marker of ['flex-flow: row nowrap !important', 'width: auto !important', 'gap: 2ch !important']) {
    assert.ok(css.includes(marker), marker);
  }
  assert.match(ui, /button\.onclick = event =>/);
  assert.match(ui, /button\.dataset\.v095ThemeIcon !== ui\.theme/);
  assert.match(ui, /界面偏好无法写入本地存储/);
});
"""
test_path.write_text(tests, encoding='utf-8')

print('Applied v0.9.5 header and theme repair.')
