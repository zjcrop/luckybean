import fs from 'node:fs';

const VERSION = '1.24B';
const REVISION = '1.24B-main.2';
const VERSION_CODE = '102402';

function replaceExact(path, replacements) {
  let text = fs.readFileSync(path, 'utf8');
  const before = text;
  for (const [from, to] of replacements) text = text.split(from).join(to);
  if (text !== before) fs.writeFileSync(path, text);
}

// Current runtime/build metadata. Historical compatibility identifiers are intentionally not touched.
for (const path of [
  'src/ui/appearance-controller.js',
  'src/core/startup-controller.js',
  'src/features/runtime-features.js'
]) replaceExact(path, [["1.23E-main-sync.4", REVISION]]);

replaceExact('android/app/src/main/java/com/luckybean/app/MainActivity.java', [
  ['LuckyBeanAndroid/1.23E', `LuckyBeanAndroid/${VERSION}`]
]);

replaceExact('src/app.js', [
  ['Luckybean-END.webp?v=1.23E-main-sync.3', `Luckybean-END.webp?v=${REVISION}`]
]);

replaceExact('tests/v123d-ui-sensory-regressions.mjs', [
  ["/APP_VERSION = '1\\.23E'/, 'the locked app version must be 1.23E'", "/APP_VERSION = '1\\.24B'/, 'the locked app version must be 1.24B'"],
  ["LuckyBean 1.23E canonical settings and sensory regression contracts passed", "LuckyBean 1.24B canonical settings and sensory regression contracts passed"]
]);

for (const path of [
  'tests/v123e-gear-matching-regression.mjs',
  'tests/v123e-interaction-repair-static.mjs',
  'tests/v123e-freshness-timeline-regression.mjs',
  'tests/v127-user-regressions-static.mjs'
]) {
  replaceExact(path, [
    ['LuckyBean 1.23E ', 'LuckyBean 1.24B '],
    ['and 1.23E Android image pipeline', 'and 1.24B Android image pipeline']
  ]);
}

// PR integration workflow must build the same application version as main.
replaceExact('.github/workflows/full-integration-pr.yml', [
  ['versionCode 102322', `versionCode ${VERSION_CODE}`],
  ["versionName '1.23E'", `versionName '${VERSION}'`],
  ['LuckyBeanAndroid/1.23E', `LuckyBeanAndroid/${VERSION}`],
  ["versionCode='102322' versionName='1.23E'", `versionCode='${VERSION_CODE}' versionName='${VERSION}'`],
  ['LuckyBean-1.23E-full-integration-debug.apk', `LuckyBean-${VERSION}-full-integration-debug.apk`],
  ['version=1.23E', `version=${VERSION}`],
  ['version_code=102322', `version_code=${VERSION_CODE}`],
  ['revision=1.23E-main-sync.11', `revision=${REVISION}`]
]);

// npm package metadata follows the application release. Test filenames remain historical identifiers.
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '1.24.2';
fs.writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
lock.version = '1.24.2';
if (lock.packages?.['']) lock.packages[''].version = '1.24.2';
fs.writeFileSync('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

// Development status: preserve historical sections, but make the current release unambiguous at the top.
const statusPath = 'DEVELOPMENT_STATUS.md';
let status = fs.readFileSync(statusPath, 'utf8');
const marker = '# LuckyBean 1.24B — 当前开发状态';
if (!status.startsWith(marker)) {
  status = `${marker}\n\n当前版本：\`${VERSION}\`  \n发布修订：\`${REVISION}\`  \nAndroid：\`versionCode ${VERSION_CODE}\` / \`versionName ${VERSION}\`\n\n当前 main 以 1.24B 为唯一发布基线；下方 1.23D/1.23E 内容仅作为历史检查点保留，不再代表当前部署版本。\n\n---\n\n${status}`;
  fs.writeFileSync(statusPath, status);
}

console.log(`LuckyBean ${VERSION} current-version migration applied`);
