// Builds the orthographic, front-facing modular brick kit used by the fixed map.
// The source sheet is an original image-generated sprite made to follow the
// reference map's visual grammar: one pale cap course over narrow charcoal
// masonry.  Lower wall rows deliberately omit the cap course so tall pillars
// read as one continuous wall instead of a stack of unrelated blue slabs.
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const masters = path.join(root, 'game-app', 'public', 'images', 'v2', 'masters');
const out = path.join(root, 'game-app', 'public', 'images', 'v2', 'props');
const ids = ['a', 'b', 'c'];
const source = path.join(masters, 'front-castle-brick-sheet.png');

const trimmed = await sharp(source)
  .trim({ background: { r:0, g:0, b:0, alpha:0 } })
  .png()
  .toBuffer();
const sheet = await sharp(trimmed).metadata();
const segmentWidth = Math.floor(sheet.width / 6);

async function segment(index, fillOnly=false) {
  const left = index * segmentWidth;
  const width = index === 5 ? sheet.width - left : segmentWidth;
  const top = fillOnly ? Math.floor(sheet.height * 0.39) : 0;
  const height = sheet.height - top;
  return sharp(trimmed)
    .extract({ left, top, width, height })
    .resize(128, 80, { fit:'fill' })
    .png()
    .toBuffer();
}

const sourceSegments = { a:0, b:2, c:4 };
const capTiles = Object.fromEntries(await Promise.all(ids.map(async id => [id, await segment(sourceSegments[id])])));
const fillTiles = Object.fromEntries(await Promise.all(ids.map(async id => [id, await segment(sourceSegments[id], true)])));

async function compose(id, columns, rows, pattern) {
  const width = columns * 128;
  const height = rows * 80;
  const layers = [];
  for (let row=0; row<rows; row++) for (let column=0; column<columns; column++) {
    const letter = pattern[(row * columns + column) % pattern.length];
    layers.push({ input:row === 0 ? capTiles[letter] : fillTiles[letter], left:column*128, top:row*80 });
  }
  await sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite(layers).webp({quality:94,alphaQuality:100}).toFile(path.join(out,`${id}.webp`));
}

await compose('flat-brick-a',1,1,'a');
await compose('flat-brick-b',1,1,'b');
await compose('flat-brick-c',1,1,'c');
await compose('flat-brick-strip-2',2,1,'ab');
await compose('flat-brick-strip-4',4,1,'abc');
await compose('flat-brick-wall-2',4,2,'abcbca');
await compose('flat-brick-pillar-4',1,4,'abca');
await compose('flat-brick-wall-4',4,4,'abcacbab');

console.log('Generated 8 orthographic fixed-map brick sprites.');
