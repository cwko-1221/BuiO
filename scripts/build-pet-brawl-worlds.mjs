import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=path.resolve('pet-app/public/assets/art/brawl'),source=path.resolve('pet-app/art-source/imagegen/brawl-v2');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
manifest.worlds={};manifest.version='brawl-v2';
for(const [id,name] of [['sunny-training','sunny'],['windbell-forest','forest'],['starcrystal-cave','cave']]){
  // Encoding only: retain every painted pixel and the original panorama geometry.
  const buffer=await sharp(path.join(source,name+'.png')).webp({quality:93,effort:6}).toBuffer();
  const hash=createHash('sha256').update(buffer).digest('hex').slice(0,12),file=`world-${id}-${hash}.webp`;
  await fs.writeFile(path.join(root,file),buffer);manifest.worlds[id]='/pet/assets/art/brawl/'+file;
  const meta=await sharp(buffer).metadata();console.log(`${id}: ${meta.width}×${meta.height}, ${buffer.length} bytes`);
}
const fx=await sharp(path.join(source,'effects.png')).webp({quality:94,alphaQuality:100,effort:6}).toBuffer();
const fxMeta=await sharp(fx).metadata();if(fxMeta.width!==1448||fxMeta.height!==1086||!fxMeta.hasAlpha)throw new Error('Unexpected VFX layout');
const fxFile=`effects-${createHash('sha256').update(fx).digest('hex').slice(0,12)}.webp`;await fs.writeFile(path.join(root,fxFile),fx);
manifest.effects={url:'/pet/assets/art/brawl/'+fxFile,frameSize:181,clips:{slash:{start:0,count:8},burst:{start:8,count:8},bolt:{start:16,count:8},vortex:{start:24,count:8},shock:{start:32,count:8},dust:{start:40,count:8}}};
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
