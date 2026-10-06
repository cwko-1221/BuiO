'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { settings, transition, advance } = require('../lib/quiet-room');

const makeSession = () => ({ status: 'running', lastTick: 0, remainingMs: 10000, remainingReward: 20, penalty: 7, breaches: 0, events: [], lastNoiseAt: null });

test('pause freezes countdown and noise penalties; resume excludes paused time', () => {
  const session = makeSession();
  transition(session, 'noise', 1000, 'event-1');
  transition(session, 'noise', 2600, 'event-1');
  assert.equal(session.remainingReward, 13);
  transition(session, 'pause', 3000);
  transition(session, 'noise', 100000, 'paused-noise');
  assert.equal(session.remainingMs, 7000);
  assert.equal(session.breaches, 1);
  transition(session, 'resume', 100000);
  transition(session, 'noise', 101000, 'event-2');
  transition(session, 'noise', 101100, 'burst-too-soon');
  assert.equal(session.remainingReward, 6);
  transition(session, 'noise', 103000, 'event-3');
  assert.equal(session.remainingReward, 0);
  transition(session, 'heartbeat', 107000);
  assert.equal(session.status, 'completed');
  transition(session, 'noise', 108000, 'after-completion');
  assert.equal(session.breaches, 3);
});

test('lost monitoring lease pauses the session instead of counting a long unattended gap', () => {
  const session = makeSession();
  advance(session, 60000);
  assert.equal(session.status, 'paused');
  assert.equal(session.remainingMs, 4000);
  transition(session, 'resume', 70000);
  advance(session, 71000);
  assert.equal(session.remainingMs, 3000);
});

test('settings reject invalid durations, thresholds and fractional rewards', () => {
  const valid = { durationSeconds: 10, threshold: 45, reward: 100, penalty: 10 };
  assert.deepEqual(settings(valid), valid);
  for (const change of [{ durationSeconds: 0 }, { durationSeconds: 7201 }, { threshold: 0 }, { threshold: 101 }, { reward: 1.5 }, { reward: 10001 }, { penalty: -1 }]) assert.throws(() => settings({ ...valid, ...change }));
});

test('concurrent settlement pays the captured recipients once, survives reload, and cancels without pay', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-quiet-room-'));
  // The fixture owns this verified temporary directory; no workspace data is used.
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const child = spawnSync(process.execPath, ['-e', `
    const assert=require('node:assert/strict');
    const repo=require('./pet-app/repositories/quiet-room.repo');
    const store=require('./db/jsonStore');
    let now=100000;Date.now=()=>now;
    (async()=>{
      const options={durationSeconds:10,threshold:45,reward:20,penalty:7};
      const s=await repo.start('T001',options,['S001','S002'],'start-1','5A');
      const again=await repo.start('T001',options,['S003'],'start-1','5B');
      assert.equal(again.id,s.id);
      await assert.rejects(repo.start('T001',options,['S003'],'start-2','5B'));
      await assert.rejects(repo.update('OTHER',s.id,'noise','bad'),e=>e.status===404);
      now+=1000;await repo.update('T001',s.id,'noise','n1');
      await repo.update('T001',s.id,'noise','n1');
      now+=1000;await repo.update('T001',s.id,'pause');
      now+=100000;await repo.update('T001',s.id,'resume');
      now+=4000;await repo.update('T001',s.id,'heartbeat');
      now+=4000;
      const results=await Promise.all([repo.update('T001',s.id,'heartbeat'),repo.current('T001'),repo.update('T001',s.id,'heartbeat')]);
      assert.ok(results.every(r=>r.payout.amount===13));
      let data=store.load();assert.equal(data.petCurrencyLedger.length,2);
      assert.ok(data.petWallets.every(w=>w.balance===13));
      delete require.cache[require.resolve('./pet-app/repositories/quiet-room.repo')];
      const loaded=require('./pet-app/repositories/quiet-room.repo');
      assert.equal((await loaded.current('T001')).payout.total,26);
      assert.equal(store.load().petCurrencyLedger.length,2);
      const cancelled=await loaded.start('T001',options,['S003'],'cancel-me','5B');
      await loaded.update('T001',cancelled.id,'cancel');
      now+=100000;assert.equal((await loaded.current('T001')).status,'cancelled');
      assert.equal(store.load().petCurrencyLedger.length,2);
      const zero=await loaded.start('T001',{...options,reward:5},['S003'],'zero','5B');
      now+=1000;await loaded.update('T001',zero.id,'noise','zero-event');
      now+=4000;await loaded.update('T001',zero.id,'heartbeat');
      now+=5000;assert.equal((await loaded.update('T001',zero.id,'heartbeat')).payout.amount,0);
      assert.equal(store.load().petCurrencyLedger.length,2);
    })().catch(e=>{console.error(e);process.exitCode=1});
  `], { cwd: path.resolve(__dirname, '../..'), env: { ...process.env, NODE_ENV: 'test', SUPABASE_DB_URL: '', BUIO_JSON_DB_FILE: path.join(temp, 'db.json') }, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
});

test('microphone readings increase about 30 points and threshold crossing stays immediate', async () => {
  const ts = require('../node_modules/typescript');
  const source = fs.readFileSync(path.resolve(__dirname, '../src/quiet-room-meter.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exported = {}; new Function('exports', js)(exported);
  assert.equal(exported.microphoneLevel(new Float32Array(2048)), 0);
  assert.equal(exported.microphoneLevel(new Float32Array(2048).fill(1)), 90);
  assert.equal(exported.microphoneLevel(new Float32Array(1024).fill(.001)), 0, 'quiet input has no artificial sensitivity boost');
  assert.equal(exported.microphoneLevel(new Float32Array(1024).fill(.004)), 10, 'the same sound reads about 30 points higher');
  assert.equal(exported.microphoneLevel(new Float32Array(1024).fill(.25)), 70);
  assert.equal(exported.microphoneLevel(new Float32Array(1024).fill(.5)), 80);
  const gate = new exported.NoiseGate();
  assert.equal(gate.sample(44,45,0),false);
  assert.equal(gate.sample(45,45,1),true, 'touching the line triggers on the very first sample');
  assert.equal(gate.sample(70,45,2),false, 'a louder continuation remains one burst');
  assert.equal(gate.sample(20,45,100),false);
  assert.equal(gate.sample(70,45,200),false);
  assert.equal(gate.sample(70,45,900),false);
  assert.equal(gate.sample(70,45,10000),false);
  gate.sample(42,45,11000); gate.sample(42,45,11999);
  assert.equal(gate.sample(45,45,12000),false, 'a sub-second quiet gap does not rearm');
  gate.sample(42,45,13000); gate.sample(43,45,13500);
  assert.equal(gate.sample(45,45,14500),false, 'hovering close to the line breaks the quiet gap');
  gate.sample(42,45,15000); gate.sample(42,45,16000);
  assert.equal(gate.sample(45,45,16001),true, 'the next crossing fires immediately after one quiet second');
  gate.reset(); assert.equal(gate.sample(70,45,17000),true, 'reset restores immediate detection');
  gate.reset(); assert.equal(gate.sample(100,100,18000),true, 'the maximum line is reachable');
});
