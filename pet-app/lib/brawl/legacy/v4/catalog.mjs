import {FIGHTERS as V1_FIGHTERS} from '../catalog.mjs';
import {FIGHTERS as V2_FIGHTERS} from '../v2/catalog.mjs';
import {FIGHTERS as V3_FIGHTERS} from '../v3/catalog.mjs';
export const VERSION = 'brawl-v4';
export const SUPPORTED_VERSIONS = Object.freeze(['brawl-v1','brawl-v2','brawl-v3',VERSION]);
export const WORLD = Object.freeze({width:5120,zoneWidth:1280,floorTop:345,floorBottom:565});
export const TICKS = 60;
export const MAX_TICKS = 36000;
export const INPUT = Object.freeze({LEFT:1,RIGHT:2,UP:4,DOWN:8,ATTACK:16,JUMP:32,GUARD:64,SKILL1:128,SKILL2:256,RUN:512,RETRY:1024,END:2048});
export const VALID_MASK = 4095;
export const FIGHTERS = Object.freeze([
  {id:'starpatch-cat',name:{'zh-HK':'星斑貓','en-US':'Starpatch Cat'},role:{'zh-HK':'換位追擊','en-US':'Agile hunter'},hp:100,speed:240,damage:[8,8,14],color:0xf5c36a,skills:[{name:{'zh-HK':'星影換位','en-US':'Starstep'},description:{'zh-HK':'閃到前方近敵背後抓擊，留下 4 秒星印。沒有目標時只向前閃避。','en-US':'Blink behind a nearby foe and claw it, leaving a 4-second star mark. With no target, blink forward to evade.'},damage:18,mp:20,cooldown:180,kind:'blink',range:230},{name:{'zh-HK':'獵星連爪','en-US':'Starhunt Claws'},description:{'zh-HK':'躍起追擊單一敵人，連抓三次；優先追蹤星印，末擊消耗星印增傷。','en-US':'Leap at one foe for three claw strikes. Prioritize a marked foe; the finisher consumes its mark for bonus damage.'},damage:30,mp:35,cooldown:420,kind:'flurry',range:280}]},
  {id:'cloud-ear-dog',name:{'zh-HK':'雲耳狗','en-US':'Cloud-ear Dog'},role:{'zh-HK':'遠程牽制','en-US':'Wind caster'},hp:100,speed:210,damage:[7,7,12],color:0x94cfe8,skills:[{name:{'zh-HK':'雲風彈','en-US':'Cloud Bolt'},damage:18,mp:20,cooldown:180,kind:'bolt',range:600},{name:{'zh-HK':'旋風推開','en-US':'Wind Vortex'},damage:6,mp:35,cooldown:420,kind:'vortex',range:165}]},
  {id:'pudding-pig',name:{'zh-HK':'布丁豬','en-US':'Pudding Pig'},role:{'zh-HK':'重擊控制','en-US':'Heavy guardian'},hp:120,speed:180,damage:[10,10,18],color:0xf3a992,skills:[{name:{'zh-HK':'布丁衝撞','en-US':'Pudding Charge'},damage:28,mp:20,cooldown:180,kind:'dash',range:200},{name:{'zh-HK':'大地踏踏','en-US':'Earth Stomp'},damage:30,mp:35,cooldown:420,kind:'stomp',range:125}]},
]);
export const ENEMIES = Object.freeze({
  mushroom:{hp:40,damage:6,speed:115,range:65}, thrower:{hp:32,damage:5,speed:90,range:440},
  shield:{hp:80,damage:9,speed:80,range:80}, slime:{hp:50,damage:8,speed:145,range:80},
  puppet:{hp:450,damage:12,speed:110,range:130}, squirrel:{hp:600,damage:14,speed:155,range:400}, golem:{hp:750,damage:16,speed:80,range:150},
});
export const STAGES = Object.freeze([
  {id:'sunny-training',name:{'zh-HK':'陽光訓練場','en-US':'Sunlit Training Grounds'},subtitle:{'zh-HK':'練習連段與正面防守','en-US':'Combos, guarding and openings'},boss:'puppet',bossName:{'zh-HK':'木偶隊長','en-US':'Captain Timber'},enemies:['mushroom','shield'],colors:[0xd5e9c6,0xf4dfad]},
  {id:'windbell-forest',name:{'zh-HK':'風鈴森林','en-US':'Windbell Woods'},subtitle:{'zh-HK':'前後走位，避開風彈','en-US':'Change lanes and evade projectiles'},boss:'squirrel',bossName:{'zh-HK':'風鈴松鼠','en-US':'Windbell Squirrel'},enemies:['mushroom','thrower','slime'],colors:[0x96c9b2,0xa8c9ac]},
  {id:'starcrystal-cave',name:{'zh-HK':'星晶洞穴','en-US':'Starcrystal Cavern'},subtitle:{'zh-HK':'看清預警，迎戰石像','en-US':'Read the warnings and face the guardian'},boss:'golem',bossName:{'zh-HK':'星晶石像','en-US':'Starcrystal Guardian'},enemies:['mushroom','thrower','shield','slime'],colors:[0x666e9e,0xb9a8d5]},
]);
export const DIFFICULTIES = Object.freeze({easy:{hp:80,damage:65,reaction:27,slots:1,telegraph:54},normal:{hp:100,damage:100,reaction:18,slots:2,telegraph:42},hard:{hp:120,damage:125,reaction:12,slots:3,telegraph:27}});
export const CLIPS = Object.freeze({idle:[0,8],walk:[8,8],run:[16,8],attack1:[24,8],attack2:[32,8],attack3:[40,8],jump:[48,8],air:[56,8],guard:[64,4],break:[68,4],hit:[72,4],fall:[76,4],rise:[80,4],skill1:[88,8],skill2:[96,8],win:[104,8]});
export const fighterById = id => FIGHTERS.find(f=>f.id===id);
export const fightersForVersion = version => version==='brawl-v1'?V1_FIGHTERS:version==='brawl-v2'?V2_FIGHTERS:version==='brawl-v3'?V3_FIGHTERS:FIGHTERS;
export const stageById = id => STAGES.find(s=>s.id===id);
