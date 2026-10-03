import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {ALL_FIGHTERS,FIGHTERS,HIDDEN_FIGHTER_IDS,fightersForVersion,INPUT as I} from '../pet-app/lib/brawl/catalog.mjs';
import {createBattle,stepBattle,replayBattle} from '../pet-app/lib/brawl/simulation.mjs';
import * as v6 from '../pet-app/lib/brawl/legacy/v6/simulation.mjs';
import {brawlSound} from '../pet-app/lib/brawl/sound.mjs';
const out='artifacts/pet-playtest/brawl-v7';await fs.mkdir(out,{recursive:true});
function fixture(fighterId){
  // Isolated positioning fixture; every kit is available through public ownership checks.
  const f=ALL_FIGHTERS.find(f=>f.id===fighterId),s=createBattle({mode:'practice'});
  Object.assign(s.actors[0],{kind:f.id,hp:f.hp-30,maxHp:f.hp});s.fighterId=f.id;return s;
}
const run=(s,n,mask=0)=>{const events=[];for(let t=0;t<n;t++){stepBattle(s,mask);events.push(...s.events);}return events;};
assert.equal(ALL_FIGHTERS.length,25);assert.equal(FIGHTERS.length,25);
assert.equal(new Set(ALL_FIGHTERS.flatMap(f=>f.skills.map(k=>k.kind))).size,50);
assert.equal(HIDDEN_FIGHTER_IDS.length,0);for(const f of FIGHTERS)assert.equal(createBattle({fighterId:f.id}).actors[0].kind,f.id);
const rows=[];
for(const f of ALL_FIGHTERS)for(const [n,k] of f.skills.entries()){
  const s=fixture(f.id),p=s.actors[0],t=s.actors[1];
  const distant=['fissure','rain','lob','tornado','field','trap','barrage','sky-shot'].includes(k.mechanic);
  t.x=p.x+(distant?k.range+(k.mechanic==='barrage'?100:0):Math.min(180,k.range||80))*100;t.y=p.y+(k.spread?.[0]||0)*100;
  const initial=t.hp;stepBattle(s,n?I.SKILL2:I.SKILL1);assert.equal(p.mp,10000-k.mp*100);assert.equal(p.cooldowns[n],k.cooldown);
  let status={},fields=0,projectiles=0,releases=0;
  for(let tick=0;tick<360;tick++){
    stepBattle(s);fields=Math.max(fields,s.fields.length);projectiles=Math.max(projectiles,s.projectiles.length);releases+=s.events.filter(e=>e.type==='skillRelease').length;
    for(const e of s.events.filter(e=>e.type==='skillRelease'))assert.equal(f.skills[e.skill]?.kind,e.kind,'Persistent effects must not announce a stale skill slot');
    for(const key of ['wetUntil','burnUntil','freezeUntil','rootUntil','shockUntil','readUntil','slowUntil'])status[key]=Math.max(status[key]||0,t[key]||0);
    for(const a of s.actors)for(const key of ['x','y','z','hp','mp','guard'])assert.ok(Number.isFinite(a[key]),f.id+' '+key);
  }
  assert.ok(releases>0,f.id+' '+k.kind+' releases');
  if(k.damage>0&&!['buff'].includes(k.mechanic))assert.ok(t.hp<initial,f.id+' '+k.kind+' deals damage');
  if(k.heal)assert.ok(p.hp>p.maxHp-30);
  if(k.element==='water'&&k.damage>0)assert.ok(status.wetUntil);if(k.burnTicks)assert.ok(status.burnUntil);if(k.freezeTicks)assert.ok(status.freezeUntil);if(k.shockTicks)assert.ok(status.shockUntil);
  rows.push({fighter:f.id,skill:k.kind,element:k.element||'star',mechanic:k.mechanic||k.kind,damage:initial-t.hp,fields,projectiles,...status});
}
console.log('✓ 50 distinct named skills: real damage/support, elemental statuses, costs and finite physics; all 25 fighters are open');
let s=fixture('spark-hamster'),p=s.actors[0],t=s.actors[1];t.x=p.x+30000;stepBattle(s,I.SKILL1|I.RIGHT);const start=p.x;run(s,60,I.RIGHT);assert.equal(p.x,start);assert.ok(t.hp<t.maxHp&&t.burnUntil>s.tick);
s=fixture('spark-hamster');p=s.actors[0];t=s.actors[1];t.x=p.x+30000;t.y=p.y+12000;stepBattle(s,I.SKILL1);run(s,120);assert.equal(t.hp,t.maxHp);
console.log('✓ Flame channel stays stationary, burns at range, and respects its widening depth cone');
s=fixture('snowfeather-penguin');p=s.actors[0];t=s.actors[1];t.x=p.x+44000;stepBattle(s,I.SKILL1);run(s,28);assert.equal(t.hp,t.maxHp);let frozen=0;for(let n=0;n<100;n++){stepBattle(s);frozen=Math.max(frozen,t.freezeUntil||0);}assert.ok(frozen);
s=fixture('snowfeather-penguin');t=s.actors[1];t.x=s.actors[0].x+44000;stepBattle(s,I.SKILL1);for(let n=0;n<140;n++){t.z=15000;t.vz=0;stepBattle(s);}assert.equal(t.hp,t.maxHp);
s=fixture('thunderhorn-goat');t=s.actors[1];t.x=s.actors[0].x+30000;stepBattle(s,I.SKILL2);run(s,14);assert.equal(s.fields.length,3);t.y=34500;run(s,130);assert.equal(t.hp,t.maxHp);
console.log('✓ Ice has a visible warning and real freeze; jumping and moving out of marked lightning zones evade damage');
function chain(wet){const s=fixture('thunderhorn-goat'),p=s.actors[0],t=s.actors[1];t.x=p.x+20000;if(wet)t.wetUntil=200;const other={...t,id:3,x:t.x+16000,hitIds:[],cooldowns:[0,0]};s.actors.push(other);stepBattle(s,I.SKILL1);const events=run(s,70);return {damage:t.maxHp-t.hp,otherDamage:other.maxHp-other.hp,links:events.filter(e=>e.type==='abilityLink').length};}
const dry=chain(false),wet=chain(true);assert.equal(wet.damage,dry.damage+3);assert.ok(dry.otherDamage>0&&dry.links===2);
console.log('✓ Lightning chains to separate foes and consumes wet status for exactly +3 damage');
s=fixture('golden-retriever-dog');p=s.actors[0];t=s.actors[1];t.x=p.x+18000;stepBattle(s,I.SKILL2);run(s,15);s.projectiles.push({id:s.nextId++,owner:t.id,team:1,x:p.x+5000,y:p.y,z:3500,dx:-800,remaining:40000,damage:8,hitIds:[]});run(s,30);assert.equal(p.hp,p.maxHp-30);assert.ok(t.hp<t.maxHp);assert.equal(p.shield,21);
console.log('✓ Golden shield reflects a real enemy projectile, spends shield and damages the original shooter');
s=fixture('pudding-pig');p=s.actors[0];t=s.actors[1];t.x=p.x+32000;stepBattle(s,I.SKILL2);run(s,40);assert.equal(t.hp,t.maxHp);run(s,70);assert.ok(t.hp<t.maxHp&&s.fields.length>0);
s=fixture('naruto-uzumaki');p=s.actors[0];t=s.actors[1];t.x=p.x+18000;stepBattle(s,I.SKILL2);const hits=run(s,160).filter(e=>e.type==='hit');assert.equal(hits.length,4);assert.equal(t.maxHp-t.hp,33);assert.equal(hits.at(-1).heavy,true);
console.log('✓ Mortar waits for its flight, then leaves a hazard; Rasengan lands three grinding hits and a distinct knockdown finisher');
for(const f of fightersForVersion('brawl-v6')){const options={version:'brawl-v6',fighterId:f.id,mode:'practice',seed:817},log=[{tick:1,mask:I.RIGHT},{tick:50,mask:0},{tick:51,mask:I.SKILL1},{tick:52,mask:0},{tick:160,mask:I.SKILL2},{tick:161,mask:0}],old=v6.createBattle(options);let mask=0;for(let tick=1;tick<=350;tick++){const frame=log.find(f=>f.tick===tick);if(frame)mask=frame.mask;v6.stepBattle(old,mask);}assert.deepEqual(replayBattle(options,log,350,{terminal:false}),old);}
console.log('✓ Every v6 fighter replays its original skills exactly after the v7 redesign');
const manifest=JSON.parse(await fs.readFile('pet-app/public/assets/art/brawl/manifest.json','utf8')),file='pet-app/public/'+manifest.elementalFx.url.replace('/pet/',''),meta=await sharp(file).metadata();assert.equal(meta.width,1024);assert.equal(meta.height,1280);assert.ok(meta.hasAlpha);assert.equal(Object.keys(manifest.elementalFx.frames).length,20);
for(let n=0;n<20;n++){const {data,info}=await sharp(file).extract({left:n%4*256,top:Math.floor(n/4)*256,width:256,height:256}).raw().toBuffer({resolveWithObject:true});let occupied=0;for(let y=0;y<256;y++)for(let x=0;x<256;x++){const alpha=data[(y*256+x)*info.channels+3];if(x<16||x>=240||y<16||y>=240)assert.equal(alpha,0);if(alpha>20)occupied++;}assert.ok(occupied>2000);}
for(const cue of ['fire','ice','lightning','water','wind','earth','chakra','ki-beam']){const sound=brawlSound(cue,12000);assert.ok(sound.length>1500);assert.ok(sound.every(x=>Number.isFinite(x)&&Math.abs(x)<=1));assert.notDeepEqual(sound,brawlSound('hit',12000));}
console.log('✓ 20 generated alpha frames have clean gutters; elemental sounds are finite and distinct from generic hits');
await fs.writeFile(out+'/elemental-coverage.json',JSON.stringify(rows,null,2));
