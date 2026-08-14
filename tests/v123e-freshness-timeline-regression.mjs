import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const index = read('index.html');
const controller = read('src/features/freshness-timeline-controller.js');
const groupController = read('src/group-interaction-controller.js');
const canonicalGroups = read('src/bean-groups-controller.js');
const utils = read('src/utils.js');
const components = read('src/ui/app-components.css');
const sw = read('sw.js');

const revisionMatch = index.match(/release-revision" content="([^"]+)"/);
assert.ok(revisionMatch, 'release revision missing from index');
const releaseRevision = revisionMatch[1];
assert.match(releaseRevision, /^1\.23E-main-sync\.\d+$/);
assert.ok(index.includes(`freshness-timeline-controller.js?v=${releaseRevision}`), 'freshness controller asset revision must match current release');
assert.match(controller, /import \{ clamp, freshnessProfile \} from '\.\.\/utils\.js'/);
assert.match(controller, /const STAGES = \['养豆中', '味正盛', '味将尽'\]/);
assert.match(controller, /if \(ratio < 1 \/ 3\) return STAGES\[0\]/);
assert.match(controller, /if \(ratio < 2 \/ 3\) return STAGES\[1\]/);
assert.match(controller, /background:\$\{profile\.color\}/);
assert.match(controller, /width:\$\{progress\}%/);
assert.match(controller, /data-lb-freshness-timeline/);
assert.match(groupController, /按赏味期阶段/);
assert.match(canonicalGroups, /luckybean:app-refreshed/);
assert.match(canonicalGroups, /render\(\{ force: true, refreshData: true \}\)/);
assert.doesNotMatch(controller, /data-lb-freshness-group-option/);
assert.doesNotMatch(controller, /container\.innerHTML|data-lb-freshness-root/);
assert.match(controller, /render: refreshTimelineCards/);
assert.doesNotMatch(controller, /document\.head\.append|attributes:\s*true|attributeFilter|observe\(document\.body/);
assert.match(controller, /beanObserver\.observe\(root, \{ childList: true, subtree: true \}\)/);
assert.match(components, /\.bean-freshness-progress \{ display: block/);
assert.match(utils, /export function freshnessProfile\(bean,\s*now = new Date\(\)\)/);
assert.doesNotMatch(controller, /RL-L0|SL28|GESHA|0\.78/);
assert.match(sw, /features\/freshness-timeline-controller\.js/);
assert.ok(sw.includes(`REVISION = '${releaseRevision}'`), 'service worker revision must match current release');

console.log('LuckyBean 1.23E canonical one-line freshness timeline and stage grouping checks passed');
