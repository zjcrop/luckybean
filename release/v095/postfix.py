from pathlib import Path

js_path = Path("src/v095-ui.js")
js = js_path.read_text(encoding="utf-8")

start = js.index("async function advanceNativeToScore")
end = js.index("function startNative", start)
replacement = r"""function attachNativeSummary(summary = '', deltaTarget = null) {
  const root = q('#sensoryContent') || document.body;
  const apply = () => {
    if (deltaTarget != null) {
      const wheel = q('#sensoryDeltaWheel');
      const auto = Number(q('#sensoryAutoScore')?.textContent || 0);
      if (wheel && Number.isFinite(auto)) {
        wheel.value = clamp(deltaTarget - auto, -10, 10).toFixed(1);
        wheel.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    const note = q('#sensoryNaturalNote');
    if (note && summary && !note.value.trim()) {
      note.value = summary;
      note.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return Boolean(q('#sensoryNaturalNote')) && (deltaTarget == null || Boolean(q('#sensoryDeltaWheel')));
  };
  if (apply()) return;
  const observer = new MutationObserver(() => {
    if (apply()) observer.disconnect();
  });
  observer.observe(root, { childList: true, subtree: true });
}
async function skipNativeToNote() {
  const map = nativeNeutralMap();
  for (let step = 0; step < 8; step += 1) {
    const title = (await waitFor('.sensory-evaluation h2')).textContent.trim();
    const groups = map[title] || [];
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      for (const value of groups[groupIndex]) await clickOption(groupIndex, value);
    }
    (await waitFor('#nextSensoryNodeBtn')).click();
    await sleep(45);
  }
  await waitFor('#sensoryDeltaWheel');
}
"""
js = js[:start] + replacement + js[end:]
js = js.replace(
    "try { await advanceNativeToScore(summaryText(state), state.suggested); }\n      catch (error) { showError('综合结果转入打分失败', error); }",
    "attachNativeSummary(summaryText(state), state.suggested);"
)
js = js.replace(
    "try { await advanceNativeToScore(summaryText(state), null); }\n    catch (error) { showError('互动品鉴转入札记失败', error); }",
    "attachNativeSummary(summaryText(state), null);"
)
js = js.replace(
    "try { await advanceNativeToScore('', null); }\n      catch (error) { showError('进入札记与打分失败', error); }",
    "try { await skipNativeToNote(); }\n      catch (error) { showError('进入札记与打分失败', error); }"
)
if "advanceNativeToScore" in js:
    raise SystemExit("obsolete auto-advance call remains")
js_path.write_text(js, encoding="utf-8")

css_path = Path("styles-v095.css")
css = css_path.read_text(encoding="utf-8")
css = css.replace('html[data-theme="light"] .v095-process-inline { color: #111 !important; }\n', '')
css_path.write_text(css, encoding="utf-8")
