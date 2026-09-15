'use strict';

const { Pool } = require('pg');
const config = require('../../config');

let pool = null;

const TRANSIENT_NODE_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'ETIMEDOUT',
]);

const TRANSIENT_POSTGRES_CODES = new Set([
  '08000', // connection exception
  '08001', // unable to connect
  '08003', // connection does not exist
  '08004', // connection rejected
  '08006', // connection failure
  '08007', // transaction resolution unknown
  '08P01', // protocol violation
  '57P01', // admin shutdown
  '57P02', // crash shutdown
  '57P03', // cannot connect now
]);

function boundedInteger(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || String(fallback), 10);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

// Retries are deliberately limited to read-only/idempotent operations. Retrying an
// arbitrary write after a broken connection could duplicate a side effect whose commit
// already reached Postgres but whose response was lost.
const dbRetryAttempts = boundedInteger('DB_RETRY_ATTEMPTS', 2, 0, 5);
const dbRetryBackoffMs = boundedInteger('DB_RETRY_BACKOFF_MS', 250, 0, 2000);
const dbSlowQueryMs = boundedInteger('DB_SLOW_QUERY_MS', 1000, 0, 60000);

function errorText(error) {
  return String(error?.message || error || 'Unknown database error')
    .split('\n')[0]
    .slice(0, 240);
}

function isTransientDatabaseError(error) {
  const nodeCode = String(error?.code || '');
  const postgresCode = String(error?.code || '');
  if (TRANSIENT_NODE_CODES.has(nodeCode) || TRANSIENT_POSTGRES_CODES.has(postgresCode)) return true;
  return /connection terminated unexpectedly|server closed the connection|socket hang up|connection timeout|timeout expired|timed out|could not connect/i.test(errorText(error));
}

function dbLog(level, event, details) {
  const line = JSON.stringify({ event, ...details });
  if (level === 'error') console.error(`[db] ${line}`);
  else console.warn(`[db] ${line}`);
}

function elapsedMs(started) {
  return Number(process.hrtime.bigint() - started) / 1e6;
}

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
    pool.on('error', err => {
      dbLog('error', 'pool_error', {
        code: err?.code || null,
        message: errorText(err),
        retryable: isTransientDatabaseError(err),
      });
    });
  }
  return pool;
}

/**
 * Run a read-only/idempotent query with bounded retries for transient network or
 * Postgres availability failures. Query text and parameters are intentionally not
 * logged because parameters can contain student identifiers or other private data.
 */
async function queryWithRetry(text, params = [], { label = 'query' } = {}) {
  if (config.db.mode !== 'postgres') {
    throw new Error('queryWithRetry is only available in postgres mode');
  }

  const totalAttempts = dbRetryAttempts + 1;
  let lastError;
  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    const started = process.hrtime.bigint();
    try {
      const result = await getPool().query(text, params);
      const durationMs = Math.round(elapsedMs(started));
      if (durationMs >= dbSlowQueryMs) {
        dbLog('warn', 'slow_query', { label, attempt, durationMs });
      }
      return result;
    } catch (error) {
      const durationMs = Math.round(elapsedMs(started));
      const retryable = isTransientDatabaseError(error);
      lastError = error;
      dbLog('error', 'query_error', {
        label,
        attempt,
        totalAttempts,
        durationMs,
        code: error?.code || null,
        retryable,
        message: errorText(error),
      });
      if (!retryable || attempt >= totalAttempts) break;
      const delayMs = dbRetryBackoffMs * (2 ** (attempt - 1));
      if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  if (lastError && isTransientDatabaseError(lastError)) {
    lastError.retryable = true;
  }
  throw lastError;
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

module.exports = {
  getPool,
  queryWithRetry,
  withTransaction,
  close,
  isTransientDatabaseError,
};
