'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createServer } = require('vite');

test('prizes are student-bound, budgeted, credited once and redeemed without coins or Epic pets', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'buio-prizes-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const source = `
    const assert = require('node:assert/strict');
    const repo = require('./pet-app/repositories/pet.repo');
    const prizes = require('./pet-app/repositories/arcade-prizes.repo');
    const store = require('./db/jsonStore');
    (async () => {
      await repo.grantUnlimitedMoney('S001', 1000); await repo.ensureStudent('S002');
      const first = await prizes.stock('S001');
      assert.equal(first.prizes.length,1,'a new cabinet starts with one prize, not four');
      assert.equal(first.dropsUntilRestock,100);
      for(let i=0;i<99;i++) await repo.playCoinPusher('S001',{idempotencyKey:'initial-'+i});
      const almost = await prizes.stock('S001');
      assert.deepEqual(almost.prizes,first.prizes);assert.equal(almost.dropsUntilRestock,1);
      for(let i=99;i<300;i++) await repo.playCoinPusher('S001',{idempotencyKey:'initial-'+i});
      const initial = await prizes.stock('S001');
      assert.equal(initial.prizes.length,4,'300 paid drops unlock three more prizes');
      assert.equal(initial.dropsUntilRestock,100);
      for (let i=0;i<8;i++) assert.deepEqual(await prizes.stock('S001'), initial);
      const [ruby, pet, wearable, furniture] = initial.prizes;
      await assert.rejects(prizes.claim('S002',ruby.id), {status:404});
      await assert.rejects(prizes.claim('S001','made-up'), {status:404});
      await assert.rejects(prizes.redeem('S001',pet.id,'cloud-ear-dog'), {status:409});
      const claimed = await Promise.all(Array.from({length:5},()=>prizes.claim('S001',ruby.id)));
      assert.equal(claimed[0].earned,50);
      assert.equal((await repo.getBootstrap('S001')).wallet.balance,750);
      assert.equal(store.load().petCurrencyLedger.filter(x=>x.kind==='arcade_ruby').length,1);
      assert.equal((await prizes.stock('S001')).prizes.length,3, 'claiming and reloading cannot mint another free ruby');
      const before = await repo.getBootstrap('S001');
      await Promise.all([pet,wearable,furniture].map(p=>prizes.claim('S001',p.id)));
      await assert.rejects(prizes.redeem('S001',pet.id,before.catalog.pets.find(x=>x.rarity==='epic').id), {status:400});
      const target = before.catalog.pets.find(x=>x.rarity==='rare');
      await Promise.all(Array.from({length:3},()=>prizes.redeem('S001',pet.id,target.id)));
      await assert.rejects(prizes.redeem('S001',pet.id,before.catalog.pets.find(x=>x.rarity==='common').id), {status:409});
      await assert.rejects(prizes.redeem('S001',wearable.id,target.id), {status:400});
      const hat = [...before.catalog.wearables].sort((a,b)=>b.price-a.price)[0];
      const sofa = [...before.catalog.furniture].filter(x=>!before.inventory.some(i=>i.itemId===x.id)).sort((a,b)=>b.price-a.price)[0];
      await prizes.redeem('S001',wearable.id,hat.id); await prizes.redeem('S001',furniture.id,sofa.id);
      const after = await repo.getBootstrap('S001');
      assert.equal(after.wallet.balance,750); assert.equal(after.profile.eggPity,before.profile.eggPity);
      assert.equal(after.pets.filter(x=>x.speciesId===target.id).length,1);
      assert.equal(after.inventory.find(x=>x.itemId===hat.id).quantity,1);
      assert.equal(after.inventory.find(x=>x.itemId===sofa.id).quantity,1);
      assert.equal((await prizes.stock('S001')).prizes.length,0);
      for(let i=0;i<99;i++) await repo.playCoinPusher('S001',{idempotencyKey:'drop-'+i});
      assert.equal((await prizes.stock('S001')).prizes.length,0,'99 drops cannot restock a prize');
      // A replayed debit is not another paid drop and must not move the threshold.
      await repo.playCoinPusher('S001',{idempotencyKey:'drop-98'});
      assert.equal((await prizes.stock('S001')).dropsUntilRestock,1);
      await repo.playCoinPusher('S001',{idempotencyKey:'drop-99'});
      const restocked = await prizes.stock('S001'); assert.equal(restocked.prizes.length,1);
      assert.equal(restocked.prizes[0].kind,'ruby'); assert.notEqual(restocked.prizes[0].id,ruby.id);
      for(let i=0;i<5;i++) assert.deepEqual(await prizes.stock('S001'),restocked);
      repo.purgeJsonStudent('S001'); assert.equal(store.load().petArcadePrizes.some(x=>x.studentId==='S001'),false);
      console.log(JSON.stringify({pass:true, ruby:50, pet:target.id, accessory:hat.id, furniture:sofa.id}));
    })().catch(e=>{console.error(e);process.exitCode=1});
  `;
  const child = spawnSync(process.execPath, ['-e', source], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', SUPABASE_DB_URL: '', BUIO_JSON_DB_FILE: path.join(temp, 'db.json') } });
  assert.equal(child.status, 0, child.stderr);
});

test('slower stock migration preserves old prizes and starts a fresh 100-drop schedule without a backlog', t => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'buio-prize-migration-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const source=`
    const assert=require('node:assert/strict');
    const repo=require('./pet-app/repositories/pet.repo');
    const prizes=require('./pet-app/repositories/arcade-prizes.repo');
    const store=require('./db/jsonStore');
    (async()=>{
      await repo.grantUnlimitedMoney('S001',1000);
      const data=store.load();
      data.petCoinPusherPlays=Array.from({length:1000},(_,i)=>({studentId:'S001',playId:'historical-'+i}));
      const existing=[
        {id:'old-ruby',kind:'ruby',variant:0,status:'board'},
        {id:'old-pet',kind:'pet',variant:0,status:'bag',claimResult:{prizeId:'old-pet',kind:'pet',earned:0,balance:1000}},
        {id:'old-wearable',kind:'wearable',variant:0,status:'board'},
        {id:'old-furniture',kind:'furniture',variant:0,status:'redeemed',itemId:'old-item'},
      ];
      data.petArcadePrizes=[{studentId:'S001',state:{issued:4,prizes:existing}}];store.save();
      const adopted=await prizes.stock('S001');
      assert.equal(adopted.prizes.length,3,'no prizes are backfilled from 1000 old drops');
      assert.equal(adopted.dropsUntilRestock,100);
      assert.deepEqual(store.load().petArcadePrizes[0].state.prizes,existing,'preserve board, bag and redeemed identities/results');
      for(let i=0;i<8;i++)assert.deepEqual(await prizes.stock('S001'),adopted);
      assert.equal((await repo.getBootstrap('S001')).wallet.balance,1000,'adoption changes no wallet money');
      for(let i=0;i<99;i++)await repo.playCoinPusher('S001',{idempotencyKey:'new-policy-'+i});
      const before=await prizes.stock('S001');assert.equal(before.prizes.length,3);assert.equal(before.dropsUntilRestock,1);
      await repo.playCoinPusher('S001',{idempotencyKey:'new-policy-99'});
      const after=await prizes.stock('S001');assert.equal(after.prizes.length,4);assert.equal(after.dropsUntilRestock,100);
      assert.equal(after.prizes.at(-1).kind,'ruby');assert.equal(store.load().petArcadePrizes[0].state.issued,5);
      assert.equal((await repo.getBootstrap('S001')).wallet.balance,900,'only paid drops affect this wallet');
      console.log(JSON.stringify({pass:true}));
    })().catch(error=>{console.error(error);process.exitCode=1});
  `;
  const child=spawnSync(process.execPath,['-e',source],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8',env:{...process.env,NODE_ENV:'test',SUPABASE_DB_URL:'',BUIO_JSON_DB_FILE:path.join(temp,'db.json')}});
  assert.equal(child.status,0,child.stderr);
});

test('physical prizes reset/save with the same identities and emit only their own trough catch', async (t) => {
  const vite = await createServer({root:path.resolve(__dirname,'..'),server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error',ssr:{noExternal:['@dimforge/rapier3d']}});
  t.after(()=>vite.close());
  const { CoinPusherModel } = await vite.ssrLoadModule('/src/game/CoinPusherModel.ts');
  const { PRIZE_HALF_HEIGHT } = await vite.ssrLoadModule('/src/game/ArcadePrizes.ts');
  const { MAIN_DECK_SUPPORT_FRONT_Z, PAYOUT_TRAY_CENTER_Z } = await vite.ssrLoadModule('/src/game/CoinPusherDimensions.ts');
  let model = new CoinPusherModel();
  try {
    const prizes = ['ruby','pet','wearable','furniture'].map((kind,i)=>({id:'prize-'+i,kind,variant:0,status:'board'}));
    model.syncPrizes(prizes); model.syncPrizes(prizes);
    assert.equal(model.coins.filter(c=>c.prize).length,4);
    model.resetBoardToThreeRows();
    assert.deepEqual(model.coins.filter(c=>c.prize).map(c=>c.prize.id),prizes.map(p=>p.id));
    const saved = model.createSnapshot(); model.destroy(); model = CoinPusherModel.restoreSnapshot(saved);
    assert.equal(model.coins.filter(c=>c.prize).length,4);
    assert.ok(model.coins.filter(c=>c.prize).every(c=>Math.abs(c.collider.halfHeight()+.005-PRIZE_HALF_HEIGHT)<.0001));
    // Move only fixture trophies to the actual deck edge and let Rapier own their full fall.
    for (const [i,coin] of model.coins.filter(c=>c.prize).entries()) {
      coin.body.setTranslation({x:(i-1.5)*.6,y:.065,z:MAIN_DECK_SUPPORT_FRONT_Z+.08},true);
      coin.body.setLinvel({x:0,y:0,z:.18},true);
    }
    const events=[];
    for(let i=0;i<360;i++){model.update(1000/60);events.push(...model.drainEvents());}
    const caught=events.filter(e=>e.type==='prize-collected');
    assert.equal(caught.length,4, 'all four tall prizes must reach the recessed trough and be confirmed');
    assert.equal(new Set(caught.map(e=>e.prize.id)).size,4);
    assert.ok(caught.every(e=>Math.abs(e.position.z-PAYOUT_TRAY_CENTER_Z)<.6));
    assert.equal(events.filter(e=>e.type==='coins-collected').length,0,'prizes must never also earn ordinary +1');
    assert.equal(model.coins.filter(c=>c.prize).length,0,'confirmed trophies disappear after the catch animation');
  } finally { model.destroy(); }
});

test('enlarged freestanding prize art has no coin plinth and fits its collision bounds', async (t) => {
  const vite = await createServer({root:path.resolve(__dirname,'..'),server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  t.after(()=>vite.close());
  const {createPrizeVisual,parsePrizeVisuals,disposePrizeVisuals} = await vite.ssrLoadModule('/src/game/ArcadePrizeVisual.ts');
  const {PRIZE_RADIUS,PRIZE_HALF_HEIGHT,PRIZE_VISUAL_SCALE} = await vite.ssrLoadModule('/src/game/ArcadePrizes.ts');
  const THREE = require('three');
  assert.ok(PRIZE_VISUAL_SCALE >= 1.5);
  const bytes = fs.readFileSync(path.resolve(__dirname,'../src/game/assets/arcade-prizes-v2.glb'));
  assert.ok(bytes.length < 900000,'texture-free collection stays within the mobile download budget');
  const templates = await parsePrizeVisuals(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  t.after(()=>disposePrizeVisuals(templates));
  assert.equal(templates.size,8);
  for(const kind of ['ruby','pet','wearable','furniture']) for(const variant of [0,1]) {
    const geometries=[];
    const visual=createPrizeVisual({id:kind+variant,kind,variant,status:'board'},templates);
    visual.traverse(part=>{if(part instanceof THREE.Mesh)geometries.push(part.geometry);});
    const box = new THREE.Box3().setFromObject(visual, true);
    assert.ok(box.min.y >= -PRIZE_HALF_HEIGHT-.0001 && box.max.y <= PRIZE_HALF_HEIGHT+.0001, kind+' height');
    assert.ok(Math.max(Math.abs(box.min.x),Math.abs(box.max.x),Math.abs(box.min.z),Math.abs(box.max.z)) <= PRIZE_RADIUS+.0001, kind+' width');
    assert.ok(Math.abs(box.min.y+PRIZE_HALF_HEIGHT)<.001,kind+' stands directly on support without floating');
    assert.equal(geometries.some(g=>g.type==='TorusGeometry'),false,'no circular coin-like rim beneath prizes');
    assert.ok(geometries.length <= 8,kind+' batches sculpted parts by material for mobile draw calls');
    assert.ok(geometries.every(g=>g.attributes.position.count>0));
    assert.ok(Math.abs(visual.position.y)<.0001,'asset pivot stays at the physical body centre');
  }
});
