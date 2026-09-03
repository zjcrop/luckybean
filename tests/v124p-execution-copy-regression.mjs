import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeExecutionText, sanitizeExecutionAction, sanitizeExecutionPlanText } from '../src/services/execution-text-sanitizer.js';

const obsolete = '按Excel方案表的累计时间、温度与累计注水量执行本段。';
assert.equal(sanitizeExecutionText(obsolete), '');
assert.equal(sanitizeExecutionText(`中心注水。${obsolete} 保持稳定流速。`), '中心注水。 保持稳定流速。');
assert.equal(sanitizeExecutionText('按 Excel 方案表累计时间、温度及累计注水量执行本段。'), '');
assert.equal(sanitizeExecutionText('按当前计时器提示执行本段。'), '按当前计时器提示执行本段。');
assert.equal(sanitizeExecutionAction({ speech: obsolete, label: `准备。${obsolete}` }).speech, '');
const plan = sanitizeExecutionPlanText({
  stages:[{ notice:obsolete, advanceSpeech:`下一段。${obsolete}` }],
  executionActions:[{ speech:`加入冰块。${obsolete}` }]
});
assert.equal(plan.stages[0].notice, '');
assert.equal(plan.stages[0].advanceSpeech, '下一段。');
assert.equal(plan.executionActions[0].speech, '加入冰块。');

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../src/services/brew-analysis-service.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
assert.match(app, /sanitizeExecutionText/);
assert.match(service, /sanitizeExecutionText/);
assert.match(service, /sanitizeExecutionPlanText|sanitizeExecutionAction/);
assert.match(sw, /execution-text-sanitizer\.js/);
assert.ok(!app.includes(obsolete), 'app must not hard-code obsolete Excel copy');
assert.ok(!service.includes(obsolete), 'service must not hard-code obsolete Excel copy');

console.log('v124p execution copy regression: ok');
