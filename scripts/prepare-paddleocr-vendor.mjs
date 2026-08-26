import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetRoot = path.join(root, 'public', 'vendor', 'paddleocr');
const depsRoot = path.join(targetRoot, 'deps');
const ortRoot = path.join(targetRoot, 'ort');
const modelsRoot = path.join(targetRoot, 'models');

const PADDLE_VERSION = '0.4.2';
const ORT_VERSION = '1.22.0';
const SDK_ESM_URL = `https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@${PADDLE_VERSION}/+esm`;
const SDK_DIST_URL = `https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@${PADDLE_VERSION}/dist/index.mjs`;
const JSDELIVR_ORIGIN = 'https://cdn.jsdelivr.net';
const MODEL_BASE = 'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0';
const MODEL_FILES = [
  'PP-OCRv5_mobile_det_onnx_infer.tar',
  'PP-OCRv5_mobile_rec_onnx_infer.tar'
];
// onnxruntime-web 1.22's browser ESM may choose the JSEP build even when
// inference is requested through the WASM backend. Keep both the baseline and
// JSEP module/binary pairs same-origin so browser capability differences never
// reintroduce an external runtime fetch or a 404.
const ORT_FILES = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm'
];

const moduleMap = new Map();
let dependencyCounter = 0;

async function fetchResponse(url, { timeoutMs = 120000, attempts = 3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 750 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError?.message || lastError}`);
}

async function fetchText(url) {
  const response = await fetchResponse(url);
  return response.text();
}

async function fetchBinary(url, minBytes = 1) {
  const response = await fetchResponse(url, { timeoutMs: 180000 });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength < minBytes) throw new Error(`Fetched asset is unexpectedly small: ${url} (${bytes.byteLength} bytes)`);
  return bytes;
}

function collectModuleSpecifiers(source) {
  const values = new Set();
  const patterns = [
    /\bimport\s*(?:[^"'()]*?\s+from\s*)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bexport\s+[^"']*?\s+from\s*["']([^"']+)["']/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) values.add(match[1]);
  }
  return [...values];
}

function normalizeRemoteModule(specifier, baseUrl) {
  if (/^https:\/\/cdn\.jsdelivr\.net\/npm\//.test(specifier)) return specifier;
  if (specifier.startsWith('/npm/')) return new URL(specifier, JSDELIVR_ORIGIN).href;
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && baseUrl.startsWith(`${JSDELIVR_ORIGIN}/npm/`)) {
    return new URL(specifier, baseUrl).href;
  }
  return null;
}

function relativeModuleSpecifier(fromRelativePath, toRelativePath) {
  let relative = path.posix.relative(path.posix.dirname(fromRelativePath), toRelativePath);
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return relative;
}

async function mirrorEsmModule(remoteUrl, relativePath) {
  const canonical = new URL(remoteUrl).href;
  const existing = moduleMap.get(canonical);
  if (existing) return existing;
  moduleMap.set(canonical, relativePath);

  let source = await fetchText(canonical);
  const specifiers = collectModuleSpecifiers(source);
  for (const specifier of specifiers) {
    const remoteDependency = normalizeRemoteModule(specifier, canonical);
    if (remoteDependency) {
      let dependencyPath = moduleMap.get(remoteDependency);
      if (!dependencyPath) {
        dependencyCounter += 1;
        dependencyPath = `deps/dep-${String(dependencyCounter).padStart(3, '0')}.mjs`;
        await mirrorEsmModule(remoteDependency, dependencyPath);
      }
      const localSpecifier = relativeModuleSpecifier(relativePath, dependencyPath);
      source = source.split(specifier).join(localSpecifier);
      continue;
    }
    if (/^(?:[A-Za-z@][^:]*|#)/.test(specifier) && !specifier.startsWith('data:')) {
      throw new Error(`Browser ESM mirror retained unresolved bare import ${JSON.stringify(specifier)} in ${canonical}`);
    }
  }

  const remainingImports = collectModuleSpecifiers(source).filter(specifier =>
    specifier.includes('cdn.jsdelivr.net') || specifier.startsWith('/npm/')
  );
  if (remainingImports.length) {
    throw new Error(`Browser ESM mirror retained external imports in ${canonical}: ${remainingImports.join(', ')}`);
  }

  const target = path.join(targetRoot, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, source, 'utf8');
  return relativePath;
}

async function prepareSdkAndWorker() {
  await mirrorEsmModule(SDK_ESM_URL, 'sdk.mjs');

  const rawDist = await fetchText(SDK_DIST_URL);
  const workerMatch = rawDist.match(/["'](\.\/assets\/worker-entry-[^"']+\.js)["']/);
  if (!workerMatch?.[1]) throw new Error('Unable to resolve PaddleOCR worker asset from pinned dist/index.mjs');
  const workerUrl = new URL(workerMatch[1], SDK_DIST_URL).href;
  const workerSource = await fetchText(workerUrl);
  if (workerSource.length < 100000) throw new Error(`PaddleOCR worker bundle is unexpectedly small (${workerSource.length} chars)`);
  await fs.writeFile(path.join(targetRoot, 'worker.js'), workerSource, 'utf8');
}

async function prepareOrt() {
  await fs.mkdir(ortRoot, { recursive: true });
  for (const file of ORT_FILES) {
    const url = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/${file}`;
    const minBytes = file.endsWith('.wasm') ? 5_000_000 : 10_000;
    await fs.writeFile(path.join(ortRoot, file), await fetchBinary(url, minBytes));
  }
}

async function prepareModels() {
  await fs.mkdir(modelsRoot, { recursive: true });
  for (const file of MODEL_FILES) {
    const url = `${MODEL_BASE}/${file}`;
    await fs.writeFile(path.join(modelsRoot, file), await fetchBinary(url, 1_000_000));
  }
}

await fs.rm(targetRoot, { recursive: true, force: true });
await Promise.all([
  fs.mkdir(depsRoot, { recursive: true }),
  fs.mkdir(ortRoot, { recursive: true }),
  fs.mkdir(modelsRoot, { recursive: true })
]);

await prepareSdkAndWorker();
await Promise.all([prepareOrt(), prepareModels()]);

const manifest = {
  runtime: 'self-hosted',
  paddleVersion: PADDLE_VERSION,
  ortVersion: ORT_VERSION,
  sdk: 'sdk.mjs',
  worker: 'worker.js',
  ort: ORT_FILES,
  models: MODEL_FILES,
  mirroredEsmModules: moduleMap.size,
  generatedAt: new Date().toISOString()
};
await fs.writeFile(path.join(targetRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Vendored PP-OCR runtime -> ${path.relative(root, targetRoot)} (${moduleMap.size} ESM modules)`);
