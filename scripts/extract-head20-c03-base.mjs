import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const atlas=path.resolve('pet-app/public/assets/art/sprites/starpatch-cat-1-atlas-2737c2cd0c.webp'),out=path.resolve('artifacts/head20-attempt6-per-cell/c03');await fs.mkdir(out,{recursive:true});const target=path.join(out,'c03-base-original-160x160.png');await sharp(atlas).extract({left:320,top:0,width:160,height:160}).png({compressionLevel:9}).toFile(target);const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),hashFile=async p=>sha(await fs.readFile(p));await fs.writeFile(path.join(out,'c03-base-lineage.json'),`${JSON.stringify({cell:'c03',sourceAtlas:atlas,sourceAtlasSha256:await hashFile(atlas),extract:[320,0,160,160],output:target,outputSha256:await hashFile(target)},null,2)}\n`);console.log(target);
