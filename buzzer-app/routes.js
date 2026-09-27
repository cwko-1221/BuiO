'use strict';

const express = require('express');
const { Client } = require('pg');
const config = require('../config');
const { requireAuth, requireTeacher } = require('../math-app/middleware/auth');
const repo = require('./repository');
const router = express.Router();
const streams = new Set();
const latest = new Map();
const deadlines = new Map();
const wrap = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };

function send(stream, session) {
  if (stream.res.destroyed) return;
  const state = repo.view(session, stream.user);
  const signature = JSON.stringify({ ...state, serverNow: 0 });
  if (signature === stream.signature) return;
  stream.signature = signature;
  stream.round = session.round;
  stream.res.write(`data: ${JSON.stringify(state)}\n\n`);
  stream.res.flush?.();
}

function broadcast(session) {
  if (!session || (latest.get(session.id)?.revision || 0) > (session.revision || 0)) return;
  latest.set(session.id, session);
  for (const stream of streams) if (stream.id === session.id) send(stream, session);
  clearTimeout(deadlines.get(session.id));
  deadlines.delete(session.id);
  if (session.phase === 'scheduled') {
    deadlines.set(session.id, setTimeout(() => {
      void repo.interrupt(session.id, { studentId: session.teacherId, role: 'teacher' }, session.round, true)
        .catch(error => console.error('[buzzer] deadline', error.message));
    }, Math.max(0, session.countdownAt - Date.now())));
  }
}

// Publish the committed snapshot directly. No second database read in the local path.
repo.changes.on('change', broadcast);

// Notifications deliver changes from other processes, instead of polling to discover them.
let listener, listening = false, connecting = false;
async function listen() {
  if (config.db.mode !== 'postgres' || listening || connecting || !streams.size) return;
  connecting = true;
  const client = new Client({ connectionString: config.db.supabaseUrl, ssl: { rejectUnauthorized: false }, keepAlive: true, connectionTimeoutMillis: 10000 });
  let stopped = false;
  const reconnect = () => {
    if (stopped) return;
    stopped = true;
    if (!listener || listener === client) { listening = false; listener = null; }
    void client.end().catch(() => {});
    setTimeout(() => { void listen(); }, 3000).unref();
  };
  client.on('error', reconnect);
  client.on('end', reconnect);
  client.on('notification', message => {
    const [id, origin] = message.payload.split(':');
    if (origin !== repo.origin && [...streams].some(stream => stream.id === id)) {
      void repo.raw(id).then(broadcast).catch(error => console.error('[buzzer] notification', error.message));
    }
  });
  try {
    await client.connect(); await client.query('LISTEN buio_buzzer');
    listener = client; listening = true;
    for (const id of new Set([...streams].map(stream => stream.id))) broadcast(await repo.raw(id));
  } catch (error) { reconnect(); }
  finally { connecting = false; }
}
// Recovery only: database proxies that cannot LISTEN still recover remote changes.
let recovering = false;
setInterval(async () => {
  if (config.db.mode !== 'postgres' || listening || recovering || !streams.size) return;
  recovering = true;
  try { for (const id of new Set([...streams].map(stream => stream.id))) broadcast(await repo.raw(id)); }
  catch (error) { console.error('[buzzer] recovery', error.message); }
  finally { recovering = false; }
}, 500).unref();
setInterval(() => {
  for (const stream of streams) {
    stream.res.write('event: heartbeat\ndata: {}\n\n'); stream.res.flush?.();
  }
}, 1000).unref();

router.use(requireAuth);
router.get('/time', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, serverNow: Date.now() });
});
router.get('/sessions', wrap(async (req, res) => res.json({ success: true, sessions: await repo.sessions(req.session) })));
router.get('/roster', requireTeacher, wrap(async (_req, res) => res.json({ success: true, ...await repo.roster() })));
router.post('/sessions', requireTeacher, wrap(async (req, res) => {
  res.json({ success: true, session: await repo.create(req.session, req.body || {}) });
}));
router.get('/sessions/:id', wrap(async (req, res) => res.json({ success: true, session: await repo.get(req.params.id, req.session) })));
router.post('/sessions/:id/actions', wrap(async (req, res) => {
  const body = req.body || {};
  if (body.action === 'unready') {
    if (req.session.role !== 'student') return res.status(403).json({ success: false, message: '只有學生可以操作。' });
    await repo.interrupt(req.params.id, req.session, Number(body.round));
    return res.json({ success: true, session: await repo.get(req.params.id, req.session) });
  }
  res.json({ success: true, session: await repo.action(req.params.id, req.session, body) });
}));
router.get('/sessions/:id/events', wrap(async (req, res) => {
  const session = await repo.raw(req.params.id);
  if (!session) throw Object.assign(new Error('找不到搶答課堂。'), { status: 404 });
  repo.view(session, req.session);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const stream = { id: req.params.id, user: { studentId: req.session.studentId, role: req.session.role }, res, signature: '', round: session.round };
  streams.add(stream);
  res.on('close', () => {
    streams.delete(stream);
    if (stream.user.role === 'student' && ![...streams].some(other => other.id === stream.id && other.user.studentId === stream.user.studentId)) {
      void repo.interrupt(stream.id, stream.user, stream.round).catch(error => console.error('[buzzer] disconnect', error.message));
    }
  });
  broadcast(session);
  send(stream, latest.get(session.id));
  void listen();
}));
router.use((error, _req, res, _next) => {
  if (res.headersSent) return res.end();
  res.status(error.status || 500).json({ success: false, message: error.status ? error.message : '搶答系統暫時未能連線，請重試。' });
});
module.exports = router;
