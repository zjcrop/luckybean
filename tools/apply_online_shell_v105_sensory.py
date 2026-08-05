from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_regex(path: Path, pattern: str, replacement: str, label: str) -> None:
    text = path.read_text(encoding='utf-8')
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'missing or ambiguous {label} pattern in {path}: {count}')
    path.write_text(updated, encoding='utf-8')


sensory = ROOT / 'src/v095-sensory-pro.js'
text = sensory.read_text(encoding='utf-8')
text = text.replace('data-mode-version="professional-v2"', 'data-mode-version="independent-v3"')
text = text.replace("current?.dataset.modeVersion === 'professional-v2'", "current?.dataset.modeVersion === 'independent-v3'")
text = text.replace('<strong>专业品鉴</strong><small>专业杯测品鉴 / 雷达图 / 札记</small>', '<strong>杯测品鉴</strong><small>独立杯测流程 / 雷达图 / 瑕疵 / 札记</small>')
text = text.replace("const lines = ['【专业品鉴】'];", "const lines = ['【杯测品鉴】'];")
sensory.write_text(text, encoding='utf-8')

start_replacement = r'''function sensoryBridge() {
  const bridge = globalThis.LuckyBeanSensoryBridgeV105;
  if (!bridge?.save) throw new Error('独立品鉴储存桥尚未就绪，请重新进入品鉴页');
  return bridge;
}

function sensoryToast(message, bad = false) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.className = `toast show ${bad ? 'status-bad' : 'status-good'}`;
  setTimeout(() => { node.className = 'toast'; }, 3600);
}

function independentRoot(id = 'v105IndependentSensory') {
  let root = $(`#${id}`);
  if (!root) {
    root = document.createElement('div');
    root.id = id;
    document.body.append(root);
  }
  return root;
}

function removeIndependentRoot() {
  $('#v105IndependentSensory')?.remove();
}

function startVoiceFor(target) {
  const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!Recognition) return sensoryToast('当前设备不支持语音输入', true);
  const recognition = new Recognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = false;
  recognition.onresult = event => {
    const value = event.results?.[0]?.[0]?.transcript || '';
    target.value += `${target.value ? ' ' : ''}${value}`;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  };
  recognition.onerror = () => sensoryToast('语音输入失败', true);
  recognition.start();
}

async function renderIndependentNote(beanId) {
  const context = await beanContext(beanId);
  const root = independentRoot();
  const beanName = context.bean?.name || '本次咖啡';
  root.innerHTML = `<div class="v095-wizard-overlay"><div class="v095-wizard-dialog v105-independent-card">
    <div><p class="v095-step">独立流程</p><h2>札记品鉴</h2><p>${esc(beanName)} · 评分与自然语言札记，不进入玩家互动节点。</p></div>
    <label class="v105-score-row"><span>本次评分</span><output data-note-score-output>80.0</output><input type="range" min="0" max="100" step="0.5" value="80" data-note-score></label>
    <label class="field"><span>自然语言札记</span><textarea class="control v105-note" maxlength="1200" data-note-text placeholder="记录香气、风味、酸甜、口感、问题和下一次调整方向……"></textarea></label>
    <div class="row"><button type="button" class="button subtle" data-note-cancel>取消</button><button type="button" class="button" data-note-voice>语记</button><span class="grow"></span><button type="button" class="button primary" data-note-save>保存札记</button></div>
  </div></div>`;
  const score = $('[data-note-score]', root);
  const output = $('[data-note-score-output]', root);
  score.addEventListener('input', () => { output.textContent = Number(score.value).toFixed(1); });
  $('[data-note-cancel]', root).addEventListener('click', removeIndependentRoot);
  $('[data-note-voice]', root).addEventListener('click', () => startVoiceFor($('[data-note-text]', root)));
  $('[data-note-save]', root).addEventListener('click', async event => {
    if (event.currentTarget.disabled) return;
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = '保存中…';
    try {
      const value = Number(score.value);
      await sensoryBridge().save({
        beanId,
        evaluationMode: 'note',
        direct: true,
        summary: ['【札记品鉴】'],
        answers: {},
        autoScore: value,
        subjectiveScore: value,
        naturalNote: $('[data-note-text]', root).value.trim(),
        sourceMode: 'independent-note-v105'
      });
      removeIndependentRoot();
    } catch (error) {
      sensoryToast(error.message || '札记保存失败', true);
      event.currentTarget.disabled = false;
      event.currentTarget.textContent = '保存札记';
    }
  });
}

async function startMode(mode) {
  if (modeTransitionBusy || transferBusy) return;
  const beanId = await selectedBeanId();
  if (!beanId) return sensoryToast('请先选择豆子', true);
  modeTransitionBusy = true;
  const buttons = $$('[data-v095-mode]');
  buttons.forEach(button => { button.disabled = true; });
  try {
    removeIndependentRoot();
    if (mode === 'player') {
      await startNative(beanId);
      return;
    }
    if (mode === 'note') {
      await renderIndependentNote(beanId);
      return;
    }
    const context = await Promise.race([
      beanContext(beanId),
      new Promise((_, reject) => setTimeout(() => reject(new Error('杯测资料加载超时，请重试')), 8000))
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
    sensoryToast(error.message || '品鉴模式启动失败', true);
  } finally {
    modeTransitionBusy = false;
    buttons.forEach(button => { button.disabled = false; });
  }
}

async function startNative'''
replace_regex(sensory, r'async function startMode\(mode\) \{.*?\n\}\n\nasync function startNative', start_replacement, 'independent startMode')

finish_replacement = r'''function renderCuppingFinal() {
  if (!wizard) return;
  const root = independentRoot('v095ProfessionalWizard');
  const summary = professionalSummary();
  const score = qualityScoreBreakdown();
  root.innerHTML = `<div class="v095-wizard-overlay v095-professional-overlay"><div class="v095-wizard-dialog v095-professional-dialog v105-independent-card">
    <div><p class="v095-step">杯测品鉴 · 最终记录</p><h2>评分与札记</h2><p>本页属于杯测品鉴自身流程，不再跳转或借用玩家互动品鉴。</p></div>
    <div class="v095-quality-breakdown"><div><span>原始杯测分</span><strong>${score.raw.toFixed(1)} / 90</strong></div><div><span>映射建议分</span><strong>${score.mapped100.toFixed(1)} / 100</strong></div></div>
    <label class="v105-score-row"><span>最终主观评分</span><output data-cup-score-output>${score.mapped100.toFixed(1)}</output><input type="range" min="0" max="100" step="0.5" value="${score.mapped100.toFixed(1)}" data-cup-score></label>
    <label class="field"><span>杯测札记</span><textarea class="control v105-note" maxlength="1200" data-cup-note placeholder="补充杯测判断、样品差异、瑕疵位置和复测建议……"></textarea></label>
    <details><summary>查看结构化杯测摘要</summary><pre class="v105-summary">${esc(summary)}</pre></details>
    <div class="row"><button type="button" class="button subtle" data-cup-cancel>取消</button><button type="button" class="button" data-cup-back>返回瑕疵</button><button type="button" class="button" data-cup-voice>语记</button><span class="grow"></span><button type="button" class="button primary" data-cup-save>保存杯测</button></div>
  </div></div>`;
  const slider = $('[data-cup-score]', root);
  const output = $('[data-cup-score-output]', root);
  slider.addEventListener('input', () => { output.textContent = Number(slider.value).toFixed(1); });
  $('[data-cup-cancel]', root).addEventListener('click', closeWizard);
  $('[data-cup-back]', root).addEventListener('click', renderWizard);
  $('[data-cup-voice]', root).addEventListener('click', () => startVoiceFor($('[data-cup-note]', root)));
  $('[data-cup-save]', root).addEventListener('click', async event => {
    if (event.currentTarget.disabled) return;
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = '保存中…';
    try {
      const subjectiveScore = Number(slider.value);
      await sensoryBridge().save({
        beanId: wizard.beanId,
        evaluationMode: 'professional',
        direct: true,
        summary: summary.split('\n'),
        answers: {},
        autoScore: score.mapped100,
        subjectiveScore,
        rawScore90: score.raw,
        qualityRaw90: score.raw,
        professionalRaw90: score.raw,
        naturalNote: $('[data-cup-note]', root).value.trim(),
        professionalData: {
          selections: structuredClone(wizard.selections),
          intensities: structuredClone(wizard.intensities),
          radar: structuredClone(wizard.radar),
          defects: structuredClone(wizard.defects),
          affective: structuredClone(wizard.affective)
        },
        sourceMode: 'independent-cupping-v105'
      });
      closeWizard();
    } catch (error) {
      sensoryToast(error.message || '杯测保存失败', true);
      event.currentTarget.disabled = false;
      event.currentTarget.textContent = '保存杯测';
    }
  });
}

async function finishProfessional() {
  if (!wizard || transferBusy || modeTransitionBusy) return;
  renderCuppingFinal();
}

function queueSync'''
replace_regex(sensory, r'async function finishProfessional\(\) \{.*?\n\}\n\nfunction queueSync', finish_replacement, 'independent cup final')

# Ensure cancellation clears every independent flow, not only the old cup wizard.
text = sensory.read_text(encoding='utf-8')
text = text.replace(
    "function closeWizard() {\n  $('#v095ProfessionalWizard')?.remove();\n  wizard = null;\n}",
    "function closeWizard() {\n  $('#v095ProfessionalWizard')?.remove();\n  removeIndependentRoot();\n  document.documentElement.classList.remove('v095-native-bypass');\n  wizard = null;\n  transferBusy = false;\n  modeTransitionBusy = false;\n}"
)
sensory.write_text(text, encoding='utf-8')

# Bootstrap must accept the new label and mode version; otherwise it repeatedly removes
# a correctly mounted panel and can make the first button appear unresponsive.
bootstrap = ROOT / 'src/v095-sensory-bootstrap.js'
boot = bootstrap.read_text(encoding='utf-8')
boot = boot.replace("const EXPECTED_MODE_VERSION = 'professional-v2';", "const EXPECTED_MODE_VERSION = 'independent-v3';")
boot = boot.replace("const BOOTSTRAP_VERSION = 'sensory-bootstrap-20260803d';", "const BOOTSTRAP_VERSION = 'sensory-bootstrap-20260804-v105';")
boot = boot.replace("import('./v095-sensory-pro.js?v=099d')", "import('./v095-sensory-pro.js?v=105')")
boot = boot.replace("const expected = ['专业品鉴', '玩家互动品鉴', '札记'];", "const expected = ['杯测品鉴', '玩家互动品鉴', '札记'];")
boot = boot.replace("document.documentElement.dataset.sensoryModesReady = 'professional-v2';", "document.documentElement.dataset.sensoryModesReady = 'independent-v3';")
bootstrap.write_text(boot, encoding='utf-8')

required = {
    sensory: ['杯测品鉴', 'independent-note-v105', 'independent-cupping-v105', 'renderCuppingFinal', "evaluationMode: 'professional'"],
    bootstrap: ["independent-v3", "['杯测品鉴', '玩家互动品鉴', '札记']"]
}
for path, markers in required.items():
    content = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in content:
            raise SystemExit(f'missing sensory v105 marker in {path}: {marker}')

print('Applied LuckyBean v1.0.5 independent sensory workflows.')
