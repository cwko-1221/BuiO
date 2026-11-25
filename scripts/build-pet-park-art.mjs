import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const sources = path.resolve('artifacts/park-art/wish-plaza-v1');
const output = path.resolve('pet-app/public/assets/art/park/wish-plaza-v1');
await fs.mkdir(output, { recursive: true });
const sizes = { ground: 1536, fountain: 860, tree: 900, bear: 384, board: 512, bench: 640, chime: 448, drum: 384, bell: 448 };
const assets = {};
for (const [key, size] of Object.entries(sizes)) {
  const source = path.join(sources, `${key}-source.png`);
  const metadata = await sharp(source).metadata();
  if (key !== 'ground' && !metadata.hasAlpha) throw new Error(`${key} must retain generated transparency`);
  // Only pack/resize the generated art; the untouched masters remain in sources.
  let pipeline = sharp(source);
  if (key !== 'ground') pipeline = pipeline.trim({ background: '#00000000', threshold: 2 });
  const buffer = await pipeline.resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: key === 'ground' ? 93 : 91, alphaQuality: 100, effort: 6 }).toBuffer();
  // Published artwork routes require content hashes, which also make long-lived
  // classroom browser caches safe when a later art revision is shipped.
  const file = `${key}-v1-${createHash('sha256').update(buffer).digest('hex').slice(0, 12)}.webp`;
  await fs.writeFile(path.join(output, file), buffer);
  const packed = await sharp(path.join(output, file)).metadata();
  assets[key] = { file, width: packed.width, height: packed.height, bytes: (await fs.stat(path.join(output, file))).size };
}
await fs.writeFile(path.resolve('pet-app/src/park/wish-plaza-assets.json'), JSON.stringify({ version: 1, assets }, null, 2) + '\n');
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({ version: 1, generator: 'Built-in ImageGen; Sharp packing only', assets }, null, 2) + '\n');
console.log(JSON.stringify({ assets: Object.keys(assets).length, bytes: Object.values(assets).reduce((sum, a) => sum + a.bytes, 0), output }));
