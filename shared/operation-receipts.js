'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const store = require('../db/jsonStore');
const { getPool, withTransaction } = require('../math-app/db/database');
let schemaPromise, jsonQueue = Promise.resolve();
async function ensureSchema() {
  if (config.db.mode !== 'postgres') return;
  if (!schemaPromise) schemaPromise = getPool().query(fs.readFileSync(path.join(__dirname, '../db/migrations/20261010_operation_receipts.sql'), 'utf8').replace("SET LOCAL lock_timeout = '3s';", ''))
    .catch(error => { schemaPromise = null; throw error; });
  await schemaPromise;
}
function operation(actorId, key, kind, payload) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9:_-]{8,120}$/.test(key)) throw Object.assign(new Error('操作識別碼不正確'), { statusCode: 400 });
  return { actorId, key, kind, hash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}
function validate(row, op) {
  if (!row) return null;
  if (row.kind !== op.kind || row.hash !== op.hash) throw Object.assign(new Error('操作已提交，請勿使用同一識別碼更改答案。'), { statusCode: 409 });
  return row.response;
}
async function read(op, client) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const { rows } = await (client || getPool()).query('SELECT Kind AS kind,PayloadHash AS hash,Response AS response FROM PlatformOperationReceipts WHERE ActorID=$1 AND OperationKey=$2', [op.actorId, op.key]);
    return validate(rows[0], op);
  }
  return validate((store.load().operationReceipts || []).find(row => row.actorId === op.actorId && row.key === op.key), op);
}
async function run(op, fn) {
  await ensureSchema();
  if (config.db.mode === 'postgres') return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [op.actorId + ':' + op.key]);
    const cached = await read(op, client);
    if (cached) return cached;
    const response = await fn(client);
    await client.query('INSERT INTO PlatformOperationReceipts(ActorID,OperationKey,Kind,PayloadHash,Response) VALUES($1,$2,$3,$4,$5::jsonb)', [op.actorId,op.key,op.kind,op.hash,JSON.stringify(response)]);
    return response;
  });
  const job = jsonQueue.then(async () => {
    const cached = await read(op);
    if (cached) return cached;
    const data = store.load();
    const response = await fn(null);
    data.operationReceipts ||= [];
    data.operationReceipts.push({ ...op, response });
    store.save();
    return response;
  });
  jsonQueue = job.catch(() => {});
  return job;
}
module.exports = { operation, read, run, ensureSchema };
