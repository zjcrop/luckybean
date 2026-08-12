import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildBeanVector,
  buildGearCorrection,
  buildMatchingEnvelope,
  MATCH_AXES
} from '../src/domain/matching/flavor-vector.js';

const read = path => fs.readFileSync(path, 'utf8');
const qr = read('src/qr.js');
const service = read('src/services/brew-analysis-service.js');
const gearController = read('src/features/gear-matching-controller.js');
const index = read('index.html');
const sw = read('sw.js');
const build = read('android/app/build.gradle');

assert.equal(MATCH_AXES.length, 8);
assert.doesNotMatch(qr, /decodeEncryptedShareEnvelope/);
assert.doesNotMatch(qr, /cdn\.jsdelivr\.net/);
assert.match(qr, /core\.normalizeQrResult/);
assert.match(qr, /async restart\(\)/);
assert.match(qr, /NotAllowedError/);
assert.match(service, /selectedBeanIdFromRuntime/);
assert.match(service, /querySelector\?\.\('#brewBean'\)/);
assert.match(service, /enrichBeanForMatching/);
assert.match(service, /flavorCodes/);
assert.match(service, /dripperSnapshot/);
assert.match(service, /filterPaperSnapshot/);
assert.match(gearController, /滤杯角度/);
assert.match(gearController, /旁通量/);
assert.match(gearController, /过滤速度/);
assert.match(gearController, /matchingGear\.drippers/);
assert.match(gearController, /matchingGear\.papers/);
assert.doesNotMatch(gearController, /const materialSelect = \$\('#brewDripperMaterial'\)/);
assert.match(gearController, /dripperSelect\.dataset\.recommendedDripperId/);
assert.match(gearController, /const match = dripperMatch\(settings, dripper\.id\)/);
assert.doesNotMatch(gearController, /brewDripperAngle/);
assert.match(index, /gear-matching-controller\.js\?v=1\.23E-main-sync\.2/);
assert.match(sw, /gear-matching-controller\.js\?v=1\.23E-main-sync\.2/);
assert.match(build, /versionCode 102311/);

const settings = {
  gear: {
    drippers: [{ id: 'd45' }, { id: 'd75' }],
    filters: [{ id: 'slow' }, { id: 'fast' }]
  },
  matchingGear: {
    drippers: { d45: { angleDeg: 45, bypass: 'low' }, d75: { angleDeg: 75, bypass: 'high' } },
    papers: { slow: { speed: 'low' }, fast: { speed: 'high' } }
  }
};
const lowSlow = buildGearCorrection(settings, { brew: { dripperId: 'd45', filterPaperId: 'slow' } });
const highFast = buildGearCorrection(settings, { brew: { dripperId: 'd75', filterPaperId: 'fast' } });
assert.notDeepEqual(lowSlow, highFast);
assert.ok(highFast.some(value => value < 0));
assert.deepEqual(buildGearCorrection({}, { brew: {} }), Array(8).fill(0));
const floral = buildBeanVector({ roastCode: 'RL-L1', processName: '水洗', varietyName: '瑰夏', flavorText: '茉莉 柠檬 茶感', altitude: 1900 });
const dark = buildBeanVector({ roastCode: 'RL-L5', processName: '日晒', varietyName: '波旁', flavorText: '巧克力 坚果', altitude: 1000 });
assert.notDeepEqual(floral.vector, dark.vector);
const envelope = buildMatchingEnvelope({ bean: { roastCode: 'RL-L1', processName: '水洗', varietyName: '瑰夏', flavorText: '茉莉 柠檬' }, settings, input: { brew: { dripperId: 'd45', filterPaperId: 'slow' }, targets: { acidity: 2, floral: 3, fruity: 2, sweetness: 2, bitterness: 2, astringency: 2 } } });
assert.equal(envelope.contract, 'luckybean-match/1.1');
assert.equal(envelope.match_vector.length, 8);
assert.equal(envelope.target_vector.length, 8);
assert.match(envelope.signature, /^LMS1-FC1-X[0-9A-F]{16}-Q\d+$/);
console.log('LuckyBean 1.23E gear binding, direct bean matching and QR runtime checks passed');
