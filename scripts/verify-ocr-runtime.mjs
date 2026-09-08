import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/vendor/paddleocr'));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
if (manifest.runtime !== 'self-hosted' || manifest.paddleVersion !== '0.4.2' || manifest.ortVersion !== '1.22.0') {
  throw new Error('Unexpected PP-OCR runtime identity');
}
const required = new Map([
  ['sdk.mjs', 10000], ['worker.js', 100000], ['roi-worker.js', 1000],
  ['models/PP-OCRv5_mobile_det_onnx_infer.tar', 1000000],
  ['models/PP-OCRv5_mobile_rec_onnx_infer.tar', 1000000],
  ['ort/ort-wasm-simd-threaded.mjs', 10000],
  ['ort/ort-wasm-simd-threaded.wasm', 5000000],
  ['ort/ort-wasm-simd-threaded.jsep.mjs', 10000],
  ['ort/ort-wasm-simd-threaded.jsep.wasm', 5000000]
]);
for (const [relative, minimum] of required) {
  const bytes = await fs.readFile(path.join(root, relative));
  if (bytes.length < minimum) throw new Error(`Missing/truncated OCR asset: ${relative}`);
  if (relative.endsWith('.wasm') && !bytes.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) {
    throw new Error(`Invalid WASM asset: ${relative}`);
  }
  if (relative === 'worker.js') {
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== manifest.workerBytes || hash !== manifest.workerSha256) {
      throw new Error('PP-OCR Worker decoded bytes/SHA-256 do not match manifest');
    }
  }
}
// Every locally mirrored ESM import must resolve before an artifact is accepted.
const modules = ['sdk.mjs', ...(await fs.readdir(path.join(root, 'deps'))).filter(name => name.endsWith('.mjs')).map(name => `deps/${name}`)];
for (const relative of modules) {
  const source = await fs.readFile(path.join(root, relative), 'utf8');
  for (const match of source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (/^(https?:|\/npm\/)/.test(specifier)) throw new Error(`External OCR import: ${specifier}`);
    if (specifier.startsWith('.')) await fs.access(path.resolve(root, path.dirname(relative), specifier));
  }
}
console.log(`Verified PP-OCRv5 runtime: ${required.size} required assets, ${modules.length} modules, Worker SHA-256 ${manifest.workerSha256}`);
