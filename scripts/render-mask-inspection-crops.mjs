/** Render 4x cell crops on a magenta review background without editing source pixels. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [inputPath, outputDirectory, prefix = 'cell'] = process.argv.slice(2);
if (!inputPath || !outputDirectory) {
  console.error('usage: node scripts/render-mask-inspection-crops.mjs <800x640-image> <output-dir> [prefix]');
  process.exit(1);
}

const image = sharp(inputPath).ensureAlpha();
const metadata = await image.metadata();
if (metadata.width !== 800 || metadata.height !== 640) {
  throw new Error(`${inputPath} must be 800x640`);
}
await fs.mkdir(outputDirectory, { recursive: true });
for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const outputPath = path.join(outputDirectory, `${prefix}-r${row}c${column}-4x-magenta.png`);
    await sharp(inputPath)
      .ensureAlpha()
      .extract({ left: column * 160, top: row * 160, width: 160, height: 160 })
      .resize(640, 640, { kernel: 'nearest' })
      .flatten({ background: { r: 255, g: 0, b: 255 } })
      .png({ compressionLevel: 9 })
      .toFile(outputPath);
  }
}
console.log(JSON.stringify({ inputPath, outputDirectory, prefix, transformedSource: false, reviewScale: 4 }, null, 2));
