import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const source = require.resolve('jsqr/dist/jsQR.js');
const targetDir = path.join(root, 'public', 'vendor', 'jsqr');
const target = path.join(targetDir, 'jsQR.js');

if (!fs.existsSync(source)) throw new Error(`jsQR runtime not installed: ${source}`);
fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log(`Vendored jsQR -> ${path.relative(root, target)}`);

await import('./prepare-paddleocr-vendor.mjs');
