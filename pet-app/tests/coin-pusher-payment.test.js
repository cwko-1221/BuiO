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
  assert.equal(result.payout.remainingPayout, 97);
  assert.equal(result.initial.coinPusherCollection.returnedCoins, 0);
  assert.equal(result.payout.collection.returnedCoins, 3);
  assert.equal(result.secondPayout.collection.returnedCoins, 5);
  assert.equal(result.finalBootstrap.coinPusherCollection.returnedCoins, 5,
    'bootstrap progress must persist across plays and reloads');
  assert.equal(result.finalBootstrap.wallet.balance, 5,
    'only the five confirmed payout coins return to the wallet after two one-coin drops');
  assert.deepEqual(result.data.petCurrencyLedger.filter((row) => row.studentId === 'coin-test-student' && row.kind === 'coin_pusher_play').map((row) => row.delta), [-1, -1]);
  assert.deepEqual(result.data.petCurrencyLedger.filter((row) => row.studentId === 'coin-test-student' && row.kind === 'coin_pusher_payout').map((row) => row.delta), [3, 2]);
  assert.deepEqual(result.errors, { foreign: 404, mismatch: 409, invalid: 400, keyReuse: 409, longKey: 400 });
});

test('paid coin-pusher has JSON/Postgres tables, row locks, and shared limits', () => {
  const source = fs.readFileSync(repoPath, 'utf8');
  for (const marker of [
    'PetCoinPusherPlays', 'PetCoinPusherPayouts', 'coin_pusher_play', 'coin_pusher_payout',
    'PetIdempotency', 'FOR UPDATE', 'COIN_PUSHER_PAYOUT_CAP', 'petCoinPusherPlays', 'petCoinPusherPayouts',
  ]) assert.ok(source.includes(marker), `missing parity guard: ${marker}`);
});
