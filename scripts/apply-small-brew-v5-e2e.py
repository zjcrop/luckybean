from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one anchor, got {count}')
    return text.replace(old, new, 1)


def regex_once(text, pattern, replacement, label):
    if re.search(pattern, text, flags=re.S) is None:
        # Treat already-modernized test as idempotent when replacement's key marker is present.
        marker = replacement.split('\n', 1)[0].strip()
        if marker and marker in text:
            return text
        raise RuntimeError(f'{label}: legacy block not found')
    return re.sub(pattern, replacement, text, count=1, flags=re.S)

# Environment is a compact menu button + dialog, no longer an inline details element.
path = 'tests/v120-core-flow.spec.mjs'
text = read(path)
old = """  const details = page.locator('.brew-environment-details');
  await expect(details).toBeVisible();
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').click();
  await expect(page.locator('#ambientTemperatureC')).toHaveValue('25');
  await expect(page.locator('#initialBedTemperatureC')).toHaveValue('25');
  await expect(page.locator('#relativeHumidityPct')).toHaveValue('');"""
new = """  await expect(page.locator('.brew-environment-details')).toHaveCount(0);
  const environmentButton = page.locator('#openEnvironmentBtn');
  await expect(environmentButton).toBeVisible();
  await environmentButton.click();
  const environment = page.locator('[data-overlay=\"brew-environment\"]');
  await expect(environment).toBeVisible();
  await expect(environment.locator('#ambientTemperatureC')).toHaveValue('25');
  await expect(environment.locator('#initialBedTemperatureC')).toHaveValue('25');
  await expect(environment.locator('#relativeHumidityPct')).toHaveValue('');"""
text = replace_once(text, old, new, 'core environment dialog')
write(path, text)

# Bound dripper properties remain visible as an informational note; material is no longer editable or rendered.
path = 'tests/v123e-gear-matching-ui.spec.mjs'
text = read(path)
text = replace_once(
    text,
    "  await expect(page.locator('#brewDripperMaterial')).toBeDisabled();",
    "  await expect(page.locator('#brewDripperMaterial')).toHaveCount(0);",
    'gear material control removal'
)
write(path, text)

# Result panel naming distinguishes a model result from the user's transient selection.
path = 'tests/v123e-interaction-repair-ui.spec.mjs'
text = read(path)
text = replace_once(
    text,
    "  await expect(panel).toContainText('豆卡自动推荐');",
    "  await expect(panel).toContainText('模型推荐结果');",
    'recommendation result label'
)
write(path, text)

# Cooling is now menu-driven, never an inline duplicated editor.
path = 'tests/v127-user-regressions-ui.spec.mjs'
text = read(path)
pattern = r"test\('custom first and tail cooling keep exactly one inline editor each after repeated mutations'.*?\n\}\);\n\ntest\('小酌 never recreates"
replacement = r'''test('cooling menus keep custom values stable and can return to model recommendation after repeated mutations', async ({ page }) => {
  await page.locator('[data-page-target="brew"]').click();
  const first = page.locator('#firstCoolingMode');
  const tail = page.locator('#tailCoolingMode');
  await expect(first).toContainText('模型推荐', { timeout: 10000 });
  await expect(tail).toContainText('模型推荐');

  await tail.click();
  await expect(page.locator('[data-overlay="cooling-mode"]')).toBeVisible();
  await page.locator('[data-cooling-choice="custom"]').click();
  await expect(page.locator('[data-overlay="cooling"]')).toBeVisible();
  await page.locator('#coolingTemperature').fill('80');
  await page.locator('#saveCoolingBtn').click();
  await expect(tail).toContainText('80°C');

  await page.evaluate(() => {
    for (let i = 0; i < 20; i += 1) {
      const marker = document.createElement('i');
      marker.hidden = true;
      document.body.append(marker);
      marker.remove();
    }
  });
  await page.waitForTimeout(300);
  await expect(page.locator('[data-lb-cooling-editor]')).toHaveCount(0);
  await expect(page.locator('#tailCoolingMode')).toContainText('80°C');

  await page.locator('#tailCoolingMode').click();
  await page.locator('[data-cooling-choice="auto"]').click();
  await expect(page.locator('#tailCoolingMode')).toContainText('模型推荐');
});

test('小酌 never recreates'''
text = regex_once(text, pattern, replacement, 'cooling menu E2E')
write(path, text)

# Requirements suite: profile owns segmentation; all catalog profiles remain selectable.
path = 'tests/v120-requirements-ui.spec.mjs'
text = read(path)
old_loop = """  const profile = page.locator('#brewProfile');
  const generate = page.locator('#generatePlanBtn');
  for (const selected of options) {
    await profile.selectOption(selected);
    await expect(profile).toHaveValue(selected);
    await expect(profile).toBeVisible();
    const segments = page.locator('#brewSegments');
    const fixedSegments = await segments.isDisabled();
    await expect(segments).toHaveAttribute('aria-hidden', fixedSegments ? 'true' : 'false');
    await generate.click();"""
new_loop = """  const profile = page.locator('#brewProfile');
  const generate = page.locator('#generatePlanBtn');
  await expect(page.locator('#brewSegments')).toHaveCount(0);
  await expect(profile).toHaveValue('recommended');
  for (const selected of options) {
    await profile.selectOption(selected);
    await expect(profile).toHaveValue(selected);
    await expect(profile).toBeVisible();
    await generate.click();"""
text = replace_once(text, old_loop, new_loop, 'requirements all-profile loop')

old_rows = """  const expected = [
    ['dose-ratio', ['brewDose', 'brewRatio']],
    ['filter-gear', ['brewDripper', 'brewDripperMaterial', 'brewFilterPaper']],
    ['method-water', ['brewProfile', 'brewWaterProfile']],
    ['tune-flavor', ['openBrewTuneBtn', 'openFlavorTargetBtn']],
    ['cooling', ['firstCoolingMode', 'tailCoolingMode']]
  ];"""
new_rows = """  const expected = [
    ['dose-ratio', ['brewDose', 'brewRatio']],
    ['filter-gear-water', ['brewDripper', 'brewFilterPaper', 'brewWaterProfile']],
    ['actions', ['openBrewTuneBtn', 'openFlavorTargetBtn', 'openEnvironmentBtn']],
    ['cooling', ['firstCoolingMode', 'tailCoolingMode']],
    ['profile', ['brewProfile']]
  ];"""
text = replace_once(text, old_rows, new_rows, 'requirements five-row order')

# Any isolated legacy segment override test is converted to a profile-selection ownership check.
text = text.replace("await page.locator('#brewSegments').selectOption('2');", "await expect(page.locator('#brewSegments')).toHaveCount(0);\n  await page.locator('#brewProfile').selectOption('two-pulse');")
text = text.replace("await expect(page.locator('#brewSegments')).toHaveValue('2');", "await expect(page.locator('#brewProfile')).toHaveValue('two-pulse');")

# Old cooling select interactions become the menu flow.
text = text.replace(
    "await page.locator('#tailCoolingMode').selectOption('custom');",
    "await page.locator('#tailCoolingMode').click();\n  await page.locator('[data-cooling-choice=\"custom\"]').click();"
)
text = text.replace(
    "await page.locator('#firstCoolingMode').selectOption('custom');",
    "await page.locator('#firstCoolingMode').click();\n  await page.locator('[data-cooling-choice=\"custom\"]').click();"
)

# Explicitly lock deleted precision/staging controls and new defaults in the five-row test if its anchor exists.
anchor = "  await expect(page.locator('[data-brew-row]')).toHaveCount(5);"
addition = """  await expect(page.locator('[data-brew-row]')).toHaveCount(5);
  await expect(page.locator('#brewSegments')).toHaveCount(0);
  await expect(page.locator('#brewDripperMaterial')).toHaveCount(0);
  await expect(page.locator('#brewProfile')).toHaveValue('recommended');
  await expect(page.locator('#brewWaterProfile')).toHaveValue('plain');"""
if addition not in text:
    text = replace_once(text, anchor, addition, 'requirements five-row deleted controls')
write(path, text)

print('Five-row small-brew E2E contract applied.')
