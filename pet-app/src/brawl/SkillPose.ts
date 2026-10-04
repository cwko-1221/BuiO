import type {Actor} from '../../lib/brawl/simulation.mjs';
import type {BrawlAssets} from './types';
import {kamehamehaPose} from './Kamehameha';

export function actorHeight(a:Actor,tick:number){
  const physical=a.z/100;
  if(a.flightUntil>0&&tick<a.flightUntil+45&&physical>0){const age=tick-(a.flightUntil-240),q=Math.max(0,Math.min(1,age/8));return Math.min(physical,Math.max(0,a.y/100-300))*q*q*(3-2*q);}
  return physical;
}
export function flightPose(a:Actor,k:any,assets:BrawlAssets,tick:number){
  const remaining=a.flightUntil-tick,age=Number(k.life||240)-remaining,clip=assets.fighters[a.kind]?.clips.skill2;
  const shooting=a.flightShots<3&&tick-(a.flightNextShot-24)<8;
  const index=remaining<12?7:age<6?4:shooting?5:5+Math.floor(age/8)%2,point=clip?.emitters?.[index];
  return {index,clip,x:a.x/100+a.facing*(point?.x||0),y:a.y/100-actorHeight(a,tick)+(point?.y??-158)};
}
// Presentation only: damage, movement, MP and deterministic replays stay in simulation.
export function skillPose(a:Actor,k:any,assets:BrawlAssets,tick=0){
  const clip=assets.fighters[a.kind]?.clips['skill'+(Number(a.skill)+1)];
  if(k?.kind==='kamehameha')return {...kamehamehaPose(a,k,assets),clip};
  const t=a.actionTick,duration=Math.max(1,a.actionDuration),wind=Number(k?.windup??12);
  let release=k?.kind==='blink'||k?.kind==='flurry'?6:k?.mechanic==='sky-shot'?wind+Math.floor((duration-wind-8)*.45):wind;
  let index=0;
  if(k?.kind==='flurry')index=t<6?Math.min(3,Math.floor(t/6*4)):t<16?3:t<23?4:t<30?5:t<34?6:7;
  else if(t<release)index=Math.min(3,Math.floor(t/release*4));
  else if(t>=duration-5)index=7;
  else if(k?.mechanic==='weapon-combo'){const phase=Math.floor((t-release)/Number(k.period||4));index=phase>=Number(k.pulses)-1?6:4+phase%2;}
  else {
    const pulses=Number(k?.pulses||k?.volleys||1),period=Number(k?.period||k?.interval||8),end=release+(pulses-1)*period+4;
    if(pulses>1&&t<end)index=(t-release)%period<2?4:5+Math.floor((t-release)/period)%2;
    else index=t<release+4?4:t<Math.max(release+7,duration-12)?5:6;
  }
  const point=clip?.emitters?.[index],z=actorHeight(a,tick);
  return {index,clip,x:a.x/100+a.facing*(point?.x??48),y:a.y/100-z+(point?.y??-85),charge:Math.min(1,t/Math.max(1,release)),release};
}
