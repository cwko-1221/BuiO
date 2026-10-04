import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {findCells,keepPose} from './sheet-cells.mjs';

const option=(name,fallback)=>{const n=process.argv.indexOf(name);return n>=0?process.argv[n+1]:fallback;};
const root=option('--source','pet-app/art-source/fighter-skill-poses-v1'),out='pet-app/public/assets/art/brawl';
const evidence=option('--evidence','artifacts/pet-playtest/skill-poses-v1'),roster=JSON.parse(fs.readFileSync(root+'/roster.json'));
const landmarks=JSON.parse(fs.readFileSync(root+'/landmarks.json'));
const manifest=JSON.parse(fs.readFileSync(out+'/manifest.json')),reports=[];
manifest.skillFx['take-copter'].originY=.9;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function bounds(data,w,h){let l=w,r=-1,t=h,b=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>16){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}assert.ok(r>l&&b>t);return {l,r,t,b,width:r-l+1,height:b-t+1};}
for(const f of roster){
 if(f.skipCastArt)continue;
 const source=root+'/'+f.id,job=JSON.parse(fs.readFileSync(source+'/generation.json'));
 if(!fs.existsSync(source+'/raw.png')){if(process.argv.includes('--partial'))continue;throw Error('Missing generated atlas '+f.id);}
 const meta=await sharp(source+'/raw.png').metadata();assert.ok(meta.hasAlpha);
 const cells=await findCells(source+'/raw.png',4,job.rows),poses=[];
 for(const [n,c] of cells.entries()){
  assert.ok(c,'missing pose '+f.id+':'+n);
  const left=Math.max(0,c.left-3),top=Math.max(0,c.top-3),box={left,top,width:Math.min(meta.width-left,c.width+6),height:Math.min(meta.height-top,c.height+6)};
  const input=await keepPose(source+'/raw.png',box,await sharp(source+'/raw.png').extract(box).png().toBuffer());
  const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  // Transparent RGB noise must not become a coloured fringe after resampling.
  for(let p=0;p<data.length;p+=4)if(data[p+3]<16)data.fill(0,p,p+4);
  const b=bounds(data,info.width,info.height);let fl=info.width,fr=-1;
  for(let y=Math.max(b.t,b.b-16);y<=b.b;y++)for(let x=b.l;x<=b.r;x++)if(data[(y*info.width+x)*4+3]>32){fl=Math.min(fl,x);fr=Math.max(fr,x);}
  poses.push({...b,foot:(fl+fr)/2,input:await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer()});
 }
 const seed=await sharp(f.seed).ensureAlpha().raw().toBuffer({resolveWithObject:true}),sb=bounds(seed.data,seed.info.width,seed.info.height);
 // Recovery is comparable to the shipped idle; raised arms do not shrink the body.
 const idleHeight=poses.filter((_,i)=>i%8===7).reduce((n,p)=>n+p.height,0)/job.skills.length;
 const desired=sb.height/idleHeight,maxLeft=Math.max(...poses.map(p=>p.foot-p.l)),maxRight=Math.max(...poses.map(p=>p.r-p.foot));
 const small=Math.min(desired,120/maxLeft,120/maxRight,222/Math.max(...poses.map(p=>p.height)));
 const cell=small/desired<.9?384:256,bottom=cell-26;
 const scale=Math.min(desired,(cell/2-8)/maxLeft,(cell/2-8)/maxRight,(bottom-8)/Math.max(...poses.map(p=>p.height)));
 const layers=[],clips={},frames=[],displaySize=180*cell/f.width;
 const folder=evidence+'/'+f.id;fs.mkdirSync(folder,{recursive:true});
 for(const [n,p] of poses.entries()){
  const width=Math.round(p.width*scale),height=Math.round(p.height*scale),left=Math.round(cell/2-(p.foot-p.l)*scale),top=bottom-height;
  assert.ok(left>=5&&left+width<=cell-5&&top>=5&&top+height<=bottom,'safe transparent padding '+f.id+':'+n);
  const input=await sharp(p.input).extract({left:p.l,top:p.t,width:p.width,height:p.height}).resize(width,height,{kernel:'lanczos3'}).png().toBuffer();
  const frame=await sharp({create:{width:cell,height:cell,channels:4,background:'#00000000'}}).composite([{input,left,top}]).png().toBuffer();
  fs.writeFileSync(folder+'/'+String(n).padStart(2,'0')+'.png',frame);layers.push({input:frame,left:n%4*cell,top:Math.floor(n/4)*cell});
  const skillName=job.skills[Math.floor(n/8)],skill=f.skills[Number(skillName.slice(-1))-1];
  const point=landmarks[skill.kind]?.points[n%8];assert.ok(point||process.argv.includes('--partial'),'missing artist landmark '+skill.kind);
  const xy=point||[.8,.5],emitter={x:Number(((p.l+xy[0]*p.width-p.foot)*scale*displaySize/cell).toFixed(2)),y:Number(((p.t+xy[1]*p.height-p.b-1)*scale*displaySize/cell).toFixed(2))};
  const clip=clips[skillName]??={start:Math.floor(n/8)*8,count:8,poseTimeline:'cast',displaySize,originY:bottom/cell,emitterRole:landmarks[skill.kind]?.role,emitters:[]};clip.emitters.push(emitter);
  const air=landmarks[skill.kind]?.airPoint;
  const airEmitter=air&&n%8===5?{x:Number(((p.l+air[0]*p.width-p.foot)*scale*displaySize/cell).toFixed(2)),y:Number(((p.t+air[1]*p.height-p.b-1)*scale*displaySize/cell).toFixed(2))}:undefined;
  frames.push({frame:n,scale,left,top,width,height,emitter,airEmitter});
 }
 if(f.id==='doraemon'){clips.flight={...clips.skill2,start:12,count:2,emitters:clips.skill2.emitters.slice(4,6)};clips.flightAttack={...clips.flight,start:13,count:1,emitterRole:'hand',emitters:[frames[13].airEmitter]};assert.ok(clips.flightAttack.emitters[0]);}
 const bytes=await sharp({create:{width:cell*4,height:job.rows*cell,channels:4,background:'#00000000'}}).composite(layers).webp({lossless:true}).toBuffer();
 const name=f.id+'-casts-'+hash(bytes).slice(0,12)+'.webp';fs.writeFileSync(out+'/'+name,bytes);
 const entry={url:'/pet/assets/art/brawl/'+name,frameWidth:cell,frameHeight:cell,clips};
 manifest.fighterSkillAnimations??={};
 if(f.id==='dragon-ball-goku'){const current=manifest.fighterSkillAnimations[f.id],approved=(Array.isArray(current)?current:[current]).find(p=>p.clips.skill1);assert.ok(approved,'preserve approved Kamehameha');manifest.fighterSkillAnimations[f.id]=[approved,entry];}
 else manifest.fighterSkillAnimations[f.id]=entry;
 reports.push({id:f.id,name,bytes:bytes.length,sourceHash:hash(fs.readFileSync(source+'/raw.png')),scale,desired,frames});
 const preview=await sharp(bytes).flatten({background:'#3c4c60'}).png().toBuffer();fs.writeFileSync(folder+'/preview.png',preview);
}
const target=out+'/manifest.json',content=JSON.stringify(manifest,null,2)+'\n';
try{fs.writeFileSync(target,content);}catch(error){if(!['UNKNOWN','EPERM','EBUSY'].includes(error.code))throw error;fs.mkdirSync(evidence,{recursive:true});fs.renameSync(target,path.join(evidence,'manifest-before-'+Date.now()+'.json'));fs.writeFileSync(target,content);}
fs.writeFileSync(evidence+'/pose-report.json',JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports.map(({id,bytes,scale,desired})=>({id,bytes,scale,desired}))));
