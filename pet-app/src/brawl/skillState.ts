import type {Actor} from '../../lib/brawl/simulation.mjs';
import type {Skill} from '../../lib/brawl/catalog.mjs';

export function skillState(actor:Actor,skill:Skill,index:number,tick:number){
  const cooldown=Math.max(0,actor.cooldowns[index]||0);
  const missingMana=Math.max(0,Math.ceil(skill.mp-actor.mp/100));
  const comboWindow=actor.kind==='starpatch-cat'&&skill.kind==='flurry'&&index===1&&actor.action==='skill1'&&actor.actionTick>=6;
  const free=['idle','walk','run','guard','jump'].includes(actor.action)||comboWindow;
  const state=actor.hp<=0?'locked':actor.freezeUntil>tick?'frozen':actor.shockUntil>tick?'shocked':cooldown?'cooldown':missingMana?'mana':actor.z>0?'air':!free?'busy':'ready';
  return {state,cooldown,missingMana,available:state==='ready',remaining:Math.ceil(cooldown/6)/10,progress:Math.min(1,cooldown/skill.cooldown)};
}
