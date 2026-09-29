'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..', '..');
const repoPath = path.join(projectRoot, 'pet-app', 'repositories', 'pet.repo.js');
const storePath = path.join(projectRoot, 'db', 'jsonStore.js');

function runFixture(t, source) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buio-coin-pusher-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const dbFile = path.join(tempDir, 'db.json');
  const child = spawnSync(process.execPath, ['-e', source], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: 'test', SUPABASE_DB_URL: '', BUIO_JSON_DB_FILE: dbFile },
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, `coin-pusher fixture failed: ${child.stderr}`);
  return JSON.parse(child.stdout);
}

test('paid coin-pusher debits exactly one coin and returns an idempotent play result', (t) => {
  const result = runFixture(t, `
    const repo = require(${JSON.stringify(repoPath)});
    const store = require(${JSON.stringify(storePath)});
    (async () => {
      await repo.getBootstrap('coin-test-student');
      await repo.grantUnlimitedMoney('coin-test-student', 2);
      const first = await repo.playCoinPusher('coin-test-student', { idempotencyKey: 'play-1' });
      const retry = await repo.playCoinPusher('coin-test-student', { idempotencyKey: 'play-1' });
      const second = await repo.playCoinPusher('coin-test-student', { idempotencyKey: 'play-2' });
      const data = store.load();
      process.stdout.write(JSON.stringify({ first, retry, second, balance: data.petWallets.find((row) => row.studentId === 'coin-test-student').balance, debits: data.petCurrencyLedger.filter((row) => row.kind === 'coin_pusher_play') }));
    })().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
  `);
  assert.equal(result.first.cost, 1);
  assert.equal(result.first.balance, 1);
  assert.deepEqual(result.retry, result.first);
  assert.equal(result.second.cost, 1);
  assert.equal(result.second.balance, 0);
  assert.equal(result.balance, 0);
  assert.deepEqual(result.debits.map((row) => row.delta), [-1, -1]);
});

test('payout events credit once, reject replay mismatches, and cannot cross student plays', (t) => {
  const result = runFixture(t, `
    const repo = require(${JSON.stringify(repoPath)});
    const store = require(${JSON.stringify(storePath)});
    (async () => {
      const initial = await repo.getBootstrap('coin-test-student'); await repo.getBootstrap('other-student');
      await repo.grantUnlimitedMoney('coin-test-student', 1); await repo.grantUnlimitedMoney('other-student', 1);
      const play = await repo.playCoinPusher('coin-test-student', { idempotencyKey: 'play-1' });
      const otherPlay = await repo.playCoinPusher('other-student', { idempotencyKey: 'other-play-1' });
      const payout = await repo.payoutCoinPusher('coin-test-student', { playId: play.playId, eventId: 'event-1', amount: 3, idempotencyKey: 'payout-1' });
      const retry = await repo.payoutCoinPusher('coin-test-student', { playId: play.playId, eventId: 'event-1', amount: 3, idempotencyKey: 'payout-1' });
      const differentKey = await repo.payoutCoinPusher('coin-test-student', { playId: play.playId, eventId: 'event-1', amount: 3, idempotencyKey: 'payout-1-retry' });
      await repo.grantUnlimitedMoney('coin-test-student', 4);
      const secondPlay = await repo.playCoinPusher('coin-test-student', { idempotencyKey: 'play-2' });
      const secondPayout = await repo.payoutCoinPusher('coin-test-student', { playId: secondPlay.playId, eventId: 'event-2', amount: 2, idempotencyKey: 'payout-2' });
      const finalBootstrap = await repo.getBootstrap('coin-test-student');
      const data = store.load();
      const errors = {};
      for (const [name, action] of Object.entries({
        foreign: () => repo.payoutCoinPusher('coin-test-student', { playId: otherPlay.playId, eventId: 'foreign', amount: 1, idempotencyKey: 'foreign' }),
        mismatch: () => repo.payoutCoinPusher('coin-test-student', { playId: play.playId, eventId: 'event-1', amount: 4, idempotencyKey: 'mismatch' }),
        invalid: () => repo.payoutCoinPusher('coin-test-student', { playId: play.playId, eventId: 'bad', amount: 0, idempotencyKey: 'invalid' }),
        keyReuse: () => repo.payoutCoinPusher('coin-test-student', { playId: play.playId, eventId: 'event-2', amount: 1, idempotencyKey: 'play-1' }),
        longKey: () => repo.playCoinPusher('coin-test-student', { idempotencyKey: 'x'.repeat(121) }),
      })) { try { await action(); } catch (error) { errors[name] = error.status; } }
      process.stdout.write(JSON.stringify({ initial, payout, retry, differentKey, secondPayout, finalBootstrap, data, errors }));
    })().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
  `);
  assert.deepEqual(result.retry, result.payout);
  assert.deepEqual(result.differentKey, result.payout);
  assert.equal(result.payout.earned, 3);
  assert.equal(result.payout.balance, 3);
  assert.equal(result.secondPayout.earned, 2);
  assert.equal(result.payout.remainingPayout, 97);
  assert.equal(result.initial.coinPusherCollection.returnedCoins, 0);
  assert.equal(result.payout.collection.returnedCoins, 3);
  assert.equal(result.secondPayout.collection.returnedCoins, 5);
  assert.equal(result.finalBootstrap.coinPusherCollection.returnedCoins, 5,
    'bootstrap progress must persist across plays and reloads');
  assert.equal(result.finalBootstrap.wallet.balance, 5,
    'the second wallet grant sets four coins, then a drop costs one and two catches earn two');
  assert.deepEqual(result.data.petCurrencyLedger.filter((row) => row.studentId === 'coin-test-student' && row.kind === 'coin_pusher_play').map((row) => row.delta), [-1, -1]);
  assert.deepEqual(result.data.petCurrencyLedger.filter((row) => row.studentId === 'coin-test-student' && row.kind === 'coin_pusher_payout').map((row) => row.delta), [3, 2]);
  assert.deepEqual(result.errors, { foreign: 404, mismatch: 409, invalid: 400, keyReuse: 409, longKey: 400 });
});

test('each new catch earns one, while an already committed ten-coin event keeps its original credit', (t) => {
  const result = runFixture(t, `
    const repo = require(${JSON.stringify(repoPath)});
    const store = require(${JSON.stringify(storePath)});
    (async () => {
      await repo.getBootstrap('coin-test-student');
      await repo.grantUnlimitedMoney('coin-test-student', 1);
      const play = await repo.playCoinPusher('coin-test-student', { idempotencyKey: 'play' });
      const data = store.load();
      const legacy = { earned: 10, balance: 10, playId: play.playId, eventId: 'legacy', remainingPayout: 99, collection: { returnedCoins: 1 } };
      data.petWallets.find(row => row.studentId === 'coin-test-student').balance = 10;
      data.petCoinPusherPlays.find(row => row.playId === play.playId).payoutTotal = 1;
      data.petCoinPusherPayouts.push({ studentId: 'coin-test-student', playId: play.playId, eventId: 'legacy', amount: 1, response: legacy });
      store.save();
      const replay = await repo.payoutCoinPusher('coin-test-student', { playId: play.playId, eventId: 'legacy', amount: 1, idempotencyKey: 'legacy-retry' });
      const fresh = await repo.payoutCoinPusher('coin-test-student', { playId: play.playId, eventId: 'fresh', amount: 1, idempotencyKey: 'fresh' });
      const retry = await repo.payoutCoinPusher('coin-test-student', { playId: play.playId, eventId: 'fresh', amount: 1, idempotencyKey: 'fresh-retry' });
      const bootstrap = await repo.getBootstrap('coin-test-student');
      process.stdout.write(JSON.stringify({ legacy, replay, fresh, retry, bootstrap }));
    })().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
  `);
  assert.deepEqual(result.replay, result.legacy, 'old committed events must never be repriced or credited again');
  assert.equal(result.fresh.earned, 1);
  assert.equal(result.fresh.balance, 11);
  assert.deepEqual(result.retry, result.fresh);
  assert.equal(result.bootstrap.wallet.balance, 11);
  assert.equal(result.bootstrap.coinPusherCollection.returnedCoins, 2, 'keepsakes still count physical catches');
});

test('paid coin-pusher has JSON/Postgres tables, row locks, and shared limits', () => {
  const source = fs.readFileSync(repoPath, 'utf8');
  for (const marker of [
    'PetCoinPusherPlays', 'PetCoinPusherPayouts', 'coin_pusher_play', 'coin_pusher_payout',
    'PetIdempotency', 'FOR UPDATE', 'COIN_PUSHER_PAYOUT_CAP', 'petCoinPusherPlays', 'petCoinPusherPayouts',
  ]) assert.ok(source.includes(marker), `missing parity guard: ${marker}`);
});

test('school reward settings persist, validate integers, and snapshot each authorized play', t => {
  const result = runFixture(t, `
    const repo=require(${JSON.stringify(repoPath)}), store=require(${JSON.stringify(storePath)});
    (async()=>{
      const defaultSettings=await repo.getCoinPusherSettings();
      await repo.grantUnlimitedMoney('coin-test-student',20);
      const original=await repo.playCoinPusher('coin-test-student',{idempotencyKey:'old-play'});
      const updated=await repo.updateCoinPusherSettings('teacher-1',{rewardPerCoin:7});
      const bootstrap=await repo.getBootstrap('coin-test-student');
      const fresh=await repo.playCoinPusher('coin-test-student',{idempotencyKey:'new-play',rewardPerCoin:999});
      const payout=await repo.payoutCoinPusher('coin-test-student',{playId:fresh.playId,eventId:'new-catch',amount:3,idempotencyKey:'new-catch',rewardPerCoin:999});
      await repo.updateCoinPusherSettings('teacher-2',{rewardPerCoin:100});
      const retry=await repo.payoutCoinPusher('coin-test-student',{playId:fresh.playId,eventId:'new-catch',amount:3,idempotencyKey:'new-catch-retry'});
      const later=await repo.payoutCoinPusher('coin-test-student',{playId:fresh.playId,eventId:'later',amount:1,idempotencyKey:'later'});
      const old=await repo.payoutCoinPusher('coin-test-student',{playId:original.playId,eventId:'old',amount:1,idempotencyKey:'old'});
      const playRetry=await repo.playCoinPusher('coin-test-student',{idempotencyKey:'old-play'});
      const errors=[];
      for(const value of [0,-1,101,1.5,'7',null,true]){try{await repo.updateCoinPusherSettings('teacher-1',{rewardPerCoin:value});}catch(error){errors.push(error.status);}}
      // Missing rates on legacy persisted plays retain the previous default, not the new global rate.
      delete store.load().petCoinPusherPlays.find(play=>play.playId===original.playId).rewardPerCoin;
      const legacy=await repo.payoutCoinPusher('coin-test-student',{playId:original.playId,eventId:'legacy-default',amount:1,idempotencyKey:'legacy-default'});
      store.save();
      process.stdout.write(JSON.stringify({defaultSettings,updated,bootstrap,payout,retry,later,old,original,playRetry,legacy,errors,settings:await repo.getCoinPusherSettings(),ledger:store.load().petCurrencyLedger}));
    })().catch(error=>{console.error(error.stack);process.exitCode=1});
  `);
  assert.equal(result.defaultSettings.rewardPerCoin, 1);
  assert.equal(result.updated.rewardPerCoin, 7);
  assert.equal(result.updated.updatedBy, 'teacher-1');
  assert.ok(result.updated.updatedAt);
  assert.equal(result.bootstrap.coinPusherSettings.rewardPerCoin, 7);
  assert.equal(result.payout.earned, 21);
  assert.equal(result.payout.balance, 39);
  assert.equal(result.payout.collection.returnedCoins, 3, 'stamp progress counts physical coins, not reward value');
  assert.deepEqual(result.retry, result.payout, 'teacher change does not reprice a committed event');
  assert.equal(result.later.earned, 7, 'unfinished play keeps its captured rate after settings change');
  assert.equal(result.old.earned, 1);
  assert.equal(result.legacy.earned, 1);
  assert.deepEqual(result.original, result.playRetry, 'lost play response keeps the original price and debit');
  assert.equal(result.settings.rewardPerCoin, 100);
  assert.equal(result.settings.updatedBy, 'teacher-2');
  assert.deepEqual(result.errors, Array(7).fill(400));
  assert.deepEqual(result.ledger.filter(row => row.kind === 'coin_pusher_payout').map(row => [row.delta, row.metadata.rewardPerCoin]), [[21,7],[7,7],[1,1],[1,1]]);
});

test('Postgres query contract snapshots prices and replays old payout responses after a settings change', t => {
  const result = runFixture(t, `
    const assert=require('node:assert/strict');
    const config=require('./config');config.db.mode='postgres';
    let settings, balance=20, ddl='';const plays=new Map(),cached=new Map(),events=new Map(),ledger=[];
    const query=async(sql,args=[])=>{
      const reply=(rows=[])=>({rows,rowCount:rows.length});
      if(sql.includes('CREATE TABLE IF NOT EXISTS PetProfiles')){ddl=sql;return reply();}
      if(sql.startsWith('WITH profile AS'))return reply();
      if(sql.startsWith('INSERT INTO PetCoinPusherSettings')){settings={rewardPerCoin:args[0],updatedBy:args[1],updatedAt:'saved'};return reply([settings]);}
      if(sql.includes('FROM PetCoinPusherSettings'))return reply(settings?[settings]:[]);
      if(sql.startsWith('SELECT Kind AS kind,Response AS response FROM PetIdempotency'))return reply(cached.has(args[1])?[cached.get(args[1])]:[]);
      if(sql.startsWith('SELECT Balance AS balance FROM PetWallets'))return reply([{balance}]);
      if(sql.startsWith('UPDATE PetWallets')){balance=args[1];return reply();}
      if(sql.startsWith('INSERT INTO PetCurrencyLedger')){ledger.push({delta:args[2],metadata:JSON.parse(args[5])});return reply();}
      if(sql.startsWith('INSERT INTO PetCoinPusherPlays')){assert.ok(sql.includes('RewardPerCoin'));plays.set(args[0],{playId:args[0],payoutTotal:0,rewardPerCoin:args[3]});return reply();}
      if(sql.startsWith('INSERT INTO PetIdempotency')){cached.set(args[1],{kind:args[2],response:JSON.parse(args[3])});return reply();}
      if(sql.includes('FROM PetCoinPusherPlays WHERE')){assert.ok(sql.includes('RewardPerCoin AS "rewardPerCoin"'));return reply(plays.has(args[0])?[plays.get(args[0])]:[]);}
      if(sql.includes('FROM PetCoinPusherPayouts WHERE')&&sql.includes('EventID='))return reply(events.has(args[1])?[events.get(args[1])]:[]);
      if(sql.includes('SUM(Amount)'))return reply([{returnedCoins:[...events.values()].reduce((sum,event)=>sum+event.amount,0)}]);
      if(sql.startsWith('UPDATE PetCoinPusherPlays')){plays.get(args[0]).payoutTotal=args[1];return reply();}
      if(sql.startsWith('INSERT INTO PetCoinPusherPayouts')){events.set(args[3],{playId:args[1],amount:args[4],response:JSON.parse(args[5])});return reply();}
      throw new Error('Unexpected query: '+sql);
    };
    const dbPath=require.resolve('./math-app/db/database');require(dbPath);require.cache[dbPath].exports={getPool:()=>({query}),withTransaction:fn=>fn({query})};
    const repo=require(${JSON.stringify(repoPath)});
    (async()=>{
      await repo.ensureStudent('pg-student');
      const defaults=await repo.getCoinPusherSettings();
      await repo.updateCoinPusherSettings('teacher',{rewardPerCoin:9});
      const play=await repo.playCoinPusher('pg-student',{idempotencyKey:'play'});
      await repo.updateCoinPusherSettings('teacher',{rewardPerCoin:2});
      const payout=await repo.payoutCoinPusher('pg-student',{playId:play.playId,eventId:'event',amount:3,idempotencyKey:'payout'});
      const replay=await repo.payoutCoinPusher('pg-student',{playId:play.playId,eventId:'event',amount:3,idempotencyKey:'replay'});
      const playReplay=await repo.playCoinPusher('pg-student',{idempotencyKey:'play'});
      const fresh=await repo.playCoinPusher('pg-student',{idempotencyKey:'fresh'});
      process.stdout.write(JSON.stringify({defaults,play,payout,replay,playReplay,fresh,balance,ledger,migration:ddl.includes('ALTER TABLE PetCoinPusherPlays ADD COLUMN IF NOT EXISTS RewardPerCoin INTEGER NOT NULL DEFAULT 1')}));
    })().catch(error=>{console.error(error.stack);process.exitCode=1});
  `);
  assert.equal(result.defaults.rewardPerCoin, 1);
  assert.equal(result.migration, true, 'old tables gain a compatible default without changing payouts');
  assert.equal(result.play.rewardPerCoin, 9);
  assert.equal(result.payout.earned, 27);
  assert.equal(result.payout.balance, 46);
  assert.deepEqual(result.replay, result.payout);
  assert.deepEqual(result.playReplay, result.play);
  assert.equal(result.fresh.rewardPerCoin, 2);
  assert.equal(result.balance, 45);
  assert.deepEqual(result.ledger.map(row => row.delta), [-1,27,-1]);
});
