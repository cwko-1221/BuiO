'use strict';

const { Pool } = require('pg');
const config = require('../../config');

let pool = null;

function getPool() {
  if (config.db.mode !== 'postgres') return null;
  if (!pool) {
    // The service and the database are in different regions (Render ohio / Supabase
    // ap-southeast-1), so a round-trip is ~220ms and opening a fresh connection costs several
    // of them for the TCP and TLS handshakes — roughly a second before the first query runs.
    // Keeping connections alive and idle-open is therefore worth far more here than it would
    // be co-located, and an explicit max keeps a full class from queueing on the default.
    pool = new Pool({
      connectionString: config.db.supabaseUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
      keepAlive: true,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 15000,
    });
    pool.on('error', err => console.error('[pg] pool error:', err.message));
  }
  return pool;
}

async function withTransaction(fn) {
  if (config.db.mode !== 'postgres') {
    return fn({ query: async () => ({ rows: [] }) });
  }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

async function close() {
  if (pool) { await pool.end(); pool = null; }
}

module.exports = { getPool, withTransaction, close };
