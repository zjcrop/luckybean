import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const index = read('index.html');
const sw = read('sw.js');
const qr = read('src/qr.js');
const qrUi = read('src/qr-ui-controller.js');
const repair = read('src/features/interaction-repair-controller.js');
const css = read('src/ui/interaction-repair.css');
const androidBuild = read('android/app/build.gradle');

assert.equal(pkg.dependencies?.jsqr, '1.4.0');
assert.match(pkg.scripts?.postinstall || '', /prepare-vendor\.mjs/);
assert.ok(fs.existsSync('public/vendor/jsqr/jsQR.js'), 'npm postinstall must vendor jsQR before tests');
assert.match(qr, /LOCAL_JSQR_URL/);
assert.match(qr, /public\/vendor\/jsqr\/jsQR\.js/);
assert.doesNotMatch(qr, /cdn\.jsdelivr\.net/);
assert.match(qr, /class CameraScanner/);
assert.match(qr, /async restart\(\)/);
assert.match(qrUi, /cameraRetryBtn/);
assert.match(qrUi, /LuckyBeanQrScanner\?\.restart|scanner\.restart/);

assert.match(repair, /const FLAVOR_GROUPS = \['花香', '果香', '茶感', '香料', '其他'\]/);
assert.match(repair, /flavorText: flavorNames\.join\(' '\)/);
assert.match(repair, /豆卡自动推荐/);
assert.match(repair, /data-lb-open-guide/);
assert.match(repair, /请先在器设页面中注册或登录账户，以便同步数据到云端/);
assert.match(repair, /杯测品鉴/);
assert.match(repair, /玩家互动品鉴/);
assert.match(repair, /札记/);
assert.match(css, /\.flavor-button[\s\S]*border-radius:6px!important/);
assert.match(css, /\.v095-tag-grid \[data-v095-tag\]/);
assert.match(css, /\.lb-guide-scroll[\s\S]*overflow-y:auto/);
assert.match(css, /max-height:min\(78dvh,720px\)/);

assert.match(index, /release-revision" content="1\.23E-main-sync\.2"/);
assert.match(index, /interaction-repair\.css\?v=1\.23E-main-sync\.2/);
assert.match(index, /interaction-repair-controller\.js\?v=1\.23E-main-sync\.2/);
assert.match(sw, /main-sync-2/);
assert.match(sw, /public\/vendor\/jsqr\/jsQR\.js/);
assert.match(androidBuild, /versionCode 102308/);

console.log('LuckyBean 1.23E QR, bean matching, flavor taxonomy and user-guide repair checks passed');
