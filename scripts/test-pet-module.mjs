import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(),'buio-pet-test-'));
process.env.BUIO_JSON_DB_FILE = path.join(tempDir,'db.json');
delete process.env.SUPABASE_DB_URL;
await fs.writeFile(process.env.BUIO_JSON_DB_FILE,JSON.stringify({
  users:[
    {studentId:'S001',name:'學生一',role:'student'},
    {studentId:'S002',name:'學生二',role:'student'},
    {studentId:'S003',name:'未進入學生',role:'student'},
    {studentId:'T001',name:'老師',role:'teacher'},
  ],studentStats:[],questionLogs:[],_logId:0,
},null,2));

const require = createRequire(import.meta.url);
const { catalog } = require('../pet-app/lib/catalog.js');
const repo = require('../pet-app/repositories/pet.repo.js');
const store = require('../db/jsonStore.js');
const pass = (label) => console.log(`✓ ${label}`);

assert.equal(catalog.pets.length,20); assert.equal(catalog.pets.flatMap((pet)=>pet.art).length,80);
assert.equal(catalog.rooms.length,10); assert.equal(catalog.maps.length,10);
assert.equal(catalog.foods.length,12); assert.equal(catalog.skills.length,16);
assert.equal(catalog.wearables.length,80); assert.equal(catalog.furniture.length,100);
assert.equal(new Set(catalog.pets.map((pet)=>pet.id)).size,20);
assert.deepEqual(catalog.evolutionThresholds,[0,400,1100,2100]);
assert.deepEqual(catalog.egg.odds,{common:.55,rare:.35,epic:.10});
for(const group of [catalog.pets,catalog.rooms,catalog.maps,catalog.foods,catalog.skills,catalog.wearables,catalog.furniture]) {
  for(const item of group) {
    const values = item.names?.['zh-HK'] || item.name?.['zh-HK'];
    assert.ok(values && (Array.isArray(values) ? values.every(Boolean) : true));
    assert.ok(!JSON.stringify(item).includes('�'));
  }
}
pass('catalogue counts, evolution rules and bilingual content');

const artRoot=path.resolve('pet-app/public/assets/art');
for(const pet of catalog.pets) for(const publicPath of pet.art) {
  const file=path.join(artRoot,publicPath.split('/art/')[1]); const metadata=await sharp(file).metadata();
  assert.equal(metadata.width,640); assert.equal(metadata.height,640); assert.equal(metadata.hasAlpha,true);
}
for(const room of catalog.rooms) { const metadata=await sharp(path.join(artRoot,room.art.split('/art/')[1])).metadata(); assert.equal(metadata.width,1600); assert.equal(metadata.height,900); }
for(const map of catalog.maps) { const metadata=await sharp(path.join(artRoot,map.art.split('/art/')[1])).metadata(); assert.equal(metadata.width,1600); assert.equal(metadata.height,1000); }
assert.equal((await fs.readdir(path.join(artRoot,'items'))).filter((name)=>name.endsWith('.webp')).length,15);
const assetManifest=JSON.parse(await fs.readFile(path.join(artRoot,'manifest.json'),'utf8'));
const spriteManifest=JSON.parse(await fs.readFile(path.join(artRoot,'sprites/manifest.json'),'utf8'));
assert.equal(spriteManifest.sheets.length,80); assert.equal(spriteManifest.columns.length,12); assert.equal(spriteManifest.rows.length,4);
for(const sheet of spriteManifest.sheets){const metadata=await sharp(path.join(artRoot,sheet.split('/art/')[1])).metadata();assert.equal(metadata.width,2304);assert.equal(metadata.height,768);assert.equal(metadata.hasAlpha,true);}
assert.equal((await fs.readdir(path.join(artRoot,'collectibles/wearables'))).filter((name)=>name.endsWith('.webp')).length,80);
assert.equal((await fs.readdir(path.join(artRoot,'collectibles/furniture'))).filter((name)=>name.endsWith('.webp')).length,100);
assert.equal((await fs.readdir(path.join(artRoot,'enemies'))).filter((name)=>name.endsWith('.webp')).length,12);
assert.equal((await fs.readdir(path.join(artRoot,'bosses'))).filter((name)=>name.endsWith('.webp')).length,10);
assert.equal((await fs.readdir(path.join(artRoot,'effects'))).filter((name)=>name.endsWith('.webp')).length,16);
assert.equal((await fs.readdir(path.join(artRoot,'layers/maps'))).filter((name)=>name.endsWith('.json')).length,10);
assert.deepEqual(assetManifest.audio,{musicThemes:12,petVoiceVariants:20,sfxEvents:15,generator:'WebAudio note events; no third-party audio'});
pass('80 transparent forms and 80 four-direction/twelve-action atlases');
pass('10 layered rooms, 10 collision maps, 180 collectibles, enemies, bosses, effects and audio');

const grant=await repo.grantCoins('T001',['S001','S002'],10000,{note:'測試獎勵',idempotencyKey:'grant-1'});
const repeatedGrant=await repo.grantCoins('T001',['S001','S002'],10000,{note:'測試獎勵',idempotencyKey:'grant-1'});
assert.equal(grant.batchId,repeatedGrant.batchId);
assert.equal((await repo.getBootstrap('S001')).wallet.balance,10000);
assert.equal(store.load().petCurrencyLedger.filter((row)=>row.kind==='teacher_grant').length,2);
await repo.walletBalances(['S003']); assert.equal(store.load().petProfiles.some((row)=>row.studentId==='S003'),false);
pass('teacher grant is immutable, whole-class-ready and idempotent');

const starter=await repo.hatchStarter('S001',{idempotencyKey:'starter-1',random:()=>.99});
const starterRetry=await repo.hatchStarter('S001',{idempotencyKey:'starter-1',random:()=>.01});
assert.equal(starter.speciesId,starterRetry.speciesId); assert.equal(starter.rarity,'common');
await assert.rejects(()=>repo.hatchStarter('S001',{idempotencyKey:'starter-2',random:()=>.99}),/already claimed/);
await assert.rejects(()=>repo.purchaseEgg('S001',{kind:'direct',speciesId:'emberwing-dragon',idempotencyKey:'epic-direct'}),/cannot be bought directly/);
pass('starter egg is once-only and epic direct purchase is blocked');

const draws=[];
for(let index=0;index<10;index+=1) draws.push(await repo.purchaseEgg('S002',{kind:'random',idempotencyKey:`pity-${index}`,random:()=>.99}));
assert.ok(draws.slice(0,9).every((draw)=>draw.rarity==='common'));
assert.equal(draws[9].rarity,'epic'); assert.equal(draws[9].eggPity,0);
assert.ok(draws.slice(1,9).some((draw)=>draw.duplicateDust===10));
pass('55/35/10 draw path, duplicate stardust and tenth-draw epic pity');

const beforeFood=(await repo.getBootstrap('S001')).wallet.balance;
await repo.purchaseItem('S001',{itemId:'apple-slice',quantity:7,idempotencyKey:'food-buy'});
const pet=(await repo.getBootstrap('S001')).pets[0];
for(let index=0;index<6;index+=1) await repo.feedPet('S001',pet.id,'apple-slice',{idempotencyKey:`feed-${index}`});
const retryFeed=await repo.feedPet('S001',pet.id,'apple-slice',{idempotencyKey:'feed-5'});
assert.equal(retryFeed.pet.dailyXp,90);
await assert.rejects(()=>repo.feedPet('S001',pet.id,'apple-slice',{idempotencyKey:'feed-over'}),/Daily XP limit/);
const afterFeed=await repo.getBootstrap('S001');
assert.equal(afterFeed.pets[0].dailyXp,90); assert.equal(afterFeed.inventory.find((row)=>row.itemId==='apple-slice').quantity,1);
assert.equal(afterFeed.wallet.balance,beforeFood-175);
assert.deepEqual([399,400,1099,1100,2099,2100].map(repo.stageForXp),[1,2,2,3,3,4]);
pass('food consumption, idempotency, Hong Kong daily XP cap and four stages');

const second=await repo.purchaseEgg('S001',{kind:'direct',speciesId:'starpatch-cat',idempotencyKey:'direct-second'});
assert.ok(second.pet);
await repo.purchaseItem('S001',{itemId:'ember-bolt',petId:pet.id,idempotencyKey:'skill-buy'});
await repo.setLoadout('S001',pet.id,['ember-bolt']);
await assert.rejects(()=>repo.setLoadout('S001',second.pet.id,['ember-bolt']),/not owned by this pet/);
pass('purchased skills remain bound to the selected pet');

const bootstrap=await repo.getBootstrap('S001');
await repo.saveRoom('S001',{themeId:'sunny-oak',visibility:'class',placements:bootstrap.room.placements});
await assert.rejects(()=>repo.saveRoom('S001',{themeId:'sunny-oak',visibility:'class',placements:[{id:'bad',itemId:'sunny-oak-furniture-1',x:11,y:9,rotation:0,layer:'furniture'}]}),/outside the room grid/);
await repo.addReaction('S001','S002','heart'); await repo.addReaction('S001','S002','star');
assert.deepEqual((await repo.getRoomSnapshot('S001')).reactions,{star:1});
pass('room ownership, grid bounds, visibility and one anonymous reaction per day');

for(let index=0;index<3;index+=1){const run=await repo.startRun('S001','clover-meadow');const result=await repo.completeRun('S001',{runId:run.runId,success:true,badgeFound:index===0},{minimumMs:0});assert.ok(result.foodId);assert.equal(result.coins,0);}
await repo.purchaseItem('S001',{itemId:'map:whisper-forest',quantity:1,idempotencyKey:'map-buy'});
const fourth=await repo.startRun('S001','whisper-forest');const fourthResult=await repo.completeRun('S001',{runId:fourth.runId,success:true,badgeFound:true},{minimumMs:0});
assert.equal(fourthResult.foodId,null); assert.equal(fourthResult.coins,0);
await assert.rejects(()=>repo.completeRun('S001',{runId:fourth.runId,success:true},{minimumMs:0}),/already completed/);
pass('one-time run tickets, no coin drops and global first-three daily food rewards');

const serverSource=await fs.readFile(path.resolve('server.js'),'utf8'); const configSource=await fs.readFile(path.resolve('src/config.js'),'utf8');
assert.match(serverSource,/app\.use\('\/api\/pet'/); assert.match(serverSource,/app\.get\(\[?'\/pet'/); assert.match(configSource,/id: 'pet'/);
const css=await fs.readFile(path.resolve('pet-app/src/styles/main.css'),'utf8'); assert.doesNotMatch(css,/@import\s+url\(['"]https?:/);
await fs.access(path.resolve('pet-app/dist/index.html')); await fs.access(path.resolve('pet-app/dist/assets/art/manifest.json'));
pass('protected platform integration, self-hosted UI and production build');

await fs.rm(tempDir,{recursive:true,force:true});
console.log('\nPet module checks passed.');
