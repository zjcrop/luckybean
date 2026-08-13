import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const index = read('index.html');
const controller = read('src/features/freshness-timeline-controller.js');
const groupController = read('src/group-interaction-controller.js');
const utils = read('src/utils.js');
const components = read('src/ui/app-components.css');
const sw = read('sw.js');

assert.match(index, /freshness-timeline-controller\.js\?v=1\.23E-main-sync\.3/);
assert.match(controller, /import \{ clamp, freshnessProfile \} from '\.\.\/utils\.js'/);
assert.match(controller, /const STAGES = \['养豆中', '味正盛', '味将尽'\]/);
assert.match(controller, /if \(ratio < 1 \/ 3\) return STAGES\[0\]/);
assert.match(controller, /if \(ratio < 2 \/ 3\) return STAGES\[1\]/);
assert.match(controller, /background:\$\{profile\.color\}/);
assert.match(controller, /width:\$\{progress\}%/);
assert.match(controller, /data-lb-freshness-timeline/);
assert.match(groupController, /按赏味期阶段/);
assert.doesNotMatch(controller, /data-lb-freshness-group-option/);
assert.match(controller, /data-lb-freshness-root class="empty-state"/);
assert.doesNotMatch(controller, /document\.head\.append|attributes:\s*true|attributeFilter|observe\(document\.body/);
assert.match(controller, /beanObserver\.observe\(root, \{ childList: true, subtree: true \}\)/);
assert.match(components, /\.bean-freshness-progress \{ display: block/);
assert.match(utils, /export function freshnessProfile\(bean,\s*now = new Date\(\)\)/);
assert.doesNotMatch(controller, /RL-L0|SL28|GESHA|0\.78/);
assert.match(sw, /features\/freshness-timeline-controller\.js/);

console.log('LuckyBean 1.23E canonical one-line freshness timeline and stage grouping checks passed');
