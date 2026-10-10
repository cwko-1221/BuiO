import fs from 'node:fs/promises';
import path from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
const root = path.resolve(import.meta.dirname, '..');
const folders = ['src', 'shared/i18n', 'report-app/js', 'report-app/css', 'buzzer-app/public',
  'math-app/public/js', 'math-app/public/css', 'multiplication-app/public/js', 'multiplication-app/public/css',
  'chinese-app/public/js', 'chinese-app/public/css', 'english-app/public/js', 'english-app/public/css',
  'phonics-app/public/js', 'phonics-app/public/css', 'homework-app/public/js', 'homework-app/public/css',
  'game-app/public/js', 'game-app/public/css', 'tower-defense-app/public/js', 'tower-defense-app/public/css',
  'whiteboard-app/client/dist/assets', 'science-lab-app/dist/assets', 'pet-app/dist/assets'];
let files = 0, before = 0, after = 0;
async function compress(file) {
  if (!/\.(js|css|json|svg|wasm)$/.test(file)) return;
  const input = await fs.readFile(file);
  if (input.length < 1024) return;
  let br = brotliCompressSync(input, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } });
  const previous = await fs.stat(file + '.br').catch(() => null);
  if (previous && previous.size < br.length && previous.mtimeMs >= (await fs.stat(file)).mtimeMs) br = await fs.readFile(file + '.br');
  const gz = gzipSync(input, { level: 6 });
  if (br.length < input.length) await fs.writeFile(file + '.br', br);
  if (gz.length < input.length) await fs.writeFile(file + '.gz', gz);
  files++; before += input.length; after += Math.min(input.length, br.length);
}
async function walk(folder) {
  for (const entry of await fs.readdir(folder, { withFileTypes: true }).catch(() => [])) {
    if (entry.name.startsWith('.')) continue;
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) await walk(file); else if (entry.isFile()) await compress(file);
  }
}
for (const folder of folders) await walk(path.join(root, folder));
for (const file of ['shared/i18n.js', 'shared/reliable-request.js', 'node_modules/phaser/dist/phaser.min.js', 'node_modules/exceljs/dist/exceljs.min.js']) await compress(path.join(root, file));
console.log(JSON.stringify({ files, originalBytes: before, brotliBytes: after }));
