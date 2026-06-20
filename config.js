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
