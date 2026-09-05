import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
const replaceExact = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`missing transform anchor: ${label}`);
  return source.replace(before, after);
};

// Wire the multi-entry controller into the local-first runtime without reintroducing eager OCR model allocation.
{
  const path = 'src/features/runtime-features.js';
  let source = read(path);
  source = replaceExact(
    source,
    "  feature('package-capture', '../package-capture-controller.js'),\n  feature('direct-camera', '../direct-camera-controller.js'),",
    "  feature('package-capture', '../package-capture-controller.js'),\n  feature('recognition-multi-entry', './recognition-multi-entry-controller.js'),\n  feature('direct-camera', '../direct-camera-controller.js'),",
    'multi-entry runtime declaration'
  );
  source = replaceExact(
    source,
    "  'recognition-quality', 'package-capture', 'direct-camera', 'recognition-review-owner',\n  'recognition-batch-progress', 'brew-pour-guide', 'shared-sortable', 'sensory-tag-sort'",
    "  'recognition-quality', 'package-capture', 'recognition-multi-entry', 'direct-camera', 'recognition-review-owner',\n  'recognition-batch-progress', 'brew-pour-guide', 'shared-sortable', 'sensory-tag-sort'",
    'multi-entry preinteraction load'
  );
  write(path, source);
}

// Add WebKit regression coverage and the live AI contract to the main gate.
{
  const path = 'package.json';
  const pkg = JSON.parse(read(path));
  pkg.scripts['test:webkit'] = 'playwright test tests/v124p-webkit-auth-ocr.spec.mjs --browser=webkit --reporter=line --workers=1';
  write(path, `${JSON.stringify(pkg, null, 2)}\n`);
}
{
  const path = '.github/workflows/test-main.yml';
  let source = read(path);
  source = source.replace('timeout-minutes: 25', 'timeout-minutes: 30');
  source = replaceExact(
    source,
    "      - name: Verify live BrewProfiles contract\n        run: npm run test:live-brewprofiles\n      - run: npx playwright install --with-deps chromium",
    "      - name: Verify live BrewProfiles contract\n        run: npm run test:live-brewprofiles\n      - name: Verify live recognition AI contract\n        run: node tests/v124p-live-recognition-ai.mjs\n      - run: npx playwright install --with-deps chromium webkit",
    'main gate live recognition AI'
  );
  source = replaceExact(
    source,
    "      - run: npm run test:smoke\n      - run: npm run test:core",
    "      - run: npm run test:smoke\n      - run: npm run test:webkit\n      - run: npm run test:core",
    'main gate WebKit regression'
  );
  write(path, source);
}
{
  const path = 'scripts/run-static-tests.mjs';
  let source = read(path);
  source = replaceExact(
    source,
    "  'tests/v124p-startup-auth-hotfix-static.mjs',\n",
    "  'tests/v124p-startup-auth-hotfix-static.mjs',\n  'tests/v124p-auth-ocr-ai-hotfix-static.mjs',\n",
    'AI static gate'
  );
  write(path, source);
}

// Final release identity: local-first schema v10 + AI/multi-entry + iOS auth compatibility.
{
  const path = 'release.json';
  const release = JSON.parse(read(path));
  release.semver = '1.24.17';
  release.revision = '1.24P-main.3';
  release.androidVersionCode = Math.max(102419, Number(release.androidVersionCode || 0) + 1);
  release.releaseTag = 'v1.24P-main.3';
  release.cacheRevision = 'main-3-local-first-ai';
  release.schemaVersion = 10;
  release.hotfix = 'local-first-ai-multibean-ios-auth-20260906';
  write(path, `${JSON.stringify(release, null, 2)}\n`);
}

// Rotate all public resource revisions that are explicitly tied to the previous main.2 cache identity.
for (const path of ['index.html', 'recognition-test.html']) {
  if (!fs.existsSync(path)) continue;
  write(path, read(path).replaceAll('1.24P-main.2', '1.24P-main.3'));
}
{
  const path = 'sw.js';
  let source = read(path).replaceAll("1.24P-main.2", "1.24P-main.3");
  source = source.replace("main-2-web-startup", "main-3-local-first-ai");
  if (!source.includes("'./src/services/recognition-ai-service.js'")) {
    source = replaceExact(
      source,
      "  './src/services/execution-text-sanitizer.js',\n",
      "  './src/services/execution-text-sanitizer.js',\n  './src/services/recognition-ai-service.js',\n",
      'AI service SW inventory'
    );
  }
  if (!source.includes("'./src/features/recognition-multi-entry-controller.js'")) {
    source = replaceExact(
      source,
      "  './src/features/recognition-batch-progress-controller.js',\n",
      "  './src/features/recognition-batch-progress-controller.js',\n  './src/features/recognition-multi-entry-controller.js',\n  './src/domain/recognition/recognition-entry-splitter.js',\n",
      'multi-entry SW inventory'
    );
  }
  write(path, source);
}

// Keep the release contract itself authoritative for the new revision and schema.
{
  const path = 'tests/v124p-release-contract.mjs';
  let source = read(path)
    .replace("assert.equal(release.revision, '1.24P-main.2');", "assert.equal(release.revision, '1.24P-main.3');")
    .replace("assert.equal(release.semver, '1.24.16');", "assert.equal(release.semver, '1.24.17');")
    .replace("assert.equal(release.releaseTag, 'v1.24P-main.2');", "assert.equal(release.releaseTag, 'v1.24P-main.3');")
    .replace(/release-revision\" content=\"1\\\.24P-main\\\.2\"/, 'release-revision\\" content=\\"1\\.24P-main\\.3\\"')
    .replace(/REVISION = '1\\\.24P-main\\\.2'/, "REVISION = '1\\.24P-main\\.3'")
    .replace(/main-2-web-startup/, 'main-3-local-first-ai');
  if (!source.includes("assert.equal(release.schemaVersion, 10);")) {
    source = source.replace("assert.equal(release.brewPlanVersion, 'brew-plan/1.0');", "assert.equal(release.brewPlanVersion, 'brew-plan/1.0');\nassert.equal(release.schemaVersion, 10);");
  }
  write(path, source);
}

console.log('final recognition/local-first integration patch applied');
