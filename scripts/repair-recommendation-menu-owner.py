from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_exact(path, old, new):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'missing expected fragment in {path}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_exact(
    'src/app.js',
    """  popup.innerHTML = items.map(([mode, label, color, large]) => `<button type=\"button\" class=\"recommend-option\" data-recommend-mode=\"${mode}\" aria-label=\"${label}\"><span class=\"recommend-label\">${label}</span><span class=\"recommend-dot${large?' random':''}\" style=\"background:${color}\"></span></button>`).join('');\n  document.body.append(popup); positionPopup($('#fabRecommendBtn'), popup, { above: true });\n}""",
    """  popup.innerHTML = items.map(([mode, label, color, large]) => `<button type=\"button\" class=\"recommend-option\" data-recommend-mode=\"${mode}\" aria-label=\"${label}\"><span class=\"recommend-label\">${label}</span><span class=\"recommend-dot${large?' random':''}\" style=\"background:${color}\"></span></button>`).join('');\n  popup.addEventListener('click', event => {\n    const button = event.target.closest('[data-recommend-mode]');\n    if (!button || !popup.contains(button)) return;\n    event.preventDefault();\n    event.stopPropagation();\n    void recommendBean(button.dataset.recommendMode);\n  });\n  document.body.append(popup); positionPopup($('#fabRecommendBtn'), popup, { above: true });\n}"""
)

replace_exact(
    'src/app.js',
    """    const recommend=event.target.closest('[data-recommend-mode]');if(recommend){recommendBean(recommend.dataset.recommendMode);return;}\n""",
    """
"""
)

# Runtime URL must change because the application module itself changed.
for path in [
    'index.html',
    'src/core/startup-controller.js',
    'tests/v110-local-first-sync-static.mjs',
    'tests/v120-requirements-static.mjs',
    'tests/v123d-deployment-contracts.mjs',
    'tests/v123e-ui-stability-static.mjs',
    'tests/v124b-final-release-contract.mjs',
    'tests/v124b-complete-plan-contract.mjs',
]:
    p = ROOT / path
    if not p.exists():
        continue
    text = p.read_text(encoding='utf-8')
    text = text.replace('1.24B-main.12-fun-prompt', '1.24B-main.13-local-menu-prompt')
    text = text.replace(r'1\.24B-main\.12-fun-prompt', r'1\.24B-main\.13-local-menu-prompt')
    p.write_text(text, encoding='utf-8')

# Strengthen the focused recommendation regression contract.
p = ROOT / 'tests/v124b-recommendation-prompt-regression.mjs'
text = p.read_text(encoding='utf-8')
anchor = "assert.match(app,/luckybean:recommendation-prompt/);"
extra = "\nassert.match(app,/popup\\.addEventListener\\('click', event => \\{/);\nassert.match(app,/void recommendBean\\(button\\.dataset\\.recommendMode\\)/);\nassert.doesNotMatch(app,/const recommend=event\\.target\\.closest\\('\\[data-recommend-mode\\]'\\)/);"
if extra.strip() not in text:
    if anchor not in text:
        raise SystemExit('focused recommendation regression anchor missing')
    text = text.replace(anchor, anchor + extra, 1)
p.write_text(text, encoding='utf-8')

print('Canonical recommendation menu now owns mode clicks locally; document-level recommendation delegation removed.')
