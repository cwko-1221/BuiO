'use strict';

const express = require('express');
const { requireAuth, requireTeacher } = require('../math-app/middleware/auth');
const repo = require('./repository');
const router = express.Router();
const streams = new Set();
const wrap = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };

function send(stream, session) {
  const state = repo.view(session, stream.user);
  const signature = JSON.stringify({ ...state, serverNow: 0 });
  if (signature === stream.signature) return;
  stream.signature = signature;
  stream.res.write(`data: ${JSON.stringify(state)}\n\n`);
  stream.res.flush?.();
}

async function broadcast() {
  if (!streams.size) return;
  const rows = await repo.all();
  for (const stream of streams) {
    const session = rows.find(row => row.id === stream.id);
    if (session) send(stream, session);
  }
}

// Broadcast immediately after mutations; also catch countdowns and other server workers.
let broadcasting = false;
setInterval(async () => {
  if (broadcasting) return;
  broadcasting = true;
  try { await broadcast(); } catch (error) { console.error('[buzzer] stream', error.message); }
  finally { broadcasting = false; }
}, 500).unref();
setInterval(() => {
  for (const stream of streams) { stream.res.write(': heartbeat\n\n'); stream.res.flush?.(); }
}, 15000).unref();

router.use(requireAuth);
router.get('/sessions', wrap(async (req, res) => res.json({ success: true, sessions: await repo.sessions(req.session) })));
router.get('/roster', requireTeacher, wrap(async (_req, res) => res.json({ success: true, ...await repo.roster() })));
router.post('/sessions', requireTeacher, wrap(async (req, res) => {
  const session = await repo.create(req.session, req.body || {});
  res.json({ success: true, session });
}));
router.get('/sessions/:id', wrap(async (req, res) => res.json({ success: true, session: await repo.get(req.params.id, req.session) })));
router.post('/sessions/:id/actions', wrap(async (req, res) => {
  const session = await repo.action(req.params.id, req.session, req.body || {});
  res.json({ success: true, session });
  await broadcast();
}));
router.get('/sessions/:id/events', wrap(async (req, res) => {
  await repo.get(req.params.id, req.session);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const stream = { id: req.params.id, user: { studentId: req.session.studentId, role: req.session.role }, res, signature: '' };
  streams.add(stream);
  res.on('close', () => streams.delete(stream));
  try { await broadcast(); } catch (error) { streams.delete(stream); res.end(); }
}));
router.use((error, _req, res, _next) => {
  if (res.headersSent) return res.end();
  res.status(error.status || 500).json({ success: false, message: error.status ? error.message : '搶答系統暫時未能連線，請重試。' });
});
module.exports = router;
