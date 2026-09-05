import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value); }
function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`missing transform anchor: ${label}`);
  return source.replace(before, after);
}

// Full integration must stay on the bean-directory fast path. It is a display enhancer, not an
// authority source, so it consumes the disposable summary store and compact display index only.
{
  const path = 'src/features/full-integration-controller-v3.js';
  let source = read(path);
  source = replaceExact(
    source,
    "import { all } from '../db.js';\nimport { loadCodebook, makeIndex, displayName } from '../codebook.js';",
    "import { all } from '../db.js';",
    'full integration imports'
  );
  source = replaceExact(source, 'let index = null;', 'let displayIndex = null;', 'full integration index state');
  source = replaceExact(
    source,
    "const code = (table, id, fallback = '') => index ? displayName(index, table, id, fallback) : fallback;",
    "const code = (table, id, fallback = '') => displayIndex?.[table]?.[id] || fallback;",
    'full integration code resolver'
  );
  source = replaceExact(
    source,
    "async function refreshBeans() {\n  beanMap = new Map((await all('beans').catch(() => [])).map(bean => [String(bean.id), bean]));\n  queueCardRender();\n}",
    "async function refreshBeans() {\n  beanMap = new Map((await all('beanSummaries').catch(() => [])).map(bean => [String(bean.id), bean]));\n  queueCardRender();\n}",
    'full integration bean directory'
  );
  source = replaceExact(
    source,
    "async function init() {\n  try {\n    const loaded = await loadCodebook();\n    index = makeIndex(loaded?.data || loaded);\n  } catch (error) {\n    console.warn('简称库加载失败', error);\n  }",
    "async function init() {\n  try {\n    const response = await fetch(new URL('../../public/bean-display-index.json', import.meta.url), { cache: 'force-cache' });\n    if (!response.ok) throw new Error(`HTTP ${response.status}`);\n    const candidate = await response.json();\n    if (candidate?.format !== 'luckybean-bean-display-index-v1') throw new Error('轻量显示索引格式不兼容');\n    displayIndex = candidate;\n  } catch (error) {\n    console.warn('轻量简称索引加载失败', error);\n    displayIndex = {};\n  }",
    'full integration init'
  );
  write(path, source);
}

// Freshness decoration needs only roast/refrigeration/weight metadata, all present in beanSummaries.
{
  const path = 'src/features/freshness-timeline-controller.js';
  let source = read(path);
  source = replaceExact(
    source,
    "  const beans = await all('beans').catch(() => []);",
    "  const beans = await all('beanSummaries').catch(() => []);",
    'freshness summary read'
  );
  write(path, source);
}

// On constrained WebKit/mobile devices prewarm the vendored SDK module during composition, but do
// not allocate the full OCR model until the user actually recognizes. Other web devices warm the
// complete engine. Android continues to use its native provider.
{
  const path = 'src/recognition-paddle-ocr.js';
  let source = read(path);
  source = replaceExact(
    source,
    "async function preload() {\n  if (globalThis.__LUCKYBEAN_ANDROID__ || LOW_MEMORY || WEBKIT) return null;\n  try { const ocr = await ensureEngine(); emit('PP-OCRv5 已在后台预热', 18); scheduleDispose(); return ocr; }\n  catch (error) { emit(`PP-OCRv5 后台预热未完成：${error.message}`, 0); return null; }\n}",
    "async function preload() {\n  if (globalThis.__LUCKYBEAN_ANDROID__) return null;\n  if (LOW_MEMORY || WEBKIT) {\n    try { await loadModule(); emit('PP-OCRv5 运行时已在拍摄阶段预热，模型将在识别时按需加载', 6); }\n    catch (error) { emit(`PP-OCRv5 运行时预热未完成：${error.message}`, 0); }\n    return null;\n  }\n  try { const ocr = await ensureEngine(); emit('PP-OCRv5 已在拍摄阶段后台预热', 18); scheduleDispose(); return ocr; }\n  catch (error) { emit(`PP-OCRv5 后台预热未完成：${error.message}`, 0); return null; }\n}",
    'ocr preload policy'
  );
  write(path, source);
}

console.log('runtime lazy final transform applied');
