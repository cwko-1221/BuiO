'use strict';

const { Pool } = require('pg');
const config = require('../../config');

let pool = null;

function getPool() {
  if (config.db.mode !== 'postgres') return null;
  if (!pool) {
    pool = new Pool({
      connectionString: config.db.supabaseUrl,
      ssl: { rejectUnauthorized: false },
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
