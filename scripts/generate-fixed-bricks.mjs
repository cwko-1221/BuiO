// Builds the orthographic, front-facing modular brick kit used by the fixed map.
// The three source masters were generated separately and chroma-keyed to alpha.
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const masters = path.join(root, 'game-app', 'public', 'images', 'v2', 'masters');
const out = path.join(root, 'game-app', 'public', 'images', 'v2', 'props');
const ids = ['a', 'b', 'c'];

async function tile(letter) {
  const source = path.join(masters, `flat-brick-${letter}-master.png`);
  const trimmed = await sharp(source).trim({ background: { r:0, g:0, b:0, alpha:0 } }).png().toBuffer();
  return sharp(trimmed).resize(128, 80, { fit:'fill' }).png().toBuffer();
}

const tiles = Object.fromEntries(await Promise.all(ids.map(async id => [id, await tile(id)])));

async function compose(id, columns, rows, pattern) {
  const width = columns * 128;
  const height = rows * 80;
  const layers = [];
  for (let row=0; row<rows; row++) for (let column=0; column<columns; column++) {
    const letter = pattern[(row * columns + column) % pattern.length];
    layers.push({ input:tiles[letter], left:column*128, top:row*80 });
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
