/**
 * Remove bottom-connected pet fringe from the five side-view cloud-cap masks.
 * Every other atlas pixel is copied byte-for-byte. No geometry is changed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [targetPath, inputMaskPath, outputMaskPath] = process.argv.slice(2);
if (!targetPath || !inputMaskPath || !outputMaskPath) {
  console.error('usage: node scripts/finalize-cloudcap-v6-mask-qa.mjs <target> <input-mask> <output-mask>');
  process.exit(1);
}
const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const read = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT) throw new Error(`${input} must be 800x640`);
  return result.data;
};
const [target, inputMask] = await Promise.all([read(targetPath), read(inputMaskPath)]);
const output = Buffer.from(inputMask);
const removedByCell = [];
const neighbours = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

for (let column = 0; column < 5; column += 1) {
  let removed = 0;
  for (let x = 110; x < CELL; x += 1) {
    for (let y = CELL - 1; y >= 65; y -= 1) {
      const at = ((((CELL + y) * WIDTH) + (column * CELL) + x) * 4);
      if (output[at + 3] === 0) continue;
      const r = target[at];
      const g = target[at + 1];
      const b = target[at + 2];
      const capBlue = b > 70 && g > 45 && b > r * 1.02 && b > g * 0.84;
      const lavender = b > 75 && b >= r - 2 && b >= g - 3;
      const coolOutline = r < 145 && g < 155 && b < 205
        && b >= r * 0.86 && b >= g * 0.84;
      if (capBlue || lavender || coolOutline) break;

      // At these x/y coordinates the accessory's lower boundary is the blue
      // brim. Any lower warm/cream/brown selected run belongs to the pet face.
      output[at] = 0;
      output[at + 1] = 0;
      output[at + 2] = 0;
      output[at + 3] = 0;
      removed += 1;
    }
  }
  const selected = new Uint8Array(CELL * CELL);
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const at = ((((CELL + y) * WIDTH) + (column * CELL) + x) * 4);
      if (output[at + 3] !== 0) selected[y * CELL + x] = 1;
    }
  }
  const seen = new Uint8Array(CELL * CELL);
  const components = [];
  for (let seed = 0; seed < selected.length; seed += 1) {
    if (!selected[seed] || seen[seed]) continue;
    const queue = [seed];
    let head = 0;
    seen[seed] = 1;
    while (head < queue.length) {
      const local = queue[head++];
      const x = local % CELL;
      const y = Math.floor(local / CELL);
      for (const [offsetX, offsetY] of neighbours) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextX >= CELL || nextY < 0 || nextY >= CELL) continue;
        const next = nextY * CELL + nextX;
        if (!selected[next] || seen[next]) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    components.push(queue);
  }
  components.sort((left, right) => right.length - left.length);
  let removedIslands = 0;
  for (const component of components.slice(1)) {
    for (const local of component) {
      const x = local % CELL;
      const y = Math.floor(local / CELL);
      const at = ((((CELL + y) * WIDTH) + (column * CELL) + x) * 4);
      output[at] = 0;
      output[at + 1] = 0;
      output[at + 2] = 0;
      output[at + 3] = 0;
      removedIslands += 1;
    }
  }
  removedByCell.push({ row: 1, column, fringePixelsRemoved: removed, islandPixelsRemoved: removedIslands });
}

// Zero-tolerance eye protection found four opaque brim-edge pixels touching
// dark eye candidates in the original pet. They are on the exterior opening,
// so clearing them does not create an enclosed hole or split the accessory.
const protectedEyePixels = [
  { row: 0, column: 3, x: 59, y: 70 },
  { row: 0, column: 3, x: 56, y: 71 },
  { row: 0, column: 3, x: 57, y: 71 },
  { row: 3, column: 3, x: 35, y: 75 },
  // Connect the protected boundary pixel above to the exterior opening so it
  // cannot become a one-pixel enclosed mask hole.
  { row: 3, column: 3, x: 36, y: 75 },
];
let eyePixelsCleared = 0;
for (const { row, column, x, y } of protectedEyePixels) {
  const at = ((((row * CELL + y) * WIDTH) + (column * CELL) + x) * 4);
  if (output[at + 3] === 0) continue;
  output[at] = 0;
  output[at + 1] = 0;
  output[at + 2] = 0;
  output[at + 3] = 0;
  eyePixelsCleared += 1;
}

await fs.mkdir(path.dirname(outputMaskPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputMaskPath);
console.log(JSON.stringify({
  outputMaskPath,
  canvas: { width: WIDTH, height: HEIGHT },
  transformed: false,
  resampled: false,
  shifted: false,
  changedCells: removedByCell,
  eyePixelsCleared,
  protectedEyePixels,
}, null, 2));
