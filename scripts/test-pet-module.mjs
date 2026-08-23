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

assert.deepEqual(catalog.pets.map((pet)=>pet.id),['starpatch-cat','cloud-ear-dog','pudding-pig']);
assert.equal(catalog.pets.flatMap((pet)=>pet.art).length,12);
assert.equal(catalog.rooms.length,10);
assert.equal(catalog.foods.length,12);
assert.equal(catalog.wearables.length,80); assert.equal(catalog.furniture.length,100);
assert.equal(new Set(catalog.pets.map((pet)=>pet.id)).size,3);
assert.deepEqual(catalog.evolutionThresholds,[0,400,1100,2100]);
assert.deepEqual(catalog.egg.odds,{common:1,rare:0,epic:0});
assert.equal(catalog.egg.pityAt,0);
for(const group of [catalog.pets,catalog.rooms,catalog.foods,catalog.wearables,catalog.furniture]) {
  for(const item of group) {
    const values = item.names?.['zh-HK'] || item.name?.['zh-HK'];
    assert.ok(values && (Array.isArray(values) ? values.every(Boolean) : true));
    assert.ok(!JSON.stringify(item).includes('\uFFFD'));
  }
}
pass('catalogue counts, evolution rules and bilingual content');

const artRoot=path.resolve('pet-app/public/assets/art');
for(const pet of catalog.pets) for(const publicPath of pet.art) {
  const file=path.join(artRoot,publicPath.split('?')[0].split('/art/')[1]); const metadata=await sharp(file).metadata();
  assert.equal(metadata.width,640); assert.equal(metadata.height,640); assert.equal(metadata.hasAlpha,true);
}
for(const room of catalog.rooms) {
  const metadata=await sharp(path.join(artRoot,room.art.split('?')[0].split('/art/')[1])).metadata();
  assert.equal(metadata.width,1600); assert.equal(metadata.height,900);
  const backdrop=await sharp(path.join(artRoot,room.backdrop.split('?')[0].split('/art/')[1])).metadata();
  assert.equal(backdrop.width,2048); assert.equal(backdrop.height,2048);
}

assert.equal((await fs.readdir(path.join(artRoot,'items'))).filter((name)=>name.endsWith('.webp')).length,15);
const assetManifest=JSON.parse(await fs.readFile(path.join(artRoot,'manifest.json'),'utf8'));
const spriteManifest=JSON.parse(await fs.readFile(path.join(artRoot,'sprites/manifest.json'),'utf8'));
// One atlas per species per stage, laid out as poses: a row per direction the creature is drawn
// facing, plus a row of one-off poses that only read from the front. Importing a pet sheet
// rewrites this manifest, so it describes the art that is actually there.
assert.deepEqual(spriteManifest.directions,['front','right','back'],'the atlas rows are no longer the directions the game plays');
assert.equal(spriteManifest.columns*spriteManifest.rows,20,'an atlas is five poses across and four down');
assert.ok(spriteManifest.clips.length>=6,'the manifest carries no clips for the game to play');
for(const clip of spriteManifest.clips) {
  assert.ok(clip.frames.length&&clip.frames.every((frame)=>Number.isInteger(frame)&&frame>=0&&frame<spriteManifest.columns*spriteManifest.rows),
    `clip ${clip.name}/${clip.facing} points outside the atlas`);
}
// 4096 is the smallest MAX_TEXTURE_SIZE still in the field; above it the sheet cannot be
// uploaded and the pet does not render at all, which is worse than loading slowly.
assert.ok(spriteManifest.frameWidth*spriteManifest.columns<=4096,`atlas too wide for older tablets`);
assert.ok(spriteManifest.frameHeight*spriteManifest.rows<=4096,`atlas too tall for older tablets`);
// Every atlas the catalogue names is the size the manifest says a frame grid should be, and
// keeps its alpha — a pet drawn on an opaque square would show its own tile over the floor.
const atlasWidth=spriteManifest.frameWidth*spriteManifest.columns;
const atlasHeight=spriteManifest.frameHeight*spriteManifest.rows;
// Only the creatures whose pose sheets are in: one manifest describes the layout of every
// atlas, so the rest are published unplayable and fall back to their still art.
const animated=catalog.pets.filter((pet)=>pet.animated);
const atlases=animated.flatMap((pet)=>pet.atlas||[]).filter(Boolean);
assert.equal(atlases.length,animated.length*4,'an animated species needs an atlas for each of its four stages');
for(const sheet of atlases){
  const metadata=await sharp(path.join(artRoot,sheet.split('?')[0].split('/art/')[1])).metadata();
  assert.equal(metadata.width,atlasWidth,`${sheet} width`);
  assert.equal(metadata.height,atlasHeight,`${sheet} height`);
  assert.equal(metadata.hasAlpha,true,`${sheet} lost its transparency`);
}
const redrawManifest=JSON.parse(await fs.readFile(path.join(artRoot,'outfit-atlases/manifest.json'),'utf8'));
assert.deepEqual(catalog.redrawnWearables,redrawManifest.modular||{},'bootstrap redraw catalogue differs from its manifest');
for(const [key,layers] of Object.entries(catalog.redrawnWearables)){
  assert.match(key,/^[a-z0-9-]+:[1-4]:(?:head|face|neck|back)-\d{2}$/);
  assert.ok(['head','face','neck','back'].includes(layers.slot),`${key} has an invalid redraw slot`);
  assert.ok(layers.patch||layers.front||layers.rear,`${key} publishes no visible redraw layer`);
  for(const url of [layers.patch,layers.erase,layers.rear,layers.frontErase,layers.front].filter(Boolean)){
    const file=path.join(artRoot,url.split('/art/')[1]);
    const metadata=await sharp(file).metadata();
    assert.equal(metadata.width,atlasWidth,`${key} layer width`);
    assert.equal(metadata.height,atlasHeight,`${key} layer height`);
    assert.equal(metadata.hasAlpha,true,`${key} layer lost transparency`);
  }
}
// Every accessory has its front view, and any extra file is one of the two turned views of an
// accessory that has them — the sheets arrive slot by slot, so the total climbs from 80 to 240.
const wornFiles=new Set((await fs.readdir(path.join(artRoot,'collectibles/wearables'))).filter((name)=>name.endsWith('.webp')));
const named=new Set(catalog.wearables.flatMap((item)=>[
  item.art,item.views?.right,item.views?.back,item.overlays?.right,item.overlays?.back,
  item.sourceViews?.right,item.sourceViews?.back,
])
  .filter(Boolean).map((url)=>url.split('?')[0].split('/').pop()));
for(const item of catalog.wearables) assert.ok(wornFiles.has(item.art.split('?')[0].split('/').pop()),`${item.id} has no front view`);
for(const file of wornFiles) assert.ok(named.has(file),`${file} is not a view the catalogue names`);
assert.ok(wornFiles.size>=80&&wornFiles.size<=244,`expected between 80 and 244 accessory files, found ${wornFiles.size}`);
assert.equal(catalog.wearables.find((item)=>item.id==='head-17')?.fit,'headset','cat ears must wrap the head rather than perch above it');
assert.equal(catalog.wearables.find((item)=>item.id==='head-20')?.fit,'helmet','the space helmet must use the enclosing-head fit');
for(const id of ['back-02','back-03','back-15']){
  const wing=catalog.wearables.find((item)=>item.id===id);
  assert.equal(wing?.sideBehind,true,`${id} must lie behind the side-on body`);
  assert.match(wing?.views?.right||'',/right-flat/,`${id} must use the folded side profile`);
}
assert.ok(catalog.wearables.find((item)=>item.id==='back-02')?.overlays?.back,'butterfly wings need a foreground harness layer');
assert.equal((await fs.readdir(path.join(artRoot,'collectibles/furniture'))).filter((name)=>name.endsWith('.webp')).length,100);

assert.equal((await fs.readdir(path.join(artRoot,'effects'))).filter((name)=>name.endsWith('.webp')).length,16);

assert.deepEqual(assetManifest.audio,{musicThemes:12,petVoiceVariants:20,sfxEvents:15,generator:'WebAudio note events; no third-party audio'});
pass(`12 released transparent forms, ${animated.length} animated species (${spriteManifest.clips.length} clips, ${spriteManifest.columns} x ${spriteManifest.rows} poses @ ${spriteManifest.frameWidth}px)`);
pass('10 layered rooms, 180 collectibles, effects and audio');

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
for(let index=0;index<10;index+=1) draws.push(await repo.purchaseEgg('S002',{kind:'random',idempotencyKey:`release-draw-${index}`,random:()=>.99}));
assert.ok(draws.every((draw)=>draw.rarity==='common'));
assert.ok(draws.every((draw)=>draw.eggPity===0));
// A duplicate now pays coins straight back into the wallet, and the refund is ledgered under
// its own key so the draw's own key stays free for the purchase row.
assert.ok(draws.slice(1,9).some((draw)=>draw.duplicateCoins===10),'a repeat of an owned species should refund coins');
const refunds=store.load().petCurrencyLedger.filter((row)=>row.kind==='egg_duplicate'&&row.studentId==='S002');
assert.equal(refunds.length,draws.filter((draw)=>draw.duplicateCoins>0).length);
assert.ok(refunds.every((row)=>row.delta>0));
pass('released-pet-only draw path and duplicate refund in coins');

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

const bootstrap=await repo.getBootstrap('S001');
await repo.saveRoom('S001',{themeId:'sunny-oak',visibility:'class',placements:bootstrap.room.placements});
await assert.rejects(()=>repo.saveRoom('S001',{themeId:'sunny-oak',visibility:'class',placements:[{id:'bad',itemId:'sunny-oak-furniture-1',x:11,y:9,rotation:0,layer:'furniture'}]}),/outside the room grid/);
await repo.addReaction('S001','S002','heart'); await repo.addReaction('S001','S002','star');
assert.deepEqual((await repo.getRoomSnapshot('S001')).reactions,{star:1});
pass('room ownership, grid bounds, visibility and one anonymous reaction per day');

const visitable=await repo.listVisitableRooms(['S001','S002','S003']);
assert.equal(visitable.length,1);
assert.equal(visitable[0].ownerStudentId,'S001');
assert.equal(visitable[0].visibility,'class');
assert.deepEqual(visitable[0].reactions,{star:1});
assert.ok(visitable[0].activePet?.speciesId);
assert.deepEqual(await repo.listVisitableRooms([]),[]);
assert.equal(store.load().petProfiles.some((row)=>row.studentId==='S003'),false);
pass('class visit listing batches in fixed queries without materialising absent students');

const serverSource=await fs.readFile(path.resolve('server.js'),'utf8'); const configSource=await fs.readFile(path.resolve('src/config.js'),'utf8');
assert.match(serverSource,/app\.use\('\/api\/pet'/); assert.match(serverSource,/app\.get\(\[?'\/pet'/); assert.match(configSource,/id: 'pet'/);
const css=await fs.readFile(path.resolve('pet-app/src/styles/main.css'),'utf8'); assert.doesNotMatch(css,/@import\s+url\(['"]https?:/);
await fs.access(path.resolve('pet-app/dist/index.html')); await fs.access(path.resolve('pet-app/dist/assets/art/manifest.json'));
pass('protected platform integration, self-hosted UI and production build');

const grantsBefore=store.load().petCurrencyLedger.filter((row)=>row.kind==='teacher_grant').length;
repo.purgeJsonStudent('T001');
const grantsAfterTeacher=store.load().petCurrencyLedger.filter((row)=>row.kind==='teacher_grant');
assert.equal(grantsAfterTeacher.length,grantsBefore);
assert.ok(grantsAfterTeacher.every((row)=>row.actorId==='T001'));
repo.purgeJsonStudent('S002');
const after=store.load();
assert.equal(after.petWallets.filter((row)=>row.studentId==='S002').length,0);
assert.equal(after.petCurrencyLedger.filter((row)=>row.studentId==='S002').length,0);
assert.equal(after.petInstances.filter((row)=>row.studentId==='S002').length,0);
assert.equal(after.petRoomReactions.filter((row)=>row.visitorStudentId==='S002').length,0);
assert.ok(after.petCurrencyLedger.some((row)=>row.studentId==='S001'&&row.kind==='teacher_grant'));
assert.ok(after.petInstances.some((row)=>row.studentId==='S001'));
pass('student deletion clears own data while preserving other students ledger history');

async function tonalBuckets(file) {
  const { data, info }=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const histogram=new Array(32).fill(0); let opaque=0;
  for(let pixel=0;pixel<data.length;pixel+=info.channels) {
    if(data[pixel+3]<200) continue;
    opaque+=1;
    const luma=0.2126*data[pixel]+0.7152*data[pixel+1]+0.0722*data[pixel+2];
    histogram[Math.min(31,Math.floor(luma/8))]+=1;
  }
  return histogram.filter((count)=>count>opaque*0.005).length;
}
const flat=[];
for(const pet of catalog.pets) {
  const buckets=await tonalBuckets(path.join(artRoot,pet.art[3].split('?')[0].split('/art/')[1]));
  if(buckets<20) flat.push(`${pet.id} (${buckets}/32)`);
}
assert.equal(flat.length,0,`these forms read as flat fills rather than shaded volumes, need >=20 of 32 luminance buckets: ${flat.join(', ')}`);
pass('creature forms carry a continuous shading ramp rather than flat fills');

// Worn items are anchored to landmarks measured off each creature's idle frame. If those go
// missing or come back out of order the avatar silently falls back to whole-cell proportions,
// which puts hats in mid-air, so assert the shape of every published set.
const unanchored=[];
// Only the creatures whose pose sheets are in. The rest are on placeholder art the manifest
// does not describe, so they carry no anchors and the runtime falls back to whole-cell
// proportions for anything they wear — which is what they had before any of this art arrived.
for(const pet of catalog.pets.filter((entry)=>entry.animated)) {
  pet.anchors.forEach((anchor,stage)=>{
    if(!anchor) return void unanchored.push(`${pet.id}-${stage+1} missing`);
    const ordered=anchor.top<anchor.eye&&anchor.eye<anchor.bottom;
    const sized=anchor.face>0&&anchor.head>=anchor.face&&anchor.width>=anchor.head;
    if(!ordered||!sized) unanchored.push(`${pet.id}-${stage+1} ${JSON.stringify(anchor)}`);
  });
}
assert.equal(unanchored.length,0,`wearable anchors must run skull < eye < feet with face <= head <= body: ${unanchored.join(', ')}`);
assert.ok(catalog.wearables.every((item)=>item.art&&item.content),'every wearable needs artwork and a content box to be placed on a pet');
pass('every creature stage publishes ordered wearable anchors and every item has art to hang on them');

// Everything on sale has to be payable in something the interface actually shows. Twenty pieces
// were priced in stardust after stardust was taken out of the topbar, so the shop offered them,
// the server refused every purchase, and the button was left dead with no message — which is
// what a child reads as the page having stopped.
const unpayable=[...catalog.wearables,...catalog.furniture,...catalog.foods,...catalog.rooms.map((room)=>({...room,id:`room:${room.id}`}))]
  .filter((item)=>item.currency&&item.currency!=='coins');
assert.equal(unpayable.length,0,`priced in a currency the player cannot see: ${unpayable.map((item)=>item.id).join(', ')}`);
assert.ok(catalog.wearables.every((item)=>Number.isInteger(item.price)&&item.price>0),'every wearable needs a positive price');
pass('every purchasable item is priced in the one currency the interface shows');

await fs.rm(tempDir,{recursive:true,force:true});
console.log('\nPet module checks passed.');
