/** Generate one quiet, square overscan texture for every room theme. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { catalog } = require('../pet-app/lib/catalog');
const [inputPath = 'pet-app/art-source/imagegen/room-backdrops/neutral-linen-plaster-v1.png'] = process.argv.slice(2);
const SIZE = 2048;
const outputRoot = path.resolve('pet-app/public/assets/art/room-backdrops');
const proofRoot = path.resolve('artifacts/pet-room-backdrops');

const texture = await sharp(inputPath)
  .resize(SIZE, SIZE, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
  .grayscale()
  .raw()
  .toBuffer({ resolveWithObject: true });
const values = texture.data;
let mean = 0;
for (const value of values) mean += value;
mean /= values.length;

const hex = (value) => {
  const clean = value.replace('#', '');
  return [0, 2, 4].map((at) => Number.parseInt(clean.slice(at, at + 2), 16));
};
const mix = (a, b, amount) => a.map((value, index) => value * (1 - amount) + b[index] * amount);
const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
const outputs = [];
await fs.mkdir(outputRoot, { recursive: true });
await fs.mkdir(proofRoot, { recursive: true });

for (const room of catalog.rooms) {
  const primary = hex(room.primary);
  const accent = hex(room.accent);
  const pixels = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const pixel = y * SIZE + x;
      const textureOffset = Math.max(-11, Math.min(11, (values[pixel] - mean) * 0.34));
      // A broad colour drift keeps large iPad bars from reading as a flat fill, while the image
      // generated linen/plaster remains the only fine pattern.
      const broad = 0.10 + 0.07 * (x / (SIZE - 1)) + 0.04 * (1 - y / (SIZE - 1));
      const themed = mix(primary, accent, broad);
      const softened = mix(themed, [245, 240, 231], room.id === 'space-pod' || room.id === 'moon-magic-attic' ? 0.08 : 0.13);
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[pixel * 3 + channel] = clamp(softened[channel] + textureOffset);
      }
    }
  }

  const fileName = new URL(room.backdrop, 'https://local.invalid').pathname.split('/').pop();
  const outputPath = path.join(outputRoot, fileName);
  await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .webp({ quality: 88, effort: 5 })
    .toFile(outputPath);
  const stat = await fs.stat(outputPath);
  outputs.push({ id: room.id, primary: room.primary, accent: room.accent, publicUrl: room.backdrop, outputPath, bytes: stat.size });
}

const thumbs = await Promise.all(outputs.map(({ outputPath }) => sharp(outputPath).resize(240, 240).toBuffer()));
await sharp({ create: { width: 1200, height: 480, channels: 3, background: '#ffffff' } })
  .composite(thumbs.map((input, index) => ({ input, left: (index % 5) * 240, top: Math.floor(index / 5) * 240 })))
  .png()
  .toFile(path.join(proofRoot, 'all-room-backdrops.png'));
await fs.writeFile(path.join(proofRoot, 'room-backdrops.json'), `${JSON.stringify({ source: inputPath, size: [SIZE, SIZE], outputs }, null, 2)}\n`);
console.log(JSON.stringify({ count: outputs.length, size: [SIZE, SIZE], proof: path.join(proofRoot, 'all-room-backdrops.png') }, null, 2));
