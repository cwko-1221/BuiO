import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {findCells,keepPose} from './sheet-cells.mjs';
import {auditSingleBody} from './sprite-body-audit.mjs';
const root='pet-app/art-source/basic-attacks-v1',out='pet-app/public/assets/art/brawl',evidence='artifacts/pet-playtest/basic-attacks-v1';
const roster=JSON.parse(fs.readFileSync(root+'/roster.json')),jobs=JSON.parse(fs.readFileSync(root+'/jobs.json')),manifest=JSON.parse(fs.readFileSync(out+'/manifest.json')),reports=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),anchors=JSON.parse(fs.readFileSync(root+'/weapon-anchors.json'));
function bounds(data,w,h){let l=w,r=-1,t=h,b=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>16){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}assert.ok(r>l&&b>t,'Nonempty character');return {l,r,t,b,width:r-l+1,height:b-t+1};}
for(const f of roster){
 if(f.skipRedraw)continue;
 const sheets=jobs.filter(j=>j.fighterId===f.id);
 if(sheets.some(j=>!fs.existsSync(`${root}/${f.id}/${j.sheet}/raw.png`))){if(process.argv.includes('--partial'))continue;throw Error('Missing normal attack art '+f.id);}
 const poses=[];
 for(const j of sheets){
  const file=`${root}/${f.id}/${j.sheet}/raw.png`,meta=await sharp(file).metadata();assert.ok(meta.hasAlpha,'True alpha '+j.id);
  const cells=await findCells(file,4,4);assert.equal(cells.length,16);
  for(const [i,c] of cells.entries()){
   assert.ok(c,'Missing cell '+j.id+':'+i);const left=Math.max(0,c.left-3),top=Math.max(0,c.top-3),box={left,top,width:Math.min(meta.width-left,c.width+6),height:Math.min(meta.height-top,c.height+6)};
   const input=await keepPose(file,box,await sharp(file).extract(box).png().toBuffer()),{data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   for(let p=0;p<data.length;p+=4)if(data[p+3]<16)data.fill(0,p,p+4);
   const audit=auditSingleBody(data,info.width,info.height);assert.equal(audit.bodyCount,1,'Exactly one body per cell '+j.id+':'+i+' '+JSON.stringify(audit));
   const b=bounds(data,info.width,info.height);let fl=info.width,fr=-1;
   for(let y=Math.max(b.t,b.b-16);y<=b.b;y++)for(let x=b.l;x<=b.r;x++)if(data[(y*info.width+x)*4+3]>32){fl=Math.min(fl,x);fr=Math.max(fr,x);}
   const heel=anchors[f.id]?.[j.sheet]?.[i];
   poses.push({...b,foot:heel?heel.x-box.left:(fl+fr)/2,footY:heel?heel.y-box.top:b.b,semanticHeel:heel||null,source:box,action:j.actions[Math.floor(i/8)],input:await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer()});
  }
 }
 assert.equal(poses.length,32);
 const seed=await sharp(f.seed).ensureAlpha().raw().toBuffer({resolveWithObject:true}),sb=bounds(seed.data,seed.info.width,seed.info.height);
 const recovery=poses.filter((_,i)=>i%8===7),idleHeight=recovery.reduce((n,p)=>n+p.footY-p.t+1,0)/4;
 const desired=sb.height/idleHeight,maxLeft=Math.max(...poses.map(p=>p.foot-p.l)),maxRight=Math.max(...poses.map(p=>p.r-p.foot)),maxHeight=Math.max(...poses.map(p=>p.footY-p.t+1)),maxBelow=Math.max(...poses.map(p=>p.b-p.footY));
 const small=Math.min(desired,120/maxLeft,120/maxRight,222/maxHeight),cell=small/desired<.9?384:256,bottom=cell-26;
 const scale=Math.min(desired,(cell/2-8)/maxLeft,(cell/2-8)/maxRight,(bottom-8)/maxHeight,maxBelow?(cell-bottom-5)/maxBelow:Infinity),displaySize=180*cell/f.width;
 // Match the published idle's actual heel position, including its existing
 // anchor margin, so entering an attack does not lift or drop the character.
 const idleWorldBottom=180*((sb.b+1)/f.height-f.originY),originY=bottom/cell-idleWorldBottom/displaySize;
 const folder=evidence+'/'+f.id;fs.mkdirSync(folder,{recursive:true});const frames=[],pages=[];
 for(const [page,j] of sheets.entries()){
  const layers=[],clips={};
  for(let i=0;i<16;i++){
   const p=poses[page*16+i],width=Math.round(p.width*scale),height=Math.round(p.height*scale),left=Math.round(cell/2-(p.foot-p.l)*scale),top=bottom-Math.round((p.footY-p.t+1)*scale);
   assert.ok(left>=5&&left+width<=cell-5&&top>=5&&top+height<=cell-5,'Transparent gutters '+j.id+':'+i);
   const input=await sharp(p.input).extract({left:p.l,top:p.t,width:p.width,height:p.height}).resize(width,height,{kernel:'lanczos3'}).png().toBuffer();
   const frame=await sharp({create:{width:cell,height:cell,channels:4,background:'#00000000'}}).composite([{input,left,top}]).png().toBuffer();
   fs.writeFileSync(folder+'/'+String(page*16+i).padStart(2,'0')+'.png',frame);layers.push({input:frame,left:i%4*cell,top:Math.floor(i/4)*cell});
   clips[p.action]??={start:Math.floor(i/8)*8,count:8,poseTimeline:'strike',displaySize,originY};
   frames.push({frame:page*16+i,action:p.action,source:p.source,semanticHeel:p.semanticHeel,scale,left,top,width,height,foot:cell/2,bottom});
  }
  const bytes=await sharp({create:{width:cell*4,height:cell*4,channels:4,background:'#00000000'}}).composite(layers).webp({lossless:true}).toBuffer();
  const name=f.id+'-normal-'+j.sheet+'-'+hash(bytes).slice(0,12)+'.webp';fs.writeFileSync(out+'/'+name,bytes);
  pages.push({url:'/pet/assets/art/brawl/'+name,frameWidth:cell,frameHeight:cell,clips});
  await sharp(bytes).flatten({background:'#334c60'}).png().toFile(folder+'/'+j.sheet+'-preview.png');
 }
 manifest.fighterAttackAnimations??={};manifest.fighterAttackAnimations[f.id]=pages;
 reports.push({id:f.id,seedHash:hash(fs.readFileSync(f.seed)),sourceHashes:sheets.map(j=>hash(fs.readFileSync(`${root}/${f.id}/${j.sheet}/raw.png`))),sourceModes:sheets.map(j=>JSON.parse(fs.readFileSync(`${root}/${f.id}/${j.sheet}/generation.json`)).mode),cell,scale,desired,displaySize,idleWorldBottom,sourceRecoveryHeights:recovery.map(p=>p.height),pages,frames});
 console.log('Normalized '+f.id+' (32 poses, shared scale '+scale.toFixed(4)+')');
}
fs.mkdirSync(evidence,{recursive:true});
function write(file,content){try{fs.writeFileSync(file,content);}catch(e){if(!['UNKNOWN','EPERM','EBUSY'].includes(e.code))throw e;fs.renameSync(file,path.join(evidence,path.basename(file)+'-before-'+Date.now()));fs.writeFileSync(file,content);}}
write(out+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
const generatedSheets=reports.flatMap(r=>r.sourceModes).filter(m=>m==='built-in imagegen').length;
fs.writeFileSync(root+'/build-report.json',JSON.stringify({mode:'built-in imagegen plus approved sprite assembly',fighters:reports.length,frames:reports.length*32,generatedSheets,newFrames:generatedSheets*16,pikachuRedraw:false,reports},null,2)+'\n');
