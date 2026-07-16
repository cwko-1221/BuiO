// Builds the extra original sprites needed by the latter half of the fixed
// reference route.  Image-generated masters are chroma-keyed beforehand and
// kept in /masters so the shipping WebP files can always be reproduced.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root=process.cwd();
const masters=path.join(root,'game-app','public','images','v2','masters');
const props=path.join(root,'game-app','public','images','v2','props');

const masterById={
  'ref-reef-rock':'ref-reef-rock-master.png',
  'ref-coral-cluster':'ref-coral-cluster-master.png',
  'ref-round-tree':'ref-round-tree-master.png',
  'ref-wood-sign':'ref-wood-sign-master.png',
  'ref-telescope':'ref-telescope-master.png',
  'ref-door-panel':'ref-door-panel-master.png',
  'ref-white-table':'ref-white-table-master.png',
  'ref-split-platform':'ref-split-platform-master.png'
};

for (const [id,name] of Object.entries(masterById)) {
  const source=path.join(masters,name);
  if (!fs.existsSync(source)) throw new Error(`Missing generated master: ${name}`);
  const trimmed=await sharp(source).trim({background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  await sharp(trimmed)
    .resize({width:512,height:512,fit:'inside',withoutEnlargement:false})
    .webp({quality:94,alphaQuality:100})
    .toFile(path.join(props,`${id}.webp`));
}

// The reference alternates red and blue stalls.  Derive the blue variant from
// the approved red sprite so both retain exactly the same silhouette and
// baseline instead of introducing a second, mismatched generation.
const redStall=path.join(props,'ref-market-stall-red.webp');
const {data,info}=await sharp(redStall).ensureAlpha().raw().toBuffer({resolveWithObject:true});
for (let offset=0;offset<data.length;offset+=4) {
  const [r,g,b,a]=[data[offset],data[offset+1],data[offset+2],data[offset+3]];
  if (a>16 && r>100 && r>g*1.22 && r>b*1.22) {
    data[offset]=Math.round(Math.min(255,b*.25+r*.18));
    data[offset+1]=Math.round(Math.min(255,g*.55+r*.13));
    data[offset+2]=Math.round(Math.min(255,b*.35+r*.92));
  }
}
await sharp(data,{raw:info}).webp({quality:94,alphaQuality:100})
  .toFile(path.join(props,'ref-market-stall-blue.webp'));

// A charcoal companion table is used by the monochrome office route.
await sharp(path.join(props,'ref-white-table.webp'))
  .grayscale().tint({r:61,g:64,b:76})
  .webp({quality:94,alphaQuality:100})
  .toFile(path.join(props,'ref-charcoal-table.webp'));

console.log(`Generated ${Object.keys(masterById).length+2} reference extension sprites.`);
