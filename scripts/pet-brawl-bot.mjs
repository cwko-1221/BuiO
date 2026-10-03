import {INPUT as I,DIFFICULTIES,fightersForVersion} from '../pet-app/lib/brawl/catalog.mjs';
import {createBattle,stepBattle,battleResult} from '../pet-app/lib/brawl/simulation.mjs';
// A reproducible player, using the same legal controls as the browser. It never edits
// HP, positions, enemies or outcomes; full winning logs exercise the real verifier.
export function botInput(s){const p=s.actors[0];if(s.status==='ko')return I.RETRY;if(s.cleared)return I.RIGHT|I.RUN;
 const enemies=s.actors.filter(a=>a.team===1&&a.hp>0);if(!enemies.length)return 0;
 const target=enemies.sort((a,b)=>Math.abs(a.x-p.x)+Math.abs(a.y-p.y)*2-Math.abs(b.x-p.x)-Math.abs(b.y-p.y)*2)[0];
 const dx=(target.x-p.x)/100,dy=(target.y-p.y)/100;let mask=0;
 const ranged=p.kind==='cloud-ear-dog',kit=fightersForVersion(s.version).find(f=>f.id===p.kind),earth=p.kind==='pudding-pig'&&['brawl-v7','brawl-v8','brawl-v9','brawl-v10'].includes(s.version),range=55;
 if(Math.abs(dy)>12)mask|=dy>0?I.DOWN:I.UP;
 if(Math.abs(dx)>range)mask|=(dx>0?I.RIGHT:I.LEFT)|I.RUN;
 if(dx*p.facing<0)mask|=dx>0?I.RIGHT:I.LEFT;
 const danger=['brawl-v9','brawl-v10'].includes(s.version)&&s.fields?.filter(f=>f.team!==p.team&&f.expires>s.tick&&Math.abs(f.x-p.x)<(f.radius+20)*100&&Math.abs(f.y-p.y)<9000).sort((a,b)=>a.starts-b.starts)[0];
 if(danger){const direction=danger.y>45500?I.UP:I.DOWN;return direction|I.RUN|(p.z===0&&danger.starts-s.tick<16?I.JUMP:0);}
 const threatening=enemies.find(a=>a.boss&&a.action.startsWith('attack')&&Math.abs(a.x-p.x)<35000&&a.actionTick<(a.windup||DIFFICULTIES[s.difficulty].telegraph+6)+28);
 if(threatening){
   const k=['brawl-v9','brawl-v10'].includes(s.version)&&threatening.enemyAttack;
   if(k){
     if(['orbit','flamethrower','fissure'].includes(k.mechanic)&&Math.abs(p.y-threatening.y)<8500)return (threatening.y>45500?I.UP:I.DOWN)|I.RUN;
     if(['rain','lob','trap','field'].includes(k.mechanic)&&(k.element==='ice'||threatening.actionTick>=(threatening.windup||42)))return (threatening.y>45500?I.UP:I.DOWN)|I.RUN;
     if(['projectile','wave','tornado'].includes(k.mechanic)&&Math.abs(p.y-threatening.y)<10500)return (threatening.y>45500?I.UP:I.DOWN)|I.RUN|(p.z===0&&threatening.actionTick>=(threatening.windup||42)-12?I.JUMP:0);
   }else{
     if(threatening.phase%2!==0&&Math.abs(p.x-threatening.x)<15000&&Math.abs(p.y-threatening.y)<6000&&p.guard>4000)return (p.facing*(threatening.x-p.x)<0?(threatening.x>p.x?I.RIGHT:I.LEFT):0)|I.GUARD;
     if(threatening.kind==='golem'&&threatening.phase%2===0)return (p.z===0&&threatening.actionTick>threatening.windup-18?I.JUMP:0);
     if(Math.abs(p.y-threatening.y)<9500)return threatening.y>45500?I.UP:I.DOWN;
     return 0;
   }
 }
 const incoming=s.projectiles.find(a=>a.team===1&&Math.abs(a.y-p.y)<2700&&(p.x-a.x)*a.dx>0&&Math.abs(a.x-p.x)<15000);
 if(incoming&&p.z===0)return mask|I.JUMP;
 if(Math.abs(dy)<24){const cat=p.kind==='starpatch-cat'&&['brawl-v3','brawl-v4','brawl-v5','brawl-v6','brawl-v7','brawl-v8','brawl-v9','brawl-v10'].includes(s.version);if(cat&&target.starMarkOwner===p.id&&target.starMarkUntil>s.tick&&p.cooldowns[1]===0&&p.mp>=(kit?.skills[1].mp||35)*100&&Math.abs(dx)<280)mask|=I.SKILL2;else if(p.cooldowns[0]===0&&p.mp>=(kit?.skills[0].mp||20)*100&&Math.abs(dx)<(ranged?570:cat?230:earth?420:200)&&(!earth||Math.abs(dx)>85))mask|=I.SKILL1;else if(p.cooldowns[1]===0&&p.mp>=(kit?.skills[1].mp||35)*100&&Math.abs(dx)<(cat?280:earth?430:130)&&(!earth||Math.abs(dx)>190))mask|=I.SKILL2;
 if(Math.abs(dx)<95&&s.tick%12<6)mask|=I.ATTACK;}
 return mask;
}
export function playBot(options){const state=createBattle(options),inputs=[];let last=0;while(!['won','lost','draw'].includes(state.status)&&state.tick<36000){const mask=botInput(state);if(mask!==last){inputs.push({tick:state.tick+1,mask});last=mask;}stepBattle(state,mask);}return {inputs,endTick:state.tick,result:battleResult(state),state};}
