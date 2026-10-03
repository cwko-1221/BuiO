import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {extractAdventureFrames} from './extract-adventure-frames.mjs';
const source='pet-app/art-source/skills-v10',out='pet-app/public/assets/art/brawl',evidence='artifacts/pet-playtest/skills-v10';
fs.mkdirSync(evidence,{recursive:true});
const manifestFile=path.join(out,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile));
manifest.skillFx??={};
for(const job of JSON.parse(fs.readFileSync(path.join(source,'jobs.json')))){
 const poses=await extractAdventureFrames(job.source),maxWidth=Math.max(...poses.map(p=>p.width)),maxHeight=Math.max(...poses.map(p=>p.height)),scale=Math.min(480/maxWidth,240/maxHeight),layers=[];
 for(const [n,p] of poses.entries()){
  const w=Math.round(p.width*scale),h=Math.round(p.height*scale),input=await sharp(p.input).resize(w,h).png().toBuffer();
  layers.push({input,left:n%4*512+16,top:Math.floor(n/4)*256+Math.round((256-h)/2)});
 }
 const png=await sharp({create:{width:2048,height:512,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer();
 const bytes=await sharp(png).webp({lossless:true}).toBuffer(),hash=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,12),name=`skill-${job.id}-${hash}.webp`;
 fs.writeFileSync(path.join(out,name),bytes);
 manifest.skillFx[job.id]={url:'/pet/assets/art/brawl/'+name,frameWidth:512,frameHeight:256,frames:8,widthRatio:maxWidth*scale/512,originX:16/512};
 const bg=await sharp({create:{width:2048,height:512,channels:4,background:'#314559'}}).composite([{input:png,left:0,top:0}]).png().toBuffer();fs.writeFileSync(path.join(evidence,job.id+'-preview.png'),bg);
}
// Retain all old hashed textures and preserve a mapped manifest on Windows.
try{fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2));}catch(e){if(!['UNKNOWN','EBUSY','EPERM'].includes(e.code))throw e;const backup=path.resolve(evidence,'manifest-'+Date.now()+'.json');if(!backup.startsWith(path.resolve('.')+path.sep))throw e;fs.renameSync(manifestFile,backup);fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2));}
console.log(JSON.stringify(manifest.skillFx));
