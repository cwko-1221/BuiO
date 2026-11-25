import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const archive=path.resolve('artifacts/park-market-v1'),target=path.resolve('pet-app/public/assets/art/park/market-v1');
const sources=JSON.parse(await fs.readFile(path.join(archive,'sources.json'),'utf8'));
await fs.mkdir(target,{recursive:true});const assets={};
for(const[id,source]of Object.entries(sources)){
  const original=await fs.readFile(source);await fs.writeFile(path.join(archive,id+'.png'),original);
  const {data,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});let left=info.width,top=info.height,right=0,bottom=0;
  if(!info.channels||data[3]!==0)throw Error(id+' has no transparent corner');
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>20){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  left=Math.max(0,left-8);top=Math.max(0,top-8);right=Math.min(info.width-1,right+8);bottom=Math.min(info.height-1,bottom+8);const crop={left,top,width:right-left+1,height:bottom-top+1};
  const bytes=await sharp(original).extract(crop).resize({width:['merchant','eco'].includes(id)?480:id.startsWith('fish-')?480:240,withoutEnlargement:true}).webp({quality:91,alphaQuality:100}).toBuffer(),file=id+'-'+createHash('sha256').update(bytes).digest('hex').slice(0,12)+'.webp',meta=await sharp(bytes).metadata();await fs.writeFile(path.join(target,file),bytes);assets[id]={file,width:meta.width,height:meta.height,bytes:bytes.length,crop,source:path.basename(source)};
}
await fs.writeFile('pet-app/src/park/market-art-assets.json',JSON.stringify({version:'market-v1',generator:'Built-in ImageGen; genuine alpha, optical crop/downscale/WebP only',assets},null,2));
await fs.writeFile(path.join(archive,'source-record.json'),JSON.stringify({sources,assets,packaging:'Original PNGs retained. Native alpha is preserved; optical crop, resize without enlargement, WebP quality 91 only.'},null,2));
const tiles=[];let i=0;for(const[id,a]of Object.entries(assets)){const tile=await sharp(path.join(target,a.file)).resize(220,150,{fit:'inside'}).extend({top:10,bottom:10,left:10,right:10,background:'#edf2df'}).png().toBuffer();tiles.push({input:tile,left:(i%5)*250,top:Math.floor(i/5)*190});i++;}await sharp({create:{width:1250,height:950,channels:4,background:'#edf2df'}}).composite(tiles).png().toFile(path.join(archive,'contact-sheet.png'));
console.log(JSON.stringify({images:Object.keys(assets).length,bytes:Object.values(assets).reduce((n,a)=>n+a.bytes,0)}));
