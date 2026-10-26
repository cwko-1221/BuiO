import {ENEMIES} from './catalog.mjs';
import {abilityDuration,setupAbility,updateAbility} from './elemental-combat.mjs';
export const enemyBrain=a=>ENEMIES[a.kind]?.brain||a.kind;
const effects={physical:'paper',nature:'roots',water:'tidal',fire:'fire',ice:'blizzard',lightning:'thunder',wind:'wind',earth:'rock',psychic:'cosmic',lunar:'moon'};
// New enemies use the same integer hitboxes and telegraphed elemental systems as
// pets. Their casts never spend or refund player MP; no rendering enters replay.
export function enemyKit(a){
 const e=ENEMIES[a.kind];if(!e?.brain)return undefined;
 const element=e.pattern==='echo'?['fire','ice','lightning','wind'][(a.phase-1)%4]:e.element;
 const k={enemy:true,kind:'enemy',mechanic:'projectile',effect:effects[element],element,damage:e.damage,range:620,speed:390,size:36,depth:28,windup:a.windup||42,duration:(a.windup||42)+40};
 if(element==='fire')k.burnTicks=120;
 if(element==='ice'){k.freezeTicks=24;k.slowTicks=60;}
 if(element==='water')k.wetTicks=120;
 if(element==='nature')k.rootTicks=18;
 if(element==='lightning')k.shockTicks=12;
 if(element==='wind')k.slowTicks=45;
 if(!a.boss){
  if(e.brain==='thrower')return {...k,range:e.range+100,damage:e.damage,speed:330};
  if(a.kind==='ember-salamander')return {...k,mechanic:'flamethrower',range:175,depth:34,pulses:2,period:12,damage:5};
  if(a.kind==='sand-scarab')return {...k,mechanic:'orbit',range:100,pulses:1,damage:e.damage};
  return undefined;
 }
 const odd=a.phase%2===1;
 switch(e.pattern){
  case 'fan':return odd?{...k,spread:[-48,0,48],range:720}:{...k,mechanic:'lob',flight:38,range:340,radius:105,height:160};
  case 'tidal':return odd?{...k,mechanic:'wave',effect:'tidal',spread:[-48,0,48],speed:350,size:58}:{...k,mechanic:'field',range:220,radius:115,arm:30,life:120,period:40,damage:6,slowTicks:45};
  case 'flame':return odd?{...k,mechanic:'flamethrower',range:360,depth:65,pulses:3,period:12,damage:7,finisher:10}:{...k,mechanic:'rain',range:500,columns:3,gap:125,arm:30,interval:12,damage:11};
  case 'ice':return odd?{...k,mechanic:'rain',range:550,columns:3,gap:135,arm:30,interval:12}:{...k,mechanic:'wave',spread:[-45,45],speed:340,size:52,range:680};
  case 'storm':return odd?{...k,mechanic:'rain',range:550,columns:3,gap:130,arm:36,interval:12}:{...k,mechanic:element==='wind'?'tornado':'projectile',range:230,radius:85,arm:18,life:130,period:45,speed:100,pull:0,damage:8,spread:[-55,0,55]};
  case 'roots':return odd?{...k,mechanic:'fissure',range:420,columns:3,gap:125,arm:24,interval:10,damage:11}:{...k,mechanic:'trap',range:215,radius:95,arm:24,life:140,damage:12};
  case 'orbit':return odd?{...k,mechanic:'orbit',range:205,pulses:2,period:16,damage:9}:{...k,mechanic:'lob',range:340,flight:42,radius:115,height:190,damage:13};
  case 'crescent':return odd?{...k,effect:'moon',spread:[-40,40],returning:true,catchMp:0,speed:390,range:500}:{...k,mechanic:'fissure',range:440,columns:3,gap:145,arm:30,interval:12,damage:12};
  case 'echo':return element==='fire'?{...k,mechanic:'flamethrower',range:410,depth:65,pulses:3,period:12,damage:7,finisher:11}:element==='wind'?{...k,mechanic:'tornado',range:220,radius:95,life:140,arm:20,period:45,speed:95,damage:8}:{...k,mechanic:'rain',range:600,columns:3,gap:150,arm:32,interval:12,damage:13};
  default:return k;
 }
}
export function prepareEnemyAttack(s,a){const k=enemyKit(a);if(!k)return;a.enemyAttack=k;setupAbility(s,a,k);a.actionDuration=Math.max(a.actionDuration,abilityDuration(k));}
export function runEnemyAttack(s,a,c){const k=enemyKit(a);if(!k)return false;a.facing=a.abilityFacing||a.facing;updateAbility(s,a,k,a.actionTick,c);return true;}
