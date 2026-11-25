import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const source = path.resolve('artifacts/park-art/full-park-v1');
const output = path.resolve('pet-app/public/assets/art/park/full-park-v1');
await fs.mkdir(output, { recursive: true });
const sizes = {
  'home-ground': 1536, 'garden-ground': 1536, 'forest-ground': 1536,
  grass: 512, paving: 512, house: 900, mailbox: 384,
  rabbit: 384, deer: 384, squirrel: 384,
  sunflowers: 640, tulips: 640, daisies: 640, pond: 800,
  apple: 768, hollow: 768, acorn: 192, litter: 192,
  mushrooms: 448, bush: 640, conifer: 768, log: 512,
  sign: 384, portal: 512,
};
const assets = {};
for (const [key, size] of Object.entries(sizes)) {
  const input = path.join(source, `${key}-source.png`);
  const opaque = key.endsWith('-ground') || ['grass', 'paving'].includes(key);
  const metadata = await sharp(input).metadata();
  if (!opaque && !metadata.hasAlpha) throw Error(`${key} requires actual transparency`);
  let pipeline = sharp(input);
  if (!opaque) pipeline = pipeline.trim({ background: '#00000000', threshold: 2 });
  const buffer = await pipeline.resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: opaque ? 93 : 91, alphaQuality: 100, effort: 6 }).toBuffer();
  const file = `${key}-v1-${createHash('sha256').update(buffer).digest('hex').slice(0, 12)}.webp`;
  await fs.writeFile(path.join(output, file), buffer);
  const packed = await sharp(buffer).metadata();
  assets[key] = { file, width: packed.width, height: packed.height, bytes: buffer.length };
}
const manifest = { version: 1, generator: 'Built-in ImageGen; Sharp packing only', assets };
await fs.writeFile(path.resolve('pet-app/src/park/world-art-assets.json'), JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ assets: Object.keys(assets).length, bytes: Object.values(assets).reduce((sum, a) => sum + a.bytes, 0), output }));
