import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [,, input, outputDir, prefix='crop'] = process.argv;
if (!input || !outputDir) throw new Error('usage: node render-atlas-crops.mjs <800x640 atlas> <output-dir> [prefix]');
const meta = await sharp(input).metadata();
if (meta.width !== 800 || meta.height !== 640) throw new Error('atlas must be 800x640');
await fs.mkdir(outputDir, {recursive:true});
for (let row=0; row<4; row+=1) for (let column=0; column<5; column+=1) {
  const output = path.join(outputDir, `${prefix}-r${row}c${column}-4x-magenta.png`);
  await sharp(input)
    .extract({left:column*160, top:row*160, width:160, height:160})
    .composite([{input:{create:{width:160,height:160,channels:4,background:{r:255,g:0,b:255,alpha:1}}},blend:'dest-over'}])
    .resize(640,640,{kernel:'nearest'})
    .png()
    .toFile(output);
}
