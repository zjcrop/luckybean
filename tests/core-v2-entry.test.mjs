import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('clean Core v2 entry does not load legacy patch chain or remote scripts', () => {
  const html = read('core-v2/index.html');
  assert.match(html, /\.\/app\.js/);
  assert.doesNotMatch(html, /v09(?:5|6|7|8|9)/i);
  assert.doesNotMatch(html, /<script[^>]+https?:\/\//i);
  assert.doesNotMatch(html, /cdn|jsdelivr|unpkg/i);
});

test('Core v2 JavaScript modules pass syntax validation', () => {
  const files = [
    'core-v2/app.js',
    'core-v2/native-bridge-loader.js',
    'core-v2/qr-tools.js',
    'core-v2/pwa.js',
    'core-v2/sw.js',
    'src/core-v2/contracts.js',
    'src/core-v2/domain/inventory.js',
    'src/core-v2/backup/backup-core.js',
    'src/core-v2/sync/outbox.js',
    'src/core-v2/platform/native-storage.js',
    'src/core-v2/platform/platform-ui.js',
    'src/storage-router.js'
  ];
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`);
  }
});

test('Android primary shell is fixed GeckoView loading only clean Core v2 entry', () => {
  const activity = read('android/app/src/main/java/com/luckybean/app/MainActivity.java');
  const build = read('android/app/build.gradle');
  assert.match(activity, /CORE_ENTRY\s*=\s*"core-v2\/index\.html"/);
  assert.match(activity, /ensureBuiltIn\(EXTENSION_LOCATION, EXTENSION_ID\)/);
  assert.match(activity, /sender\.url\.startsWith\(trustedExtensionBase \+ "core-v2\/"\)/);
  assert.match(build, /org\.mozilla\.geckoview:geckoview:/);
  assert.match(build, /compileSdk 36/);
  assert.doesNotMatch(build, /fallbackToDestructiveMigration/);
});

test('migration policy forbids destructive fallback and preserves snapshots', () => {
  const database = read('android/app/src/main/java/com/luckybean/app/data/LuckyBeanDatabase.java');
  const migration = read('android/app/src/main/java/com/luckybean/app/data/MigrationRepository.java');
  assert.doesNotMatch(database, /fallbackToDestructiveMigration/);
  assert.match(migration, /MigrationSnapshotWriter/);
  assert.match(migration, /MIGRATION_VERIFY_FAILED/);
  assert.match(migration, /webviewMigrationComplete/);
});
