'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('../../config');
const TTL = 2 * 60 * 60 * 1000;

// One row per changed board, not one complete classroom per pen movement.
function createStore({ mode = config.db.mode, query, file = path.join(path.dirname(process.env.BUIO_JSON_DB_FILE || path.join(__dirname, '../../data/db.json')), 'whiteboard-checkpoints.json') } = {}) {
  let schema, records;
  const sql = query || ((...args) => require('../../math-app/db/database').getPool().query(...args));
  async function prepare() {
    if (mode === 'postgres') {
      if (!schema) schema = sql(`CREATE TABLE IF NOT EXISTS WhiteboardCheckpoints (
        RoomID TEXT NOT NULL, PartID TEXT NOT NULL, Payload JSONB NOT NULL,
        UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(RoomID, PartID));
        ALTER TABLE WhiteboardCheckpoints ENABLE ROW LEVEL SECURITY;`)
        .catch(error => { schema = null; throw error; });
      await schema;
    } else if (!records) {
      try { records = JSON.parse(await fs.readFile(file, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; records = []; }
    }
  }
  return {
    async load() {
      await prepare();
      if (mode === 'postgres') {
        await sql('DELETE FROM WhiteboardCheckpoints WHERE UpdatedAt < NOW() - INTERVAL \'2 hours\'');
        return (await sql('SELECT RoomID AS room, PartID AS part, Payload AS payload FROM WhiteboardCheckpoints')).rows;
      }
      return records.filter(row => row.at > Date.now() - TTL);
    },
    async write(rows) {
      await prepare();
      if (mode === 'postgres') {
        await sql(`INSERT INTO WhiteboardCheckpoints(RoomID,PartID,Payload)
          SELECT room,part,payload FROM jsonb_to_recordset($1::jsonb) AS x(room TEXT,part TEXT,payload JSONB)
          ON CONFLICT(RoomID,PartID) DO UPDATE SET Payload=EXCLUDED.Payload,UpdatedAt=NOW()`, [JSON.stringify(rows)]);
      } else {
        const next = new Map(records.filter(row => row.at > Date.now() - TTL).map(row => [JSON.stringify([row.room,row.part]), row]));
        for (const row of rows) next.set(JSON.stringify([row.room,row.part]), { ...row, at: Date.now() });
        const value = [...next.values()];
        await fs.mkdir(path.dirname(file), { recursive: true });
        const temporary = file + '.writing-' + process.pid;
        await fs.writeFile(temporary, JSON.stringify(value));
        await fs.rename(temporary, file);
        records = value;
      }
    },
  };
}

// Changes that arrive while a write is pending remain in the next batch. Failed
// batches are retried; a newer tombstone always wins over an older board save.
function createCheckpoints(store, { intervalMs = 10000, onError = error => console.error('[WB] checkpoint:', error.message) } = {}) {
  let pending = new Map(), flight = null;
  function put(room, part, payload) { pending.set(JSON.stringify([room,part]), { room, part, payload }); }
  async function flush() {
    if (flight) { await flight; if (pending.size) return flush(); return; }
    if (!pending.size || !store) return;
    const batch = pending; pending = new Map();
    flight = store.write([...batch.values()]).catch(error => {
      for (const [key,row] of batch) if (!pending.has(key)) pending.set(key,row);
      throw error;
    });
    try { await flight; } finally { flight = null; }
  }
  const timer = store ? setInterval(() => { if (!flight) void flush().catch(onError); }, intervalMs) : null;
  timer?.unref();
  return { put, flush, load: () => store ? store.load() : Promise.resolve([]),
    close: async () => { clearInterval(timer); await flush(); }, pending: () => pending.size };
}
module.exports = { createStore, createCheckpoints };
