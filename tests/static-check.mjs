import { readdir, readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

async function walk(dir) {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await walk(full)); else output.push(full);
  }
  return output;
}

const files = await walk(root);
for (const file of files.filter(file => file.endsWith('.js') || file.endsWith('.mjs'))) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${path.relative(root, file)}: ${result.stderr.trim()}`);
}

for (const file of files.filter(file => file.endsWith('.json'))) {
  try { JSON.parse(await readFile(file, 'utf8')); } catch (error) { failures.push(`${path.relative(root, file)}: JSON ${error.message}`); }
}

const html = await readFile(path.join(root, 'index.html'), 'utf8');
const requiredIds = ['loginScreen','appShell','pageBeans','pageBrew','pageSensory','pageSettings','beanGroups','brewContent','sensoryContent','settingsContent','fabWrap','bottomNav','overlayRoot','toast'];
for (const id of requiredIds) if (!html.includes(`id="${id}"`)) failures.push(`index.html 缺少 #${id}`);

const app = await readFile(path.join(root, 'src/app.js'), 'utf8');
const requiredFeatures = ['scanQrFile','CameraScanner','parseNaturalLanguage','requestPrivatePlan','computeFallbackPlan','inventoryEvents','SENSORY_NODES','openShareDialog','checkCodebookUpdate'];
for (const feature of requiredFeatures) if (!app.includes(feature)) failures.push(`app.js 缺少 ${feature}`);

const utils = await readFile(path.join(root, 'src/utils.js'), 'utf8');
const schemaMatch = utils.match(/SCHEMA_VERSION\s*=\s*(\d+)/);
if (!schemaMatch || Number(schemaMatch[1]) < 6) failures.push('IndexedDB SCHEMA_VERSION 不得低于 6，避免回滚触发 VersionError');

const dbSource = await readFile(path.join(root, 'src/db.js'), 'utf8');
for (const feature of ['openDatabase()', 'current.version >= SCHEMA_VERSION', 'Math.max(SCHEMA_VERSION', 'dbPromise = undefined']) {
  if (!dbSource.includes(feature)) failures.push(`db.js 缺少回滚兼容逻辑：${feature}`);
}

const codebookStats = await stat(path.join(root, 'public/fallback-codebook.json'));
if (codebookStats.size < 50000) failures.push('回退编码表体积异常');

const secretPattern = /(github_pat_|ghp_[A-Za-z0-9]{20,}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----)/;
for (const file of files.filter(file => !file.includes(`${path.sep}tests${path.sep}`) && !file.endsWith('.jpg') && !file.endsWith('.png'))) {
  const content = await readFile(file, 'utf8').catch(() => '');
  if (secretPattern.test(content)) failures.push(`${path.relative(root, file)} 疑似包含密钥`);
}

if (failures.length) {
  console.error('静态校验失败：');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`静态校验通过：${files.length} 个文件；JS 语法、JSON、必要入口、数据库回滚兼容、敏感信息均通过。`);
