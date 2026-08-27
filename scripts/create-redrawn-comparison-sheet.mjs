/** Build the mandatory full-redraw vs mask-recomposition visual acceptance sheet. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [fullRedrawPath, recomposedPath, outputPath] = process.argv.slice(2);
if (!fullRedrawPath || !recomposedPath || !outputPath) {
  console.error('usage: node scripts/create-redrawn-comparison-sheet.mjs <full-redraw> <recomposed> <output>');
  process.exit(1);
}
const PANEL_WIDTH = 800;
const PANEL_HEIGHT = 640;
const HEADER = 54;
for (const input of [fullRedrawPath, recomposedPath]) {
  const metadata = await sharp(input).metadata();
  if (metadata.width !== PANEL_WIDTH || metadata.height !== PANEL_HEIGHT) throw new Error(`${input} must be 800x640`);
}
const header = Buffer.from(`
  <svg width="1600" height="54" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="54" fill="#111827"/>
    <text x="400" y="35" text-anchor="middle" fill="#f9fafb" font-family="Arial, sans-serif" font-size="22" font-weight="700">FULL REDRAW — TARGET</text>
    <text x="1200" y="35" text-anchor="middle" fill="#f9fafb" font-family="Arial, sans-serif" font-size="22" font-weight="700">MASK + ORIGINAL PET — MUST MATCH</text>
  </svg>
`);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp({ create: {
  width: PANEL_WIDTH * 2,
  height: PANEL_HEIGHT + HEADER,
  channels: 4,
  background: { r: 0, g: 0, b: 0, alpha: 1 },
} })
  .composite([
    { input: header, left: 0, top: 0 },
    { input: fullRedrawPath, left: 0, top: HEADER },
    { input: recomposedPath, left: PANEL_WIDTH, top: HEADER },
    { input: Buffer.from('<svg width="2" height="640"><rect width="2" height="640" fill="#f59e0b"/></svg>'), left: 799, top: HEADER },
  ])
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(outputPath);
