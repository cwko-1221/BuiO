import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {extractAdventureFrames} from './extract-adventure-frames.mjs';
const source='pet-app/art-source/brawl-newcomers-v12',out='pet-app/public/assets/art/brawl',evidence='artifacts/pet-playtest/newcomers-v12/fx';
fs.mkdirSync(evidence,{recursive:true});
const file=path.join(out,'manifest.json'),manifest=JSON.parse(fs.readFileSync(file)),report=[];
for(const job of JSON.parse(fs.readFileSync(source+'/jobs.json'))){
 const poses=await extractAdventureFrames(job.source,{minRatio:.035});assert.equal(poses.length,8);
 const maxWidth=Math.max(...poses.map(p=>p.width)),maxHeight=Math.max(...poses.map(p=>p.height)),scale=Math.min(480/maxWidth,224/maxHeight),layers=[];
 for(const [n,p] of poses.entries()){
  const width=Math.round(p.width*scale),height=Math.round(p.height*scale);
  const input=await sharp(p.input).resize(width,height).png().toBuffer(),left=job.anchor==='left'?16:Math.round((512-width)/2),top=job.anchor==='ground'?240-height:Math.round((256-height)/2);
  layers.push({input,left:n%4*512+left,top:Math.floor(n/4)*256+top});
 }
 const png=await sharp({create:{width:2048,height:512,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer(),bytes=await sharp(png).webp({lossless:true}).toBuffer();
 const name='skill-'+job.id+'-'+createHash('sha256').update(bytes).digest('hex').slice(0,12)+'.webp';fs.writeFileSync(out+'/'+name,bytes);
 manifest.skillFx[job.id]={url:'/pet/assets/art/brawl/'+name,frameWidth:512,frameHeight:256,frames:8,widthRatio:maxWidth*scale/512,heightRatio:maxHeight*scale/256,originX:job.anchor==='left'?16/512:.5,originY:job.anchor==='ground'?240/256:.5,anchor:job.anchor};
 fs.writeFileSync(evidence+'/'+job.id+'-preview.png',await sharp(png).flatten({background:'#314559'}).png().toBuffer());
 report.push({id:job.id,file:name,source:job.source,sourceHash:createHash('sha256').update(fs.readFileSync(job.source)).digest('hex'),bytes:bytes.length,scale,anchor:job.anchor,poses:poses.map(p=>p.source)});
}
const content=JSON.stringify(manifest,null,2)+'\n';try{fs.writeFileSync(file,content);}catch(error){if(!['UNKNOWN','EBUSY','EPERM'].includes(error.code))throw error;fs.renameSync(file,path.resolve(evidence,'manifest-before-'+Date.now()+'.json'));fs.writeFileSync(file,content);}
fs.writeFileSync(evidence+'/normalization.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.map(({id,bytes})=>({id,bytes}))));
