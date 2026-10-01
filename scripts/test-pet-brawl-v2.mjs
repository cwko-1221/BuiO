import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {createBattle,stepBattle,replayBattle,battleResult} from '../pet-app/lib/brawl/simulation.mjs';
import * as v1 from '../pet-app/lib/brawl/legacy/simulation.mjs';
import {INPUT as I} from '../pet-app/lib/brawl/catalog.mjs';
import {botInput} from './pet-brawl-bot.mjs';
import {brawlSound} from '../pet-app/lib/brawl/sound.mjs';
const s=createBattle({mode:'campaign'});s.spawned=s.total;
stepBattle(s);assert.equal(s.cleared,true);let previous=s.actors[0].x,largest=0;
while(s.zone===0){stepBattle(s,I.RIGHT|I.RUN);largest=Math.max(largest,Math.abs(s.actors[0].x-previous));previous=s.actors[0].x;}
assert.ok(largest<=600,'crossing a zone never teleports the player');assert.ok(s.actors[0].x>=128000&&s.actors[0].x<=128600);
const p=createBattle({mode:'practice'});p.freeze=2;stepBattle(p,I.SKILL1);stepBattle(p,0);stepBattle(p,0);assert.equal(p.actors[0].action,'skill1','quick taps during hit stop are buffered');
const q=createBattle({mode:'practice'});q.actors[0].x=57000;let events=0,hits=0;for(let i=0;i<120;i++){stepBattle(q,I.ATTACK);events+=q.events.length;hits+=q.events.filter(e=>e.type==='hit').length;}assert.ok(hits>=3&&events>hits);assert.ok(q.bestCombo>=3);
const options={version:'brawl-v1',mode:'campaign',fighterId:'pudding-pig',stageId:'sunny-training',difficulty:'easy',seed:1};
const original=v1.createBattle(options),inputs=[];let last=-1;while(!['won','lost'].includes(original.status)&&original.tick<36000){const mask=botInput(original);if(mask!==last){inputs.push({tick:original.tick+1,mask});last=mask;}v1.stepBattle(original,mask);}
assert.deepEqual(battleResult(replayBattle(options,inputs,original.tick)),v1.battleResult(original));
const require=createRequire(import.meta.url),verifier=require('../pet-app/lib/brawl/verifier.cjs');try{assert.deepEqual(await verifier.verify(options,inputs,original.tick),v1.battleResult(original));}finally{await verifier.close();}
const sound=[];for(const cue of ['hit','heavy','guard','whoosh','dash','bolt','vortex','stomp','jump','land','ko','pickup','warning','clear']){const wave=brawlSound(cue);let sum=0,peak=0;for(const value of wave){assert.ok(Number.isFinite(value));sum+=value*value;peak=Math.max(peak,Math.abs(value));}const rms=Math.sqrt(sum/wave.length);assert.ok(rms>.008&&peak<.99);sound.push({cue,seconds:wave.length/48000,rms,peak});}
await fs.writeFile('artifacts/pet-playtest/brawl-v2/v2-mechanics-report.json',JSON.stringify({pass:true,zoneMaximumStep:largest/100,legacyReplay:true,bufferedInput:true,comboHits:hits,sound},null,2));
console.log('Continuous movement, hit-stop input, combos, legacy worker replays and all 14 sound buffers passed');
