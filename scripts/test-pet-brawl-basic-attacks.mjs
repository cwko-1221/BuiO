import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import sharp from 'sharp';
import {FIGHTERS,INPUT as I,VERSION} from '../pet-app/lib/brawl/catalog.mjs';
import {createBattle,stepBattle,replayBattle,battleResult} from '../pet-app/lib/brawl/simulation.mjs';
import {basicAttackPose} from '../pet-app/src/brawl/basic-attack-pose.mjs';
import {auditSingleBody} from './sprite-body-audit.mjs';
const require=createRequire(import.meta.url),manifest=JSON.parse(await fs.readFile('pet-app/public/assets/art/brawl/manifest.json','utf8')),assets=require('../pet-app/lib/brawl/assets.cjs').completeAssets(manifest,FIGHTERS);
const report=JSON.parse(await fs.readFile('pet-app/art-source/basic-attacks-v1/build-report.json','utf8'));
if(!process.argv.includes('--partial')){assert.equal(report.fighters,27);assert.equal(report.frames,864);assert.equal(Object.keys(manifest.fighterAttackAnimations).length,27);}
assert.equal(VERSION,'brawl-v14');assert.equal(manifest.fighterAttackAnimations.pikachu,undefined);
for(const r of report.reports){
 assert.equal(r.frames.length,32);assert.equal(new Set(r.frames.map(p=>p.scale)).size,1,'One scale across all four attacks');
 for(const p of r.pages){const c=await sharp('pet-app/public/'+p.url.slice('/pet/'.length)).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.ok(c.info.width<=2048&&c.info.height<=2048);assert.equal(c.info.width,p.frameWidth*4);assert.equal(c.info.height,p.frameHeight*4);
  for(let i=0;i<16;i++){let occupied=0;const x=i%4*p.frameWidth,y=Math.floor(i/4)*p.frameHeight,cut=Buffer.alloc(p.frameWidth*p.frameHeight*4);for(let yy=0;yy<p.frameHeight;yy++){c.data.copy(cut,yy*p.frameWidth*4,((y+yy)*c.info.width+x)*4,((y+yy)*c.info.width+x+p.frameWidth)*4);for(let xx=0;xx<p.frameWidth;xx++){const a=c.data[((y+yy)*c.info.width+x+xx)*4+3];if(xx<4||xx>=p.frameWidth-4||yy<4||yy>=p.frameHeight-4)assert.equal(a,0,'Transparent frame gutter '+r.id+':'+i);if(a>16)occupied++;}}assert.ok(occupied>500,'Full body in every cell');assert.equal(auditSingleBody(cut,p.frameWidth,p.frameHeight).bodyCount,1,'One complete character per runtime cell '+r.id+':'+i);}
 }
 const f=assets.fighters[r.id];for(const action of ['attack1','attack2','attack3','air']){const c=f.clips[action];assert.equal(c.count,8);assert.equal(c.poseTimeline,'strike');assert.ok(f.pages[c.page].includes('-normal-'));if(r.idleWorldBottom!==undefined)assert.ok(Math.abs((r.cell-26-r.cell*c.originY)*c.displaySize/r.cell-r.idleWorldBottom)<.001,'Published idle heel remains continuous');}
}
for(const f of FIGHTERS){
 const s=createBattle({fighterId:f.id,mode:'practice',seed:327}),p=s.actors[0],t=s.actors[1];p.x=50000;t.x=56000;let contacts=0;
 for(let tick=0;tick<130;tick++){stepBattle(s,I.ATTACK);for(const e of s.events.filter(e=>e.type==='strike'&&e.actor===p.id)){const pose=basicAttackPose(p.actionTick,p.windup,p.actionDuration);assert.ok(pose===3||pose===4,'Art contact matches real strike '+f.id);contacts++;}if(s.events.some(e=>e.type==='hit'&&e.source===p.id)){const pose=basicAttackPose(p.actionTick,p.windup,p.actionDuration);assert.ok(pose===3||pose===4,'Art matches real hit '+f.id);}}
 assert.ok(contacts>=3,f.id+' three-hit chain');assert.ok(t.hp<t.maxHp,f.id+' actual melee damage');
 const inputs=[{tick:1,mask:I.ATTACK},{tick:121,mask:0}],a=createBattle({fighterId:f.id,mode:'practice',seed:817});for(let tick=0;tick<180;tick++)stepBattle(a,tick<120?I.ATTACK:0);
 assert.deepEqual(battleResult(replayBattle({fighterId:f.id,mode:'practice',seed:817,version:VERSION},inputs,180,{terminal:false})),battleResult(a),'Replay remains deterministic '+f.id);
}
for(const [wind,duration] of [[6,20],[6,24],[10,30],[10,34]]){assert.equal(basicAttackPose(0,wind,duration),0);assert.equal(basicAttackPose(wind-1,wind,duration),2);for(let t=wind;t<wind+4;t++)assert.ok([3,4].includes(basicAttackPose(t,wind,duration)));assert.equal(basicAttackPose(duration-1,wind,duration),7);}
console.log('✓ Normal sprites preserve transparency, all 32 cells share scale and anchors, actual hits match contact art, and all 28 replays remain deterministic');
