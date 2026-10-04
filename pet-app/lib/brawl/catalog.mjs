import {ADVENTURE_CHAPTER_DESIGNS,ADVENTURE_MINIONS,ADVENTURE_BOSSES} from './adventure-design.mjs';
import {ELEMENTAL_KITS,ELEMENTAL_ROLES} from './elemental-kits.mjs';
import {FIGHTERS as V1_FIGHTERS} from './legacy/catalog.mjs';
import {FIGHTERS as V2_FIGHTERS} from './legacy/v2/catalog.mjs';
import {FIGHTERS as V3_FIGHTERS} from './legacy/v3/catalog.mjs';
import {FIGHTERS as V4_FIGHTERS} from './legacy/v4/catalog.mjs';
import {FIGHTERS as V5_FIGHTERS} from './legacy/v5/catalog.mjs';
import {FIGHTERS as V6_FIGHTERS} from './legacy/v6/catalog.mjs';
import {FIGHTERS as V7_FIGHTERS} from './legacy/v7/catalog.mjs';
import {FIGHTERS as V9_FIGHTERS} from './legacy/v9/catalog.mjs';
import {FIGHTERS as V8_FIGHTERS} from './legacy/v8/catalog.mjs';
import {FIGHTERS as V10_FIGHTERS} from './legacy/v10/catalog.mjs';
import {FIGHTERS as V11_FIGHTERS} from './legacy/v11/catalog.mjs';
import {EXTRA_FIGHTERS} from './fighter-roster.mjs';
export const VERSION = 'brawl-v12';
export const SUPPORTED_VERSIONS = Object.freeze(['brawl-v1','brawl-v2','brawl-v3','brawl-v4','brawl-v5','brawl-v6','brawl-v7','brawl-v8','brawl-v9','brawl-v10','brawl-v11',VERSION]);
export const WORLD = Object.freeze({width:5120,zoneWidth:1280,floorTop:345,floorBottom:565});
export const TICKS = 60;
export const MAX_TICKS = 36000;
export const INPUT = Object.freeze({LEFT:1,RIGHT:2,UP:4,DOWN:8,ATTACK:16,JUMP:32,GUARD:64,SKILL1:128,SKILL2:256,RUN:512,RETRY:1024,END:2048});
export const VALID_MASK = 4095;
// All published pets, including the former hidden guests, are open in Brawl.
// Ownership checks still apply in every mode.
export const HIDDEN_FIGHTER_IDS = Object.freeze([]);
export const ALL_FIGHTERS = Object.freeze([
  {id:'starpatch-cat',name:{'zh-HK':'星斑貓','en-US':'Starpatch Cat'},role:{'zh-HK':'換位追擊','en-US':'Agile hunter'},hp:100,speed:240,damage:[8,8,14],rarity:'common',color:0xf5c36a,skills:[{name:{'zh-HK':'星影換位','en-US':'Starstep'},description:{'zh-HK':'閃到前方近敵背後抓擊，留下 4 秒星印。沒有目標時只向前閃避。','en-US':'Blink behind a nearby foe and claw it, leaving a 4-second star mark. With no target, blink forward to evade.'},damage:18,mp:25,cooldown:180,kind:'blink',range:230},{name:{'zh-HK':'獵星連爪','en-US':'Starhunt Claws'},description:{'zh-HK':'躍起追擊單一敵人，連抓三次；優先追蹤星印，末擊消耗星印增傷。','en-US':'Leap at one foe for three claw strikes. Prioritize a marked foe; the finisher consumes its mark for bonus damage.'},damage:30,mp:44,cooldown:420,kind:'flurry',range:280}]},
  {id:'cloud-ear-dog',name:{'zh-HK':'雲耳狗','en-US':'Cloud-ear Dog'},role:ELEMENTAL_ROLES['cloud-ear-dog'],hp:100,speed:210,damage:[7,7,12],rarity:'common',color:0x94cfe8,skills:ELEMENTAL_KITS['cloud-ear-dog']},
  {id:'pudding-pig',name:{'zh-HK':'布丁豬','en-US':'Pudding Pig'},role:ELEMENTAL_ROLES['pudding-pig'],hp:120,speed:180,damage:[10,10,18],rarity:'common',color:0xf3a992,skills:ELEMENTAL_KITS['pudding-pig']},
  ...EXTRA_FIGHTERS,
]);
export const FIGHTERS = Object.freeze(ALL_FIGHTERS.filter(f=>!HIDDEN_FIGHTER_IDS.includes(f.id)));
const combatEnemies=values=>Object.fromEntries(Object.entries(values).map(([id,{art,...stats}])=>[id,stats]));
export const ENEMIES = Object.freeze({
  ...combatEnemies(ADVENTURE_MINIONS),...combatEnemies(ADVENTURE_BOSSES),
  mushroom:{hp:46,damage:7,speed:115,range:65}, thrower:{hp:37,damage:6,speed:90,range:440},
  shield:{hp:92,damage:10,speed:80,range:80}, slime:{hp:58,damage:9,speed:145,range:80},
  puppet:{hp:518,damage:13,speed:110,range:130}, squirrel:{hp:690,damage:16,speed:155,range:400}, golem:{hp:863,damage:18,speed:80,range:150},
});
const openingStages = [
  {id:'sunny-training',name:{'zh-HK':'陽光訓練場','en-US':'Sunlit Training Grounds'},subtitle:{'zh-HK':'練習連段與正面防守','en-US':'Combos, guarding and openings'},boss:'puppet',bossName:{'zh-HK':'木偶隊長','en-US':'Captain Timber'},enemies:['mushroom','shield'],colors:[0xd5e9c6,0xf4dfad]},
  {id:'windbell-forest',name:{'zh-HK':'風鈴森林','en-US':'Windbell Woods'},subtitle:{'zh-HK':'前後走位，避開風彈','en-US':'Change lanes and evade projectiles'},boss:'squirrel',bossName:{'zh-HK':'風鈴松鼠','en-US':'Windbell Squirrel'},enemies:['mushroom','thrower','slime'],colors:[0x96c9b2,0xa8c9ac]},
  {id:'starcrystal-cave',name:{'zh-HK':'星晶洞穴','en-US':'Starcrystal Cavern'},subtitle:{'zh-HK':'看清預警，迎戰石像','en-US':'Read the warnings and face the guardian'},boss:'golem',bossName:{'zh-HK':'星晶石像','en-US':'Starcrystal Guardian'},enemies:['mushroom','thrower','shield','slime'],colors:[0x666e9e,0xb9a8d5]},
];
export const STAGES=Object.freeze(ADVENTURE_CHAPTER_DESIGNS.map(d=>({...((d.number<=3)?openingStages[d.number-1]:{id:d.id,name:d.name,subtitle:d.title,boss:d.boss,bossName:ADVENTURE_BOSSES[d.boss].name,enemies:d.enemies,colors:d.colors}),chapter:d.number,act:d.act,encounters:d.number<=3||d.number>=18?[6,8,10]:[4,6,8]})));
export const DIFFICULTIES = Object.freeze({easy:{hp:80,damage:65,reaction:27,slots:1,telegraph:54},normal:{hp:100,damage:100,reaction:18,slots:2,telegraph:42},hard:{hp:120,damage:125,reaction:12,slots:3,telegraph:27}});
export const CLIPS = Object.freeze({idle:[0,8],walk:[8,8],run:[16,8],attack1:[24,8],attack2:[32,8],attack3:[40,8],jump:[48,8],air:[56,8],guard:[64,4],break:[68,4],hit:[72,4],fall:[76,4],rise:[80,4],skill1:[88,8],skill2:[96,8],win:[104,8]});
export const fighterById = id => FIGHTERS.find(f=>f.id===id);
export const fightersForVersion = version => version==='brawl-v1'?V1_FIGHTERS:version==='brawl-v2'?V2_FIGHTERS:version==='brawl-v3'?V3_FIGHTERS:version==='brawl-v4'?V4_FIGHTERS:version==='brawl-v5'?V5_FIGHTERS:version==='brawl-v6'?V6_FIGHTERS:version==='brawl-v7'?V7_FIGHTERS:version==='brawl-v8'?V8_FIGHTERS:version==='brawl-v9'?V9_FIGHTERS:version==='brawl-v10'?V10_FIGHTERS:version==='brawl-v11'?V11_FIGHTERS:FIGHTERS;
export const stageById = id => STAGES.find(s=>s.id===id);

// Combat lookup and launch roster include all published kits; launch checks ownership.
export const combatFighterById = id => ALL_FIGHTERS.find(f=>f.id===id);
