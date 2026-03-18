/**
 * Copy ONNX Runtime Web WASM files to public/ so they are served
 * at the root path and can be loaded by the inference engine.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'node_modules', 'onnxruntime-web', 'dist');
const dest = resolve(root, 'public');

if (!existsSync(src)) {
  console.log('[sync-onnx] onnxruntime-web not installed yet — skipping.');
  process.exit(0);
}

if (!existsSync(dest)) {
  mkdirSync(dest, { recursive: true });
}

const wasmFiles = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.asyncify.mjs',
];

let copied = 0;
for (const file of wasmFiles) {
  const srcFile = resolve(src, file);
  if (existsSync(srcFile)) {
    cpSync(srcFile, resolve(dest, file));
    copied++;
  }
}

console.log(`[sync-onnx] Copied ${copied} ONNX Runtime assets to public/`);
