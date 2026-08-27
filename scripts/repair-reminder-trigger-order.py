from pathlib import Path
import re

app_path = Path('src/app.js')
app = app_path.read_text()
old = """    if (mode !== 'random') await focusRecommendedBean(selected, { automatic: true, settle: true, duration: 800 });
    const prompt = recommendationPrompt(mode, selected);
    document.dispatchEvent(new CustomEvent('luckybean:recommendation-prompt', { detail: { mode, prompt, beanId: selected?.id || '' } }));
    toast(prompt, 'recommendation');
"""
new = """    const prompt = recommendationPrompt(mode, selected);
    document.dispatchEvent(new CustomEvent('luckybean:recommendation-prompt', { detail: { mode, prompt, beanId: selected?.id || '' } }));
    toast(prompt, 'recommendation');
    if (mode !== 'random') await focusRecommendedBean(selected, { automatic: true, settle: true, duration: 800 });
"""
if app.count(old) != 1:
    raise SystemExit(f'expected one delayed reminder block, found {app.count(old)}')
app_path.write_text(app.replace(old, new, 1))

startup_path = Path('src/core/startup-controller.js')
startup = startup_path.read_text()
startup, count = re.subn(
    r"APP_MODULE_REVISION = '1\.24B-main\.14-legacy-reminders'",
    "APP_MODULE_REVISION = '1.24B-main.15-reminder-trigger'",
    startup,
    count=1,
)
if count != 1:
    raise SystemExit(f'expected one app revision, replaced {count}')
startup_path.write_text(startup)

index_path = Path('index.html')
index = index_path.read_text()
index, count = re.subn(
    r"startup-controller\.js\?v=1\.24B-main\.14-legacy-reminders",
    "startup-controller.js?v=1.24B-main.15-reminder-trigger",
    index,
    count=1,
)
if count != 1:
    raise SystemExit(f'expected one startup URL, replaced {count}')
index_path.write_text(index)

for path in Path('tests').rglob('*.mjs'):
    text = path.read_text()
    lines = []
    touched = False
    for line in text.splitlines(keepends=True):
        original = line
        runtime_context = any(token in line for token in [
            'startup-controller', 'APP_MODULE_REVISION', 'appModuleRevision',
            'app_module_revision', 'PROMPT_RUNTIME_REVISION', 'app.js?v', 'app-runtime'
        ]) and not any(token in line for token in ['styles.css', 'stylesRevision', 'styles_revision'])
        if runtime_context:
            line = line.replace('1.24B-main.14-legacy-reminders', '1.24B-main.15-reminder-trigger')
            line = line.replace(r'1\.24B-main\.14-legacy-reminders', r'1\.24B-main\.15-reminder-trigger')
        if line != original:
            touched = True
        lines.append(line)
    if touched:
        path.write_text(''.join(lines))

regression = Path('tests/v124b-recommendation-prompt-regression.mjs')
text = regression.read_text()
assertion = """assert.ok(
  app.indexOf('const prompt = recommendationPrompt(mode, selected);') < app.indexOf("if (mode !== 'random') await focusRecommendedBean(selected"),
  'legacy reminder must fire as soon as the selection result is known, before non-random focus animation can delay it'
);"""
if assertion not in text:
    marker = "assert.match(app,/const prompt = recommendationPrompt\\(mode, selected\\)/);"
    if marker not in text:
        raise SystemExit('prompt regression marker not found')
    regression.write_text(text.replace(marker, marker + '\n' + assertion, 1))
