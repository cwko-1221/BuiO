/**
 * Take the background off a redrawn sheet without taking the white off the drawing.
 *
 * The sheets that came back from the generator were cut out by keying on colour: every pale pixel
 * anywhere on the sheet was made transparent. That works until something in the picture is white —
 * a snow cape, a fur ruff, a belly — and then the cutout is punched full of holes where the drawing
 * was. Those holes travelled through the whole pipeline and came out as gaps in the baked mask.
 *
 * The background is not a colour, it is a region: the paper the figures were drawn on, reachable
 * from the edge of the sheet without crossing a figure. So it is flooded from the border instead of
 * matched by value, and a white cape stops the flood the same way a black one would.
 *
 * A cape's own edge is white against white paper, and the flood can squeeze through a soft edge and
 * eat inwards. Two things hold it back: the flood only crosses pixels close to the paper's own
 * colour, and wherever the creature was drawn on the base sheet the pixel is foreground whatever
 * the flood decided — the redraw is the same pose with something added, so the body cannot have
 * shrunk.
 *
 * What colour the paper is, is read off the border rather than assumed. The sheets came back on
 * white, on off-white and on black, and one fixed idea of what a background looks like left two of
 * them uncut.
 *
 *   node scripts/redraw-to-transparent.mjs <raw.png> <base.png> <out.png>
 */
import sharp from 'sharp';

/** How far a pixel may sit from the paper's own colour and still be paper. */
const TOLERANCE = 18;

const [rawFile, baseFile, outFile] = process.argv.slice(2);
if (!rawFile || !baseFile || !outFile) {
  console.error('usage: node scripts/redraw-to-transparent.mjs <raw.png> <base.png> <out.png>');
  process.exit(1);
}

const src = await sharp(rawFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = src.info.width;
const H = src.info.height;
const N = W * H;
const d = src.data;

// The paper's colour, taken as the middle value around the border of the sheet.
const border = [];
for (let x = 0; x < W; x += 1) { border.push(x); border.push((H - 1) * W + x); }
for (let y = 0; y < H; y += 1) { border.push(y * W); border.push(y * W + W - 1); }
const middle = (channel) => {
  const values = border.map((p) => d[p * 4 + channel]).sort((a, b) => a - b);
  return values[values.length >> 1];
};
const paperColour = [middle(0), middle(1), middle(2)];

const isPaper = (p) => {
  const i = p * 4;
  for (let c = 0; c < 3; c += 1) if (Math.abs(d[i + c] - paperColour[c]) > TOLERANCE) return false;
  return true;
};

const paper = new Uint8Array(N);
const queue = new Int32Array(N);
let head = 0;
let tail = 0;
const add = (p) => { if (!paper[p] && isPaper(p)) { paper[p] = 1; queue[tail += 1, tail - 1] = p; } };
for (let x = 0; x < W; x += 1) { add(x); add((H - 1) * W + x); }
for (let y = 0; y < H; y += 1) { add(y * W); add(y * W + W - 1); }
while (head < tail) {
  const p = queue[head += 1, head - 1];
  const x = p % W;
  const y = (p - x) / W;
  if (x > 0) add(p - 1);
  if (x + 1 < W) add(p + 1);
  if (y > 0) add(p - W);
  if (y + 1 < H) add(p + W);
}

// The body of the creature, as the base sheet has it, at this sheet's size. Anything the base drew
// is foreground here too: the redraw was asked for the same pose with a thing added to it.
const body = await sharp(baseFile).ensureAlpha()
  .resize(W, H, { fit: 'fill' })
  .extractChannel('alpha').raw().toBuffer();

const cut = Buffer.alloc(N * 4);
let restored = 0;
for (let p = 0; p < N; p += 1) {
  const i = p * 4;
  cut[i] = d[i]; cut[i + 1] = d[i + 1]; cut[i + 2] = d[i + 2];
  if (!paper[p]) { cut[i + 3] = 255; continue; }
  if (body[p] > 32) { cut[i + 3] = 255; restored += 1; continue; }
  cut[i + 3] = 0;
}

let inked = 0;
for (let p = 0; p < N; p += 1) if (cut[p * 4 + 3]) inked += 1;

await sharp(cut, { raw: { width: W, height: H, channels: 4 } })
  .resize(4096, 4096, { fit: 'fill', kernel: 'lanczos3' })
  .png().toFile(outFile);

console.log(`${outFile}  paper ${paperColour.join(",")}  kept ${inked.toLocaleString()} of ${N.toLocaleString()} source pixels`
  + `  (${restored.toLocaleString()} pale ones the base sheet says are the creature)`);
