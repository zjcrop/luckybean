from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_exact(path: str, old: str, new: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'expected source fragment not found in {path}: {old[:120]!r}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


# 1) Keep recommendation presentation in the canonical app toast and make it immediately visible.
replace_exact(
    'src/app.js',
    """  if (kind === 'recommendation') {\n    node.className = 'toast recommendation';\n    requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('show')));\n    toastTimer = setTimeout(() => node.classList.remove('show'), 6000);\n    toastCleanupTimer = setTimeout(() => { node.className = 'toast'; }, 7000);\n    return;\n  }""",
    """  if (kind === 'recommendation') {\n    const text = String(message || '').trim();\n    if (!text) return;\n    node.textContent = text;\n    node.className = 'toast recommendation show';\n    toastTimer = setTimeout(() => node.classList.remove('show'), 6000);\n    toastCleanupTimer = setTimeout(() => { node.className = 'toast'; node.textContent = ''; }, 7000);\n    return;\n  }"""
)

# 2) Normalize every incoming mode before either selecting a bean or selecting a prompt.
replace_exact(
    'src/app.js',
    """function recommendationPrompt(mode) {\n  const pool = RECOMMENDATION_PROMPTS[mode] || [];\n  if (!pool.length) return '';\n  const previous = state.recommendationPromptMemory[mode] || '';\n  const choices = pool.filter(value => value !== previous);\n  const selected = choices[Math.floor(Math.random() * choices.length)] || pool[0];\n  state.recommendationPromptMemory[mode] = selected;\n  return selected;\n}""",
    """function normalizeRecommendationMode(mode) {\n  const value = String(mode || '').trim();\n  return Object.prototype.hasOwnProperty.call(RECOMMENDATION_PROMPTS, value) ? value : 'random';\n}\n\nfunction recommendationPrompt(mode) {\n  const key = normalizeRecommendationMode(mode);\n  const pool = RECOMMENDATION_PROMPTS[key];\n  const previous = state.recommendationPromptMemory[key] || '';\n  const choices = pool.filter(value => value !== previous);\n  const selected = choices[Math.floor(Math.random() * choices.length)] || pool[0];\n  state.recommendationPromptMemory[key] = selected;\n  return selected;\n}"""
)

replace_exact(
    'src/app.js',
    """async function recommendBean(mode) {\n  closePopups();""",
    """async function recommendBean(mode) {\n  mode = normalizeRecommendationMode(mode);\n  closePopups();"""
)

# 3) Recommendation output must never fall back to a bean-name/result sentence.
replace_exact(
    'src/app.js',
    """    const prompt = recommendationPrompt(mode);\n    toast(prompt || `已选：${beanDisplayName(selected)}`, 'recommendation');""",
    """    const prompt = recommendationPrompt(mode);\n    document.dispatchEvent(new CustomEvent('luckybean:recommendation-prompt', { detail: { mode, prompt, beanId: selected?.id || '' } }));\n    toast(prompt, 'recommendation');"""
)

# 4) Lock the regression test to fun-prompt-only semantics.
replace_exact(
    'tests/v124b-recommendation-prompt-regression.mjs',
    """assert.match(app,/function recommendationPrompt\\(mode\\)/);\nassert.match(app,/toast\\(prompt \\|\\| `已选：\\$\\{beanDisplayName\\(selected\\)\\}`, 'recommendation'\\)/);\nassert.match(app,/if \\(kind === 'recommendation'\\)/);""",
    """assert.match(app,/function normalizeRecommendationMode\\(mode\\)/);\nassert.match(app,/function recommendationPrompt\\(mode\\)/);\nassert.match(app,/mode = normalizeRecommendationMode\\(mode\\)/);\nassert.match(app,/toast\\(prompt, 'recommendation'\\)/);\nassert.match(app,/luckybean:recommendation-prompt/);\nassert.doesNotMatch(app,/toast\\(prompt \\|\\| `已选：\\$\\{beanDisplayName\\(selected\\)\\}`/);\nassert.match(app,/if \\(kind === 'recommendation'\\)/);"""
)

# 5) A new immutable runtime key forces both startup/app and the top-level stylesheet off the old CDN/module cache key.
for path in [
    'index.html',
    'src/core/startup-controller.js',
    '.github/workflows/deploy-main.yml',
    'tests/v110-local-first-sync-static.mjs',
    'tests/v120-requirements-static.mjs',
    'tests/v123d-deployment-contracts.mjs',
    'tests/v123e-ui-stability-static.mjs',
    'tests/v124b-final-release-contract.mjs',
    'tests/v124b-complete-plan-contract.mjs',
]:
    file = ROOT / path
    if not file.exists():
        continue
    text = file.read_text(encoding='utf-8')
    if '1.24B-main.11-native-prompt' in text:
        file.write_text(text.replace('1.24B-main.11-native-prompt', '1.24B-main.12-fun-prompt'), encoding='utf-8')

# The live gate previously sampled opacity at the first animation frame. Wait for the actual rendered state.
deploy = ROOT / '.github/workflows/deploy-main.yml'
text = deploy.read_text(encoding='utf-8')
needle = "await page.waitForFunction(() => document.querySelector('#toast')?.classList.contains('recommendation') && document.querySelector('#toast')?.classList.contains('show'), null, { timeout:5000 });"
if needle in text and 'await page.waitForTimeout(1100);' not in text:
    text = text.replace(needle, needle + "\n          await page.waitForTimeout(1100);", 1)
deploy.write_text(text, encoding='utf-8')

# Remove this one-shot workflow from the repair commit; the subsequent normal user-token commit will trigger CI/Pages.
workflow = ROOT / '.github/workflows/repair-recommendation-prompt.yml'
if workflow.exists():
    workflow.unlink()

print('Recommendation prompt core repaired: normalized mode, fun-only output, no bean-name fallback, runtime cache bumped.')
