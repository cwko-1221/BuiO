'use strict';

require('dotenv').config({ quiet: true });

const env = (process.env.NODE_ENV || 'development').toLowerCase();
const isProd = env === 'production';

function required(name) {
  const value = process.env[name];
  if (!value) {
    if (isProd) throw new Error(`Missing required env var: ${name}`);
    return null;
  }
  return value;
}

const supabaseUrl = process.env.SUPABASE_DB_URL || null;
// Falling back to the JSON store is right for local development and catastrophic in
// production: the server starts cleanly, every student is served an empty world, and each
// write goes to a container-local file that is discarded on the next deploy. A missing
// connection string is far easier to diagnose as a refusal to boot than as silent data loss.
if (isProd && !supabaseUrl) {
  throw new Error('SUPABASE_DB_URL is required in production (without it the server would silently use the local JSON store and lose all writes)');
}
const mode = supabaseUrl ? 'postgres' : 'json';

const sessionSecret =
  process.env.SESSION_SECRET ||
  (isProd
    ? (() => { throw new Error('SESSION_SECRET is required in production'); })()
    : 'dev-only-do-not-use-in-prod');

const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

module.exports = Object.freeze({
  env,
  isProd,
  port: Number(process.env.PORT) || 3000,
  db: { mode, supabaseUrl },
  session: {
    secret: sessionSecret,
    secure: isProd,
    maxAge: 24 * 60 * 60 * 1000,
  },
  cors: {
    origins: corsOrigins,
  },
  mockAuth: !isProd && process.env.MOCK_AUTH === '1',
});
