'use strict';
const {catalog}=require('../catalog');
// Keep the three dedicated battle atlases. Other fighters use the exact published
// pet atlas and its declared frame layout, without duplicating image files.
function completeAssets(manifest,fighters){
  const assets=JSON.parse(JSON.stringify(manifest));
  for(const fighter of fighters){
    if(assets.fighters[fighter.id])continue;
    const pet=catalog.pets.find(p=>p.id===fighter.id);
    if(!pet?.atlas?.[0])throw new Error('Missing published fighter atlas: '+fighter.id);
    const layout=catalog.animationByPet[pet.id]||catalog.animation;
    const action=(name,facing='front')=>layout.actions.find(a=>a.name===name&&a.facing===facing);
    const frames=(name,facing='front')=>{const a=action(name,facing);return a?.frames.filter((_,i)=>!a.durations||a.durations[i]>0);};
    const walk=frames('walk','right')||frames('walk'),idle=frames('idle','right')||frames('idle'),happy=frames('happy'),surprise=frames('surprised'),sit=frames('sit'),sleep=frames('sleep');
    const clips={};const clip=(name,f)=>{if(!f?.length)throw new Error('Missing animation '+pet.id+':'+name);clips[name]={page:0,start:f[0],count:f.length,frames:f};};
    clip('idle',idle);const idleAction=action('idle','right')||action('idle');if(idleAction.durations)clips.idle.durations=idleAction.durations.filter(d=>d>0);clip('walk',walk);clip('run',walk);
    for(const name of ['attack1','attack2','attack3','air'])clip(name,[walk[0],walk[1],...happy,...surprise,walk[2],walk[0]]);
    clip('jump',[walk[0],...happy,...happy,...surprise,walk[0]]);clip('guard',sit);clip('break',surprise);clip('hit',surprise);clip('fall',sleep);clip('rise',[...sit,...idle]);
    clip('skill1',[...idle.slice(0,2),...happy,...surprise,...walk.slice(0,3)]);clip('skill2',[...idle.slice(0,2),...surprise,...happy,...walk.slice(0,3)]);clip('win',happy);
    assets.fighters[pet.id]={pages:[pet.atlas[0]],clips,frameWidth:layout.frameWidth,frameHeight:layout.frameHeight,originY:pet.anchors?.[0]?.bottom||.94,runtime:'pet'};
  }
  return assets;
}
module.exports={completeAssets};
