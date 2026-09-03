/**
 * Put the three pictures side by side that say whether a baked accessory is right.
 *
 * The bake already asserts the arithmetic: inside the mask the composite equals the redraw, pixel
 * for pixel. What that cannot say is whether the mask cut round the right thing — a mask that took
 * the creature's cheek with the collar passes the arithmetic perfectly. So the original, the
 * composite and the redraw are set out together, and under them the mask alone on a flat colour,
 * where a hole or a stray whisker of fur has nowhere to hide.
 *
 *   node scripts/proof-baked-wearable.mjs <base.png> <layer.png>
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [baseFile, layerFile] = process.argv.slice(2);
if (!baseFile || !layerFile) {
  console.error('usage: node scripts/proof-baked-wearable.mjs <base.png> <layer.png>');
  process.exit(1);
}

const dir = path.dirname(layerFile);
const stem = path.basename(layerFile).replace(/-layer\.png$/, '');
const dressedFile = path.join(dir, `${stem}-dressed.png`);
const redrawFile = path.join(dir, `${stem}.png`);

const TILE = 620;
const LABEL = 30;
const FLOOR = { r: 122, g: 104, b: 92, alpha: 1 };

const on = async (file, background) => sharp({ create: { width: TILE, height: TILE, channels: 4, background } })
  .composite([{ input: await sharp(file).resize(TILE, TILE, { fit: 'fill' }).png().toBuffer() }])
  .png().toBuffer();

const caption = (text, colour) => Buffer.from(
  `<svg width="${TILE}" height="${LABEL}"><rect width="100%" height="100%" fill="#101014"/>`
  + `<text x="8" y="21" font-family="Arial" font-size="17" fill="${colour}">${text}</text></svg>`,
);

// A flat mid colour behind the composite is the point of the proof: it is roughly what a bedroom
// floor is, and anything the mask left see-through shows up on it at once.
const row = [
  ['original', await on(baseFile, FLOOR), '#cbd5e1'],
  ['composite: original + baked layer', await on(dressedFile, FLOOR), '#7CFC00'],
  ['redraw the layer was lifted from', await on(redrawFile, FLOOR), '#cbd5e1'],
  ['the baked layer alone', await on(layerFile, { r: 26, g: 26, b: 30, alpha: 1 }), '#facc15'],
];

const layers = [];
row.forEach(([text, image, colour], index) => {
  layers.push({ input: caption(text, colour), left: index * (TILE + 8), top: 0 });
  layers.push({ input: image, left: index * (TILE + 8), top: LABEL });
});

const out = path.join(dir, `${stem}-proof.png`);
await sharp({
  create: {
    width: row.length * (TILE + 8) - 8, height: TILE + LABEL, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 1 },
  },
}).composite(layers).png().toFile(out);
await fs.access(out);
console.log(out);
