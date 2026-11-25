'use strict';
const repository = require('../repositories/park-garden.repo');
const worldPromise = import('../lib/park-world.mjs');
const layoutPromise = import('../lib/park-layout-v4.mjs');
const projectsPromise = import('../lib/park-projects.mjs');
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };

module.exports = function createParkGarden({ players, now = Date.now, current, allowed, emitRoom = () => {}, isBusy = () => false, repo = repository }) {
  const cache = new Map(), lastAction = new Map(); let disposed = false, ticking = false, nextTick = 0;
  const available = p => p && players.get(p.id) === p && p.socket.connected !== false && p.active && !p.locked && !p.game && !p.pending && !isBusy(p.id);
  const signature = state => `${state.day}:${state.revision}:${Object.values(state.plots).map(p => p.stage).join(',')}`;
  const older = (state, previous) => previous && (state.day < previous.day || state.day === previous.day && (state.revision < previous.revision || state.revision === previous.revision && state.at < previous.at));
  const publish = (room, state, force = false) => { const previous = cache.get(room); if (older(state, previous?.state)) return; cache.set(room, { state, signature: signature(state) }); if (force || previous?.signature !== signature(state)) emitRoom(room, { state, at: now() }); };
  async function snapshotFor(player) { if (disposed) fail('花圃暫時未開放。'); const state = { ...await repo.read(player.room, now()), scope: player.room }; if (!older(state, cache.get(player.room)?.state)) cache.set(player.room, { state, signature: signature(state) }); return state; }
  async function act(socket, body) {
    if (disposed) fail('花圃暫時未開放。');
    const p = await allowed(socket);
    const [world, layout,projects] = await Promise.all([worldPromise, layoutPromise,projectsPromise]);
    current(socket);
    if (!available(p)) fail('先結束目前的活動，再照顧花圃吧。');
    const plot = body.action==='contribute'?projects.SCENE_PROJECTS.find(plot=>plot.id===body.plotId):layout.GARDEN_PLOTS.find(plot => plot.id === body.plotId);
    const close = () => plot && Math.hypot(p.x - plot.at.x, p.y - plot.at.y) <= 170 && world.clearLine(p, plot.at);
    if (!close()) fail('請先走到這片花圃前的小徑。');
    if (typeof body.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,96}$/.test(body.requestId)) fail('無效的花圃操作。', 400);
    const previous = lastAction.get(p.id);
    if (previous && previous.id !== body.requestId && now() - previous.at < 500) fail('請稍等花圃更新，再繼續照顧。', 429);
    const marker = { garden: true, plotId: plot.id }; p.pending = marker; p.path = []; p.mask = 0; p.seated = null;
    try {
      const result = await repo.act(p.room, { id: p.id, name: String(p.name).slice(0, 120) }, { plotId: body.plotId, action: body.action, requestId: body.requestId, day: body.day, revision: body.revision, seed: body.seed }, { now: now(), canCommit: async () => {
        await allowed(socket); current(socket);
        if (disposed || players.get(p.id) !== p || p.pending !== marker || !p.active || p.locked || p.game || isBusy(p.id) || !close()) fail('花圃照顧已中斷，請再試一次。');
      } });
      result.state.scope = p.room; lastAction.set(p.id, { id: body.requestId, at: now() }); p.seenAt = now(); publish(p.room, result.state, true); return result;
    } finally { if (p.pending === marker) p.pending = null; }
  }
  function attach(socket, handle) {
    handle('park:garden:state', async () => { const p = await allowed(socket), state = await snapshotFor(p); current(socket); return { state }; });
    handle('park:garden:act', body => act(socket, body));
  }
  async function tick() {
    if (disposed || ticking || now() < nextTick) return; ticking = true; nextTick = now() + 1000;
    try {
      const rooms = new Set([...players.values()].filter(p => p.active && !p.locked).map(p => p.room));
      await Promise.all([...rooms].map(async room => { try { const state = { ...await repo.read(room, now()), scope: room }; if (!disposed) publish(room, state); } catch { /* Keep the last view; actions surface storage errors without corrupting it. */ } }));
      for (const room of cache.keys()) if (!rooms.has(room)) cache.delete(room);
      if (lastAction.size > 2000) for (const [id, value] of lastAction) if (now() - value.at > 60000) lastAction.delete(id);
    } finally { ticking = false; }
  }
  function dispose() { disposed = true; cache.clear(); lastAction.clear(); }
  return { attach, snapshotFor, tick, dispose };
};
