import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {FIGHTERS,VERSION,HIDDEN_FIGHTER_IDS,INPUT as I,fightersForVersion} from '../pet-app/lib/brawl/catalog.mjs';
import * as v5 from '../pet-app/lib/brawl/legacy/v5/simulation.mjs';
import {createBattle,stepBattle,replayBattle,battleResult} from '../pet-app/lib/brawl/simulation.mjs';
const require=createRequire(import.meta.url),published=require('../pet-app/lib/catalog').catalog;
assert.equal(VERSION,'brawl-v8');assert.equal(FIGHTERS.length,25);assert.equal(HIDDEN_FIGHTER_IDS.length,0);
assert.equal(FIGHTERS.filter(f=>f.rarity==='epic').length,13);
assert.deepEqual(FIGHTERS.map(f=>f.id).sort(),published.pets.filter(p=>!HIDDEN_FIGHTER_IDS.includes(p.id)).map(p=>p.id).sort());
assert.equal(new Set(FIGHTERS.flatMap(f=>f.skills.map(k=>k.kind))).size,50);
for(const f of FIGHTERS)assert.equal(f.rarity,published.pets.find(p=>p.id===f.id).rarity);
for(const version of ['brawl-v1','brawl-v2','brawl-v3','brawl-v4']){assert.equal(fightersForVersion(version).length,3);const s=createBattle({version,mode:'practice'});for(let t=0;t<90;t++)stepBattle(s,t===0?I.SKILL1:0);assert.equal(s.version,version);}
assert.equal(fightersForVersion('brawl-v5').length,19);
for(const f of fightersForVersion('brawl-v5')){
 const options={version:'brawl-v5',fighterId:f.id,mode:'practice',seed:315},log=[{tick:1,mask:I.RIGHT},{tick:60,mask:0},{tick:61,mask:I.SKILL1},{tick:62,mask:0},{tick:150,mask:I.SKILL2},{tick:151,mask:0}];
 const old=v5.createBattle(options),routed=createBattle(options);let mask=0;
 for(let tick=1;tick<=400;tick++){const frame=log.find(f=>f.tick===tick);if(frame)mask=frame.mask;v5.stepBattle(old,mask);stepBattle(routed,mask);}
 assert.deepEqual(routed,old);assert.deepEqual(replayBattle(options,log,400,{terminal:false}),old);assert.deepEqual(battleResult(routed),v5.battleResult(old));
}
console.log('✓ Historical v5 logs retain their exact 19-fighter simulation; all archived rules remain unchanged');
console.log('✓ Exact released roster, 50 named skills; all 13 former hidden fighters are open, rarity and v1–v4 archives');
const coverage=[];
for(const f of FIGHTERS){
  for(const [n,k] of f.skills.entries()){
    const s=createBattle({fighterId:f.id,mode:'practice'}),p=s.actors[0],t=s.actors[1];p.hp=p.maxHp-30;
    const distant=['projectile','wave','leap','trap','blast','target-blast','field','retreat','tornado','lob','fissure','rain','barrage','sky-shot'].includes(k.mechanic);
    t.x=p.x+(distant?k.mechanic==='retreat'?0:k.range+(k.mechanic==='barrage'?100:0):Math.min(120,k.range||60))*100;t.y=p.y+(k.spread?.[0]||0)*100;
    const initial=t.hp,startMp=p.mp,bit=n?I.SKILL2:I.SKILL1;stepBattle(s,bit);
    assert.equal(p.mp,startMp-k.mp*100,f.id+' mana cost');assert.equal(p.cooldowns[n],k.cooldown);
    let shield=0,haste=0,counter=0,slow=0,root=0,mark=0,fields=0,projectiles=0,releases=0;
    for(let tick=0;tick<360;tick++){
      stepBattle(s,0);shield=Math.max(shield,p.shield||0);haste=Math.max(haste,p.haste||0);counter=Math.max(counter,p.counterDamage||0);slow=Math.max(slow,t.slowUntil||0);root=Math.max(root,t.rootUntil||0);mark=Math.max(mark,t.readUntil||0);fields=Math.max(fields,s.fields.length);projectiles=Math.max(projectiles,s.projectiles.length);releases+=s.events.filter(e=>e.type==='skillRelease').length;
      for(const actor of s.actors)for(const key of ['x','y','z','hp','mp'])assert.ok(Number.isFinite(actor[key]),f.id+' '+key);
    }
    assert.ok(releases>0,f.id+' skill '+n+' released');
    if(k.mechanic!=='buff'&&k.damage>0)assert.ok(t.hp<initial,f.id+' '+k.kind+' damages its intended target');
    if(k.shield)assert.equal(shield,k.shield);if(k.haste)assert.equal(haste,k.haste);if(k.counter)assert.equal(counter,k.counter);if(k.heal)assert.ok(p.hp>p.maxHp-30);
    if(k.slowTicks)assert.ok(slow);if(k.rootTicks)assert.ok(root);if(k.markTicks)assert.ok(mark);if(['projectile','wave','lob'].includes(k.mechanic))assert.ok(projectiles,f.id+' '+k.kind+' creates a visible travelling projectile');if(['trap','blast','target-blast','field','clones','retreat','tornado','fissure','rain','sanctuary','barrage'].includes(k.mechanic))assert.ok(fields);
    coverage.push({fighter:f.id,skill:k.kind,damage:initial-t.hp,shield,haste,counter,fields,projectiles});
  }
  // Legal input logs include movement, skills and an aerial attack, with no fixture edits.
  const options={fighterId:f.id,mode:'practice',seed:315},log=[{tick:1,mask:I.RIGHT},{tick:60,mask:0},{tick:61,mask:I.SKILL1},{tick:62,mask:0},{tick:150,mask:I.SKILL2},{tick:151,mask:0},{tick:260,mask:I.JUMP|I.RIGHT},{tick:261,mask:I.RIGHT},{tick:266,mask:I.ATTACK},{tick:267,mask:0}];
  const live=createBattle(options);let mask=0;for(let tick=1;tick<=400;tick++){const frame=log.find(f=>f.tick===tick);if(frame)mask=frame.mask;stepBattle(live,mask);}assert.deepEqual(replayBattle(options,log,400,{terminal:false}),live,f.id+' deterministic replay');
}
console.log('✓ All 50 released skills have real hits or buffs, costs, finite physics and deterministic logs');
// Shield / counter is an actual defensive interaction, and marks apply only to the owner.
let s=createBattle({fighterId:'mossback-turtle',opponentId:'starpatch-cat',mode:'pvp'}),p=s.actors[0],t=s.actors[1];t.x=p.x+6000;
stepBattle(s,I.SKILL1,0);for(let i=0;i<14;i++)stepBattle(s,0,0);const hp=p.hp;
stepBattle(s,0,I.ATTACK);for(let i=0;i<22;i++)stepBattle(s,0,0);assert.equal(p.hp,hp);assert.ok(t.hp<t.maxHp);assert.equal(p.counterDamage,0);
s=createBattle({fighterId:'bubble-otter',mode:'practice'});p=s.actors[0];t=s.actors[1];t.x=p.x+16000;t.z=6000;t.vz=900;
stepBattle(s,I.SKILL2);for(let i=0;i<48;i++)stepBattle(s,0);assert.equal(t.hp,t.maxHp,'airborne target avoids ground trap');
console.log('✓ Front-facing shell counter blocks once; airborne targets evade ground traps');
const manifest=JSON.parse(await fs.readFile('pet-app/public/assets/art/brawl/manifest.json','utf8')),assets=require('../pet-app/lib/brawl/assets.cjs').completeAssets(manifest,FIGHTERS);
for(const f of FIGHTERS){const asset=assets.fighters[f.id];for(const url of asset.pages){const file=path.join('pet-app/public',url.replace('/pet/','').split('?')[0]),meta=await sharp(file).metadata();assert.ok(meta.hasAlpha);assert.ok(meta.width<=2048&&meta.height<=2048);const count=meta.width/(asset.frameWidth||256)*meta.height/(asset.frameHeight||256);for(const c of Object.values(asset.clips).filter(c=>c.page===asset.pages.indexOf(url))){for(const frame of c.frames||Array.from({length:c.count},(_,i)=>c.start+i))assert.ok(frame>=0&&frame<count,f.id+' clip bounds');}}}
console.log('✓ All published sprites exist, retain transparency and have valid declared clips');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-roster-unit-'));process.env.BUIO_JSON_DB_FILE=path.join(temp,'db.json');process.env.SUPABASE_DB_URL='';
await fs.writeFile(process.env.BUIO_JSON_DB_FILE,JSON.stringify({users:[{studentid:'S001',role:'student'},{studentid:'S002',role:'student'}],studentStats:[],questionLogs:[],_logId:0}));
const petRepo=require('../pet-app/repositories/pet.repo'),repo=require('../pet-app/repositories/brawl.repo'),duels=require('../pet-app/repositories/brawl-duel.repo'),store=require('../db/jsonStore');
try{await petRepo.ensureStudent('S001');await petRepo.ensureStudent('S002');const d=store.load();for(const f of FIGHTERS)d.petInstances.push({petId:randomUUID(),studentId:'S001',speciesId:f.id,xp:0,stage:1,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});store.save();
  for(const pet of d.petInstances){for(const mode of ['practice','tutorial','duel','campaign']){assert.equal((await repo.access('S001',{petId:pet.petId,fighterId:pet.speciesId,mode})).allowed,true);await assert.rejects(()=>repo.access('S002',{petId:pet.petId,fighterId:pet.speciesId,mode}),{status:403});}const {run}=await repo.start('S001',{petId:pet.petId,stageId:'sunny-training',difficulty:'easy'},randomUUID());assert.equal(run.options.fighterId,pet.speciesId);await repo.abandon('S001',run.id);}
  const pet=d.petInstances[0];await assert.rejects(()=>repo.access('S001',{petId:pet.petId,fighterId:'thunderhorn-goat',mode:'practice'}),{status:403});assert.equal((await duels.player('S001')).pets.length,25);assert.equal((await duels.player('S002')).pets.length,0);
  const other={petId:randomUUID(),studentId:'S002',speciesId:'starpatch-cat',xp:0,stage:1};d.petInstances.push(other);for(const wallet of d.petWallets)wallet.balance=900;
  const c=await repo.getCatalog();assert.equal(c.fighters.length,25);assert.equal(Object.keys(c.assets.fighters).length,25);assert.equal(d.petCurrencyLedger.length,0,'access and free modes charge nothing');
  for(const fighter of FIGHTERS.filter(f=>f.rarity==='epic')){
    const owned=d.petInstances.find(p=>p.studentId==='S001'&&p.speciesId===fighter.id);
    assert.equal(createBattle({fighterId:fighter.id,mode:'practice'}).actors[0].kind,fighter.id);
    assert.equal(createBattle({opponentId:fighter.id,mode:'duel'}).actors[1].kind,fighter.id);
    const match={id:randomUUID(),version:VERSION,stageId:'sunny-training',seed:1,players:[{id:'S001',petId:owned.petId,fighterId:fighter.id},{id:'S002',petId:other.petId,fighterId:other.speciesId}]};
    await assert.rejects(()=>duels.charge({...match,id:randomUUID(),players:[match.players[0],{id:'S002',petId:owned.petId,fighterId:fighter.id}]}),{status:403});
    assert.ok(d.petWallets.every(w=>w.balance===900),'Unowned guest rejects without charging either wallet');
    const accepted=await duels.charge(match);assert.equal(accepted.status,'preparing');assert.ok(d.petWallets.every(w=>w.balance===400));
    await duels.finalize(match.id,{status:'cancelled',reason:'qa_before_start'},true);assert.ok(d.petWallets.every(w=>w.balance===900));
  }
  assert.equal(d.petCurrencyLedger.filter(l=>l.kind==='brawl_duel_entry').length,26);assert.equal(d.petCurrencyLedger.filter(l=>l.kind==='brawl_duel_refund').length,26);
  console.log('✓ All 13 former hidden fighters support owned free modes, campaigns, AI opponents and paid duels; unowned guests reject without charges');
  await fs.mkdir('artifacts/pet-playtest/brawl-v8',{recursive:true});await fs.writeFile('artifacts/pet-playtest/brawl-v8/skill-coverage.json',JSON.stringify(coverage,null,2));
  console.log('✓ All 25 open owned fighters authorized in every mode; foreign / spoofed / unowned selections rejected, no charges');
}finally{await fs.rm(temp,{recursive:true,force:true});}
