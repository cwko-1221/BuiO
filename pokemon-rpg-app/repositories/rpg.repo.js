'use strict';

const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool } = require('../../math-app/db/database');
const {sanitizeAdventureState}=require('./adventureState.cjs');

const MAX_PARTY = 6;
const MAX_BOX = 120;
const MAX_FOLLOWERS = 3;

let schemaPromise = null;

function ensureJsonStore() {
  const data = store.load();
  if (!data.pokemonRpgSaves || typeof data.pokemonRpgSaves !== 'object' || Array.isArray(data.pokemonRpgSaves)) {
    data.pokemonRpgSaves = {};
  }
  return data;
}

async function ensureSchema() {
  if (config.db.mode !== 'postgres') {
    ensureJsonStore();
    return;
  }
  if (!schemaPromise) {
    schemaPromise = getPool().query(`
      CREATE TABLE IF NOT EXISTS PokemonRpgSaves (
        StudentID VARCHAR(20) PRIMARY KEY REFERENCES Users(StudentID) ON DELETE CASCADE,
        SaveData JSONB NOT NULL,
        CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `).catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  await schemaPromise;
}

function clampInt(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function sanitizePokemonInstance(mon) {
  if (!mon || typeof mon !== 'object') return null;
  const uid = String(mon.uid || '').slice(0, 64);
  const speciesId = String(mon.speciesId || '').slice(0, 40);
  if (!uid || !speciesId) return null;
  const level = clampInt(mon.level, 1, 99, 1);
  const maxHp = clampInt(mon.maxHp, 10, 9999, 40);
  const maxMp = clampInt(mon.maxMp, 5, 999, 25);
  return {
    uid,
    speciesId,
    nickname: String(mon.nickname || '').slice(0, 24),
    level,
    exp: clampInt(mon.exp, 0, 9999999, 0),
    hp: clampInt(mon.hp, 0, maxHp, maxHp),
    maxHp,
    mp: clampInt(mon.mp, 0, maxMp, maxMp),
    maxMp,
    atk: clampInt(mon.atk, 1, 9999, 12),
    def: clampInt(mon.def, 1, 9999, 10),
    spd: clampInt(mon.spd, 1, 9999, 10),
    status: ['burn', 'paralyze', 'sleep'].includes(mon.status) ? mon.status : null,
    caughtBall: String(mon.caughtBall || 'pokeball').slice(0, 32),
    caughtZone: String(mon.caughtZone || 'dawnleaf').slice(0, 40),
    isStarter: Boolean(mon.isStarter),
  };
}

function sanitizeSaveData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.trainer || typeof raw.trainer !== 'object') return null;

  const party = Array.isArray(raw.party)
    ? raw.party.map(sanitizePokemonInstance).filter(Boolean).slice(0, MAX_PARTY)
    : [];
  if (party.length === 0) return null;

  const box = Array.isArray(raw.box)
    ? raw.box.map(sanitizePokemonInstance).filter(Boolean).slice(0, MAX_BOX)
    : [];

  const allOwnedIds = new Set([...party, ...box].map((p) => p.uid));
  const followersRaw = Array.isArray(raw.followers) ? raw.followers : [];
  const followers = [];
  for (const fid of followersRaw) {
    const idStr = String(fid || '');
    if (allOwnedIds.has(idStr) && !followers.includes(idStr)) {
      followers.push(idStr);
    }
    if (followers.length >= MAX_FOLLOWERS) break;
  }
  if (followers.length === 0 && party[0]) {
    followers.push(party[0].uid);
  }

  const inventory = {};
  if (raw.inventory && typeof raw.inventory === 'object') {
    for (const [k, v] of Object.entries(raw.inventory)) {
      const key = String(k).slice(0, 40);
      const qty = clampInt(v, 0, 999, 0);
      if (key && qty > 0) inventory[key] = qty;
    }
  }

  const pokedexSeen = Array.isArray(raw.pokedex?.seen)
    ? [...new Set(raw.pokedex.seen.map((s) => String(s).slice(0, 40)).filter(Boolean))].slice(0, 60)
    : [];
  const pokedexCaught = Array.isArray(raw.pokedex?.caught)
    ? [...new Set(raw.pokedex.caught.map((s) => String(s).slice(0, 40)).filter(Boolean))].slice(0, 60)
    : [];

  const defeatedNpcs = Array.isArray(raw.defeatedNpcs)
    ? [...new Set(raw.defeatedNpcs.map((s) => String(s).slice(0, 50)).filter(Boolean))].slice(0, 100)
    : [];
  const badges = Array.isArray(raw.badges)
    ? [...new Set(raw.badges.map((s) => String(s).slice(0, 40)).filter(Boolean))].slice(0, 12)
    : [];
  const storyFlags = {};
  if (raw.storyFlags && typeof raw.storyFlags === 'object') {
    for (const [fk, fv] of Object.entries(raw.storyFlags)) {
      const flagKey = String(fk).slice(0, 50);
      if (flagKey) storyFlags[flagKey] = Boolean(fv);
    }
  }

  const posX = Number(raw.position?.x);
  const posZ = Number(raw.position?.z);

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    trainer: {
      name: String(raw.trainer.name || '訓練員').trim().slice(0, 20) || '訓練員',
      avatarId: ['blaze', 'azure', 'emerald', 'violet'].includes(raw.trainer.avatarId)
        ? raw.trainer.avatarId
        : 'blaze',
      starterId: String(raw.trainer.starterId || party[0].speciesId).slice(0, 40),
    },
    position: {
      x: Number.isFinite(posX) ? Math.max(-120, Math.min(120, Number(posX.toFixed(2)))) : 0,
      z: Number.isFinite(posZ) ? Math.max(-120, Math.min(120, Number(posZ.toFixed(2)))) : 8,
      facing: ['down', 'up', 'left', 'right'].includes(raw.position?.facing) ? raw.position.facing : 'down',
      zone: String(raw.position?.zone || 'dawnleaf').slice(0, 40),
    },
    gold: clampInt(raw.gold, 0, 9999999, 500),
    inventory,
    party,
    box,
    followers,
    pokedex: {
      seen: pokedexSeen,
      caught: pokedexCaught,
    },
    questStage: clampInt(raw.questStage, 0, 20, 0),
    badges,
    defeatedNpcs,
    storyFlags,
    adventure:sanitizeAdventureState(raw.adventure),
    stats: {
      battlesWon: clampInt(raw.stats?.battlesWon, 0, 999999, 0),
      pokemonCaught: clampInt(raw.stats?.pokemonCaught, 0, 999999, 0),
      hospitalVisits: clampInt(raw.stats?.hospitalVisits, 0, 999999, 0),
      playSeconds: clampInt(raw.stats?.playSeconds, 0, 99999999, 0),
    },
  };
}

async function getSave(studentId) {
  await ensureSchema();
  const id = String(studentId || '').trim();
  if (!id) return null;

  if (config.db.mode !== 'postgres') {
    const data = ensureJsonStore();
    return data.pokemonRpgSaves[id] ? JSON.parse(JSON.stringify(data.pokemonRpgSaves[id])) : null;
  }

  const res = await getPool().query(
    'SELECT SaveData FROM PokemonRpgSaves WHERE StudentID = $1',
    [id]
  );
  return res.rows[0]?.savedata || res.rows[0]?.SaveData || null;
}

async function upsertSave(studentId, rawSave) {
  await ensureSchema();
  const id = String(studentId || '').trim();
  if (!id) {
    const err = new Error('未登入帳號');
    err.statusCode = 401;
    throw err;
  }

  const clean = sanitizeSaveData(rawSave);
  if (!clean) {
    const err = new Error('存檔格式無效');
    err.statusCode = 400;
    throw err;
  }

  if (config.db.mode !== 'postgres') {
    const data = ensureJsonStore();
    data.pokemonRpgSaves[id] = clean;
    store.save();
    return JSON.parse(JSON.stringify(clean));
  }

  await getPool().query(
    `INSERT INTO PokemonRpgSaves (StudentID, SaveData, CreatedAt, UpdatedAt)
     VALUES ($1, $2::jsonb, NOW(), NOW())
     ON CONFLICT (StudentID)
     DO UPDATE SET SaveData = EXCLUDED.SaveData, UpdatedAt = NOW()`,
    [id, JSON.stringify(clean)]
  );
  return clean;
}

async function deleteSave(studentId) {
  await ensureSchema();
  const id = String(studentId || '').trim();
  if (!id) return false;

  if (config.db.mode !== 'postgres') {
    const data = ensureJsonStore();
    delete data.pokemonRpgSaves[id];
    store.save();
    return true;
  }

  await getPool().query('DELETE FROM PokemonRpgSaves WHERE StudentID = $1', [id]);
  return true;
}

module.exports = {
  ensureSchema,
  sanitizeSaveData,
  getSave,
  upsertSave,
  deleteSave,
};
