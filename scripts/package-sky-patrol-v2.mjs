import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=path.resolve('artifacts/sky-patrol-v2'),destination=path.resolve('pet-app/public/assets/art/park/sky-patrol-v2');
await fs.mkdir(destination,{recursive:true});
const sources=JSON.parse(await fs.readFile(path.join(root,'sources.json'),'utf8')),assets={};
for(const key of Object.keys(sources)){
  const input=path.join(root,key+'-source.png'),image=sharp(input),original=await image.metadata();
  if(!['valley','grove'].includes(key))image.trim({threshold:8}).resize({width:key==='boss'?768:key==='cloud'?640:512,withoutEnlargement:true});
  const {data,info}=await image.webp({quality:94,effort:6}).toBuffer({resolveWithObject:true});
  const hash=createHash('sha256').update(data).digest('hex').slice(0,12),file=key+'-'+hash+'.webp';await fs.writeFile(path.join(destination,file),data);
  assets[key]={file,width:info.width,height:info.height,bytes:data.length,sourceWidth:original.width,sourceHeight:original.height};
}
await fs.writeFile('pet-app/src/park/sky-art-assets.json',JSON.stringify({version:'sky-patrol-v2',generator:'Built-in ImageGen; trim/downscale and WebP packaging only',assets},null,2)+'\n');
console.log(JSON.stringify(assets));
