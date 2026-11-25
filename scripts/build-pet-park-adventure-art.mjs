import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
const sourceDir = path.resolve('artifacts/park-art/adventure-v2');
const outputDir = path.resolve('pet-app/public/assets/art/park/adventure-v2');
await fs.mkdir(outputDir, { recursive: true });
const prompts = JSON.parse(await fs.readFile(path.join(sourceDir, 'prompts.json'), 'utf8'));
const assets = {};
for (const item of prompts.assets) {
  const local = path.join(sourceDir, item.key + '.png');
  try { await fs.access(local); } catch { await fs.copyFile(item.source, local); }
  let img = sharp(local);
  if (item.key !== 'meadow') img = img.trim({ threshold: 2 });
  const buffer = await img.resize({ width: item.key === 'banana' ? 384 : item.key === 'meadow' ? 1024 : 640 }).webp({ quality: 87, alphaQuality: 100 }).toBuffer();
  const file = `${item.key}-${crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12)}.webp`;
  await fs.writeFile(path.join(outputDir, file), buffer);
  const meta = await sharp(buffer).metadata(); assets[item.key] = { file, width: meta.width, height: meta.height, bytes: buffer.length };
}
await fs.writeFile('pet-app/src/park/adventure-art-assets.json', JSON.stringify({ version: 2, assets }, null, 2) + '\n');
console.log(JSON.stringify(assets));
