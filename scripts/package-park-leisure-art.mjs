import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const folder='C:/Users/kochu/.codex/generated_images/01a15245-2022-7121-bf16-9d43d78eec7e';
const sources={pond:'exec-9f9cf2b7-91bd-4307-a095-44e5e04082e8.png',meadow:'exec-cc2fe92d-e2d4-41e9-9adb-cd8a49baf4f1.png'};
const target=path.resolve('pet-app/public/assets/art/park/leisure-v1'),archive=path.resolve('artifacts/park-leisure-v1');
await fs.mkdir(target,{recursive:true});await fs.mkdir(archive,{recursive:true});const assets={};
for(const [id,file]of Object.entries(sources)){const source=await fs.readFile(path.join(folder,file));await fs.writeFile(path.join(archive,id+'.png'),source);const bytes=await sharp(source).resize({width:1200,withoutEnlargement:true}).webp({quality:85}).toBuffer(),name=id+'-'+createHash('sha256').update(bytes).digest('hex').slice(0,12)+'.webp';await fs.writeFile(path.join(target,name),bytes);assets[id]={file:name,bytes:bytes.length,...await sharp(bytes).metadata().then(m=>({width:m.width,height:m.height}))};}
await fs.writeFile('pet-app/src/park/leisure-art-assets.json',JSON.stringify({version:'leisure-v1',generator:'Built-in ImageGen; resize and WebP packaging only',assets},null,2));
await fs.writeFile(path.join(archive,'source-record.json'),JSON.stringify({generator:'Built-in image_gen',sources,assets,packaging:'Original PNG retained. Downscale to 1200 px wide and WebP quality 85. No painting or AI edits during packaging.'},null,2));
console.log(JSON.stringify(assets));
