'use strict';

const crypto = require('crypto');
const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool, withTransaction } = require('../../math-app/db/database');
const { catalog, indexes } = require('../lib/catalog');

const JSON_KEYS = [
  'petProfiles', 'petWallets', 'petCurrencyLedger', 'petInstances',
  'petInventory', 'petRoomLayouts', 'petRoomReactions',
  'petIdempotency',
];

const hkDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
const nowIso = () => new Date().toISOString();
const makeId = () => crypto.randomUUID();
const clone = (value) => JSON.parse(JSON.stringify(value));

let schemaPromise;
async function ensureSchema() {
  if (config.db.mode !== 'postgres') { ensureJsonData(); return; }
  if (!schemaPromise) schemaPromise = getPool().query(`
    CREATE TABLE IF NOT EXISTS PetProfiles (
      StudentID VARCHAR(20) PRIMARY KEY REFERENCES Users(StudentID) ON DELETE CASCADE,
      ActivePetID UUID,
      StarterEggClaimed BOOLEAN NOT NULL DEFAULT FALSE,
      EggPity INTEGER NOT NULL DEFAULT 0 CHECK (EggPity BETWEEN 0 AND 9),
      Stardust INTEGER NOT NULL DEFAULT 0 CHECK (Stardust >= 0),
      CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(), UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS PetWallets (
      StudentID VARCHAR(20) PRIMARY KEY REFERENCES Users(StudentID) ON DELETE CASCADE,
      Balance INTEGER NOT NULL DEFAULT 0 CHECK (Balance >= 0), UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS PetCurrencyLedger (
      TransactionID UUID PRIMARY KEY, StudentID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
      ActorID VARCHAR(20), Delta INTEGER NOT NULL, Kind VARCHAR(40) NOT NULL, BatchID UUID,
      IdempotencyKey VARCHAR(120), Note VARCHAR(240) NOT NULL DEFAULT '', Metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_ledger_idempotency
      ON PetCurrencyLedger(StudentID, IdempotencyKey) WHERE IdempotencyKey IS NOT NULL;
    CREATE TABLE IF NOT EXISTS PetInstances (
      PetID UUID PRIMARY KEY, StudentID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
      SpeciesID VARCHAR(80) NOT NULL, XP INTEGER NOT NULL DEFAULT 0 CHECK (XP >= 0),
      Stage INTEGER NOT NULL DEFAULT 1 CHECK (Stage BETWEEN 1 AND 4),
      DailyXP INTEGER NOT NULL DEFAULT 0 CHECK (DailyXP BETWEEN 0 AND 100), DailyXPDate VARCHAR(10) NOT NULL DEFAULT '',
      EquippedSkills JSONB NOT NULL DEFAULT '[]'::jsonb, EquippedWearables JSONB NOT NULL DEFAULT '[]'::jsonb,
      CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(), UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(StudentID, SpeciesID)
    );
    CREATE TABLE IF NOT EXISTS PetInventory (
      StudentID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
      ItemID VARCHAR(120) NOT NULL, Quantity INTEGER NOT NULL DEFAULT 0 CHECK (Quantity >= 0),
      UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(StudentID, ItemID)
    );
    CREATE TABLE IF NOT EXISTS PetRoomLayouts (
      StudentID VARCHAR(20) PRIMARY KEY REFERENCES Users(StudentID) ON DELETE CASCADE,
      ThemeID VARCHAR(80) NOT NULL DEFAULT 'sunny-oak', Visibility VARCHAR(12) NOT NULL DEFAULT 'private',
      Placements JSONB NOT NULL DEFAULT '[]'::jsonb, UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (Visibility IN ('private','class'))
    );
    CREATE TABLE IF NOT EXISTS PetRoomReactions (
      OwnerStudentID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
      VisitorStudentID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
      ReactionDay VARCHAR(10) NOT NULL, Reaction VARCHAR(20) NOT NULL, UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(OwnerStudentID, VisitorStudentID, ReactionDay)
    );
    CREATE TABLE IF NOT EXISTS PetIdempotency (
      ActorID VARCHAR(20) NOT NULL, IdempotencyKey VARCHAR(120) NOT NULL, Kind VARCHAR(40) NOT NULL,
      Response JSONB NOT NULL, CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(ActorID, IdempotencyKey)
    );
  `).catch((error) => { schemaPromise = null; throw error; });
  await schemaPromise;
}

function ensureJsonData() {
  const data = store.load();
  let changed = false;
  for (const key of JSON_KEYS) {
    if (!Array.isArray(data[key])) { data[key] = []; changed = true; }
  }
  if (changed) store.save();
  return data;
}

function starterInventoryRows(studentId) {
  const rows = [
    { studentId, itemId: 'room:sunny-oak', quantity: 1 },
  ];
  for (const item of catalog.furniture.filter((entry) => entry.roomId === 'sunny-oak')) {
    rows.push({ studentId, itemId: item.id, quantity: 1 });
  }
  return rows;
}

/**
 * The starter room is the first thing a child sees, so it is arranged the way a decorated room
 * actually reads rather than scattered across the floor: the bed tucked into the back corner
 * with a side table and lamp flanking it, wall art centred above, a rug defining the open
 * middle, and the toy out in the play area where the pet stands.
 *
 * Grid is 12x10 with the origin at the back corner, so x=0 and y=0 are the two walls.
 * Footprints must not overlap within a layer — validatePlacements() rejects the whole save
 * if they do.
 */
function starterPlacements() {
  return [
    // itemId,                        x, y, rotation, layer      footprint  reasoning
    ['sunny-oak-furniture-1', 0, 1, 0, 'furniture'], // [3,2] bed against the back-left wall
    ['sunny-oak-furniture-3', 3, 1, 0, 'furniture'], // [1,1] side table at the head of the bed
    ['sunny-oak-furniture-5', 0, 3, 0, 'furniture'], // [1,1] night light at the foot of the bed
    ['sunny-oak-furniture-7', 1, 0, 0, 'wall'],      // [1,1] wall art above the bed
    ['sunny-oak-furniture-2', 4, 4, 0, 'rug'],       // [4,3] rug anchoring the open middle
    ['sunny-oak-furniture-9', 6, 7, 0, 'furniture'], // [1,1] toy out in the play area
  ].map(([itemId, x, y, rotation, layer]) => ({ id: makeId(), itemId, x, y, rotation, layer }));
}

async function ensureStudent(studentId, runner) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const db = runner || getPool();
    await db.query(`INSERT INTO PetProfiles (StudentID) VALUES ($1) ON CONFLICT DO NOTHING`, [studentId]);
    await db.query(`INSERT INTO PetWallets (StudentID) VALUES ($1) ON CONFLICT DO NOTHING`, [studentId]);
    await db.query(`INSERT INTO PetRoomLayouts (StudentID, Placements) VALUES ($1,$2::jsonb) ON CONFLICT DO NOTHING`, [studentId, JSON.stringify(starterPlacements())]);
    for (const item of starterInventoryRows(studentId)) {
      await db.query(`INSERT INTO PetInventory (StudentID,ItemID,Quantity) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [studentId, item.itemId, item.quantity]);
    }
    return;
  }
  const data = ensureJsonData();
  if (!data.petProfiles.some((row) => row.studentId === studentId)) {
    data.petProfiles.push({ studentId, activePetId: null, starterEggClaimed: false, eggPity: 0, stardust: 0, createdAt: nowIso(), updatedAt: nowIso() });
    data.petWallets.push({ studentId, balance: 0, updatedAt: nowIso() });
    data.petRoomLayouts.push({ studentId, themeId: 'sunny-oak', visibility: 'private', placements: starterPlacements(), updatedAt: nowIso() });
    data.petInventory.push(...starterInventoryRows(studentId));
    store.save();
  }
}

const stageForXp = (xp) => {
  let stage = 1;
  catalog.evolutionThresholds.forEach((threshold, index) => { if (xp >= threshold) stage = index + 1; });
  return Math.min(4, stage);
};

function chooseRarity(pity, random) {
  if (pity >= catalog.egg.pityAt - 1) return 'epic';
  const roll = random();
  if (roll < catalog.egg.odds.epic) return 'epic';
  if (roll < catalog.egg.odds.epic + catalog.egg.odds.rare) return 'rare';
  return 'common';
}

function chooseSpecies(rarity, ownedSpecies, random) {
  const pool = catalog.pets.filter((pet) => pet.rarity === rarity);
  const unseen = pool.filter((pet) => !ownedSpecies.has(pet.id));
  const source = unseen.length && random() < .8 ? unseen : pool;
  return source[Math.min(source.length - 1, Math.floor(random() * source.length))];
}

function publicPet(row) {
  return {
    id: row.petId || row.petid, speciesId: row.speciesId || row.speciesid,
    xp: Number(row.xp) || 0, stage: Number(row.stage) || 1,
    dailyXp: Number(row.dailyXp ?? row.dailyxp) || 0,
    dailyXpDate: row.dailyXpDate || row.dailyxpdate || '',
  };
}

async function getBootstrap(studentId) {
  await ensureStudent(studentId);
  if (config.db.mode === 'postgres') {
    const pool = getPool();
    const [profileResult, walletResult, petsResult, inventoryResult, roomResult] = await Promise.all([
      pool.query(`SELECT StudentID AS "studentId", ActivePetID AS "activePetId", StarterEggClaimed AS "starterEggClaimed", EggPity AS "eggPity", Stardust AS stardust FROM PetProfiles WHERE StudentID=$1`, [studentId]),
      pool.query(`SELECT Balance AS balance FROM PetWallets WHERE StudentID=$1`, [studentId]),
      pool.query(`SELECT PetID AS "petId",SpeciesID AS "speciesId",XP AS xp,Stage AS stage,DailyXP AS "dailyXp",DailyXPDate AS "dailyXpDate",EquippedSkills AS "equippedSkills",EquippedWearables AS "equippedWearables" FROM PetInstances WHERE StudentID=$1 ORDER BY CreatedAt`, [studentId]),
      pool.query(`SELECT ItemID AS "itemId",Quantity AS quantity FROM PetInventory WHERE StudentID=$1 AND Quantity>0`, [studentId]),
      pool.query(`SELECT ThemeID AS "themeId",Visibility AS visibility,Placements AS placements,UpdatedAt AS "updatedAt" FROM PetRoomLayouts WHERE StudentID=$1`, [studentId]),
    ]);
    return { profile: profileResult.rows[0], wallet: { balance: Number(walletResult.rows[0]?.balance) || 0 }, pets: petsResult.rows.map((row) => publicPet(row)), inventory: inventoryResult.rows.map((row) => ({ ...row, quantity: Number(row.quantity) })), room: roomResult.rows[0], catalog, serverDay: hkDay() };
  }
  const data = ensureJsonData();
  const profile = data.petProfiles.find((row) => row.studentId === studentId);
  return clone({
    profile,
    wallet: data.petWallets.find((row) => row.studentId === studentId),
    pets: data.petInstances.filter((row) => row.studentId === studentId).map((row) => publicPet(row)),
    inventory: data.petInventory.filter((row) => row.studentId === studentId && row.quantity > 0),
    room: data.petRoomLayouts.find((row) => row.studentId === studentId),
    catalog, serverDay: hkDay(),
  });
}

function readJsonIdempotency(data, actorId, key, kind) {
  if (!key) return null;
  const row = data.petIdempotency.find((entry) => entry.actorId === actorId && entry.key === key);
  if (!row) return null;
  if (row.kind !== kind) throw Object.assign(new Error('Idempotency key already used'), { status: 409 });
  return clone(row.response);
}
function writeJsonIdempotency(data, actorId, key, kind, response) {
  if (key) data.petIdempotency.push({ actorId, key, kind, response: clone(response), createdAt: nowIso() });
}

function applyJsonEgg(studentId, { starter = false, directSpeciesId = null, random = Math.random, idempotencyKey }) {
  const data = ensureJsonData();
  const kind = starter ? 'starter_egg' : directSpeciesId ? 'direct_egg' : 'random_egg';
  const cached = readJsonIdempotency(data, studentId, idempotencyKey, kind);
  if (cached) return cached;
  const profile = data.petProfiles.find((row) => row.studentId === studentId);
  const wallet = data.petWallets.find((row) => row.studentId === studentId);
  if (starter && profile.starterEggClaimed) throw Object.assign(new Error('Starter egg already claimed'), { status: 409 });
  const owned = new Set(data.petInstances.filter((row) => row.studentId === studentId).map((row) => row.speciesId));
  let species;
  let price = 0;
  let countsForPity = false;
  if (directSpeciesId) {
    species = indexes.pets.get(directSpeciesId);
    if (!species || species.rarity === 'epic') throw Object.assign(new Error('This pet cannot be bought directly'), { status: 400 });
    if (owned.has(species.id)) throw Object.assign(new Error('Pet already owned'), { status: 409 });
    price = species.rarity === 'common' ? catalog.egg.directCommonPrice : catalog.egg.directRarePrice;
  } else {
    const rarity = chooseRarity(profile.eggPity, random);
    species = chooseSpecies(rarity, owned, random);
    price = starter ? 0 : catalog.egg.randomPrice;
    countsForPity = true;
  }
  if (wallet.balance < price) throw Object.assign(new Error('Not enough coins'), { status: 409 });
  if (price) {
    wallet.balance -= price; wallet.updatedAt = nowIso();
    data.petCurrencyLedger.push({ transactionId: makeId(), studentId, actorId: studentId, delta: -price, kind: 'egg_purchase', idempotencyKey, metadata: { speciesId: directSpeciesId, random: !directSpeciesId }, createdAt: nowIso() });
  }
  let pet = null;
  let duplicateDust = 0;
  if (owned.has(species.id)) {
    duplicateDust = catalog.egg.duplicateDust[species.rarity];
    profile.stardust += duplicateDust;
  } else {
    pet = { petId: makeId(), studentId, speciesId: species.id, xp: 0, stage: 1, dailyXp: 0, dailyXpDate: '', equippedWearables: [], createdAt: nowIso(), updatedAt: nowIso() };
    data.petInstances.push(pet);
    if (!profile.activePetId) profile.activePetId = pet.petId;
  }
  if (starter) profile.starterEggClaimed = true;
  if (countsForPity) profile.eggPity = species.rarity === 'epic' ? 0 : Math.min(9, profile.eggPity + 1);
  profile.updatedAt = nowIso();
  const response = { speciesId: species.id, rarity: species.rarity, pet: pet ? publicPet(pet) : null, duplicateDust, balance: wallet.balance, stardust: profile.stardust, eggPity: profile.eggPity };
  writeJsonIdempotency(data, studentId, idempotencyKey, kind, response);
  store.save();
  return clone(response);
}

async function applyPostgresEgg(studentId, options) {
  const { starter = false, directSpeciesId = null, random = Math.random, idempotencyKey } = options;
  const kind = starter ? 'starter_egg' : directSpeciesId ? 'direct_egg' : 'random_egg';
  return withTransaction(async (client) => {
    await ensureStudent(studentId, client);
    if (idempotencyKey) {
      const cached = await client.query(`SELECT Kind AS kind,Response AS response FROM PetIdempotency WHERE ActorID=$1 AND IdempotencyKey=$2`, [studentId, idempotencyKey]);
      if (cached.rows[0]) {
        if (cached.rows[0].kind !== kind) throw Object.assign(new Error('Idempotency key already used'), { status: 409 });
        return cached.rows[0].response;
      }
    }
    const profileResult = await client.query(`SELECT StudentID AS "studentId",ActivePetID AS "activePetId",StarterEggClaimed AS "starterEggClaimed",EggPity AS "eggPity",Stardust AS stardust FROM PetProfiles WHERE StudentID=$1 FOR UPDATE`, [studentId]);
    const walletResult = await client.query(`SELECT Balance AS balance FROM PetWallets WHERE StudentID=$1 FOR UPDATE`, [studentId]);
    const profile = profileResult.rows[0];
    let balance = Number(walletResult.rows[0].balance);
    if (starter && profile.starterEggClaimed) throw Object.assign(new Error('Starter egg already claimed'), { status: 409 });
    const ownedResult = await client.query(`SELECT SpeciesID AS "speciesId" FROM PetInstances WHERE StudentID=$1`, [studentId]);
    const owned = new Set(ownedResult.rows.map((row) => row.speciesId));
    let species; let price = 0; let countsForPity = false;
    if (directSpeciesId) {
      species = indexes.pets.get(directSpeciesId);
      if (!species || species.rarity === 'epic') throw Object.assign(new Error('This pet cannot be bought directly'), { status: 400 });
      if (owned.has(species.id)) throw Object.assign(new Error('Pet already owned'), { status: 409 });
      price = species.rarity === 'common' ? catalog.egg.directCommonPrice : catalog.egg.directRarePrice;
    } else {
      species = chooseSpecies(chooseRarity(Number(profile.eggPity), random), owned, random);
      price = starter ? 0 : catalog.egg.randomPrice; countsForPity = true;
    }
    if (balance < price) throw Object.assign(new Error('Not enough coins'), { status: 409 });
    if (price) {
      balance -= price;
      await client.query(`UPDATE PetWallets SET Balance=$2,UpdatedAt=NOW() WHERE StudentID=$1`, [studentId, balance]);
      await client.query(`INSERT INTO PetCurrencyLedger (TransactionID,StudentID,ActorID,Delta,Kind,IdempotencyKey,Metadata) VALUES ($1,$2,$2,$3,'egg_purchase',$4,$5::jsonb)`, [makeId(), studentId, -price, idempotencyKey || null, JSON.stringify({ speciesId: directSpeciesId, random: !directSpeciesId })]);
    }
    let pet = null; let duplicateDust = 0;
    if (owned.has(species.id)) duplicateDust = catalog.egg.duplicateDust[species.rarity];
    else {
      pet = { petId: makeId(), speciesId: species.id, xp: 0, stage: 1, dailyXp: 0, dailyXpDate: '' };
      await client.query(`INSERT INTO PetInstances (PetID,StudentID,SpeciesID) VALUES ($1,$2,$3)`, [pet.petId, studentId, species.id]);
    }
    const nextPity = countsForPity ? (species.rarity === 'epic' ? 0 : Math.min(9, Number(profile.eggPity) + 1)) : Number(profile.eggPity);
    const nextDust = Number(profile.stardust) + duplicateDust;
    const activePetId = profile.activePetId || pet?.petId || null;
    await client.query(`UPDATE PetProfiles SET ActivePetID=$2,StarterEggClaimed=CASE WHEN $3 THEN TRUE ELSE StarterEggClaimed END,EggPity=$4,Stardust=$5,UpdatedAt=NOW() WHERE StudentID=$1`, [studentId, activePetId, starter, nextPity, nextDust]);
    const response = { speciesId: species.id, rarity: species.rarity, pet, duplicateDust, balance, stardust: nextDust, eggPity: nextPity };
    if (idempotencyKey) await client.query(`INSERT INTO PetIdempotency (ActorID,IdempotencyKey,Kind,Response) VALUES ($1,$2,$3,$4::jsonb)`, [studentId, idempotencyKey, kind, JSON.stringify(response)]);
    return response;
  });
}

async function hatchStarter(studentId, options = {}) {
  await ensureStudent(studentId);
  return config.db.mode === 'postgres' ? applyPostgresEgg(studentId, { ...options, starter: true }) : applyJsonEgg(studentId, { ...options, starter: true });
}
async function purchaseEgg(studentId, options = {}) {
  await ensureStudent(studentId);
  const directSpeciesId = options.kind === 'direct' ? options.speciesId : null;
  return config.db.mode === 'postgres' ? applyPostgresEgg(studentId, { ...options, directSpeciesId }) : applyJsonEgg(studentId, { ...options, directSpeciesId });
}

async function activatePet(studentId, petId) {
  await ensureStudent(studentId);
  if (config.db.mode === 'postgres') {
    const owned = await getPool().query(`SELECT 1 FROM PetInstances WHERE PetID=$1 AND StudentID=$2`, [petId, studentId]);
    if (!owned.rowCount) throw Object.assign(new Error('Pet not found'), { status: 404 });
    await getPool().query(`UPDATE PetProfiles SET ActivePetID=$2,UpdatedAt=NOW() WHERE StudentID=$1`, [studentId, petId]);
  } else {
    const data = ensureJsonData();
    if (!data.petInstances.some((row) => row.petId === petId && row.studentId === studentId)) throw Object.assign(new Error('Pet not found'), { status: 404 });
    const profile = data.petProfiles.find((row) => row.studentId === studentId); profile.activePetId = petId; profile.updatedAt = nowIso(); store.save();
  }
  return { activePetId: petId };
}

async function feedPet(studentId, petId, foodId, { idempotencyKey } = {}) {
  const food = indexes.foods.get(foodId);
  if (!food) throw Object.assign(new Error('Food not found'), { status: 404 });
  if (!idempotencyKey) throw Object.assign(new Error('Idempotency key is required'), { status: 400 });
  await ensureStudent(studentId);
  const day = hkDay();
  if (config.db.mode === 'postgres') return withTransaction(async (client) => {
    const cached = await client.query(`SELECT Kind AS kind,Response AS response FROM PetIdempotency WHERE ActorID=$1 AND IdempotencyKey=$2`, [studentId, idempotencyKey]);
    if (cached.rows[0]) {
      if (cached.rows[0].kind !== 'pet_feed') throw Object.assign(new Error('Idempotency key already used'), { status: 409 });
      return cached.rows[0].response;
    }
    const petResult = await client.query(`SELECT PetID AS "petId",SpeciesID AS "speciesId",XP AS xp,Stage AS stage,DailyXP AS "dailyXp",DailyXPDate AS "dailyXpDate",EquippedSkills AS "equippedSkills",EquippedWearables AS "equippedWearables" FROM PetInstances WHERE PetID=$1 AND StudentID=$2 FOR UPDATE`, [petId, studentId]);
    if (!petResult.rowCount) throw Object.assign(new Error('Pet not found'), { status: 404 });
    const inventory = await client.query(`SELECT Quantity AS quantity FROM PetInventory WHERE StudentID=$1 AND ItemID=$2 FOR UPDATE`, [studentId, foodId]);
    if (!inventory.rowCount || Number(inventory.rows[0].quantity) < 1) throw Object.assign(new Error('Food not owned'), { status: 409 });
    const pet = petResult.rows[0];
    const usedToday = pet.dailyXpDate === day ? Number(pet.dailyXp) : 0;
    if (usedToday + food.xp > catalog.dailyXpCap) throw Object.assign(new Error('Daily XP limit would be exceeded'), { status: 409 });
    const xp = Number(pet.xp) + food.xp; const stage = stageForXp(xp);
    await client.query(`UPDATE PetInstances SET XP=$3,Stage=$4,DailyXP=$5,DailyXPDate=$6,UpdatedAt=NOW() WHERE PetID=$1 AND StudentID=$2`, [petId, studentId, xp, stage, usedToday + food.xp, day]);
    await client.query(`UPDATE PetInventory SET Quantity=Quantity-1,UpdatedAt=NOW() WHERE StudentID=$1 AND ItemID=$2`, [studentId, foodId]);
    const response = { pet: { ...publicPet({ ...pet, xp, stage, dailyXp: usedToday + food.xp, dailyXpDate: day }), xp, stage, dailyXp: usedToday + food.xp, dailyXpDate: day }, consumed: foodId, evolved: stage > Number(pet.stage) };
    await client.query(`INSERT INTO PetIdempotency (ActorID,IdempotencyKey,Kind,Response) VALUES ($1,$2,'pet_feed',$3::jsonb)`, [studentId, idempotencyKey, JSON.stringify(response)]);
    return response;
  });
  const data = ensureJsonData();
  const cached = readJsonIdempotency(data, studentId, idempotencyKey, 'pet_feed'); if (cached) return cached;
  const pet = data.petInstances.find((row) => row.petId === petId && row.studentId === studentId);
  if (!pet) throw Object.assign(new Error('Pet not found'), { status: 404 });
  const item = data.petInventory.find((row) => row.studentId === studentId && row.itemId === foodId);
  if (!item || item.quantity < 1) throw Object.assign(new Error('Food not owned'), { status: 409 });
  const usedToday = pet.dailyXpDate === day ? pet.dailyXp : 0;
  if (usedToday + food.xp > catalog.dailyXpCap) throw Object.assign(new Error('Daily XP limit would be exceeded'), { status: 409 });
  const previousStage = pet.stage; pet.xp += food.xp; pet.stage = stageForXp(pet.xp); pet.dailyXp = usedToday + food.xp; pet.dailyXpDate = day; pet.updatedAt = nowIso(); item.quantity -= 1;
  const response = { pet: publicPet(pet), consumed: foodId, evolved: pet.stage > previousStage };
  writeJsonIdempotency(data, studentId, idempotencyKey, 'pet_feed', response); store.save(); return clone(response);
}

function purchaseDefinition(itemId) {
  if (itemId.startsWith('room:')) return { ...indexes.rooms.get(itemId.slice(5)), itemId, category: 'room_theme', currency: 'coins' };
  const found = indexes.foods.get(itemId) || indexes.wearables.get(itemId) || indexes.furniture.get(itemId);
  return found ? { ...found, itemId: found.id, currency: found.currency || 'coins' } : null;
}

async function purchaseItem(studentId, { itemId, quantity = 1, idempotencyKey }) {
  const definition = purchaseDefinition(itemId);
  if (!definition) throw Object.assign(new Error('Shop item not found'), { status: 404 });
  quantity = Number(quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > (definition.category === 'food' ? 20 : definition.category === 'furniture' ? 10 : 1)) throw Object.assign(new Error('Invalid quantity'), { status: 400 });
  await ensureStudent(studentId);
  if (config.db.mode === 'postgres') return withTransaction(async (client) => {
    if (idempotencyKey) {
      const cached = await client.query(`SELECT Kind AS kind,Response AS response FROM PetIdempotency WHERE ActorID=$1 AND IdempotencyKey=$2`, [studentId, idempotencyKey]);
      if (cached.rows[0]) {
        if (cached.rows[0].kind !== 'shop_purchase') throw Object.assign(new Error('Idempotency key already used'), { status: 409 });
        return cached.rows[0].response;
      }
    }
    const walletResult = await client.query(`SELECT Balance AS balance FROM PetWallets WHERE StudentID=$1 FOR UPDATE`, [studentId]);
    const profileResult = await client.query(`SELECT Stardust AS stardust FROM PetProfiles WHERE StudentID=$1 FOR UPDATE`, [studentId]);
    let balance = Number(walletResult.rows[0].balance); let stardust = Number(profileResult.rows[0].stardust);
    const existing = await client.query(`SELECT Quantity AS quantity FROM PetInventory WHERE StudentID=$1 AND ItemID=$2`, [studentId, itemId]);
    if (definition.category !== 'food' && definition.category !== 'furniture' && existing.rowCount) throw Object.assign(new Error('Item already owned'), { status: 409 });
    const total = Number(definition.price) * quantity;
    if (definition.currency === 'stardust') {
      if (stardust < total) throw Object.assign(new Error('Not enough stardust'), { status: 409 });
      stardust -= total; await client.query(`UPDATE PetProfiles SET Stardust=$2,UpdatedAt=NOW() WHERE StudentID=$1`, [studentId, stardust]);
    } else {
      if (balance < total) throw Object.assign(new Error('Not enough coins'), { status: 409 });
      balance -= total; await client.query(`UPDATE PetWallets SET Balance=$2,UpdatedAt=NOW() WHERE StudentID=$1`, [studentId, balance]);
      await client.query(`INSERT INTO PetCurrencyLedger (TransactionID,StudentID,ActorID,Delta,Kind,IdempotencyKey,Metadata) VALUES ($1,$2,$2,$3,'shop_purchase',$4,$5::jsonb)`, [makeId(), studentId, -total, idempotencyKey || null, JSON.stringify({ itemId, quantity })]);
    }
    await client.query(`INSERT INTO PetInventory (StudentID,ItemID,Quantity) VALUES ($1,$2,$3) ON CONFLICT (StudentID,ItemID) DO UPDATE SET Quantity=PetInventory.Quantity+EXCLUDED.Quantity,UpdatedAt=NOW()`, [studentId, itemId, quantity]);
    const response = { itemId, quantity, balance, stardust };
    if (idempotencyKey) await client.query(`INSERT INTO PetIdempotency (ActorID,IdempotencyKey,Kind,Response) VALUES ($1,$2,'shop_purchase',$3::jsonb)`, [studentId, idempotencyKey, JSON.stringify(response)]);
    return response;
  });
  const data = ensureJsonData();
  const cached = readJsonIdempotency(data, studentId, idempotencyKey, 'shop_purchase'); if (cached) return cached;
  const wallet = data.petWallets.find((row) => row.studentId === studentId); const profile = data.petProfiles.find((row) => row.studentId === studentId);
  const existing = data.petInventory.find((row) => row.studentId === studentId && row.itemId === itemId);
  if (!['food','furniture'].includes(definition.category) && existing) throw Object.assign(new Error('Item already owned'), { status: 409 });
  const total = Number(definition.price) * quantity;
  if (definition.currency === 'stardust') { if (profile.stardust < total) throw Object.assign(new Error('Not enough stardust'), { status: 409 }); profile.stardust -= total; }
  else {
    if (wallet.balance < total) throw Object.assign(new Error('Not enough coins'), { status: 409 }); wallet.balance -= total; wallet.updatedAt = nowIso();
    data.petCurrencyLedger.push({ transactionId: makeId(), studentId, actorId: studentId, delta: -total, kind: 'shop_purchase', idempotencyKey, metadata: { itemId, quantity }, createdAt: nowIso() });
  }
  if (existing) existing.quantity += quantity;
  else data.petInventory.push({ studentId, itemId, quantity });
  const response = { itemId, quantity, balance: wallet.balance, stardust: profile.stardust };
  writeJsonIdempotency(data, studentId, idempotencyKey, 'shop_purchase', response); store.save(); return clone(response);
}

async function setOutfit(studentId, petId, wearableIds) {
  if (!Array.isArray(wearableIds) || wearableIds.length > 5 || new Set(wearableIds).size !== wearableIds.length) throw Object.assign(new Error('Invalid outfit'), { status: 400 });
  const definitions = wearableIds.map((id) => indexes.wearables.get(id));
  if (definitions.some((item) => !item) || new Set(definitions.map((item) => item.slot)).size !== definitions.length) throw Object.assign(new Error('Outfit slots must be unique'), { status: 400 });
  await ensureStudent(studentId);
  if (config.db.mode === 'postgres') {
    const inventory = await getPool().query(`SELECT ItemID AS "itemId" FROM PetInventory WHERE StudentID=$1 AND Quantity>0 AND ItemID=ANY($2::text[])`, [studentId, wearableIds]);
    if (inventory.rowCount !== wearableIds.length) throw Object.assign(new Error('Wearable not owned'), { status: 409 });
    const updated = await getPool().query(`UPDATE PetInstances SET EquippedWearables=$3::jsonb,UpdatedAt=NOW() WHERE PetID=$1 AND StudentID=$2`, [petId, studentId, JSON.stringify(wearableIds)]);
    if (!updated.rowCount) throw Object.assign(new Error('Pet not found'), { status: 404 });
  } else {
    const data = ensureJsonData(); const pet = data.petInstances.find((row) => row.petId === petId && row.studentId === studentId);
    if (!pet) throw Object.assign(new Error('Pet not found'), { status: 404 });
    const owned = new Set(data.petInventory.filter((row) => row.studentId === studentId && row.quantity > 0).map((row) => row.itemId));
    if (!wearableIds.every((id) => owned.has(id))) throw Object.assign(new Error('Wearable not owned'), { status: 409 });
    pet.equippedWearables = [...wearableIds]; pet.updatedAt = nowIso(); store.save();
  }
  return { petId, equippedWearables: wearableIds };
}

function validatePlacements(placements, inventoryRows) {
  if (!Array.isArray(placements) || placements.length > 80) throw Object.assign(new Error('Room may contain at most 80 items'), { status: 400 });
  const owned = new Map(inventoryRows.map((row) => [row.itemId, Number(row.quantity)]));
  const used = new Map(); const occupied = new Set();
  return placements.map((placement) => {
    const item = indexes.furniture.get(placement.itemId);
    if (!item || !owned.has(item.id)) throw Object.assign(new Error('Furniture not owned'), { status: 409 });
    used.set(item.id, (used.get(item.id) || 0) + 1);
    if (used.get(item.id) > owned.get(item.id)) throw Object.assign(new Error('Too many copies of furniture placed'), { status: 409 });
    const x = Number(placement.x); const y = Number(placement.y); const rotation = Number(placement.rotation) || 0;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 11 || y > 9 || ![0,90,180,270].includes(rotation)) throw Object.assign(new Error('Furniture is outside the room grid'), { status: 400 });
    let [width, height] = item.footprint; if (rotation === 90 || rotation === 270) [width, height] = [height, width];
    if (x + width > 12 || y + height > 10) throw Object.assign(new Error('Furniture footprint is outside the room grid'), { status: 400 });
    if (item.layer !== 'wall') for (let px = x; px < x + width; px += 1) for (let py = y; py < y + height; py += 1) {
      const key = `${item.layer}:${px}:${py}`; if (occupied.has(key)) throw Object.assign(new Error('Furniture footprints overlap'), { status: 409 }); occupied.add(key);
    }
    return { id: String(placement.id || makeId()), itemId: item.id, x, y, rotation, layer: item.layer };
  });
}

async function saveRoom(studentId, { themeId, visibility, placements }) {
  if (!indexes.rooms.has(themeId) || !['private','class'].includes(visibility)) throw Object.assign(new Error('Invalid room settings'), { status: 400 });
  await ensureStudent(studentId);
  if (config.db.mode === 'postgres') {
    const inventory = await getPool().query(`SELECT ItemID AS "itemId",Quantity AS quantity FROM PetInventory WHERE StudentID=$1 AND Quantity>0`, [studentId]);
    if (!inventory.rows.some((row) => row.itemId === `room:${themeId}`)) throw Object.assign(new Error('Room theme not owned'), { status: 409 });
    const clean = validatePlacements(placements, inventory.rows);
    await getPool().query(`UPDATE PetRoomLayouts SET ThemeID=$2,Visibility=$3,Placements=$4::jsonb,UpdatedAt=NOW() WHERE StudentID=$1`, [studentId, themeId, visibility, JSON.stringify(clean)]);
    return { themeId, visibility, placements: clean };
  }
  const data = ensureJsonData(); const inventory = data.petInventory.filter((row) => row.studentId === studentId && row.quantity > 0);
  if (!inventory.some((row) => row.itemId === `room:${themeId}`)) throw Object.assign(new Error('Room theme not owned'), { status: 409 });
  const clean = validatePlacements(placements, inventory); const room = data.petRoomLayouts.find((row) => row.studentId === studentId);
  Object.assign(room, { themeId, visibility, placements: clean, updatedAt: nowIso() }); store.save(); return clone(room);
}

async function getRoomSnapshot(studentId, { create = true } = {}) {
  if (!create) {
    if (config.db.mode === 'postgres') {
      await ensureSchema();
      const exists = await getPool().query(`SELECT 1 FROM PetRoomLayouts WHERE StudentID=$1`, [studentId]);
      if (!exists.rowCount) return null;
    } else if (!ensureJsonData().petRoomLayouts.some((row) => row.studentId === studentId)) return null;
  }
  await ensureStudent(studentId);
  const bootstrap = await getBootstrap(studentId);
  const activePet = bootstrap.pets.find((pet) => pet.id === bootstrap.profile.activePetId) || bootstrap.pets[0] || null;
  return { ownerStudentId: studentId, themeId: bootstrap.room.themeId, visibility: bootstrap.room.visibility, placements: bootstrap.room.placements || [], activePet, reactions: await reactionCounts(studentId) };
}

/**
 * Class-visit listing. Fetching this per classmate meant one getBootstrap (seven queries) each;
 * a class of thirty cost roughly two hundred sequential round-trips. This resolves the whole
 * class in a fixed four queries, and only touches students who have actually opened their room,
 * so listing a class no longer materialises pet profiles for everyone in it.
 */
async function listVisitableRooms(studentIds) {
  const ids = [...new Set(studentIds)];
  if (!ids.length) return [];
  await ensureSchema();

  if (config.db.mode === 'postgres') {
    const pool = getPool();
    const [layouts, profiles, pets, reactions] = await Promise.all([
      pool.query(`SELECT StudentID AS "studentId",ThemeID AS "themeId",Visibility AS visibility,Placements AS placements FROM PetRoomLayouts WHERE StudentID=ANY($1::text[]) AND Visibility='class'`, [ids]),
      pool.query(`SELECT StudentID AS "studentId",ActivePetID AS "activePetId" FROM PetProfiles WHERE StudentID=ANY($1::text[])`, [ids]),
      pool.query(`SELECT StudentID AS "studentId",PetID AS "petId",SpeciesID AS "speciesId",XP AS xp,Stage AS stage,DailyXP AS "dailyXp",DailyXPDate AS "dailyXpDate",EquippedSkills AS "equippedSkills",EquippedWearables AS "equippedWearables" FROM PetInstances WHERE StudentID=ANY($1::text[]) ORDER BY CreatedAt`, [ids]),
      pool.query(`SELECT OwnerStudentID AS "ownerStudentId",Reaction AS reaction,COUNT(*)::int AS count FROM PetRoomReactions WHERE OwnerStudentID=ANY($1::text[]) GROUP BY OwnerStudentID,Reaction`, [ids]),
    ]);
    const activeByStudent = new Map(profiles.rows.map((row) => [row.studentId, row.activePetId]));
    const petsByStudent = new Map();
    for (const row of pets.rows) {
      if (!petsByStudent.has(row.studentId)) petsByStudent.set(row.studentId, []);
      petsByStudent.get(row.studentId).push(row);
    }
    const reactionsByOwner = new Map();
    for (const row of reactions.rows) {
      if (!reactionsByOwner.has(row.ownerStudentId)) reactionsByOwner.set(row.ownerStudentId, {});
      reactionsByOwner.get(row.ownerStudentId)[row.reaction] = Number(row.count);
    }
    return layouts.rows.map((room) => {
      const owned = petsByStudent.get(room.studentId) || [];
      const active = owned.find((pet) => pet.petId === activeByStudent.get(room.studentId)) || owned[0] || null;
      return { ownerStudentId: room.studentId, themeId: room.themeId, visibility: room.visibility, placements: room.placements || [], activePet: active ? publicPet(active) : null, reactions: reactionsByOwner.get(room.studentId) || {} };
    });
  }

  const data = ensureJsonData();
  const wanted = new Set(ids);
  return data.petRoomLayouts
    .filter((room) => wanted.has(room.studentId) && room.visibility === 'class')
    .map((room) => {
      const profile = data.petProfiles.find((row) => row.studentId === room.studentId);
      const owned = data.petInstances.filter((row) => row.studentId === room.studentId);
      const active = owned.find((pet) => pet.petId === profile?.activePetId) || owned[0] || null;
      const reactions = {};
      for (const row of data.petRoomReactions.filter((entry) => entry.ownerStudentId === room.studentId)) {
        reactions[row.reaction] = (reactions[row.reaction] || 0) + 1;
      }
      return clone({ ownerStudentId: room.studentId, themeId: room.themeId, visibility: room.visibility, placements: room.placements || [], activePet: active ? publicPet(active) : null, reactions });
    });
}

async function reactionCounts(ownerStudentId) {
  if (config.db.mode === 'postgres') {
    const result = await getPool().query(`SELECT Reaction AS reaction,COUNT(*)::int AS count FROM PetRoomReactions WHERE OwnerStudentID=$1 GROUP BY Reaction`, [ownerStudentId]);
    return Object.fromEntries(result.rows.map((row) => [row.reaction, Number(row.count)]));
  }
  const counts = {}; for (const row of ensureJsonData().petRoomReactions.filter((entry) => entry.ownerStudentId === ownerStudentId)) counts[row.reaction] = (counts[row.reaction] || 0) + 1; return counts;
}

async function addReaction(ownerStudentId, visitorStudentId, reaction) {
  if (!catalog.reactions.includes(reaction) || ownerStudentId === visitorStudentId) throw Object.assign(new Error('Invalid reaction'), { status: 400 });
  const day = hkDay();
  if (config.db.mode === 'postgres') await getPool().query(`INSERT INTO PetRoomReactions (OwnerStudentID,VisitorStudentID,ReactionDay,Reaction) VALUES ($1,$2,$3,$4) ON CONFLICT (OwnerStudentID,VisitorStudentID,ReactionDay) DO UPDATE SET Reaction=EXCLUDED.Reaction,UpdatedAt=NOW()`, [ownerStudentId, visitorStudentId, day, reaction]);
  else {
    const data = ensureJsonData(); const existing = data.petRoomReactions.find((row) => row.ownerStudentId === ownerStudentId && row.visitorStudentId === visitorStudentId && row.reactionDay === day);
    if (existing) { existing.reaction = reaction; existing.updatedAt = nowIso(); } else data.petRoomReactions.push({ ownerStudentId, visitorStudentId, reactionDay: day, reaction, updatedAt: nowIso() }); store.save();
  }
  return { reaction, reactions: await reactionCounts(ownerStudentId) };
}



async function walletBalances(studentIds) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const result = await getPool().query(`SELECT StudentID AS "studentId",Balance AS balance FROM PetWallets WHERE StudentID=ANY($1::text[])`, [studentIds]);
    return new Map(result.rows.map((row) => [row.studentId, Number(row.balance)]));
  }
  const rows = ensureJsonData().petWallets.filter((row) => studentIds.includes(row.studentId)); return new Map(rows.map((row) => [row.studentId, Number(row.balance)]));
}

async function grantCoins(actorId, studentIds, amount, { note = '', idempotencyKey } = {}) {
  const uniqueIds = [...new Set(studentIds)];
  if (!uniqueIds.length || !Number.isInteger(amount) || amount < 1 || amount > 10000 || !idempotencyKey) throw Object.assign(new Error('Invalid grant request'), { status: 400 });
  if (config.db.mode === 'postgres') return withTransaction(async (client) => {
    const cached = await client.query(`SELECT Response AS response FROM PetIdempotency WHERE ActorID=$1 AND IdempotencyKey=$2`, [actorId, idempotencyKey]); if (cached.rows[0]) return cached.rows[0].response;
    const batchId = makeId(); const balances = [];
    for (const studentId of uniqueIds) {
      await ensureStudent(studentId, client);
      const updated = await client.query(`UPDATE PetWallets SET Balance=Balance+$2,UpdatedAt=NOW() WHERE StudentID=$1 RETURNING Balance AS balance`, [studentId, amount]);
      balances.push({ studentId, balance: Number(updated.rows[0].balance) });
      await client.query(`INSERT INTO PetCurrencyLedger (TransactionID,StudentID,ActorID,Delta,Kind,BatchID,Note,Metadata) VALUES ($1,$2,$3,$4,'teacher_grant',$5,$6,$7::jsonb)`, [makeId(), studentId, actorId, amount, batchId, String(note).slice(0,240), JSON.stringify({ idempotencyKey })]);
    }
    const response = { batchId, count: uniqueIds.length, amount, total: amount * uniqueIds.length, balances };
    await client.query(`INSERT INTO PetIdempotency (ActorID,IdempotencyKey,Kind,Response) VALUES ($1,$2,'teacher_grant',$3::jsonb)`, [actorId, idempotencyKey, JSON.stringify(response)]); return response;
  });
  const data = ensureJsonData(); const cached = readJsonIdempotency(data, actorId, idempotencyKey, 'teacher_grant'); if (cached) return cached;
  for (const studentId of uniqueIds) await ensureStudent(studentId);
  const batchId = makeId(); const balances = [];
  for (const studentId of uniqueIds) {
    const wallet = data.petWallets.find((row) => row.studentId === studentId); wallet.balance += amount; wallet.updatedAt = nowIso(); balances.push({ studentId, balance: wallet.balance });
    data.petCurrencyLedger.push({ transactionId: makeId(), studentId, actorId, delta: amount, kind: 'teacher_grant', batchId, note: String(note).slice(0,240), metadata: { idempotencyKey }, createdAt: nowIso() });
  }
  const response = { batchId, count: uniqueIds.length, amount, total: amount * uniqueIds.length, balances }; writeJsonIdempotency(data, actorId, idempotencyKey, 'teacher_grant', response); store.save(); return clone(response);
}

// Ownership differs per table, so a single blanket predicate is wrong. In particular
// PetCurrencyLedger.actorId is the *teacher* who issued a grant: matching on it would delete
// the grant history of every student that teacher ever paid. Postgres does not do that
// (ActorID carries no foreign key, so those rows survive the cascade) and neither do we —
// a grant record belongs to the student who received it.
function purgeJsonStudent(studentId) {
  const data = ensureJsonData();
  const ownedByStudentId = ['petProfiles', 'petWallets', 'petCurrencyLedger', 'petInstances', 'petInventory', 'petRoomLayouts'];
  for (const key of ownedByStudentId) data[key] = data[key].filter((row) => row.studentId !== studentId);
  // Idempotency records are namespaced by the actor that created them.
  data.petIdempotency = data.petIdempotency.filter((row) => row.actorId !== studentId);
  // Reactions are a two-sided relationship; remove the row from either side.
  data.petRoomReactions = data.petRoomReactions.filter((row) => row.ownerStudentId !== studentId && row.visitorStudentId !== studentId);
  store.save();
}

async function grantUnlimitedMoney(studentId, amount = 999999) {
  await ensureStudent(studentId);
  if (config.db.mode === 'postgres') {
    const pool = getPool();
    await pool.query(`UPDATE PetWallets SET Balance=$2, UpdatedAt=NOW() WHERE StudentID=$1`, [studentId, amount]);
    await pool.query(`UPDATE PetProfiles SET Stardust=$2, UpdatedAt=NOW() WHERE StudentID=$1`, [studentId, amount]);
  } else {
    const data = ensureJsonData();
    const wallet = data.petWallets.find((row) => row.studentId === studentId);
    if (wallet) { wallet.balance = amount; wallet.updatedAt = nowIso(); }
    const profile = data.petProfiles.find((row) => row.studentId === studentId);
    if (profile) { profile.stardust = amount; profile.updatedAt = nowIso(); }
    store.save();
  }
  return { balance: amount, stardust: amount };
}

module.exports = {
  ensureSchema, ensureStudent, getBootstrap, hatchStarter, purchaseEgg, activatePet, feedPet,
  purchaseItem, setOutfit, saveRoom, getRoomSnapshot, listVisitableRooms, addReaction,
  walletBalances, grantCoins, grantUnlimitedMoney, purgeJsonStudent,
  hkDay, chooseRarity, chooseSpecies, stageForXp, validatePlacements,
};
