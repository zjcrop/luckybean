from pathlib import Path

path = Path('src/recognition-paddle-ocr.js')
s = path.read_text(encoding='utf-8')

def once(old: str, new: str) -> None:
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'expected exactly one match, got {count}: {old[:120]!r}')
    s = s.replace(old, new, 1)

once("const VERSION = '0.4.11';", "const VERSION = '0.4.12';")

anchor = """async function startCompatibilityEngine(reason = 'webkit') {
  memoryConstrained = true;
  const isWebKitMode = reason === 'webkit';
  engineMode = isWebKitMode ? 'direct-wasm-no-simd' : 'direct-wasm-no-simd-low-memory';
  emit(isWebKitMode ? 'Safari 正在启用低内存兼容识别模式' : 'PP-OCRv5 正在使用会话低内存兼容模式', 9);
  return withTimeout(createCompatibilityEngine(), ENGINE_INIT_TIMEOUT_MS, isWebKitMode ? 'PP-OCRv5 Safari 兼容模式初始化超时' : 'PP-OCRv5 低内存兼容模式初始化超时', () => {});
}
"""
replacement = anchor + """async function startWebKitEngine() {
  const generation = ++engineGeneration;
  const startedAt = diagnosticNow();
  memoryConstrained = true;
  engineMode = 'direct-wasm-no-simd';
  emit('Safari 正在启用单线程无 SIMD 本地 PP-OCRv5', 7);
  let raw = createCompatibilityEngine();
  try {
    const ocr = await withTimeout(raw, ENGINE_INIT_TIMEOUT_MS, 'PP-OCRv5 Safari 兼容模式初始化超时', () => {});
    if (generation !== engineGeneration) { disposeInstance(ocr); throw new Error('PP-OCRv5 Safari 初始化结果已失效，请重新识别'); }
    recordDiagnostic('webkit-runtime-init-success', startedAt, { mode:engineMode });
    return ocr;
  } catch (error) {
    raw.then(ocr => { if (generation !== engineGeneration) disposeInstance(ocr); }).catch(() => {});
    recordDiagnostic('webkit-runtime-init-failed', startedAt, { message:String(error?.message || error) });
    if (generation !== engineGeneration) throw error;
    if (isWasmMemoryAllocationFailure(error)) return startMemoryCompatibilityEngine(generation, error);
    if (isOnnxSessionCreationFailure(error)) {
      emit('Safari 主线程 ONNX session 创建失败，正在用同一 PP-OCRv5 的无 SIMD Worker 兼容路径重试', 9);
      return startSessionCompatibilityEngine(generation, error);
    }
    throw error;
  }
}
"""
once(anchor, replacement)

once(
  "const pending = WEBKIT ? startCompatibilityEngine('webkit') : memoryConstrained ? startRememberedMemoryEngine() : runtimeCompatibilityConstrained ? startRememberedSessionCompatibilityEngine() : startWorkerEngine();",
  "const pending = WEBKIT ? startWebKitEngine() : memoryConstrained ? startRememberedMemoryEngine() : runtimeCompatibilityConstrained ? startRememberedSessionCompatibilityEngine() : startWorkerEngine();"
)

once(
  "compatibilityFallback:'webkit-direct-wasm-no-simd',",
  "compatibilityFallback:'webkit-direct-wasm-no-simd->direct-module-worker-wasm-no-simd->direct-wasm-no-simd-last-resort',"
)

path.write_text(s, encoding='utf-8')

Path('test/ocr-webkit-session-fallback.test.js').write_text(r'''import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/recognition-paddle-ocr.js', 'utf8');

test('WebKit ONNX session failure enters the same PP-OCRv5 compatibility state machine', () => {
  assert.match(source, /const VERSION = '0\.4\.12'/u);
  assert.match(source, /async function startWebKitEngine\(\)/u);
  assert.match(source, /if \(isOnnxSessionCreationFailure\(error\)\) \{/u);
  assert.match(source, /return startSessionCompatibilityEngine\(generation, error\)/u);
  assert.match(source, /WEBKIT \? startWebKitEngine\(\)/u);
  assert.match(source, /webkit-direct-wasm-no-simd->direct-module-worker-wasm-no-simd->direct-wasm-no-simd-last-resort/u);
  assert.doesNotMatch(source, /Tesseract|tesseract/u);
});
''', encoding='utf-8')
