/** Composite a base atlas with optional late erase and front layers for visual QA. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [basePath, frontPath, frontErasePath = '-', outputPath] = process.argv.slice(2);
if (!basePath || !frontPath || !outputPath) {
  console.error('usage: node scripts/compose-redrawn-layer-proof.mjs <base> <front> <front-erase|-> <output>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const read = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) throw new Error(`${input} must be 800x640`);
  return image;
};
const [base, front, erase] = await Promise.all([
  read(basePath),
  read(frontPath),
  frontErasePath === '-' ? null : read(frontErasePath),
]);

const proof = Buffer.alloc(WIDTH * HEIGHT * 4);
for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
  const at = pixel * 4;
  const eraseAlpha = erase ? erase.data[at + 3] / 255 : 0;
  const baseAlpha = (base.data[at + 3] / 255) * (1 - eraseAlpha);
  const frontAlpha = front.data[at + 3] / 255;
  const outputAlpha = frontAlpha + baseAlpha * (1 - frontAlpha);
  if (outputAlpha <= 0) continue;
  for (let channel = 0; channel < 3; channel += 1) {
    proof[at + channel] = Math.round(
      (front.data[at + channel] * frontAlpha + base.data[at + channel] * baseAlpha * (1 - frontAlpha)) / outputAlpha,
    );
  }
  proof[at + 3] = Math.round(outputAlpha * 255);
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(proof, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(outputPath);
