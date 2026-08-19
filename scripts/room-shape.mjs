/**
 * Draws the floor the game actually projects, so a generated room can be held against the shape
 * it has to match — and so the picture can be handed to an image generator as the composition.
 *
 * The numbers are read out of the scene rather than copied, because a guide that has drifted from
 * the code is worse than no guide: it would send art off to be drawn to a shape nothing uses.
 */
import fs from 'node:fs';
import sharp from 'sharp';

const scene = fs.readFileSync('pet-app/src/game/BedroomScene.ts', 'utf8');
const read = (name) => {
  const found = scene.match(new RegExp('^const ' + name + ' = ([0-9.]+)', 'm'));
  if (!found) throw new Error(`BedroomScene no longer declares ${name} — this guide cannot be trusted`);
  return Number(found[1]);
};
const W = read('STAGE_WIDTH'), H = read('STAGE_HEIGHT');
const LINE = read('FLOOR_LINE'), BACK = read('BACK_SPAN'), FRONT = read('FRONT_SPAN');
const COLS = read('GRID_COLUMNS'), ROWS = read('GRID_ROWS');

const top = H * LINE, depth = H - top, backHalf = (W * BACK) / 2, frontHalf = (W * FRONT) / 2, cx = W / 2;
const ratio = BACK / FRONT;
const ease = (t) => (ratio * t) / (1 - (1 - ratio) * t);
const pt = (gx, gy) => {
  const e = ease(gy / ROWS);
  const half = backHalf + (frontHalf - backHalf) * e;
  return [cx + (gx / COLS - .5) * 2 * half, top + depth * e];
};

let grid = '';
for (let c = 0; c <= COLS; c++) { const [ax, ay] = pt(c, 0), [bx, by] = pt(c, ROWS); grid += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}"/>`; }
for (let r = 0; r <= ROWS; r++) { const [ax, ay] = pt(0, r), [bx, by] = pt(COLS, r); grid += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}"/>`; }

const [bl, br, fl, fr] = [pt(0, 0), pt(COLS, 0), pt(0, ROWS), pt(COLS, ROWS)];
const pct = (p, total) => `${Math.round((p / total) * 100)}%`;
const corner = ([x, y]) => `${pct(x, W)}, ${pct(y, H)}`;
const inset = 3;   // keep the outline and the bottom labels inside the canvas

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#f4ede2"/>
  <polygon points="0,0 ${bl} 0,${H}" fill="#dcd3c6"/>
  <polygon points="${W},0 ${br} ${W},${H}" fill="#dcd3c6"/>
  <polygon points="${bl[0]},0 ${br[0]},0 ${br} ${bl}" fill="#e8dfd1"/>
  <polygon points="${bl} ${br} ${fr} ${fl}" fill="#c9a882"/>
  <g stroke="#8a6a45" stroke-width="1.5" opacity=".5" fill="none">${grid}</g>
  <polygon points="${bl} ${br} ${fr[0] - inset},${fr[1] - inset} ${fl[0] + inset},${fl[1] - inset}"
           fill="none" stroke="#c0392b" stroke-width="4"/>
  <g font-family="sans-serif" font-size="21" font-weight="700" fill="#c0392b">
    <text x="${bl[0] + 12}" y="${bl[1] - 14}">${corner(bl)}</text>
    <text x="${br[0] - 132}" y="${br[1] - 14}">${corner(br)}</text>
    <text x="16" y="${H - 18}">${corner(fl)}</text>
    <text x="${W - 146}" y="${H - 18}">${corner(fr)}</text>
  </g>
  <g font-family="sans-serif" font-size="24" font-weight="700" fill="#5b4a36">
    <text x="${cx - 66}" y="44">BACK WALL</text>
    <text x="24" y="${H * .5}">SIDE</text>
    <text x="${W - 94}" y="${H * .5}">SIDE</text>
    <text x="${cx - 40}" y="${H * .78}">FLOOR</text>
  </g>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile('docs/room-shape.png');
const heights = Array.from({ length: ROWS }, (_, r) => Math.round(pt(0, r + 1)[1] - pt(0, r)[1]));
console.log(`docs/room-shape.png · ${COLS} x ${ROWS} · row depths back to front: ${heights.join(', ')}`);
