import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const sourceRoot='C:/Users/kochu/.codex/generated_images/01a15245-2022-7121-bf16-9d43d78eec7e';
const specs={
  'wood-deck':['exec-62fda56e-587f-4694-ab13-e82aefc72e17.png',1320,220],
  'wood-rail':['exec-ececf9bc-5844-4b79-a9bf-8a06783143ee.png',1360,16],
  'stone-deck':['exec-0a19a151-a29d-4e7d-90ba-15485e99eb1f.png',1320,220],
  'stone-rail':['exec-27bd6927-9509-443a-97db-14cdc6ffb240.png',1360,16],
  'garden-bed':['exec-4238ac1c-714a-4b9f-a642-55332c0bdf3b.png',600,24],
  garland:['exec-5a7624cb-fbeb-41f1-8dda-1da5b7e3dcd0.png',480,12],
  lily:['exec-2dde8dbb-c0b0-4fc2-8935-42cabece7036.png',256,110],
  lantern:['exec-b9a47ffd-1839-407a-9380-53e487c38e8e.png',256,50],
};
const archive=path.resolve('artifacts/park-community-v1'),dest=path.resolve('pet-app/public/assets/art/park/community-v1');
await fs.mkdir(archive,{recursive:true});await fs.mkdir(dest,{recursive:true});const assets={};
for(const [id,[source,maxWidth,threshold]]of Object.entries(specs)){
  const original=await fs.readFile(path.join(sourceRoot,source));await fs.writeFile(path.join(archive,id+'.png'),original);
  const {data,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});let left=info.width,top=info.height,right=0,bottom=0,transparent=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a===0)transparent++;if(a>=threshold){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
  if(!transparent||right<=left)throw Error('Missing genuine alpha: '+id);
  const margin=10;left=Math.max(0,left-margin);top=Math.max(0,top-margin);right=Math.min(info.width-1,right+margin);bottom=Math.min(info.height-1,bottom+margin);
  const crop={left,top,width:right-left+1,height:bottom-top+1},bytes=await sharp(original).extract(crop).resize({width:maxWidth,withoutEnlargement:true}).webp({quality:90,alphaQuality:100}).toBuffer(),meta=await sharp(bytes).metadata();
  const file=id+'-'+createHash('sha256').update(bytes).digest('hex').slice(0,12)+'.webp';await fs.writeFile(path.join(dest,file),bytes);assets[id]={file,width:meta.width,height:meta.height,bytes:bytes.length,source,crop,alphaThreshold:threshold,sourceWidth:info.width,sourceHeight:info.height};
}
const record={version:'community-v1',generator:'Built-in image_gen, genuine alpha; optical bounding crop and downscale/WebP only',assets};await fs.writeFile('pet-app/src/park/community-art-assets.json',JSON.stringify(record,null,2));await fs.writeFile(path.join(archive,'source-record.json'),JSON.stringify(record,null,2));console.log(JSON.stringify(Object.fromEntries(Object.entries(assets).map(([id,a])=>[id,{width:a.width,height:a.height,bytes:a.bytes}]))));
