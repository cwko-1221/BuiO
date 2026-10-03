import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {extractAdventureFrames} from './extract-adventure-frames.mjs';
const source='pet-app/art-source/skills-v11',out='pet-app/public/assets/art/brawl',evidence='artifacts/pet-playtest/skills-v11/atlas';
fs.mkdirSync(evidence,{recursive:true});
const manifestFile=path.join(out,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile)),report=[],failed=[];
manifest.skillFx??={};
// Preserve whole connected poses, including artwork extending past approximate
// source slots. All frames share one scale and a fixed gameplay anchor.
for(const job of JSON.parse(fs.readFileSync(path.join(source,'jobs.json')))){
 if(!fs.existsSync(job.source)){failed.push({id:job.id,error:'Source not generated yet'});continue;}
 try{
  const poses=await extractAdventureFrames(job.source,{minRatio:.035});
  const maxWidth=Math.max(...poses.map(p=>p.width)),maxHeight=Math.max(...poses.map(p=>p.height)),scale=Math.min(480/maxWidth,224/maxHeight),layers=[];
  for(const [n,p] of poses.entries()){
   const w=Math.max(1,Math.round(p.width*scale)),h=Math.max(1,Math.round(p.height*scale)),input=await sharp(p.input).resize(w,h).png().toBuffer();
   layers.push({input,left:n%4*512+(job.anchor==='left'?16:Math.round((512-w)/2)),top:Math.floor(n/4)*256+(job.anchor==='ground'?240-h:Math.round((256-h)/2))});
  }
  const png=await sharp({create:{width:2048,height:512,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer();
  const bytes=await sharp(png).webp({lossless:true}).toBuffer(),hash=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,12),name=`skill-${job.id}-${hash}.webp`;
  fs.writeFileSync(path.join(out,name),bytes);
  manifest.skillFx[job.id]={url:'/pet/assets/art/brawl/'+name,frameWidth:512,frameHeight:256,frames:8,widthRatio:maxWidth*scale/512,heightRatio:maxHeight*scale/256,originX:job.anchor==='left'?16/512:.5,originY:job.anchor==='ground'?240/256:.5,anchor:job.anchor};
  const preview=await sharp({create:{width:2048,height:512,channels:4,background:'#314559'}}).composite([{input:png,left:0,top:0}]).png().toBuffer();fs.writeFileSync(path.join(evidence,job.id+'-preview.png'),preview);
  report.push({id:job.id,fighter:job.fighter,source:job.source,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(job.source)).digest('hex'),file:name,bytes:bytes.length,anchor:job.anchor,scale,poses:poses.map(p=>p.source)});
 }catch(e){failed.push({id:job.id,error:e.message});}
}
// Windows can keep a mapped manifest open. Preserve it before replacing it.
try{fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2));}catch(e){if(!['UNKNOWN','EBUSY','EPERM'].includes(e.code))throw e;fs.renameSync(manifestFile,path.resolve(evidence,'manifest-'+Date.now()+'.json'));fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2));}
fs.writeFileSync(path.join(evidence,'normalization.json'),JSON.stringify({report,failed},null,2));
console.log(JSON.stringify({built:report.length,failed},null,2));if(failed.length&&!process.argv.includes('--partial'))process.exitCode=1;
