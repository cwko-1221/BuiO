import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import sharp from 'sharp';
import {findCells,keepPose} from './sheet-cells.mjs';
import {FIGHTERS} from '../pet-app/lib/brawl/catalog.mjs';
const require=createRequire(import.meta.url),id='gundam-rx-78-2';
const source='pet-app/art-source/gundam-brawl-v1',out='pet-app/public/assets/art/brawl',evidence='artifacts/pet-playtest/gundam-brawl';
await fs.mkdir(evidence,{recursive:true});
const manifest=JSON.parse(await fs.readFile(out+'/manifest.json','utf8'));
const base=require('../pet-app/lib/brawl/assets.cjs').completeAssets({...manifest,fighterSkillAnimations:{},fighterAttackAnimations:{}},FIGHTERS).fighters[id];
const baseFile='pet-app/public/'+base.pages[0].slice('/pet/'.length).split('?')[0],meta=await sharp(baseFile).metadata(),fw=base.frameWidth,fh=base.frameHeight;
const idle=base.clips.idle.frames?.[0]??base.clips.idle.start;
const seed=await sharp(baseFile).extract({left:idle%(meta.width/fw)*fw,top:Math.floor(idle/(meta.width/fw))*fh,width:fw,height:fh}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function rig(data,w,h){
  let l=w,r=-1,t=h,b=-1;const eyes=[],boots=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const at=(y*w+x)*4,[R,G,B,A]=data.subarray(at,at+4);if(A<32)continue;l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
    if(A>180&&G>70&&G>R*1.35&&G>B*1.15)eyes.push([x,y]);
    if(y>h*.6&&A>180&&R>140&&G>12&&G<100&&B<95)boots.push([x,y]);
  }
  assert.ok(eyes.length>3&&boots.length>10,'Visible sensor and red boot anchors');
  const bottom=Math.max(...boots.map(p=>p[1])),feet=boots.filter(p=>p[1]>=bottom-10);
  return {l,r,t,b,width:r-l+1,height:b-t+1,foot:feet.reduce((n,p)=>n+p[0],0)/feet.length,bottom,eyeY:eyes.reduce((n,p)=>n+p[1],0)/eyes.length};
}
const reference=rig(seed.data,fw,fh),worldBottom=(reference.bottom+1-fh*(base.originY||.94))*180/fh;
// Larger transparent cells accommodate the extended rifle/saber without scaling
// down the robot. Display size preserves the published atlas's pixel density.
const cell=384,displaySize=180*cell/fh,bottom=cell-31,originY=(bottom+1-worldBottom*cell/displaySize)/cell,report={id,mode:'built-in imagegen; shared-scale strip normalization',reference,worldBottom,displaySize,originY,poses:{},effects:{}};
async function publish(prefix,layers){const bytes=await sharp({create:{width:cell*4,height:cell*2,channels:4,background:'#00000000'}}).composite(layers).webp({lossless:true}).toBuffer();const name=prefix+'-'+hash(bytes).slice(0,12)+'.webp';await fs.writeFile(out+'/'+name,bytes);return '/pet/assets/art/brawl/'+name;}
const anchors={rifle:[[.70,.91],[.985,.28],[.98,.37],[.985,.37],[.98,.25],[.985,.325],[.84,.75],[.70,.87]],saber:[[.30,.75],[.30,.53],[.34,.32],[.34,.20],[.46,.67],[.49,.50],[.69,.51],[.38,.76]]};
const animations=[];
for(const [index,name] of ['rifle','saber'].entries()){
  const file=source+'/'+name+'-raw.png',m=await sharp(file).metadata();assert.ok(m.hasAlpha);
  const cells=await findCells(file,4,2),poses=[];assert.ok(cells.every(Boolean));
  for(const [n,box0] of cells.entries()){
    const left=Math.max(0,box0.left-2),top=Math.max(0,box0.top-2),box={left,top,width:Math.min(m.width-left,box0.width+4),height:Math.min(m.height-top,box0.height+4)};
    const bytes=await keepPose(file,box,await sharp(file).extract(box).png().toBuffer());
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),p=rig(data,info.width,info.height);
    const rawPoint={x:(n%4+anchors[name][n][0])*m.width/4-left,y:(Math.floor(n/4)+anchors[name][n][1])*m.height/2-top};
    poses.push({...p,bytes,rawPoint,box});
  }
  const eyeHeight=([poses[0],poses[7]].reduce((n,p)=>n+p.bottom-p.eyeY,0))/2;
  const desired=(reference.bottom-reference.eyeY)/eyeHeight;
  const scale=Math.min(desired,...poses.map(p=>(cell/2-6)/Math.max(p.foot-p.l,p.r-p.foot)),...poses.map(p=>(bottom-6)/(p.bottom-p.t+1)),...poses.map(p=>(cell-bottom-6)/Math.max(1,p.b-p.bottom)));
  assert.ok(scale/desired>.88,'Do not shrink character to fit its weapon: '+name);
  const layers=[],emitters=[],frames=[];
  for(const [n,p] of poses.entries()){
    const width=Math.round(p.width*scale),height=Math.round(p.height*scale),left=Math.round(cell/2-(p.foot-p.l)*scale),top=bottom-Math.round((p.bottom-p.t)*scale);
    assert.ok(left>=4&&top>=4&&left+width<=cell-4&&top+height<=cell-4,'Clear pose gutters '+name+':'+n);
    const input=await sharp(p.bytes).extract({left:p.l,top:p.t,width:p.width,height:p.height}).resize(width,height).png().toBuffer();
    const frame=await sharp({create:{width:cell,height:cell,channels:4,background:'#00000000'}}).composite([{input,left,top}]).png().toBuffer();
    await fs.writeFile(evidence+'/'+name+'-'+n+'.png',frame);layers.push({input:frame,left:n%4*cell,top:Math.floor(n/4)*cell});
    emitters.push({x:Number(((p.rawPoint.x-p.foot)*scale*displaySize/cell).toFixed(2)),y:Number((worldBottom+(p.rawPoint.y-p.bottom-1)*scale*displaySize/cell).toFixed(2))});
    frames.push({frame:n,scale,left,top,width,height,heel:{x:cell/2,y:bottom},emitter:emitters[n],source:p.box});
  }
  const url=await publish(id+'-'+name+'-poses',layers);
  animations.push({url,frameWidth:cell,frameHeight:cell,clips:{['skill'+(index+1)]:{start:0,count:8,poseTimeline:'cast',emitters,emitterRole:'weapon',displaySize,originY}}});
  await sharp(out+'/'+path.basename(url)).flatten({background:'#314b58'}).png().toFile(evidence+'/'+name+'-poses-preview.png');
  report.poses[name]={url,sourceHash:hash(await fs.readFile(file)),desired,scale,frames};
}
manifest.fighterSkillAnimations??={};manifest.fighterSkillAnimations[id]=animations;
const normalFrames={attack1:[0,1,2,4,4,6,7,0],attack2:[0,1,3,5,5,6,7,0],attack3:[0,1,2,6,6,4,7,0],air:[0,2,3,4,4,6,7,0]};
manifest.fighterAttackAnimations??={};manifest.fighterAttackAnimations[id]=[{url:animations[1].url,frameWidth:cell,frameHeight:cell,clips:Object.fromEntries(Object.entries(normalFrames).map(([name,frames])=>[name,{start:0,count:8,frames,poseTimeline:'strike',displaySize,originY}]))}];
for(const name of ['rifle','saber']){
  const file=source+'/'+name+'-fx-raw.png',m=await sharp(file).metadata();assert.ok(m.hasAlpha);
  const cells=await findCells(file,4,2);assert.ok(cells.every(Boolean));const layers=[],frames=[];
  for(const [n,b] of cells.entries()){
    const bytes=await keepPose(file,b,await sharp(file).extract(b).png().toBuffer());
    const resized=await sharp(bytes).resize(Math.floor(cell*.9),Math.floor(cell*.9),{fit:'inside'}).png().toBuffer(),d=await sharp(resized).metadata(),left=Math.floor((cell-d.width)/2),top=Math.floor((cell-d.height)/2);
    layers.push({input:resized,left:n%4*cell+left,top:Math.floor(n/4)*cell+top});frames.push({frame:n,source:b,width:d.width,height:d.height,left,top});
  }
  const url=await publish(id+'-'+name+'-fx',layers);
  manifest.skillFx??={};manifest.skillFx['rx-beam-'+name]={url,frameWidth:cell,frameHeight:cell,frames:8,widthRatio:.9,heightRatio:.9,originX:name==='saber'?.15:.5,originY:.5,anchor:'center'};
  report.effects[name]={url,sourceHash:hash(await fs.readFile(file)),frames};
  await sharp(out+'/'+path.basename(url)).flatten({background:'#314b58'}).png().toFile(evidence+'/'+name+'-fx-preview.png');
}
const manifestFile=out+'/manifest.json',manifestBytes=JSON.stringify(manifest,null,2)+'\n';
try { await fs.writeFile(manifestFile,manifestBytes); }
catch(error){
  if(!['UNKNOWN','EBUSY','EPERM'].includes(error.code))throw error;
  const backup=evidence+'/manifest-before-'+Date.now()+'.json';
  await fs.rename(manifestFile,backup);
  try { await fs.writeFile(manifestFile,manifestBytes); }
  catch(writeError){await fs.rename(backup,manifestFile);throw writeError;}
}
await fs.writeFile(evidence+'/build-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({poses:report.poses,effects:report.effects}));
