'use strict';
const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool, withTransaction } = require('../../math-app/db/database');
const rulesPromise = import('../lib/park-garden.mjs');
let schema, queue = Promise.resolve();
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
function roomKey(room) { if (typeof room !== 'string' || !room || room.length > 180) fail('無效的班級花園。'); return room; }
async function ensure() {
  if (config.db.mode !== 'postgres') { store.load().petParkGardens ??= []; return; }
  schema ??= getPool().query(`CREATE TABLE IF NOT EXISTS PetParkGardens (RoomKey VARCHAR(180) NOT NULL,ParkDay VARCHAR(10) NOT NULL,State JSONB NOT NULL,UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(RoomKey,ParkDay));`).catch(error => { schema = null; throw error; });
  await schema;
}
async function read(room, now = Date.now()) {
  roomKey(room); await ensure(); const rules = await rulesPromise, day = rules.gardenDay(now);
  const row = config.db.mode === 'postgres' ? (await getPool().query('SELECT State AS state FROM PetParkGardens WHERE RoomKey=$1 AND ParkDay=$2', [room, day])).rows[0] : store.load().petParkGardens.find(row => row.room === room && row.day === day);
  return rules.publicGarden(structuredClone(row?.state || rules.blankGarden(day)), now);
}
async function act(room, actor, command, options = {}) {
  roomKey(room); await ensure(); const rules = await rulesPromise, now = options.now ?? Date.now(), day = rules.gardenDay(now);
  const apply = async value => { const state = structuredClone(value); await options.canCommit?.(); const result = rules.applyGardenAction(state, actor, command, now); return { internal: state, state: rules.publicGarden(state, now), result }; };
  if (config.db.mode === 'postgres') return withTransaction(async client => {
    await client.query('INSERT INTO PetParkGardens (RoomKey,ParkDay,State) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING', [room, day, JSON.stringify(rules.blankGarden(day))]);
    const row = (await client.query('SELECT State AS state FROM PetParkGardens WHERE RoomKey=$1 AND ParkDay=$2 FOR UPDATE', [room, day])).rows[0];
    const value = await apply(row.state);
    if (!value.result.repeated) await client.query('UPDATE PetParkGardens SET State=$3::jsonb,UpdatedAt=NOW() WHERE RoomKey=$1 AND ParkDay=$2', [room, day, JSON.stringify(value.internal)]);
    await options.canCommit?.();
    return { state: value.state, result: value.result };
  });
  const task = queue.catch(() => {}).then(async () => {
    const data = store.load(), index = data.petParkGardens.findIndex(row => row.room === room && row.day === day), previous = index < 0 ? undefined : data.petParkGardens[index];
    const value = await apply(previous?.state || rules.blankGarden(day));
    if (value.result.repeated) return { state: value.state, result: value.result };
    await options.canCommit?.();
    const row = { room, day, state: value.internal };
    if (index < 0) data.petParkGardens.push(row); else data.petParkGardens[index] = row;
    try { store.save(); } catch (error) { if (index < 0) data.petParkGardens.pop(); else data.petParkGardens[index] = previous; throw error; }
    return { state: value.state, result: value.result };
  });
  queue = task; return task;
}
module.exports = { read, act };
