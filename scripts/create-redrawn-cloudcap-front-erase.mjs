/** Create the anatomical ear erase mask for the enclosed starpatch-cat cloud cap. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [outputPath] = process.argv.slice(2);
if (!outputPath) {
  console.error('usage: node scripts/create-redrawn-cloudcap-front-erase.mjs <output-mask>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const output = Buffer.alloc(WIDTH * HEIGHT * 4);

const insideTriangle = (x, y, [a, b, c]) => {
  const sign = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const point = [x, y];
  const d1 = sign(point, a, b);
  const d2 = sign(point, b, c);
  const d3 = sign(point, c, a);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
};

const frontEars = [
  [[37, 17], [72, 78], [18, 78]],
  [[124, 17], [142, 78], [87, 78]],
  [[47, 17], [66, 54], [27, 54]],
  [[113, 17], [132, 54], [94, 54]],
];
const sideEar = [
  [[105, 16], [82, 74], [128, 74]],
];
const rearEars = [
  [[42, 12], [73, 76], [18, 76]],
  [[119, 12], [143, 76], [87, 76]],
  [[47, 12], [70, 61], [25, 61]],
  [[113, 12], [137, 61], [90, 61]],
];
const specialEars = {
  0: [
    [[39, 50], [71, 99], [22, 99]],
    [[120, 50], [138, 99], [87, 99]],
    [[47, 48], [68, 78], [27, 78]],
    [[113, 48], [134, 78], [92, 78]],
  ],
  1: [
    [[37, 22], [73, 79], [19, 79]],
    [[124, 22], [140, 79], [86, 79]],
    [[47, 20], [68, 56], [26, 56]],
    [[113, 20], [134, 56], [92, 56]],
  ],
  // The sleeping cap is intentionally tilted and leaves one continuous ear visible. Keeping the
  // original ear is anatomically correct; erasing it would create a triangular hole below the brim.
  2: [],
  3: frontEars,
  4: frontEars,
};

const trianglesFor = (row, column) => {
  if (row === 0) return frontEars;
  if (row === 1) return sideEar;
  if (row === 2) return rearEars;
  return specialEars[column];
};

const stats = [];
for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const triangles = trianglesFor(row, column);
    let pixels = 0;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        if (!triangles.some((triangle) => insideTriangle(x + 0.5, y + 0.5, triangle))) continue;
        const at = ((row * CELL + y) * WIDTH + column * CELL + x) * 4;
        output[at] = 255;
        output[at + 1] = 255;
        output[at + 2] = 255;
        output[at + 3] = 255;
        pixels += 1;
      }
    }
    stats.push({ row, column, pixels });
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ outputPath, stats }, null, 2));
