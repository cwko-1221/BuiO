import type {Actor} from '../../lib/brawl/simulation.mjs';
import type {BrawlAssets} from './types';

// One timeline drives the character's pose and the energy at their palms.
export function kamehamehaPose(a:Actor,k:any,assets:BrawlAssets){
  const wind=Number(k?.windup||32),end=wind+(Number(k?.pulses||6)-1)*Number(k?.period||10)+18,t=a.actionTick;
  const index=t<wind?Math.min(3,Math.floor(t/wind*4)):t<wind+4?4:t<end?5+Math.floor((t-wind-4)/5)%2:7;
  const emitter=assets.fighters[a.kind]?.clips.skill1.emitters?.[index];
  const dx=emitter?.x??(t<wind?-22:62),dy=emitter?.y??-80;
  const ease=(q:number)=>q*q*(3-2*q);
  return {index,x:a.x/100+a.facing*dx,y:a.y/100-a.z/100+dy,
    charge:Math.min(1,t/wind),envelope:ease(Math.min(1,(t-wind+1)/5))*ease(Math.min(1,(end-t)/7)),end};
}
