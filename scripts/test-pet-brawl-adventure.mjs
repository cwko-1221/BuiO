import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {STAGES,ENEMIES,INPUT} from '../pet-app/lib/brawl/catalog.mjs';
import {ADVENTURE} from '../pet-app/lib/brawl/story.mjs';
import {createBattle,stepBattle} from '../pet-app/lib/brawl/simulation.mjs';
import {enemyKit} from '../pet-app/lib/brawl/enemy-combat.mjs';

assert.equal(STAGES.length,20);
assert.equal(new Set(STAGES.map(s=>s.boss)).size,20);
for(const stage of STAGES){
 const story=ADVENTURE.chapters.find(c=>c.stageId===stage.id);
 assert.equal(story.sections.length,4);
 assert.equal(stage.encounters.length,3);
 for(const kind of [...stage.enemies,stage.boss])assert.ok(ENEMIES[kind],kind);
}
const fresh=Object.entries(ENEMIES).filter(([,e])=>e.brain);
assert.equal(fresh.length,29);
for(const [kind,e] of fresh){
 const boss=STAGES.find(s=>s.boss===kind),a={kind,boss:!!boss,phase:1,windup:48};
 const k=enemyKit(a);
 if(k){assert.equal(k.windup,48);assert.ok(k.duration>k.windup);assert.ok(k.damage>0);assert.equal(k.enemy,true);}
 if(boss){assert.ok(k);a.phase=2;assert.ok(enemyKit(a));}
}
console.log('✓ Twenty distinct bosses, four sections per chapter and twenty-nine new enemy definitions');

// Isolated combat fixtures exercise actual AI casts, hit detection and statuses.
// Production saves and input-only reward tests never use these fixture edits.
function encounter(stageId,phase=0,guard=false){
 const s=createBattle({mode:'campaign',stageId,difficulty:'easy',seed:1});
 Object.assign(s,{zone:3,total:1,spawned:0,spawnAt:0});
 Object.assign(s.actors[0],{x:430000,y:45500,facing:1});
 stepBattle(s);const boss=s.actors.find(a=>a.boss);
 assert.ok(boss);Object.assign(boss,{x:440000,y:45500,facing:-1,phase,nextAttack:0,lastThink:-999});
 const events=[];let cast;
 for(let i=0;i<200;i++){
  stepBattle(s,guard?INPUT.GUARD:0);events.push(...s.events);
  if(!cast&&boss.enemyAttack)cast={tick:s.tick,windup:boss.windup,mechanic:boss.enemyAttack.mechanic};
 }
 return {s,boss,events,cast,p:s.actors[0]};
}
for(const stage of STAGES.slice(3)){
 for(const phase of [0,1]){
  const b=encounter(stage.id,phase);
  assert.ok(b.cast,stage.id+' casts its pattern');
  const first=b.events.find(e=>e.type==='skillRelease');assert.ok(first,stage.id+' releases its attack');
  assert.equal(first.element,enemyKit({...b.boss,phase:phase+1}).element);
 }
}
let b=encounter('ember-forge');assert.ok(b.events.some(e=>e.type==='elementStatus'&&e.element==='fire'));
b=encounter('frost-mirror-field');assert.ok(b.events.some(e=>e.type==='elementStatus'&&e.element==='ice'));
const guarded=encounter('ember-forge',0,true);
assert.ok(guarded.events.some(e=>e.type==='block'));
assert.equal(guarded.events.some(e=>e.type==='elementStatus'&&e.actor===guarded.p.id),false,'A guarded elemental hit must not apply a status');
console.log('✓ All seventeen new bosses cast both patterns; real flame and ice hits apply statuses, while guard prevents status application');

const assets=JSON.parse(await fs.readFile('pet-app/public/assets/art/brawl/manifest.json','utf8'));
assert.equal(Object.keys(assets.areas).length,20);assert.equal(Object.keys(assets.enemySprites).length,29);
const file=url=>path.join('pet-app/public',url.slice('/pet/'.length));
for(const stage of STAGES){
 assert.equal(assets.areas[stage.id].length,4);
 assert.equal(new Set(assets.areas[stage.id]).size,4);
 for(const url of assets.areas[stage.id]){const m=await sharp(file(url)).metadata();assert.equal(m.width,1280);assert.equal(m.height,720);}
}
for(const [kind] of fresh){
 const art=assets.enemySprites[kind];assert.ok(art,kind);
 const m=await sharp(file(art.url)).metadata();assert.equal(m.width,2048);assert.equal(m.height,256);assert.equal(m.hasAlpha,true);
 const pixels=await sharp(file(art.url)).ensureAlpha().raw().toBuffer();
 for(let frame=0;frame<8;frame++){
  let opaque=0;for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(pixels[(y*2048+frame*256+x)*4+3]>16){opaque++;assert.ok(x>=8&&x<=247&&y<240,kind+' keeps its complete silhouette inside its frame');}
  assert.ok(opaque>500,kind+' frame '+frame);
 }
}
for(const speaker of ['paperfox','dragon','tideguide'])assert.ok(assets.storyPortraits[speaker]);
console.log('✓ Eighty distinct area images, twenty-nine complete eight-frame alpha strips and three story portraits fit iPad texture limits');
