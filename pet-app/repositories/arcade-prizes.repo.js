'use strict';

const { randomUUID } = require('crypto');
const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool, withTransaction } = require('../../math-app/db/database');
const { catalog } = require('../lib/catalog');
const KINDS = ['ruby', 'pet', 'wearable', 'furniture'];
const STOCK_POLICY_VERSION = 2;
const RESTOCK_DROPS = 100;
const INITIAL_PRIZES = 1;
const MAX_BOARD_PRIZES = 4;
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const copy = (value) => JSON.parse(JSON.stringify(value));
let schema;

// Lock the same wallet row used by shop and arcade operations. The prize journal, wallet,
// ledger and redeemed item commit together, even when two tabs submit the same prize.
async function mutate(studentId, action) {
  await require('./pet.repo').ensureStudent(studentId);
  if (config.db.mode === 'postgres') {
    schema ??= getPool().query(`CREATE TABLE IF NOT EXISTS PetArcadePrizes (
      StudentID VARCHAR(20) PRIMARY KEY REFERENCES Users(StudentID) ON DELETE CASCADE,
      State JSONB NOT NULL DEFAULT '{"issued":0,"prizes":[]}'::jsonb
    )`).catch((error) => { schema = undefined; throw error; });
    await schema;
    return withTransaction(async (client) => {
      const wallet = (await client.query('SELECT Balance AS balance FROM PetWallets WHERE StudentID=$1 FOR UPDATE', [studentId])).rows[0];
      const state = (await client.query('SELECT State AS state FROM PetArcadePrizes WHERE StudentID=$1', [studentId])).rows[0]?.state ?? { issued: 0, prizes: [] };
      const context = {
        state, wallet,
        plays: Number((await client.query('SELECT COUNT(*) AS count FROM PetCoinPusherPlays WHERE StudentID=$1', [studentId])).rows[0].count),
        owned: new Set((await client.query('SELECT SpeciesID AS id FROM PetInstances WHERE StudentID=$1', [studentId])).rows.map((row) => row.id)),
        inventory: new Set((await client.query('SELECT ItemID AS id FROM PetInventory WHERE StudentID=$1 AND Quantity>0', [studentId])).rows.map((row) => row.id)),
        credit: async (prize) => {
          wallet.balance = Number(wallet.balance) + 50;
          await client.query('UPDATE PetWallets SET Balance=$2,UpdatedAt=NOW() WHERE StudentID=$1', [studentId, wallet.balance]);
          await client.query(`INSERT INTO PetCurrencyLedger (TransactionID,StudentID,ActorID,Delta,Kind,IdempotencyKey,Metadata)
            VALUES ($1,$2,$2,50,'arcade_ruby',$3,$4::jsonb)`, [randomUUID(), studentId, `ruby:${prize.id}`, JSON.stringify({ prizeId: prize.id })]);
        },
        grant: async (kind, itemId) => {
          if (kind === 'pet') {
            const id = randomUUID();
            await client.query('INSERT INTO PetInstances (PetID,StudentID,SpeciesID) VALUES ($1,$2,$3)', [id, studentId, itemId]);
            await client.query('UPDATE PetProfiles SET ActivePetID=COALESCE(ActivePetID,$2),StarterEggClaimed=TRUE,UpdatedAt=NOW() WHERE StudentID=$1', [studentId, id]);
          } else await client.query(`INSERT INTO PetInventory (StudentID,ItemID,Quantity) VALUES ($1,$2,1)
            ON CONFLICT (StudentID,ItemID) DO UPDATE SET Quantity=PetInventory.Quantity+1,UpdatedAt=NOW()`, [studentId, itemId]);
        },
      };
      const result = await action(context);
      await client.query(`INSERT INTO PetArcadePrizes (StudentID,State) VALUES ($1,$2::jsonb)
        ON CONFLICT (StudentID) DO UPDATE SET State=EXCLUDED.State`, [studentId, JSON.stringify(state)]);
      return result;
    });
  }
  // Actions on JSON never await I/O: concurrent requests cannot observe an intermediate grant.
  const data = store.load();
  data.petArcadePrizes ??= [];
  const original = data.petArcadePrizes.find((row) => row.studentId === studentId);
  const state = copy(original?.state ?? { issued: 0, prizes: [] });
  const wallet = data.petWallets.find((row) => row.studentId === studentId);
  const context = {
    state, wallet,
    plays: data.petCoinPusherPlays.filter((row) => row.studentId === studentId).length,
    owned: new Set(data.petInstances.filter((row) => row.studentId === studentId).map((row) => row.speciesId)),
    inventory: new Set(data.petInventory.filter((row) => row.studentId === studentId && row.quantity > 0).map((row) => row.itemId)),
    credit: (prize) => {
      wallet.balance += 50; wallet.updatedAt = new Date().toISOString();
      data.petCurrencyLedger.push({ transactionId: randomUUID(), studentId, actorId: studentId, delta: 50, kind: 'arcade_ruby', idempotencyKey: `ruby:${prize.id}`, metadata: { prizeId: prize.id }, createdAt: wallet.updatedAt });
    },
    grant: (kind, itemId) => {
      if (kind === 'pet') {
        const id = randomUUID();
        data.petInstances.push({ petId: id, studentId, speciesId: itemId, xp: 0, stage: 1, dailyXp: 0, dailyXpDate: '', equippedWearables: [], createdAt: new Date().toISOString() });
        const profile = data.petProfiles.find((row) => row.studentId === studentId);
        profile.activePetId ??= id; profile.starterEggClaimed = true;
      } else {
        const row = data.petInventory.find((entry) => entry.studentId === studentId && entry.itemId === itemId);
        if (row) row.quantity += 1; else data.petInventory.push({ studentId, itemId, quantity: 1 });
      }
    },
  };
  const result = action(context);
  if (result?.then) throw new Error('JSON prize mutations must be synchronous');
  if (original) original.state = state; else data.petArcadePrizes.push({ studentId, state });
  store.save();
  return copy(result);
}

function stock(studentId) {
  return mutate(studentId, ({ state, plays }) => {
    if (state.stockPolicyVersion !== STOCK_POLICY_VERSION) {
      // Preserve existing prize identities, claims and vouchers. Start the slower
      // schedule at adoption, rather than applying it retroactively to all plays
      // (which could either freeze restocking or immediately flood the board).
      const isNew = state.issued === 0 && state.prizes.length === 0;
      state.stockBudget = state.issued + (isNew ? INITIAL_PRIZES : 0);
      state.nextRestockPlay = plays + RESTOCK_DROPS;
      state.stockPolicyVersion = STOCK_POLICY_VERSION;
    }
    if (plays >= state.nextRestockPlay) {
      const intervals = Math.floor((plays - state.nextRestockPlay) / RESTOCK_DROPS) + 1;
      state.stockBudget += intervals;
      state.nextRestockPlay += intervals * RESTOCK_DROPS;
    }
    while (state.issued < state.stockBudget && state.prizes.filter((prize) => prize.status === 'board').length < MAX_BOARD_PRIZES) {
      state.prizes.push({ id: randomUUID(), kind: KINDS[state.issued % KINDS.length], variant: Math.floor(state.issued / 4) % 2, status: 'board' });
      state.issued += 1;
    }
    return { prizes: state.prizes.filter((prize) => prize.status !== 'redeemed' && !(prize.kind === 'ruby' && prize.status === 'bag')), dropsUntilRestock: state.nextRestockPlay - plays };
  });
}

function claim(studentId, prizeId) {
  return mutate(studentId, (context) => {
    const prize = context.state.prizes.find((entry) => entry.id === prizeId);
    if (!prize) fail('這件獎品不屬於你的機台。', 404);
    if (prize.claimResult) return { ...prize.claimResult, replayed: true, balance: Number(context.wallet.balance) };
    const complete = () => {
      prize.status = 'bag'; prize.claimedAt = new Date().toISOString();
      prize.claimResult = { prizeId, kind: prize.kind, earned: prize.kind === 'ruby' ? 50 : 0, balance: Number(context.wallet.balance) };
      return copy(prize.claimResult);
    };
    if (prize.kind !== 'ruby') return complete();
    const credited = context.credit(prize);
    return credited?.then ? credited.then(complete) : complete();
  });
}

function redeem(studentId, prizeId, itemId) {
  return mutate(studentId, (context) => {
    const prize = context.state.prizes.find((entry) => entry.id === prizeId);
    if (!prize) fail('找不到這張兌換券。', 404);
    if (prize.status === 'redeemed') {
      if (prize.itemId !== itemId) fail('這張券已兌換其他物品。');
      return { ...prize.redeemResult, replayed: true };
    }
    if (prize.status !== 'bag' || prize.kind === 'ruby') fail('獎品必須先跌入幣槽才可兌換。');
    const source = prize.kind === 'pet' ? catalog.pets : prize.kind === 'wearable' ? catalog.wearables : catalog.furniture;
    const item = source.find((entry) => entry.id === itemId);
    if (!item || (prize.kind === 'pet' && !['common', 'rare'].includes(item.rarity))) fail('這張券不能兌換此物品。', 400);
    if ((prize.kind === 'pet' ? context.owned : context.inventory).has(itemId)) fail('你已擁有此物品，請選另一件。');
    const complete = () => {
      prize.status = 'redeemed'; prize.itemId = itemId; prize.redeemedAt = new Date().toISOString();
      prize.redeemResult = { prizeId, itemId, kind: prize.kind };
      return copy(prize.redeemResult);
    };
    const granted = context.grant(prize.kind, itemId);
    return granted?.then ? granted.then(complete) : complete();
  });
}

module.exports = { stock, claim, redeem };
