import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {STAGES} from '../pet-app/lib/brawl/catalog.mjs';
const source='pet-app/art-source/brawl-panoramas-v2',out='pet-app/public/assets/art/brawl';
const jobs=JSON.parse(await fs.readFile(source+'/jobs.json','utf8')),manifest=JSON.parse(await fs.readFile(out+'/manifest.json','utf8')),report=[];
const digest=b=>createHash('sha256').update(b).digest('hex');
async function publish(id,b){const name=`panorama-wide-${id}-${digest(b).slice(0,12)}.webp`;await fs.writeFile(out+'/'+name,b);return '/pet/assets/art/brawl/'+name;}
for(const stage of STAGES){
 const j=jobs.find(j=>j.id===stage.id),file=source+'/'+j.source;
 try{await fs.access(file);}catch(e){if(process.argv.includes('--partial'))continue;throw e;}
 const bytes=await fs.readFile(file),meta=await sharp(bytes).metadata();
 if(Math.abs(meta.width/meta.height-16/9)>.03){if(process.argv.includes('--partial'))continue;throw Error('Missing accepted two-row artwork '+j.id);}
 assert.equal(j.layout,'folded-panorama');
 // Unfold two DIFFERENT consecutive painted rows into one full-level bitmap.
 // No repeated tile, no stretched dimensions, no runtime background joins.
 // Trim at most a rounding pixel so the natural image spans 5120 x 720.
 const height=Math.min(Math.floor(meta.height/2),Math.floor(meta.width*9/32));
 const rows=[{left:0,top:0,width:meta.width,height},{left:0,top:Math.ceil(meta.height/2),width:meta.width,height}];
 const layers=await Promise.all(rows.map(async(box,n)=>({input:await sharp(bytes).extract(box).png().toBuffer(),left:n*meta.width,top:0})));
 let flattened=await sharp({create:{width:meta.width*2,height,channels:3,background:'#000'}}).composite(layers).png().toBuffer();
 const repairDirectory=source+'/repairs/'+j.id;
 let assembly;
 try{assembly=JSON.parse(await fs.readFile(repairDirectory+'/assembly.json','utf8'));flattened=await fs.readFile(repairDirectory+'/full.png');}
 catch(e){if(process.argv.includes('--partial'))continue;throw e;}
 assert.equal(assembly.originalSha256,digest(bytes));
 assert.equal(assembly.fullSha256,digest(flattened));
 const webp=await sharp(flattened).resize({width:4096,withoutEnlargement:true}).webp({quality:94,effort:6}).toBuffer(),size=await sharp(webp).metadata();
 assert.ok(size.width/size.height>=5120/720,'Full painting spans the world at natural height');
 assert.ok(j.floorLine<=345/720,'The painted floor begins above the playable lane');
 const url=await publish(j.id,webp);manifest.panoramas[j.id]={url,width:size.width,height:size.height,floorLine:j.floorLine};
 const cardWidth=Math.min(size.width,Math.floor(size.height*16/9));
 manifest.backgrounds[j.id]=await publish(j.id+'-card',await sharp(webp).extract({left:0,top:0,width:cardWidth,height:size.height}).resize(512,288).webp({quality:90}).toBuffer());
 report.push({id:j.id,chapter:j.chapter,url,width:size.width,height:size.height,floorLine:j.floorLine,rows,sourceSha256:digest(bytes),repairSha256:assembly.repairSha256,fullSha256:digest(flattened),publishedSha256:digest(webp),bytes:webp.length});
 console.log('Packed full level '+j.id+' '+size.width+'x'+size.height);
}
manifest.adventure={...manifest.adventure,backgroundVersion:'panoramas-v2'};
const contents=JSON.stringify(manifest,null,2)+'\n';
try{await fs.writeFile(out+'/manifest.json',contents);}catch(e){if(!['UNKNOWN','EPERM','EBUSY'].includes(e.code))throw e;await fs.mkdir('artifacts/panorama-backups',{recursive:true});await fs.rename(out+'/manifest.json','artifacts/panorama-backups/manifest-wide-'+Date.now()+'.json');await fs.writeFile(out+'/manifest.json',contents);}
await fs.writeFile(source+'/build-report.json',JSON.stringify({version:'panoramas-v2',mode:'built-in image_gen; mechanical unfolding into one full background',scenes:report},null,2)+'\n');
