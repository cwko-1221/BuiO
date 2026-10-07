'use strict';

const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool, withTransaction } = require('../../math-app/db/database');
const years = require('../../math-app/repositories/academic-years.repo');
const { validate, statusFor } = require('../lib/access-lock.cjs');
const events = new EventEmitter();
let schemaPromise, cache, loading, revision = 0, queue = Promise.resolve();

async function ensureSchema() {
  if (config.db.mode !== 'postgres') return;
  if (!schemaPromise) schemaPromise = getPool().query(`CREATE TABLE IF NOT EXISTS PetAccessLocks (
    LockID UUID PRIMARY KEY, AcademicYear VARCHAR(10) NOT NULL, State JSONB NOT NULL,
    UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
  ); CREATE INDEX IF NOT EXISTS idx_pet_access_year ON PetAccessLocks(AcademicYear);`)
    .catch(e => { schemaPromise = null; throw e; });
  await schemaPromise;
}

async function readRules(academicYear, client = null) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const { rows } = await (client || getPool()).query('SELECT State AS state FROM PetAccessLocks WHERE AcademicYear=$1', [academicYear]);
    return rows.map(r => r.state);
  }
  return structuredClone((store.load().petAccessLocks || []).filter(r => r.academicYear === academicYear));
}

// Coalesce a classroom's status polls. Evaluate dates on every call, even inside this short cache.
async function snapshot(fresh = false) {
  if (!fresh && cache && Date.now() - cache.at < 750) return cache;
  if (!fresh && loading) return loading;
  const generation = revision;
  const work = (async () => {
    const academicYear = await years.getCurrentAcademicYear();
    const [enrollments, rules] = await Promise.all([years.listEnrollments(academicYear), readRules(academicYear)]);
    const result = { academicYear, enrollments: enrollments.filter(r => r.role !== 'teacher'), rules, at: Date.now() };
    if (generation === revision) cache = result;
    return result;
  })();
  loading = work;
  try { return await work; } finally { if (loading === work) loading = null; }
}

async function studentStatus(studentId, now = Date.now()) {
  const s = await snapshot();
  const enrollment = s.enrollments.find(r => r.studentId === studentId);
  // A missing enrollment has no class to inherit; never substitute a client/session class.
  if (!enrollment) return { academicYear: s.academicYear, className: '', locked: false, note: '', endsAt: null, nextChangeAt: null, serverNow: now };
  return statusFor(s.rules, s.academicYear, enrollment.className || '', now);
}
async function studentStatuses(ids, now = Date.now()) {
  const s = await snapshot(), classes = new Map(s.enrollments.map(r => [r.studentId, r.className || '']));
  return new Map(ids.map(id => [id, statusFor(s.rules, s.academicYear, classes.get(id) ?? '\u0000', now)]));
}
async function assertAllowed(studentId) {
  const access = await studentStatus(studentId);
  if (access.locked) throw Object.assign(new Error('老師已暫時鎖定寵物樂園。'), { status: 423, code: 'PET_APP_LOCKED', access });
  return access;
}
function teacherView(s, now = Date.now()) {
  const classes = [...new Set(s.enrollments.map(r => r.className || ''))].sort((a, b) => a.localeCompare(b, 'zh-HK', { numeric: true }));
  return {
    academicYear: s.academicYear, serverNow: now,
    classes: classes.map(name => ({ name, count: s.enrollments.filter(r => (r.className || '') === name).length, ...statusFor(s.rules, s.academicYear, name, now) })),
    rules: s.rules.filter(r => !r.endsAt || Date.parse(r.endsAt) > now).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
  };
}
async function teacherSettings() { return teacherView(await snapshot(true)); }

async function mutate(operation) {
  await ensureSchema();
  const run = async client => {
    if (client) await client.query("SELECT pg_advisory_xact_lock(hashtext('pet-access-locks'))");
    const academicYear = await years.getCurrentAcademicYear();
    const enrollments = (await years.listEnrollments(academicYear)).filter(r => r.role !== 'teacher');
    const rules = await readRules(academicYear, client), now = Date.now();
    const next = operation(rules, { academicYear, enrollments, now });
    if (client) {
      await client.query('DELETE FROM PetAccessLocks WHERE AcademicYear=$1', [academicYear]);
      for (const rule of next) await client.query('INSERT INTO PetAccessLocks(LockID,AcademicYear,State) VALUES($1,$2,$3::jsonb)', [rule.id, academicYear, JSON.stringify(rule)]);
    } else {
      const data = store.load(), previous = data.petAccessLocks;
      data.petAccessLocks = [...(previous || []).filter(r => r.academicYear !== academicYear), ...next];
      try { store.save(); } catch (e) { data.petAccessLocks = previous; throw e; }
    }
    return teacherView({ academicYear, enrollments, rules: next }, now);
  };
  const work = config.db.mode === 'postgres' ? withTransaction(run) : queue.then(() => run(null));
  queue = work.catch(() => {});
  const result = await work;
  revision++; cache = null; loading = null;
  events.emit('changed');
  return result;
}
async function update(actorId, body) {
  return mutate((rules, s) => {
    const values = validate(body, [...new Set(s.enrollments.map(r => r.className || ''))], s.now);
    // Unlock is explicit: clear active locks AND upcoming reservations for just these classes.
    let next = rules.filter(r => !r.endsAt || Date.parse(r.endsAt) > s.now);
    if (values.action === 'unlock') return next.map(r => ({ ...r, classes: r.classes.filter(c => !values.classes.includes(c)) })).filter(r => r.classes.length);
    // Setting a new immediate lock or recurring lesson schedule replaces that class's
    // current rule, so an older lock cannot silently defeat the newly chosen policy.
    if (values.action === 'lock' || values.action === 'lesson') next = next.map(r => Date.parse(r.startsAt) <= s.now ? { ...r, classes: r.classes.filter(c => !values.classes.includes(c)) } : r).filter(r => r.classes.length);
    if (next.length >= 500) throw Object.assign(new Error('預約太多，請先取消不再需要的鎖定。'), { status: 400 });
    const { action, ...rule } = values;
    next.push({ ...rule, id: randomUUID(), academicYear: s.academicYear, actorId, createdAt: new Date(s.now).toISOString(), kind: action });
    return next;
  });
}
async function cancel(id) {
  return mutate(rules => {
    if (typeof id !== 'string' || !rules.some(r => r.id === id)) throw Object.assign(new Error('找不到這個鎖定，請重新載入。'), { status: 404 });
    return rules.filter(r => r.id !== id);
  });
}
module.exports = { studentStatus, studentStatuses, assertAllowed, teacherSettings, update, cancel, events };
