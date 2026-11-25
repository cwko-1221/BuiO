'use strict';
const { randomUUID } = require('node:crypto');
const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool, withTransaction } = require('../../math-app/db/database');
const pets = require('./pet.repo');
const world = import('../lib/park-world.mjs');
const gameRules = import('../lib/park-games.mjs');
const marketRules = import('../lib/park-market.mjs');
const economyRules=import('../lib/park-economy.mjs');
const copy = value => structuredClone(value);
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
let schema, queue = Promise.resolve();

async function ensure() {
  await pets.ensureSchema();
  const {PARK_ECONOMY:e,migrateParkSettings}=await economyRules;
  if (config.db.mode !== 'postgres') { const data=store.load();data.petParkProgress??=[];const previous=data.petParkSettings,next=migrateParkSettings(previous);if(previous!==next){data.petParkSettings=next;try{store.save();}catch(error){data.petParkSettings=previous;throw error;}}return; }
  schema ??= getPool().query(`
    CREATE TABLE IF NOT EXISTS PetParkProgress (
      StudentID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
      ParkDay VARCHAR(10) NOT NULL, State JSONB NOT NULL,
      UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (StudentID, ParkDay)
    );
    CREATE TABLE IF NOT EXISTS PetParkSettings (
      SettingID INTEGER PRIMARY KEY CHECK (SettingID=1), DailyCap INTEGER NOT NULL CHECK (DailyCap BETWEEN 0 AND ${e.maxDailyCap}), EconomyVersion INTEGER NOT NULL DEFAULT ${e.version},
      UpdatedBy VARCHAR(20) NOT NULL, UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE PetParkSettings ADD COLUMN IF NOT EXISTS EconomyVersion INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE PetParkSettings DROP CONSTRAINT IF EXISTS petparksettings_dailycap_check;
    UPDATE PetParkSettings SET DailyCap=LEAST(${e.maxDailyCap},DailyCap*${e.legacyCapScale}),EconomyVersion=${e.version} WHERE EconomyVersion<${e.version};
    ALTER TABLE PetParkSettings ADD CONSTRAINT petparksettings_dailycap_check CHECK(DailyCap BETWEEN 0 AND ${e.maxDailyCap});`).catch(error => { schema = null; throw error; });
  await schema;
}
async function settings(client) {
  await ensure();
  const row = config.db.mode === 'postgres'
    ? (await (client || getPool()).query('SELECT DailyCap AS "dailyCap" FROM PetParkSettings WHERE SettingID=1')).rows[0]
    : store.load().petParkSettings;
  return { dailyCap: row?.dailyCap === undefined ? (await economyRules).PARK_ECONOMY.defaultDailyCap : Number(row.dailyCap) };
}
async function updateSettings(actorId, dailyCap) {
  const {PARK_ECONOMY:e}=await economyRules;
  if (!Number.isInteger(dailyCap) || dailyCap < 0 || dailyCap > e.maxDailyCap) fail(`每日任務金幣上限須為 0 至 ${e.maxDailyCap} 的整數。`, 400);
  await ensure();
  if (config.db.mode === 'postgres') await getPool().query(`INSERT INTO PetParkSettings (SettingID,DailyCap,UpdatedBy,EconomyVersion) VALUES (1,$1,$2,$3)
    ON CONFLICT (SettingID) DO UPDATE SET DailyCap=$1,UpdatedBy=$2,EconomyVersion=$3,UpdatedAt=NOW()`, [dailyCap, actorId,e.version]);
  else { const data = store.load(), previous = data.petParkSettings; data.petParkSettings = { dailyCap, actorId, economyVersion:e.version }; try { store.save(); } catch (error) { data.petParkSettings = previous; throw error; } }
  return { dailyCap };
}
const blank = day => ({ day, quests: {}, earned: 0, bonusClaimed: false, position: null, discoveries: [], games: {} });
const normalize = state => ({ ...blank(state.day), ...state, discoveries: state.discoveries || [], games: state.games || {} });
async function read(studentId, now = Date.now()) {
  await pets.ensureStudent(studentId); await ensure();
  const day = pets.hkDay(new Date(now));
  const row = config.db.mode === 'postgres'
    ? (await getPool().query('SELECT State AS state FROM PetParkProgress WHERE StudentID=$1 AND ParkDay=$2', [studentId, day])).rows[0]
    : store.load().petParkProgress.find(row => row.studentId === studentId && row.day === day);
  return copy(normalize(row?.state || blank(day)));
}
async function mutate(studentId, change, options = {}) {
  await pets.ensureStudent(studentId); await ensure();
  const now = options.now ?? Date.now(), day = pets.hkDay(new Date(now)), rules = await world, market = await marketRules;
  const apply = (state, balance, dailyCap, bagState) => {
    const bag = options.cargo ? market.normalizeBag(copy(bagState || market.blankBag()), day) : undefined;
    state = normalize(state);
    options.canCommit?.();
    const entries = [], credit = (amount, key, metadata) => {
      const delta = Math.min(amount, Math.max(0, dailyCap - state.earned));
      if (delta) entries.push({ transactionId: randomUUID(), studentId, actorId: studentId, delta, kind: 'park_daily', idempotencyKey: `park:${day}:${key}`, metadata: { day, ...metadata }, createdAt: new Date(now).toISOString() });
      state.earned += delta; return delta;
    };
    credit.trade=(amount,key,metadata,kind)=>{if(!Number.isSafeInteger(amount)||amount<1||amount>1000000||!['park_sale','park_eco'].includes(kind))fail('無效的收購金額。',400);entries.push({transactionId:randomUUID(),studentId,actorId:studentId,delta:amount,kind,idempotencyKey: 'park:'+day+':'+key,metadata:{day,...metadata},createdAt:new Date(now).toISOString()});return amount;};
    credit.eco=(amount,key,metadata)=>{const delta=Math.min(amount,Math.max(0,dailyCap-state.earned));if(delta)entries.push({transactionId:randomUUID(),studentId,actorId:studentId,delta,kind:'park_eco',idempotencyKey:'park:'+day+':'+key,metadata:{day,...metadata},createdAt:new Date(now).toISOString()});state.earned+=delta;return delta;};
    const result = change(state, credit, rules, day, now, bag);
    if (options.position && rules.walkable(options.position.x, options.position.y)) state.position = { x: Math.round(options.position.x), y: Math.round(options.position.y) };
    return { state, entries, bag, response: { state: copy(state), ...(bag?{bag:copy(bag)}:{}), dailyCap, balance: balance + entries.reduce((sum, row) => sum + row.delta, 0), ...result } };
  };
  if (config.db.mode === 'postgres') return withTransaction(async client => {
    const wallet = (await client.query('SELECT Balance AS balance FROM PetWallets WHERE StudentID=$1 FOR UPDATE', [studentId])).rows[0];
    if (!wallet) fail('找不到學生錢包。', 404);
    await client.query('INSERT INTO PetParkProgress (StudentID,ParkDay,State) VALUES ($1,$2,$3::jsonb) ON CONFLICT DO NOTHING', [studentId, day, JSON.stringify(blank(day))]);
    const row = (await client.query('SELECT State AS state FROM PetParkProgress WHERE StudentID=$1 AND ParkDay=$2 FOR UPDATE', [studentId, day])).rows[0];
    let bagRow;if(options.cargo){await client.query('INSERT INTO PetParkProgress (StudentID,ParkDay,State) VALUES ($1,$2,$3::jsonb) ON CONFLICT DO NOTHING',[studentId,'inventory',JSON.stringify(market.blankBag())]);bagRow=(await client.query('SELECT State AS state FROM PetParkProgress WHERE StudentID=$1 AND ParkDay=$2 FOR UPDATE',[studentId,'inventory'])).rows[0];}
    const { dailyCap } = await settings(client), value = apply(copy(row.state), Number(wallet.balance), dailyCap, bagRow?.state);
    for (const entry of value.entries) {
      await client.query(`INSERT INTO PetCurrencyLedger (TransactionID,StudentID,ActorID,Delta,Kind,IdempotencyKey,Metadata)
        VALUES ($1,$2,$2,$3,$4,$5,$6::jsonb)`, [entry.transactionId, studentId, entry.delta, entry.kind, entry.idempotencyKey, JSON.stringify(entry.metadata)]);
    }
    if (value.entries.length) await client.query('UPDATE PetWallets SET Balance=$2,UpdatedAt=NOW() WHERE StudentID=$1', [studentId, value.response.balance]);
    await client.query('UPDATE PetParkProgress SET State=$3::jsonb,UpdatedAt=NOW() WHERE StudentID=$1 AND ParkDay=$2', [studentId, day, JSON.stringify(value.state)]);
    if(value.bag)await client.query('UPDATE PetParkProgress SET State=$3::jsonb,UpdatedAt=NOW() WHERE StudentID=$1 AND ParkDay=$2',[studentId,'inventory',JSON.stringify(value.bag)]);
    options.canCommit?.();
    return value.response;
  });
  const task = queue.catch(() => {}).then(async () => {
    const data = store.load(), wallet = data.petWallets.find(row => row.studentId === studentId);
    if (!wallet) fail('找不到學生錢包。', 404);
    const previous = data.petParkProgress.find(row => row.studentId === studentId && row.day === day);
    const previousBag=data.petParkProgress.find(row=>row.studentId===studentId&&row.day==='inventory');
    const { dailyCap } = await settings(), value = apply(copy(previous?.state || blank(day)), wallet.balance, dailyCap, previousBag?.state);
    const before = wallet.balance, ledgerLength = data.petCurrencyLedger.length;
    const row = previous || { studentId, day, state: blank(day) }, oldState = row.state;
    row.state = value.state; if (!previous) data.petParkProgress.push(row);
    const bagRow=previousBag||{studentId,day:'inventory'},oldBag=previousBag?.state;if(value.bag){bagRow.state=value.bag;if(!previousBag)data.petParkProgress.push(bagRow);}
    wallet.balance = value.response.balance; data.petCurrencyLedger.push(...value.entries);
    try { options.canCommit?.(); store.save(); } catch (error) {
      wallet.balance = before; data.petCurrencyLedger.length = ledgerLength; row.state = oldState;
      if(value.bag){if(previousBag)previousBag.state=oldBag;else data.petParkProgress.splice(data.petParkProgress.indexOf(bagRow),1);}
      if (!previous) data.petParkProgress.splice(data.petParkProgress.indexOf(row), 1);
      throw error;
    }
    return value.response;
  });
  queue = task; return task;
}
async function accept(studentId, questId, options = {}) {
  return mutate(studentId, (state, _credit, rules, day, now) => {
    const quest = rules.QUESTS.find(quest => quest.id === questId);
    if (!quest) fail('找不到這個委託。', 400);
    state.quests[questId] ??= { acceptedAt: now, steps: [], completedAt: null, earned: 0 };
    return { accepted: questId };
  }, options);
}
function advance(state, credit, rules, day, now, objectId, mode = 'visit') {
    const object = rules.OBJECTS.find(object => object.id === objectId);
    if (!object) fail('找不到這個互動物件。', 400);
    if (!state.discoveries.includes(objectId)) state.discoveries.push(objectId);
    const advanced = [], claimed = []; let earned = 0, bonus = 0;
    const daily = rules.dailyQuests(day);
    const defaultMode = object.kind === 'flowers' ? 'water' : object.kind === 'acorn' ? 'search' : object.kind === 'litter' ? 'sort' : ['chime', 'drum', 'bell'].includes(object.kind) ? 'melody' : 'visit';
    for (const quest of rules.QUESTS) {
      const progress = state.quests[quest.id]; if (!progress || progress.completedAt) continue;
      const required = quest.requirements?.[objectId] || defaultMode;
      const inOrder = !quest.ordered || quest.steps.find(id => !progress.steps.includes(id)) === objectId;
      if (quest.steps.includes(objectId) && !progress.steps.includes(objectId) && required === mode && inOrder) { progress.steps.push(objectId); advanced.push(quest.id); }
      if (quest.npc === objectId && quest.steps.every(id => progress.steps.includes(id))) {
        progress.completedAt = now; progress.earned = credit(quest.reward, quest.id, { questId: quest.id });
        earned += progress.earned; claimed.push(quest.id);
      }
    }
    if (!state.bonusClaimed && daily.every(quest => state.quests[quest.id]?.completedAt)) {
      state.bonusClaimed = true; bonus = credit(rules.PARK_ECONOMY.featuredBonus, 'bonus', { bonus: true }); earned += bonus;
    }
    return { advanced, claimed, earned, bonus };
}
async function interact(studentId, objectId, options = {}) {
  return mutate(studentId, (state, credit, rules, day, now) => advance(state, credit, rules, day, now, objectId, options.mode), options);
}
async function recordGame(studentId, kind, outcome, sessionId, options = {}) {
  const {GAME_RULES} = await gameRules;
  const market=await marketRules;
  return mutate(studentId, (state, credit, rules, day, now, bag) => {
    if (!Object.hasOwn(GAME_RULES,kind) || !Number.isInteger(outcome.score) || outcome.score < 0) fail('無效的遊戲結果。', 400);
    const record = state.games[kind] ||= { best: 0, plays: 0, rewardedAt: null, earned: 0 };
    if (record.lastSessionId === sessionId) return { earned: 0, game: kind };
    if(kind==='fishing'){if(bag)market.addFish(bag,outcome,sessionId);record.collection=[...new Set([...(record.collection||[]),...(outcome.collection||[])])].filter(n=>Number.isInteger(n)&&n>=0&&n<20);}
    record.lastSessionId = sessionId; record.best = Math.max(record.best, outcome.score); record.plays++;
    let gameCoins = 0;
    if (outcome.qualified && !record.rewardedAt) { record.rewardedAt = now; gameCoins = credit(GAME_RULES[kind].reward, `game:${kind}`, { game: kind, score: outcome.score }); record.earned = gameCoins; }
    const progress = outcome.qualified ? advance(state, credit, rules, day, now, ({banana:'banana-game',flight:'sky-game',fishing:'pond',rhythm:'drum',lantern:'bell',golf:'garden-bench'})[kind], kind) : { earned: 0 };
    return { ...progress, earned: (progress.earned || 0) + gameCoins, gameCoins, game: kind, outcome };
  }, {...options,cargo:kind==='fishing'});
}
async function savePosition(studentId, position) {
  return mutate(studentId, () => ({}), { position });
}
async function readBag(studentId,now=Date.now()){await pets.ensureStudent(studentId);await ensure();const market=await marketRules,day=pets.hkDay(new Date(now));const row=config.db.mode==='postgres'?(await getPool().query('SELECT State AS state FROM PetParkProgress WHERE StudentID=$1 AND ParkDay=$2',[studentId,'inventory'])).rows[0]:store.load().petParkProgress.find(r=>r.studentId===studentId&&r.day==='inventory');return copy(market.normalizeBag(row?.state||market.blankBag(),day));}
async function marketAction(studentId,command,options={}){const market=await marketRules;return mutate(studentId,(_s,credit,_r,day,now,bag)=>market.marketAction(bag,command,{day,now,studentId,credit}),{...options,cargo:true});}
module.exports = { readBag, marketAction, ensure, read, accept, interact, recordGame, savePosition, settings, updateSettings };
