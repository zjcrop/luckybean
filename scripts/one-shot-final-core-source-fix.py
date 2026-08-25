from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 occurrence, found {count}")
    return text.replace(old, new, 1)


# The capture-phase group menu is the visible menu. Keep its process label identical
# to the canonical app menu instead of relying on a later DOM text rewrite.
group_path = ROOT / "src/group-interaction-controller.js"
group = group_path.read_text(encoding="utf-8")
group = replace_once(
    group,
    "['process', '按处理工法']",
    "['process', '按处理法']",
    "process group label",
)
group_path.write_text(group, encoding="utf-8")

# Small Brew automatic fields must render their final user-visible labels at source.
# UI adapters may style automatic state, but they must not be required to rewrite text.
app_path = ROOT / "src/app.js"
app = app_path.read_text(encoding="utf-8")
app = replace_once(
    app,
    "return `自动 · ${Number(dose).toFixed(dose % 1 ? 1 : 0)}g`;",
    "return `${Number(dose).toFixed(dose % 1 ? 1 : 0)}g`;",
    "automatic dose label",
)
app = replace_once(
    app,
    "const ratioRecommendedLabel = `自动 · 1:${Number(settings.ratio || 15.5)}`;",
    "const ratioRecommendedLabel = `1:${Number(settings.ratio || 15.5)}`;",
    "automatic ratio label",
)
app = replace_once(
    app,
    "<option value=\"recommended\"${currentDripperSelection==='recommended'?' selected':''}>方案推荐${recommendedDripper ? ` · ${esc(recommendedDripper.name || recommendedDripper.type)}` : ''}</option>",
    "<option value=\"recommended\"${currentDripperSelection==='recommended'?' selected':''}>${recommendedDripper ? esc(recommendedDripper.name || recommendedDripper.type) : '自动'}</option>",
    "recommended dripper label",
)
app_path.write_text(app, encoding="utf-8")

# Lock the source-level contract into the existing regression suite so a future UI
# adapter cannot mask a reintroduction of old generator strings.
test_path = ROOT / "tests/v123e-ui-stability-static.mjs"
test = test_path.read_text(encoding="utf-8")
if "const groupInteraction=read('src/group-interaction-controller.js');" not in test:
    test = replace_once(
        test,
        "const beanGroups=read('src/bean-groups-controller.js');",
        "const beanGroups=read('src/bean-groups-controller.js');\nconst groupInteraction=read('src/group-interaction-controller.js');\nconst appSource=read('src/app.js');",
        "static source declarations",
    )
anchor = "assert.doesNotMatch(beanGroups,/data-v099t-group-back|>收</);"
checks = """assert.doesNotMatch(beanGroups,/data-v099t-group-back|>收</);
assert.match(groupInteraction,/\['process', '按处理法'\]/);
assert.doesNotMatch(groupInteraction,/处理工法/);
assert.doesNotMatch(appSource,/return `自动 · \$\{Number\(dose\)/);
assert.doesNotMatch(appSource,/const ratioRecommendedLabel = `自动 ·/);
assert.doesNotMatch(appSource,/>方案推荐\$\{recommendedDripper/);
"""
if "assert.match(groupInteraction,/\\['process', '按处理法'\\]/);" not in test:
    test = replace_once(test, anchor, checks.rstrip("\n"), "source-label static checks")
test_path.write_text(test, encoding="utf-8")

print("final Core source labels fixed and statically locked")
