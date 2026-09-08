from pathlib import Path

path = Path('src/recognition-paddle-ocr.js')
s = path.read_text(encoding='utf-8')


def once(old: str, new: str) -> None:
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'expected exactly one match, got {count}: {old[:120]!r}')
    s = s.replace(old, new, 1)


once("const VERSION = '0.4.10';", "const VERSION = '0.4.11';")

once(
    "const MEMORY_FALLBACK_SESSION_KEY = 'luckybean.ppocr.low-memory.v2';\nconst MEMORY_WORKER_RECLAIM_DELAY_MS = 350;",
    "const MEMORY_FALLBACK_SESSION_KEY = 'luckybean.ppocr.low-memory.v2';\nconst COMPATIBILITY_FALLBACK_SESSION_KEY = 'luckybean.ppocr.runtime-compat.v1';\nconst MEMORY_WORKER_RECLAIM_DELAY_MS = 350;",
)
once(
    "function hasRememberedMemoryConstraint() {\n  try { return globalThis.sessionStorage?.getItem(MEMORY_FALLBACK_SESSION_KEY) === '1'; } catch { return false; }\n}\n",
    "function hasRememberedMemoryConstraint() {\n  try { return globalThis.sessionStorage?.getItem(MEMORY_FALLBACK_SESSION_KEY) === '1'; } catch { return false; }\n}\nfunction hasRememberedRuntimeCompatibilityConstraint() {\n  try { return globalThis.sessionStorage?.getItem(COMPATIBILITY_FALLBACK_SESSION_KEY) === '1'; } catch { return false; }\n}\n",
)
once(
    "let memoryConstrained = LOW_MEMORY || hasRememberedMemoryConstraint();\nconst activeModuleWorkers = new Set();",
    "let memoryConstrained = LOW_MEMORY || hasRememberedMemoryConstraint();\nlet runtimeCompatibilityConstrained = hasRememberedRuntimeCompatibilityConstraint();\nconst activeModuleWorkers = new Set();",
)
once(
    "function rememberMemoryConstraint() {\n  memoryConstrained = true;\n  try { globalThis.sessionStorage?.setItem(MEMORY_FALLBACK_SESSION_KEY, '1'); } catch {}\n}\n",
    "function rememberMemoryConstraint() {\n  memoryConstrained = true;\n  try { globalThis.sessionStorage?.setItem(MEMORY_FALLBACK_SESSION_KEY, '1'); } catch {}\n}\nfunction rememberRuntimeCompatibilityConstraint() {\n  runtimeCompatibilityConstrained = true;\n  try { globalThis.sessionStorage?.setItem(COMPATIBILITY_FALLBACK_SESSION_KEY, '1'); } catch {}\n}\n",
)
once(
    "function isWasmMemoryAllocationFailure(error) {\n  const message = String(error?.message || error || '');\n  return /WebAssembly\\.Memory\\(\\).*could not allocate memory|could not allocate memory|(?:WebAssembly|WASM).*out of memory|memory allocation failed|RangeError:.*WebAssembly\\.Memory/iu.test(message);\n}\nasync function createCompatibilityEngine() {",
    "function isWasmMemoryAllocationFailure(error) {\n  const message = String(error?.message || error || '');\n  return /WebAssembly\\.Memory\\(\\).*could not allocate memory|could not allocate memory|(?:WebAssembly|WASM).*out of memory|memory allocation failed|RangeError:.*WebAssembly\\.Memory/iu.test(message);\n}\nfunction isOnnxSessionCreationFailure(error) {\n  const message = String(error?.message || error || '');\n  return /Failed to create ONNX session|Failed to create (?:an )?(?:ONNX )?InferenceSession|InferenceSession.*(?:create|initializ(?:e|ation)).*(?:fail|error)|No available adapters/iu.test(message);\n}\nasync function createCompatibilityEngine() {",
)
once(
    "if (!isWasmMemoryAllocationFailure(workerRetryError) && !isOpaqueWorkerStartupFailure(workerRetryError)) throw workerRetryError;",
    "if (!isWasmMemoryAllocationFailure(workerRetryError) && !isOpaqueWorkerStartupFailure(workerRetryError) && !isOnnxSessionCreationFailure(workerRetryError)) throw workerRetryError;",
)
once(
    "throw new Error(`PP-OCRv5 在低内存 Worker 与主线程兼容模式下均无法分配内存：${mainThreadError?.message || mainThreadError}`);",
    "throw new Error(`PP-OCRv5 在低内存 Worker 与主线程兼容模式下均无法初始化：${mainThreadError?.message || mainThreadError}`);",
)

once(
    "async function startRememberedMemoryEngine() {\n  const generation = ++engineGeneration;\n  return startMemoryCompatibilityEngine(generation, new Error('当前会话已记录 PP-OCRv5 WASM 内存受限'));\n}\nasync function startWorkerEngine() {",
    """async function startRememberedMemoryEngine() {
  const generation = ++engineGeneration;
  return startMemoryCompatibilityEngine(generation, new Error('当前会话已记录 PP-OCRv5 WASM 内存受限'));
}
async function startSessionCompatibilityEngine(generation, failure) {
  if (generation !== engineGeneration) throw failure;
  const retryStarted = diagnosticNow();
  rememberRuntimeCompatibilityConstraint();
  terminateModuleWorkers();
  releaseWorkerBundle();
  workerBootstrapMode = 'direct-module-no-simd-session-retry';
  engineMode = 'worker-direct-module-no-simd-session-compat';
  emit('PP-OCRv5 ONNX session 创建失败，正在以同一模型的单线程无 SIMD WASM 兼容模式重试', 10);
  recordDiagnostic('onnx-session-retry', retryStarted, { reason:String(failure?.message || failure), to:engineMode, deviceMemory:DEVICE_MEMORY_GB || null });
  await delay(MEMORY_WORKER_RECLAIM_DELAY_MS);

  let raw = createLowMemoryWorkerEngine();
  try {
    const ocr = await withTimeout(raw, ENGINE_INIT_TIMEOUT_MS, 'PP-OCRv5 无 SIMD Worker 兼容模式初始化超时', terminateModuleWorkers);
    if (generation !== engineGeneration) { disposeInstance(ocr); throw new Error('PP-OCRv5 无 SIMD Worker 兼容模式结果已失效，请重新识别'); }
    recordDiagnostic('onnx-session-worker-retry-success', retryStarted, { mode:engineMode });
    return ocr;
  } catch (workerRetryError) {
    raw.then(ocr => { if (generation !== engineGeneration) disposeInstance(ocr); }).catch(() => {});
    terminateModuleWorkers();
    recordDiagnostic('onnx-session-worker-retry-failed', retryStarted, { message:String(workerRetryError?.message || workerRetryError) });
    if (generation !== engineGeneration) throw workerRetryError;
    if (isWasmMemoryAllocationFailure(workerRetryError)) {
      return startMemoryCompatibilityEngine(generation, workerRetryError);
    }
    if (!isOnnxSessionCreationFailure(workerRetryError) && !isOpaqueWorkerStartupFailure(workerRetryError)) throw workerRetryError;

    workerBootstrapMode = 'direct-wasm-no-simd-session-last-resort';
    engineMode = 'direct-wasm-no-simd-session-last-resort';
    emit('PP-OCRv5 无 SIMD Worker 仍无法建立 session，正在使用同一 PP-OCRv5 主线程 WASM 兼容模式', 12);
    await delay(MEMORY_MAIN_THREAD_RECLAIM_DELAY_MS);
    raw = createCompatibilityEngine();
    try {
      const ocr = await withTimeout(raw, ENGINE_INIT_TIMEOUT_MS, 'PP-OCRv5 主线程 ONNX session 兼容模式初始化超时', () => {});
      if (generation !== engineGeneration) { disposeInstance(ocr); throw new Error('PP-OCRv5 主线程 ONNX session 兼容模式结果已失效，请重新识别'); }
      recordDiagnostic('onnx-session-main-thread-retry-success', retryStarted, { mode:engineMode });
      return ocr;
    } catch (mainThreadError) {
      raw.then(ocr => { if (generation !== engineGeneration) disposeInstance(ocr); }).catch(() => {});
      recordDiagnostic('onnx-session-main-thread-retry-failed', retryStarted, { message:String(mainThreadError?.message || mainThreadError) });
      throw new Error(`PP-OCRv5 在无 SIMD Worker 与主线程 WASM 兼容模式下均无法创建 ONNX session：${mainThreadError?.message || mainThreadError}`);
    }
  }
}
async function startRememberedSessionCompatibilityEngine() {
  const generation = ++engineGeneration;
  return startSessionCompatibilityEngine(generation, new Error('当前会话已记录 PP-OCRv5 ONNX runtime 兼容性约束'));
}
async function startWorkerEngine() {""",
)
once(
    "    if (isWasmMemoryAllocationFailure(error)) return startMemoryCompatibilityEngine(generation, error);\n    if (!isOpaqueWorkerStartupFailure(error)) throw error;",
    "    if (isWasmMemoryAllocationFailure(error)) return startMemoryCompatibilityEngine(generation, error);\n    if (isOnnxSessionCreationFailure(error)) return startSessionCompatibilityEngine(generation, error);\n    if (!isOpaqueWorkerStartupFailure(error)) throw error;",
)
once(
    "      if (generation === engineGeneration && isWasmMemoryAllocationFailure(retryError)) {\n        return startMemoryCompatibilityEngine(generation, retryError);\n      }\n      terminateModuleWorkers();",
    "      if (generation === engineGeneration && isWasmMemoryAllocationFailure(retryError)) {\n        return startMemoryCompatibilityEngine(generation, retryError);\n      }\n      if (generation === engineGeneration && isOnnxSessionCreationFailure(retryError)) {\n        return startSessionCompatibilityEngine(generation, retryError);\n      }\n      terminateModuleWorkers();",
)
once(
    "  emit(WEBKIT ? '正在按需准备 Safari 本地 OCR' : memoryConstrained ? '正在按低内存模式准备本地 PP-OCRv5' : '正在后台准备本地 PP-OCRv5 中文检测与识别模型', 7);\n  const pending = WEBKIT ? startCompatibilityEngine('webkit') : memoryConstrained ? startRememberedMemoryEngine() : startWorkerEngine();\n  const tracked = pending.then(ocr => {\n    emit(engineMode.includes('low-memory') ? 'PP-OCRv5 低内存兼容模式已就绪' : WEBKIT ? 'PP-OCRv5 Safari 兼容模式已就绪' : 'PP-OCRv5 Worker 中文模型已就绪', 18);\n    recordDiagnostic('runtime-init', diagnosticStarted, { mode:engineMode, webkit:WEBKIT, lowMemory:memoryConstrained, deviceMemory:DEVICE_MEMORY_GB || null, workerBootstrap:workerBootstrapMode });",
    "  emit(WEBKIT ? '正在按需准备 Safari 本地 OCR' : memoryConstrained ? '正在按低内存模式准备本地 PP-OCRv5' : runtimeCompatibilityConstrained ? '正在按 ONNX runtime 兼容模式准备本地 PP-OCRv5' : '正在后台准备本地 PP-OCRv5 中文检测与识别模型', 7);\n  const pending = WEBKIT ? startCompatibilityEngine('webkit') : memoryConstrained ? startRememberedMemoryEngine() : runtimeCompatibilityConstrained ? startRememberedSessionCompatibilityEngine() : startWorkerEngine();\n  const tracked = pending.then(ocr => {\n    emit(engineMode.includes('low-memory') ? 'PP-OCRv5 低内存兼容模式已就绪' : engineMode.includes('session') ? 'PP-OCRv5 ONNX runtime 兼容模式已就绪' : WEBKIT ? 'PP-OCRv5 Safari 兼容模式已就绪' : 'PP-OCRv5 Worker 中文模型已就绪', 18);\n    recordDiagnostic('runtime-init', diagnosticStarted, { mode:engineMode, webkit:WEBKIT, lowMemory:memoryConstrained, runtimeCompatibility:runtimeCompatibilityConstrained, deviceMemory:DEVICE_MEMORY_GB || null, workerBootstrap:workerBootstrapMode });",
)
once(
    "emit(WEBKIT ? 'Safari 本地 OCR 已在录入阶段预热' : memoryConstrained ? 'PP-OCRv5 低内存模式已在录入阶段预热' : 'PP-OCRv5 模型已在录入阶段预热', 18);",
    "emit(WEBKIT ? 'Safari 本地 OCR 已在录入阶段预热' : memoryConstrained ? 'PP-OCRv5 低内存模式已在录入阶段预热' : runtimeCompatibilityConstrained ? 'PP-OCRv5 ONNX runtime 兼容模式已在录入阶段预热' : 'PP-OCRv5 模型已在录入阶段预热', 18);",
)
once(
    "  version:VERSION, engine:ENGINE, get lowMemory() { return memoryConstrained; }, appleMobile:APPLE_MOBILE,\n  workerOnly:false, browserSafe:true, primaryIsolation:WEBKIT ? 'webkit-direct-wasm-no-simd' : 'module-worker', compatibilityFallback:'webkit-direct-wasm-no-simd',\n  memoryFallback:'direct-module-worker-wasm-no-simd-low-memory->direct-wasm-no-simd-last-resort',",
    "  version:VERSION, engine:ENGINE, get lowMemory() { return memoryConstrained; }, get runtimeCompatibility() { return runtimeCompatibilityConstrained; }, appleMobile:APPLE_MOBILE,\n  workerOnly:false, browserSafe:true, primaryIsolation:WEBKIT ? 'webkit-direct-wasm-no-simd' : 'module-worker', compatibilityFallback:'webkit-direct-wasm-no-simd',\n  memoryFallback:'direct-module-worker-wasm-no-simd-low-memory->direct-wasm-no-simd-last-resort',\n  sessionFallback:'onnx-session->direct-module-worker-wasm-no-simd->direct-wasm-no-simd-last-resort',",
)
once(
    'self-hosted-lazy-memory-bounded-reuse`;',
    'self-hosted-lazy-memory-bounded-runtime-compat-reuse`;'
)

path.write_text(s, encoding='utf-8')
print('patched', path, 'bytes=', len(s.encode('utf-8')))
