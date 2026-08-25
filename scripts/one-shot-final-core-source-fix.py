from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 occurrence, found {count}")
    return text.replace(old, new, 1)


group_path = ROOT / "src/group-interaction-controller.js"
group = group_path.read_text(encoding="utf-8")
group = replace_once(
    group,
    "['process', '按处理工法']",
    "['process', '按处理法']",
    "process group label",
)
group_path.write_text(group, encoding="utf-8")

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

print("final Core source labels fixed at generator level")
