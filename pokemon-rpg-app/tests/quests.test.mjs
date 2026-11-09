import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {QUESTS,QUEST_BY_ID} from '../src/data/quests.mjs';
import {ensureAdventure,acceptQuest,recordQuestEvent,questProgress,claimQuest,getTrackedQuest} from '../src/engine/questEngine.mjs';
import {createPokemonInstance} from '../src/data/pokemon.mjs';
import {MAP_ZONES,isPositionWalkable} from '../src/data/world.mjs';
import {THEME_ATLAS} from '../src/data/themeAtlas.mjs';
import {LANDMARK_ATLAS} from '../src/data/landmarkAtlas.mjs';
import {NPCS} from '../src/data/trainers.mjs';
import {getActiveWorldNpc} from '../src/data/worldAdventure.mjs';
const require=createRequire(import.meta.url),{sanitizeSaveData}=require('../repositories/rpg.repo.js');
function save(){const mon=createPokemonInstance('charmander',5);return{version:1,trainer:{name:'任務測試',avatarId:'blaze',starterId:'charmander'},position:{zone:'dawnleaf',x:0,z:6,facing:'down'},party:[mon],box:[],followers:[mon.uid],gold:100,inventory:{},pokedex:{seen:['charmander'],caught:['charmander']},questStage:0,defeatedNpcs:[],badges:[],storyFlags:{},stats:{battlesWon:0,pokemonCaught:1}};}
function fulfill(s,o){const a=s.adventure;switch(o.type){case'event':recordQuestEvent(s,o.key);break;case'inspect':if(!a.inspected.includes(o.key))a.inspected.push(o.key);break;case'collected':if(!a.collected.includes(o.key))a.collected.push(o.key);break;case'visit':a.visited.push(o.key);break;case'defeated':s.defeatedNpcs.push(o.key);break;case'ending':s.questStage=6;break;case'dex':s.pokedex.caught=['charmander','eevee'];break;default:throw Error(o.type);}}

test('all six 5x5 atlases contain 150 installed transparent source assets and every variant is placed',()=>{
  assert.equal(Object.keys(THEME_ATLAS).length,6);
  assert.equal(Object.keys(LANDMARK_ATLAS).length,6);
  for(const [id,list]of Object.entries(THEME_ATLAS)){
    assert.equal(list.length,25);for(const asset of list){assert.ok(asset.width>20&&asset.height>20);assert.ok(fs.existsSync(new URL('../public'+asset.src.replace('/pokemon-rpg',''),import.meta.url)));}
    const landmarks=LANDMARK_ATLAS[id];
    assert.equal(landmarks.length,25);for(const asset of landmarks){assert.ok(asset.width>20&&asset.height>20);assert.ok(fs.existsSync(new URL('../public'+asset.src.replace('/pokemon-rpg',''),import.meta.url)));}
    assert.equal(new Set(MAP_ZONES[id].themeProps.map(p=>p.variant)).size,19);
    assert.ok(MAP_ZONES[id].landmarkProps.length>=15,id+' has landmark setpieces placed');
    for(const object of MAP_ZONES[id].fieldObjects)assert.ok(isPositionWalkable(object.x,object.z,id),object.id+' is reachable on foot');
  }
});
test('38 quests have valid rewards, prerequisite graph and actual world/NPC references',()=>{
  assert.equal(QUESTS.length,38);assert.equal(new Set(QUESTS.map(q=>q.id)).size,38);
  const seen=new Set(),fieldIds=new Set(Object.values(MAP_ZONES).flatMap(m=>m.fieldObjects.map(p=>p.id)));
  for(const q of QUESTS){assert.ok(MAP_ZONES[q.zone]);for(const p of q.requires)assert.ok(seen.has(p),q.id+' prerequisite precedes it');seen.add(q.id);
    for(const o of q.objectives){if(['inspect','collected'].includes(o.type))assert.ok(fieldIds.has(o.key),o.key);if(o.type==='defeated'||o.key?.startsWith('talk:'))assert.ok(NPCS.some(n=>n.id===(o.type==='defeated'?o.key:o.key.slice(5))),o.key);}
  }
});
test('new game starts in Dawnleaf; later conversations cannot be completed by earlier dialogue',()=>{
  const s=save();ensureAdventure(s);assert.equal(getTrackedQuest(s,zone=>MAP_ZONES[zone]).id,'m01');
  recordQuestEvent(s,'talk:nurse_joy');recordQuestEvent(s,'talk:prof_hibiscus');assert.ok(claimQuest(s,'m01').ok);
  const nurse=questProgress(s,QUEST_BY_ID.m02).objectives[0];assert.equal(nurse.value,0,'Earlier talk does not skip a newly assigned visit');
  assert.equal(claimQuest(s,'m03').ok,false,'Locked chapters cannot be claimed');
});
test('complete all 13 main chapters across save serialization; rewards and world changes occur once',()=>{
  let s=save();ensureAdventure(s);let rewards=0;
  for(const q of QUESTS.filter(q=>q.category==='main')){
    assert.ok(s.adventure.accepted[q.id],q.id+' is auto accepted');for(const o of q.objectives)fulfill(s,o);
    assert.ok(questProgress(s,q).ready,q.id+' ready');const before=s.gold;assert.ok(claimQuest(s,q.id).ok);rewards+=q.reward.gold;
    assert.equal(s.gold,before+q.reward.gold);assert.equal(claimQuest(s,q.id).ok,false,'Duplicate claim rejected');assert.equal(s.gold,before+q.reward.gold);
    s=sanitizeSaveData(JSON.parse(JSON.stringify(s)));ensureAdventure(s);
  }
  assert.equal(s.gold,100+rewards);assert.equal(s.adventure.completed.length,13);assert.ok(s.storyFlags.forest_restored&&s.storyFlags.coast_beacon&&s.storyFlags.canyon_stable&&s.storyFlags.starlight_restored);
  assert.equal(getTrackedQuest(s),null);assert.ok(s.inventory.masterball>=1);
  const researcher=NPCS.find(n=>n.id==='forest_researcher');
  const returned=getActiveWorldNpc(researcher,s);
  assert.notEqual(returned.x,researcher.x,'Forest restoration returns the researcher to camp');
  assert.ok(isPositionWalkable(returned.x,returned.z,'mosswood'));
  assert.notDeepEqual(returned.dialogueZh,researcher.dialogueZh,'The restored forest changes the conversation');
});
test('side, research, exploration and crafting progress survives save reload',()=>{
  let s=save();ensureAdventure(s);assert.ok(acceptQuest(s,'s01'));fulfill(s,QUEST_BY_ID.s01.objectives[0]);fulfill(s,QUEST_BY_ID.s01.objectives[1]);recordQuestEvent(s,'talk:nurse_joy');
  assert.ok(claimQuest(s,'s01').ok);recordQuestEvent(s,'craft:potion');assert.ok(acceptQuest(s,'r07'));assert.ok(questProgress(s,QUEST_BY_ID.r07).ready,'Previously crafted potion is recorded');
  s.adventure.resources={berry:3,herb:2};s.adventure.tracked='r07';s.adventure.rested.push('mosswood');s=sanitizeSaveData(s);ensureAdventure(s);
  assert.ok(s.adventure.completed.includes('s01'));assert.equal(s.adventure.resources.herb,2);assert.equal(s.adventure.tracked,'r07');assert.ok(claimQuest(s,'r07').ok);
});
test('adventure save sanitizer rejects prototype keys, duplicate arrays and unbounded counters',()=>{
  const s=save();s.adventure=JSON.parse('{"accepted":{"__proto__":{"base":{}},"m01":{"base":{"talk:prof_hibiscus":-8}}},"events":{"__proto__":8,"craft:potion":100000000},"collected":["dawnleaf_berry_2","dawnleaf_berry_2"],"resources":{"berry":-10,"herb":1000000}}');
  const a=sanitizeSaveData(s).adventure;assert.equal(Object.hasOwn(a.accepted,'__proto__'),false);assert.equal(a.events['craft:potion'],99999);assert.equal(a.resources.berry,0);assert.equal(a.resources.herb,999);assert.deepEqual(a.collected,['dawnleaf_berry_2']);
});
