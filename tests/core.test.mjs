import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCodebook, makeIndex, parseNaturalLanguage, mergeCodebooks } from '../src/codebook.js';
import { computeFallbackPlan, validatePlan } from '../src/brew-engine.js';
import { decodeBrewIonBytes } from '../src/qr.js';

const root = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('BrewIon 回退编码表结构完整且编码唯一', async () => {
  const book = JSON.parse(await text('public/fallback-codebook.json'));
  validateCodebook(book);
  assert.equal(book._format, 'coffee-qr-codebook');
  assert.equal(book._schemaVersion, 1);
  assert.ok(book.countries.length >= 50);
  assert.ok(book.regions.length >= 200);
  assert.ok(book.entities.length >= 400);
  assert.ok(book.varieties.length >= 50);
  assert.ok(book.processes.length >= 20);
  assert.ok(book.flavors.length >= 120);
  assert.equal(book.flavors.some(row => String(row[0]).startsWith('FL-')), false);
  const index = makeIndex(book);
  assert.equal(index.countries.size, book.countries.length);
  assert.equal(index.flavors.size, book.flavors.length);
});

test('本地回退冲煮引擎输出满足协议与守恒', async () => {
  const input = {
    schemaVersion: 1,
    bean: { countryCode: 'CO-PA', varietyCode: 'VA-GE', processCode: 'PR-WA', roastCode: 'RL-L1', roastDate: '2026-07-20' },
    brew: { method: 'pourover', doseG: 15, ratio: 15.5, segments: 4, dripperCode: '平底滤杯' },
    water: { tdsMgL: 85 },
    targets: { floral: 2, acidity: 1, sweetness: 2, body: 1 }
  };
  const plan = await computeFallbackPlan(input);
  validatePlan(plan);
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.totals.waterG, Math.round(15 * 15.5));
  assert.equal(plan.stages.at(-1).cumulativeWaterG, plan.totals.waterG);
  assert.equal(plan.stages.reduce((sum, stage) => sum + stage.stageWaterG, 0), plan.totals.waterG);
  assert.ok(plan.stages.every(stage => stage.temperatureC >= 84 && stage.temperatureC <= 96));
  assert.ok(plan.engineVersion.startsWith('fallback-'));
});

test('导航与双字题注严格对应', async () => {
  const html = await text('index.html');
  for (const term of ['>藏<', '>拾<', '>鉴<', '>器<', '>豆藏<', '>拾味<', '>品鉴<', '>器设<']) assert.ok(html.includes(term), `缺少 ${term}`);
  for (const label of ['豆藏：咖啡豆管理', '拾味：冲煮制作', '品鉴：感官评价', '器设：设备与系统设置']) assert.ok(html.includes(label));
});

test('HTML 不含重复 ID 或内联事件处理器', async () => {
  const html = await text('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
  assert.equal(/\son[a-z]+\s*=/i.test(html), false);
});

test('应用代码只保留单一初始化和主渲染函数', async () => {
  const app = await text('src/app.js');
  assert.equal((app.match(/function init\s*\(/g) || []).length, 1);
  assert.equal((app.match(/function renderBeans\s*\(/g) || []).length, 1);
  assert.equal((app.match(/function detailBean\s*\(/g) || []).length, 1);
  assert.ok(app.includes('Math.floor(Math.random() * 6) + 4'));
  assert.equal(app.includes('id="beanRemainingWeight"'), false);
  assert.ok(app.includes('is-recommended'));
});

test('私有仓库凭据不会进入前端', async () => {
  const files = ['index.html', 'src/app.js', 'src/brew-engine.js', 'src/codebook.js', 'src/qr.js'];
  const combined = (await Promise.all(files.map(text))).join('\n');
  assert.equal(/github_pat_|ghp_[A-Za-z0-9]{20,}|GITHUB_TOKEN\s*=/.test(combined), false);
  assert.equal(combined.includes('api.github.com/repos/zjcrop/brew-profiles'), false);
});


test('自然语言识别回填确定性字段和 BrewIon 代码', async () => {
  const book = JSON.parse(await text('public/fallback-codebook.json'));
  const parsed = parseNaturalLanguage('埃塞俄比亚 古吉 日晒 埃塞原生种 浅烘 2026-07-20 海拔2100m 净重150g 茉莉 蓝莓 蜂蜜', book);
  assert.equal(parsed.countryCode, 'CO-EA');
  assert.equal(parsed.processCode, 'PR-NA');
  assert.equal(parsed.varietyCode, 'VA-EH');
  assert.equal(parsed.roastCode, 'RL-L1');
  assert.equal(parsed.roastDate, '2026-07-20');
  assert.equal(parsed.altitude, 2100);
  assert.equal(parsed.initialWeight, 150);
  assert.ok(parsed.flavorCodes.length >= 2);
  assert.ok(Object.keys(parsed.evidence).length >= 6);
});

function crc16(bytes) {
  let crc = 0xffff;
  for (const value of bytes) {
    crc ^= value << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) : crc << 1;
    crc &= 0xffff;
  }
  return crc;
}

test('BrewIon 固定字段二维码执行 CRC 和行索引解码', async () => {
  const book = JSON.parse(await text('public/fallback-codebook.json'));
  const fixed = '01' + '**' + '***' + '***' + '01' + '01' + '*1' + '**' + '01' + '**' + '**' + '**' + '**' + '000' + '0';
  assert.equal(fixed.length, 32);
  const core = new TextEncoder().encode(fixed);
  const crc = crc16(core);
  const bytes = Uint8Array.from([...core, crc >> 8, crc & 0xff]);
  const decoded = decodeBrewIonBytes(bytes, book);
  assert.equal(decoded.countryCode, book.countries[0][0]);
  assert.equal(decoded.varietyCode, book.varieties[0][0]);
  assert.equal(decoded.processCode, book.processes[0][0]);
  assert.deepEqual(decoded.flavorCodes, [book.flavors[0][0]]);
  assert.equal(decoded.roastCode, 'RL-L1');
  assert.equal(decoded.roastDate, '2000-01-01');
  const corrupted = Uint8Array.from(bytes); corrupted[0] ^= 1;
  assert.throws(() => decodeBrewIonBytes(corrupted, book), /CRC16/);
});

test('搜索多选、品鉴完整性、分享文档和原子缓存修复已落地', async () => {
  const [app, db, codebook] = await Promise.all([text('src/app.js'), text('src/db.js'), text('src/codebook.js')]);
  assert.ok(app.includes('data-filter-flavor'));
  assert.ok(app.includes("['recommended','推荐']"));
  assert.ok(app.includes('请完成“${node.label}”节点'));
  assert.ok(app.includes('<body><h1>'));
  assert.ok(app.includes("button.textContent = state.currentPlan ? '重新生成' : '生成方案'"));
  assert.equal(app.includes("150, 188"), false);
  assert.ok(db.includes('migration.legacy.backup.v1'));
  assert.ok(db.includes('export async function activateCodebook'));
  assert.ok(codebook.includes('await activateCodebook(candidate)'));
});


test('视觉与信息架构改造已落地', async () => {
  const [html, css, app] = await Promise.all([text('index.html'), text('styles.css'), text('src/app.js')]);
  assert.equal(html.includes('id="syncStatus"'), false);
  assert.equal(html.includes('id="profileBtn"'), false);
  assert.equal(html.includes('page-kicker'), false);
  assert.ok(html.includes('class="page-seal"'));
  assert.ok(html.includes('>拾<'));
  assert.ok(html.includes('>拾味<'));
  assert.ok(html.includes('>诹吉<'));
  assert.ok(html.includes('>添<'));
  assert.ok(css.includes('.page-seal'));
  assert.ok(css.includes('font-family: FangSong'));
  assert.ok(css.includes('border-bottom-style: dashed'));
  assert.ok(css.includes('.overlay[data-overlay="bean-search"]'));
  assert.ok(app.includes('<summary><span>账户</span>'));
  assert.ok(app.includes('<summary><span>私器</span>'));
  assert.ok(app.includes('<summary><span>数藏</span>'));
  assert.ok(app.includes('<summary><span>本物</span>'));
  assert.ok(app.includes('zj_crop'));
  assert.ok(app.includes('端茶倒水的秦始皇🐻'));
});

test('豆卡名称、烘焙色值和现有数据筛选逻辑正确', async () => {
  const app = await text('src/app.js');
  assert.equal(app.includes('id="beanName"'), false);
  assert.ok(app.includes('id="beanRoastColor"'));
  assert.ok(app.includes('填写色值自动生成'));
  assert.ok(app.includes("name: `${codeName('countries'"));
  assert.ok(app.includes("uniqueRowsFromBeans('countries'"));
  assert.ok(app.includes("uniqueRowsFromBeans('varieties'"));
  assert.ok(app.includes('availableFlavorRows(activeBeans)'));
});

test('远程编码表与内置表合并时保留缺失风味', async () => {
  const fallback = JSON.parse(await text('public/fallback-codebook.json'));
  const primary = structuredClone(fallback);
  primary.flavors = primary.flavors.slice(0, 3);
  const merged = mergeCodebooks(primary, fallback);
  assert.equal(merged.flavors.length, fallback.flavors.length);
  assert.equal(new Set(merged.flavors.map(row => row[0])).size, merged.flavors.length);
});

test('拾味包含自动推荐、低温首段、轨迹与全屏计时', async () => {
  const app = await text('src/app.js');
  for (const marker of ['模型自动推荐', '第一段低温注水', 'trajectorySvg(plan)', '萃取轨迹', '风味拟合', 'timerTotalRemaining', 'timerPrevBtn', 'timerNextBtn']) assert.ok(app.includes(marker), marker);
});
