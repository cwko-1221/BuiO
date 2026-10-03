import {normalizeAdventureFrames} from './lib/adventure-normalize.mjs';
import {extractAdventureFrames} from './extract-adventure-frames.mjs';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import sharp from 'sharp';
import {ADVENTURE_CHAPTER_DESIGNS} from '../pet-app/lib/brawl/adventure-design.mjs';
const root=path.resolve('.'),source=path.join(root,fs.existsSync('pet-app/art-source/adventure-v9/jobs.json')?'pet-app/art-source/adventure-v9':'artifacts/adventure-v9/source'),output=path.join(root,'pet-app/public/assets/art/brawl'),evidence=path.join(root,'artifacts/pet-playtest/adventure-v9/art');
fs.mkdirSync(output,{recursive:true});fs.mkdirSync(evidence,{recursive:true});
const jobs=JSON.parse(fs.readFileSync(path.join(source,'jobs.json'))),manifestPath=path.join(output,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath));
const reports={backgrounds:[],enemies:[]};
async function asset(id,buffer){const hash=crypto.createHash('sha256').update(buffer).digest('hex').slice(0,12),name=`adventure-${id}-${hash}.webp`,file=path.join(output,name);if(!fs.existsSync(file))fs.writeFileSync(file,buffer);return '/pet/assets/art/brawl/'+name;}
const local=url=>path.join(root,'pet-app/public',url.slice('/pet/'.length));
manifest.areas={};
for(const c of ADVENTURE_CHAPTER_DESIGNS){
 const job=jobs.find(j=>j.id==='bg-'+c.id),original=c.number<=3?local(manifest.worlds[c.id]):job?.source&&path.join(root,job.source);if(!original)throw Error(`Missing background ${c.id}`);
 const m=await sharp(original).metadata(),areas=[];
 for(let n=0;n<4;n++){
  const left=c.number<=3?Math.round(n*m.width/4):Math.round(n%2*m.width/2),top=c.number<=3?0:Math.round(Math.floor(n/2)*m.height/2),right=c.number<=3?Math.round((n+1)*m.width/4):Math.round((n%2+1)*m.width/2),bottom=c.number<=3?m.height:Math.round((Math.floor(n/2)+1)*m.height/2);
  const png=await sharp(original).extract({left,top,width:right-left,height:bottom-top}).resize(1280,720,{fit:'fill'}).png().toBuffer();
  const buffer=await sharp(png).webp({quality:86}).toBuffer(),url=await asset(`${c.id}-${n+1}`,buffer);areas.push(url);
  if(c.number>3&&n===0)manifest.backgrounds[c.id]=await asset(`${c.id}-card`,await sharp(png).resize(512,288).webp({quality:82}).toBuffer());
  reports.backgrounds.push({chapter:c.number,section:n+1,url,width:1280,height:720,bytes:buffer.length});
 }
 manifest.areas[c.id]=areas;
}
manifest.enemySprites={};
for(const job of jobs.filter(j=>j.kind==='animation')){
 if(!job.source){if(process.argv.includes('--backgrounds-only'))continue;throw Error(`Missing animation ${job.id}`);}
 const original=path.join(root,job.source),poses=await extractAdventureFrames(original),frames=poses.map(p=>p.input),cellWidth=Math.max(...poses.map(p=>p.width))+24,cellHeight=Math.max(...poses.map(p=>p.height))+24;
 const working=path.join(root,'artifacts/adventure-v9/build');fs.mkdirSync(working,{recursive:true});
 const strip=path.join(working,`strip-${job.enemy}.png`),dir=path.join(working,'normalized',job.enemy);
 await sharp({create:{width:cellWidth*8,height:cellHeight,channels:4,background:'#00000000'}}).composite(frames.map((input,n)=>({input,left:n*cellWidth+Math.round((cellWidth-poses[n].width)/2),top:cellHeight-12-poses[n].height}))).png().toFile(strip);
 await normalizeAdventureFrames(poses,dir,path.join(evidence,job.enemy+'.png'));
 const composites=[],metrics=[];
 for(let n=0;n<8;n++){
  const frame=path.join(dir,`${String(n+1).padStart(2,'0')}.png`),raw=await sharp(frame).ensureAlpha().raw().toBuffer();let opaque=0,minX=224,minY=224,maxX=-1,maxY=-1;
  for(let y=0;y<224;y++)for(let x=0;x<224;x++)if(raw[(y*224+x)*4+3]>16){opaque++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  if(opaque<500)throw Error(`${job.id} empty frame ${n+1}`);
  metrics.push({frame:n+1,width:maxX-minX+1,height:maxY-minY+1,opaque,baseline:230});composites.push({input:frame,left:n*256+16,top:6});
 }
 const buffer=await sharp({create:{width:2048,height:256,channels:4,background:'#00000000'}}).composite(composites).webp({quality:92,alphaQuality:100}).toBuffer(),url=await asset(job.enemy,buffer);
 manifest.enemySprites[job.enemy]={url,row:0,rows:1,frames:8};

 reports.enemies.push({enemy:job.enemy,url,width:2048,height:256,bytes:buffer.length,metrics});
}
manifest.storyPortraits={};
for(const job of jobs.filter(j=>j.kind==='portrait'&&j.source))manifest.storyPortraits[job.speaker]=await asset(`portrait-${job.speaker}`,await sharp(path.join(root,job.source)).resize(384,384,{fit:'inside'}).webp({quality:88}).toBuffer());
manifest.adventure={chapters:20,sections:80,version:'adventure-v9'};
// Preserve immutable old hashed assets; publish the manifest only after all new files exist.
const saved=path.join(root,'artifacts/adventure-backups',`manifest-${Date.now()}.json`);fs.mkdirSync(path.dirname(saved),{recursive:true});fs.renameSync(manifestPath,saved);fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({backgrounds:reports.backgrounds.length,enemies:reports.enemies.length,largestTexture:2048,totalBytes:[...reports.backgrounds,...reports.enemies].reduce((n,a)=>n+a.bytes,0)}));
