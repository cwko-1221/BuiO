// Package the selected, continuous ImageGen terrain without redrawing it.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
const source = path.resolve('artifacts/park-art/storybook-v3/terrain-detail-source.png');
const destination = path.resolve('pet-app/public/assets/art/park/storybook-v3');
await fs.mkdir(destination, { recursive: true });
const image = sharp(source), metadata = await image.metadata();
const buffer = await image.webp({ quality: 96, effort: 6 }).toBuffer();
const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);
const file = `garden-terrain-${hash}.webp`;
await fs.writeFile(path.join(destination, file), buffer);
const manifest = { version: 'storybook-v3', source: 'Built-in ImageGen; see artifacts/park-art/storybook-v3', assets: { terrain: { file, width: metadata.width, height: metadata.height } } };
await fs.writeFile('pet-app/src/park/storybook-art-assets.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ file, bytes: buffer.length, width: metadata.width, height: metadata.height }));
