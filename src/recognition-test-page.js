import { recognitionDocumentFromText } from './domain/recognition/recognition-document.js';
import { classifyRecognitionDates } from './domain/recognition/recognition-date-classifier.js';
import { buildDateReviewModel, resolveDateReviewSelections } from './domain/recognition/recognition-date-review.js';

const SAMPLE = 'ROAST DATE 2026-07-28\nBEST BEFORE 2026-10-28\nLOT 20260729';
const TYPE_OPTIONS = [
  ['ignore', '忽略/暂不确定'], ['roastDate', '烘焙日期'], ['productionDate', '生产日期'],
  ['packDate', '包装日期'], ['bestBefore', '最佳赏味期'], ['expiryDate', '到期日期']
];

const input = document.querySelector('#testInput');
const result = document.querySelector('#testResult');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function render() {
  const text = input.value.trim();
  if (!text) {
    result.innerHTML = '<p class="test-status bad">请先输入豆袋 OCR 文字。</p>';
    return;
  }
  const decision = classifyRecognitionDates(recognitionDocumentFromText(text));
  const model = buildDateReviewModel(decision);
  if (!model.length) {
    result.innerHTML = '<p class="test-status">未发现合法日期候选，系统不会填写烘焙日期。</p>';
    return;
  }
  result.dataset.decision = JSON.stringify(decision);
  result.innerHTML = `<div class="date-review-list">${model.map(candidate => `
    <article class="date-review-row" data-candidate-id="${escapeHtml(candidate.candidateId)}">
      <div><strong>${escapeHtml(candidate.rawValue)}</strong><small>${escapeHtml(candidate.fieldLabel)} · ${escapeHtml(candidate.imageRole)}</small></div>
      <select class="control test-date-type">${TYPE_OPTIONS.map(([value, label]) => `<option value="${value}"${candidate.defaultType === value ? ' selected' : ''}>${label}</option>`).join('')}</select>
      <select class="control test-date-value">${candidate.values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}</select>
      ${candidate.warnings.length ? `<p>${candidate.warnings.map(escapeHtml).join(' ')}</p>` : ''}
    </article>`).join('')}</div>
    <div class="test-actions"><button id="confirmTestBtn" class="button primary" type="button">确认归属</button></div>
    <div id="testDecisionOutput"></div>`;
  result.querySelectorAll('.test-date-type').forEach(control => control.addEventListener('change', () => {
    if (control.value !== 'roastDate') return;
    result.querySelectorAll('.test-date-type').forEach(other => { if (other !== control && other.value === 'roastDate') other.value = 'ignore'; });
  }));
  result.querySelector('#confirmTestBtn').addEventListener('click', confirm);
}

function confirm() {
  const decision = JSON.parse(result.dataset.decision);
  const selections = [...result.querySelectorAll('[data-candidate-id]')].map(row => ({
    candidateId: row.dataset.candidateId,
    type: row.querySelector('.test-date-type').value,
    value: row.querySelector('.test-date-value').value
  }));
  const resolved = resolveDateReviewSelections(decision, selections);
  const output = result.querySelector('#testDecisionOutput');
  if (!resolved.ok) {
    output.innerHTML = `<p class="test-status bad">${escapeHtml(resolved.errors[0])}</p>`;
    return;
  }
  output.innerHTML = `<p class="test-status ok">${resolved.roastDate ? `确认烘焙日期：${escapeHtml(resolved.roastDate)}` : '未确认烘焙日期，豆卡将保持为空。'}</p><p class="test-meta">${escapeHtml(JSON.stringify(resolved.confirmedRoastDate || { decisionSource: 'user-left-empty' }))}</p>`;
}

document.querySelector('#classifyBtn').addEventListener('click', render);
document.querySelector('#resetBtn').addEventListener('click', () => { input.value = SAMPLE; render(); });
render();
