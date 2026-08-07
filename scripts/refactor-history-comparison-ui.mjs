import { readFile, writeFile } from 'node:fs/promises';

async function patchHistoryScreen() {
  const path = 'src/ui/history/history-screen.js';
  let source = await readFile(path, 'utf8');
  const importMarker = "import { formatDate } from '../../utils.js';\n";
  const comparisonImport = "import { compareAnalyses, changeReasons } from '../../domain/history/history-comparison.js';\n";
  if (!source.includes(comparisonImport)) {
    if (!source.includes(importMarker)) throw new Error('history comparison import marker missing');
    source = source.replace(importMarker, importMarker + comparisonImport);
  }
  source = source.replace(
    "${state.recycle ? '<button type=\"button\" data-history-restore>恢复所选</button><button type=\"button\" class=\"danger\" data-history-permanent>永久删除</button>' : `<button type=\"button\" data-history-archive>${state.archived?'取消归档':'归档所选'}</button><button type=\"button\" class=\"danger\" data-history-recycle>移至回收站</button>`}",
    "${state.recycle ? '<button type=\"button\" data-history-restore>恢复所选</button><button type=\"button\" class=\"danger\" data-history-permanent>永久删除</button>' : `<button type=\"button\" data-history-compare>对比两条记录</button><button type=\"button\" data-history-archive>${state.archived?'取消归档':'归档所选'}</button><button type=\"button\" class=\"danger\" data-history-recycle>移至回收站</button>`}"
  );
  const listenerMarker = "  root.querySelector('[data-history-archive]')?.addEventListener('click',async()=>{const ids=selectedIds(root);if(!ids.length)return;await archiveBrewRecords(ids,!state.archived);await openHistoryScreen();});";
  const compareListener = "  root.querySelector('[data-history-compare]')?.addEventListener('click',()=>{const ids=selectedIds(root);if(ids.length!==2)return;openHistoryComparison(records.filter(record=>ids.includes(record.id)),beanMap);});\n";
  if (!source.includes("data-history-compare]')?.addEventListener")) {
    if (!source.includes(listenerMarker)) throw new Error('history action listener marker missing');
    source = source.replace(listenerMarker, compareListener + listenerMarker);
  }

  const functionMarker = 'function openPermanentDelete(ids) {';
  const compareFunction = `function comparisonDirectionRow(item) {
  return \`<div class="history-compare-signal \${esc(item.direction.key)}"><span>\${esc(item.label)}</span><strong>\${esc(item.direction.arrow)} \${esc(item.direction.label)}</strong></div>\`;
}

function openHistoryComparison(selected, beanMap) {
  if (!Array.isArray(selected) || selected.length !== 2) return;
  const [previous, current] = [...selected].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  const comparison = compareAnalyses(previous, current);
  const reasons = changeReasons(comparison);
  const root = overlayRoot();
  if (!root) return;
  root.innerHTML = \`<div class="overlay full" data-overlay="history-comparison"><div class="dialog history-comparison-dialog">
    <div class="dialog-header"><div><h2>冲煮记录对比</h2><p>\${esc(beanMap.get(previous.beanId)?.name || '豆卡')} · \${esc(formatDate(previous.createdAt))} → \${esc(formatDate(current.createdAt))}</p></div><button class="close-button" type="button" data-history-comparison-back>×</button></div>
    <section class="panel"><div class="panel-title"><div><h3>总体趋势</h3><p>\${esc(comparison.headline)}</p></div></div><div class="history-compare-signals">\${comparison.signals.length?comparison.signals.map(comparisonDirectionRow).join(''):'<p class="muted">两条记录没有共同的可比较风味信号。</p>'}</div></section>
    <section class="panel"><div class="panel-title"><h3>方案参数变化</h3></div><div class="history-compare-parameters">\${comparison.parameters.map(item=>\`<div><span>\${esc(item.label)}</span><strong>\${item.before==null?'—':esc(item.before)}\${esc(item.unit)} → \${item.after==null?'—':esc(item.after)}\${esc(item.unit)}</strong></div>\`).join('')}</div>\${reasons.length?\`<p class="muted small">\${reasons.map(esc).join('；')}</p>\`:''}</section>
    <p class="muted small">风味结果采用方向比较，不表示实验室级绝对测量。</p>
    <div class="history-detail-actions"><button type="button" data-history-comparison-spatial="previous">查看前次三维</button><button type="button" data-history-comparison-spatial="current">查看本次三维</button><button type="button" data-history-comparison-back>返回</button></div>
  </div></div>\`;
  root.querySelectorAll('[data-history-comparison-back]').forEach(button=>button.addEventListener('click',()=>openHistoryScreen()));
  root.querySelectorAll('[data-history-comparison-spatial]').forEach(button=>button.addEventListener('click',()=>{
    const record=button.dataset.historyComparisonSpatial==='previous'?previous:current;
    document.dispatchEvent(new CustomEvent('luckybean:open-spatial-scene',{detail:{scene:record.analysisSnapshot?.trajectory}}));
  }));
}

`;
  if (!source.includes('function openHistoryComparison(')) {
    if (!source.includes(functionMarker)) throw new Error('permanent delete function marker missing');
    source = source.replace(functionMarker, compareFunction + functionMarker);
  }
  await writeFile(path, source);
}

async function patchStyles() {
  const path = 'src/ui/history/history-screen.css';
  let source = await readFile(path, 'utf8');
  const css = `.history-comparison-dialog{width:min(760px,100%);min-height:100vh}.history-compare-signals,.history-compare-parameters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 20px}.history-compare-signal,.history-compare-parameters>div{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.07)}.history-compare-signal span,.history-compare-parameters span{color:var(--muted)}.history-compare-signal strong,.history-compare-parameters strong{font-weight:560;text-align:right}.history-compare-signal.significant-up strong,.history-compare-signal.slight-up strong{color:var(--ok)}.history-compare-signal.significant-down strong,.history-compare-signal.slight-down strong{color:var(--warn)}@media(max-width:560px){.history-compare-signals,.history-compare-parameters{grid-template-columns:1fr}}\n`;
  if (!source.includes('.history-comparison-dialog{')) source += css;
  await writeFile(path, source);
}

await patchHistoryScreen();
await patchStyles();
console.log('Two-record directional history comparison integrated.');
