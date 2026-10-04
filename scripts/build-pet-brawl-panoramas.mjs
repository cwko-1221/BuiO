import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {STAGES} from '../pet-app/lib/brawl/catalog.mjs';
const root=path.resolve('.'),source=path.join(root,'pet-app/art-source/brawl-panoramas-v1'),output=path.join(root,'pet-app/public/assets/art/brawl');
const jobs=JSON.parse(await fs.readFile(path.join(source,'jobs.json'),'utf8')),manifestFile=path.join(output,'manifest.json');
const manifest=JSON.parse(await fs.readFile(manifestFile,'utf8')),report=[];
manifest.panoramas={};
async function publish(id,bytes){
 const hash=createHash('sha256').update(bytes).digest('hex').slice(0,12),name=`panorama-${id}-${hash}.webp`;
 const target=path.join(output,name);try{await fs.writeFile(target,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
 return '/pet/assets/art/brawl/'+name;
}
for(const stage of STAGES){
 const job=jobs.find(j=>j.id===stage.id);
 if(!job?.source){if(process.argv.includes('--partial'))continue;throw Error(`Missing continuous panorama: ${stage.id}`);}
 const file=path.resolve(source,job.source);if(!file.startsWith(source+path.sep))throw Error('Invalid panorama path');
 const original=await fs.readFile(file),meta=await sharp(original).metadata();
 if(!meta.width||!meta.height||meta.width/meta.height<2.7||meta.width/meta.height>4.1)throw Error(`Panorama aspect ratio: ${stage.id}`);
 const bytes=await sharp(original).resize({width:2048,withoutEnlargement:true}).webp({quality:90,effort:6}).toBuffer(),size=await sharp(bytes).metadata();
 const url=await publish(stage.id,bytes);
 manifest.panoramas[stage.id]={url,width:size.width,height:size.height,floorLine:job.floorLine};
 manifest.backgrounds[stage.id]=await publish(stage.id+'-card',await sharp(original).resize(512,288,{fit:'cover'}).webp({quality:86}).toBuffer());
 report.push({chapter:stage.chapter,id:stage.id,url,native:{width:meta.width,height:meta.height},width:size.width,height:size.height,bytes:bytes.length,floorLine:job.floorLine,sourceSha256:createHash('sha256').update(original).digest('hex')});
}
manifest.adventure={...manifest.adventure,backgroundVersion:'panoramas-v1'};
// Some Windows editors map the manifest. Preserve it before replacement if needed.
const contents=JSON.stringify(manifest,null,2)+'\n';
try{await fs.writeFile(manifestFile,contents);}catch(e){if(e.code!=='UNKNOWN')throw e;const backup=path.join(root,'artifacts/panorama-backups');await fs.mkdir(backup,{recursive:true});await fs.rename(manifestFile,path.join(backup,`manifest-${Date.now()}.json`));await fs.writeFile(manifestFile,contents);}
await fs.writeFile(path.join(source,'build-report.json'),JSON.stringify({version:'panoramas-v1',generationMode:'built-in image_gen',scenes:report},null,2)+'\n');
console.log(JSON.stringify({scenes:report.length,totalBytes:report.reduce((n,r)=>n+r.bytes,0),maxWidth:Math.max(...report.map(r=>r.width))}));
