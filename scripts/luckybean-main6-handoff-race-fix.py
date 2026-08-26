from pathlib import Path

# 1) Emit an explicit completion event only after the recognition document has been accepted
#    and the bean-form handoff has finished. This removes a UI race between package review
#    click handling and the recognition form renderer.
package_capture = Path('src/package-capture-controller.js')
text = package_capture.read_text(encoding='utf-8')
old = """  clearCapture();
  await flow.acceptDocument(recognitionDocument, { overwrite: true });
}"""
new = """  clearCapture();
  await flow.acceptDocument(recognitionDocument, { overwrite: true });
  document.dispatchEvent(new CustomEvent('luckybean:recognition-handoff-complete', {
    detail: { source: 'package-capture' }
  }));
}"""
if old not in text:
    raise SystemExit('package recognition handoff source changed unexpectedly')
package_capture.write_text(text.replace(old, new, 1), encoding='utf-8')

# 2) Package-row editing waits for the canonical handoff-complete event. A bounded polling
#    fallback remains for compatibility, but it no longer gives up merely because #beanForm
#    exists before its pending-review rows are rendered.
followup = Path('src/ui/release-1.24b-followup-controller.js')
text = followup.read_text(encoding='utf-8')
old = """function openPackageReviewEditor(row) {
  const field = String(row.dataset.recognitionField || '');
  if (!field) return;
  const handoff = document.querySelector('#bagHandoffBtn');
  if (!handoff || handoff.disabled) {
    notice('请先完成识别文字整理，再编辑待确认项', 'status-warn');
    return;
  }
  handoff.click();
  let attempts = 0;
  const locate = () => {
    attempts += 1;
    const form = document.querySelector('form#beanForm');
    const pending = form?.querySelector(`[data-recognition-review=\"pending\"] .evidence-row[data-evidence-field=\"${CSS.escape(field)}\"]`);
    if (pending && activateRecognitionEditor(pending)) return;
    if (form && attempts >= 10) {
      const controlId = FIELD_CONTROLS[field];
      const control = controlId ? form.querySelector(`#${CSS.escape(controlId)}`) : null;
      if (control) {
        const fieldRoot = control.closest('.form-field');
        fieldRoot?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        control.focus({ preventScroll: true });
        notice('已进入对应字段，请编辑后保存豆卡', 'status-warn');
      }
      return;
    }
    if (attempts < 40) setTimeout(locate, 50);
  };
  setTimeout(locate, 0);
}"""
new = """function openPackageReviewEditor(row) {
  const field = String(row.dataset.recognitionField || '');
  if (!field) return;
  const handoff = document.querySelector('#bagHandoffBtn');
  if (!handoff || handoff.disabled) {
    notice('请先完成识别文字整理，再编辑待确认项', 'status-warn');
    return;
  }

  let attempts = 0;
  let settled = false;
  let retryTimer = 0;

  const cleanup = () => {
    document.removeEventListener('luckybean:recognition-handoff-complete', onHandoffComplete);
    if (retryTimer) clearTimeout(retryTimer);
  };
  const fallbackToControl = form => {
    const controlId = FIELD_CONTROLS[field];
    const control = controlId ? form?.querySelector(`#${CSS.escape(controlId)}`) : null;
    if (!control) return false;
    const fieldRoot = control.closest('.form-field');
    fieldRoot?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    control.focus({ preventScroll: true });
    notice('已进入对应字段，请编辑后保存豆卡', 'status-warn');
    return true;
  };
  const locate = () => {
    if (settled) return true;
    attempts += 1;
    const form = document.querySelector('form#beanForm');
    const pending = form?.querySelector(`[data-recognition-review=\"pending\"] .evidence-row[data-evidence-field=\"${CSS.escape(field)}\"]`);
    if (pending && activateRecognitionEditor(pending)) {
      settled = true;
      cleanup();
      return true;
    }
    if (attempts >= 100) {
      settled = true;
      fallbackToControl(form);
      cleanup();
      return true;
    }
    return false;
  };
  const retry = () => {
    if (locate()) return;
    retryTimer = setTimeout(retry, 50);
  };
  function onHandoffComplete(event) {
    if (event.detail?.source !== 'package-capture' || settled) return;
    if (!locate()) retry();
  }

  document.addEventListener('luckybean:recognition-handoff-complete', onHandoffComplete);
  handoff.click();
  retryTimer = setTimeout(retry, 50);
}"""
if old not in text:
    raise SystemExit('package review editor source changed unexpectedly')
followup.write_text(text.replace(old, new, 1), encoding='utf-8')

# 3) Lock the event-driven handoff into source regression tests.
regression = Path('test/v124b-main6-ui-regression.test.js')
text = regression.read_text(encoding='utf-8')
extra = r'''

test('main.6 package review waits for recognition handoff completion instead of racing the form renderer', () => {
  const capture = read('src/package-capture-controller.js');
  const followup = read('src/ui/release-1.24b-followup-controller.js');
  assert.match(capture, /await flow\.acceptDocument\(recognitionDocument, \{ overwrite: true \}\);[\s\S]*luckybean:recognition-handoff-complete/);
  assert.match(followup, /addEventListener\('luckybean:recognition-handoff-complete', onHandoffComplete\)/);
  assert.match(followup, /attempts >= 100/);
  assert.equal(followup.includes('form && attempts >= 10'), false);
});
'''
if 'main.6 package review waits for recognition handoff completion' not in text:
    regression.write_text(text.rstrip() + extra + '\n', encoding='utf-8')

Path('scripts/luckybean-main6-handoff-race-fix.py').unlink(missing_ok=True)
