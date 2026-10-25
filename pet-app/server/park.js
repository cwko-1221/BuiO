'use strict';
const { randomUUID } = require('node:crypto');
const config = require('../../config');
const pets = require('../repositories/pet.repo');
const repo = require('../repositories/park.repo');
const users = require('../../math-app/repositories/users.repo');
const access = require('../repositories/access-lock.repo');
const worldPromise = import('../lib/park-world.mjs');
const activitiesPromise = import('../lib/park-activities.mjs');
const gamesPromise = import('../lib/park-games.mjs');
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };

module.exports = function registerPark(io, options = {}) {
  const ns = io.of('/pet-park'), players = new Map(), now = options.now || Date.now;
  let checking = false, disposed = false, lastTick = now();
  const roomFor = (status, id) => `park:${status.academicYear}:${status.className && status.className !== '\u0000' ? status.className : `private-${id}`}`;
  const appearance = p => ({ id: p.id, name: p.name, className: p.className, pet: p.pet });
  function roster(room) { ns.to(room).emit('park:roster', { peers: [...players.values()].filter(p => p.room === room).map(appearance) }); }
  function current(socket) {
    const p = players.get(socket.data.studentId);
    if (!p || p.socket !== socket) fail('樂園已在另一個分頁開啟，請重新進入。');
    if (p.locked) fail('老師已暫時鎖定寵物樂園。', 423);
    if (now() > socket.data.expiresAt) { socket.disconnect(); fail('登入已到期，請重新登入。', 401); }
    return p;
  }
  async function allowed(socket) { const p = current(socket); await access.assertAllowed(p.id); current(socket); return p; }
  const social = require('./park-social')({ players, now, current, allowed, emitRoom: (room, payload) => ns.to(room).emit('park:social', payload) });
  const garden = require('./park-garden')({ players, now, current, allowed, isBusy: id => social.isBusy(id), emitRoom: (room, payload) => ns.to(room).emit('park:garden', payload) });
  const market=require('./park-market')({players,now,current,allowed,isBusy:id=>social.isBusy(id)});
  function availableForActivity(p) { if (social.isBusy(p.id)) fail('請先離開雙人合奏，再進行其他活動。'); if (p.pending?.garden) fail('請稍等這次花圃照顧完成。'); }
  function near(p, object, rules) { const target = rules.interactionPoint(object); return Math.hypot(p.x - target.x, p.y - target.y) <= 155; }
  async function checkAccess() {
    if (checking || disposed || !players.size) return; checking = true;
    try {
      const statuses = await access.studentStatuses([...players.keys()], now());
      for (const p of players.values()) {
        const status = statuses.get(p.id); if (!status) continue;
        const expired = now() > p.socket.data.expiresAt;
        if (status.locked || expired || p.room !== roomFor(status, p.id)) {
          social.cancelPlayer(p.id, 'unavailable');
          p.locked = true; p.path = []; p.mask = 0; p.pending = null; p.game = null;
          p.socket.emit('park:access', status);
          if (!status.locked) p.socket.emit('park:notice', { message: expired ? '登入已到期，請重新登入。' : '班別已更新，請重新進入樂園。' });
          p.socket.disconnect();
        }
      }
    } catch (error) {
      // Fail closed: a failed permission check cannot leave a moving/rewarding player behind.
      for (const p of players.values()) { social.cancelPlayer(p.id, 'unavailable'); p.path = []; p.mask = 0; p.locked = true; p.pending = null; p.socket.emit('park:notice', { message: '正在確認樂園開放狀態，請稍候再進入。' }); p.socket.disconnect(); }
    } finally { checking = false; }
  }
  ns.use(async (socket, next) => {
    try {
      const origin = socket.request.headers.origin;
      if (origin && new URL(origin).host !== socket.request.headers.host && !config.cors.origins.includes(origin)) fail('請在寵物樂園內開啟。', 403);
      const session = socket.request.session;
      if (!session?.studentId || session.role !== 'student') fail('請先以學生帳戶登入。', 401);
      await access.assertAllowed(session.studentId);
      socket.data.studentId = session.studentId; socket.data.expiresAt = now() + config.session.maxAge;
      next();
    } catch (error) { const result = new Error(error.message); result.data = { status: error.status, code: error.code, access: error.access }; next(result); }
  });
  ns.on('connection', socket => {
    let count = 0, windowAt = now(), joining = false;
    const handle = (event, fn) => socket.on(event, async (body = {}, ack) => {
      try {
        if (!body || typeof body !== 'object' || Array.isArray(body)) fail('無效的樂園操作。', 400);
        if (now() - windowAt >= 1000) { count = 0; windowAt = now(); }
        if (++count > 35) fail('操作太快，請稍候。', 429);
        if (now() > socket.data.expiresAt) fail('登入已到期，請重新登入。', 401);
        const result = await fn(body); if (typeof ack === 'function') ack({ success: true, ...result });
      } catch (error) { if (typeof ack === 'function') ack({ success: false, status: error.status || 500, code: error.code, access: error.access, message: error.status ? error.message : '樂園暫時未能完成操作，請重試。' }); }
    });
    social.attach(socket, handle);
    garden.attach(socket, handle);
    market.attach(socket,handle);
    handle('park:join', async () => {
      if (joining) fail('正在進入樂園。'); joining = true;
      try {
        const id = socket.data.studentId, rules = await worldPromise;
        const [user, bootstrap, state, status, settings] = await Promise.all([users.findById(id), pets.getBootstrap(id), repo.read(id, now()), access.assertAllowed(id), repo.settings()]);
        if (!user || (user.role || 'student') !== 'student') fail('學生帳戶已無法進入樂園。', 403);
        const pet = bootstrap.pets.find(p => p.id === bootstrap.profile.activePetId) || bootstrap.pets[0];
        if (!pet) fail('先在房間孵出你的寵物，再一起出門吧！');
        const latest = await access.assertAllowed(id); if (!socket.connected) return {};
        const room = roomFor(latest, id);
        const previous = players.get(id);
        if (previous) social.cancelPlayer(id, 'replaced');
        const position = previous && !previous.locked && rules.walkable(previous.x, previous.y) ? previous : (state.position && rules.walkable(state.position.x, state.position.y) ? state.position : rules.spawnPoint([...players.values()].filter(p => p.room === room)));
        if (previous && previous.socket !== socket) { previous.socket.emit('park:notice', { message: '樂園已在另一個分頁開啟。' }); previous.socket.disconnect(); }
        if (previous?.socket === socket) socket.leave(previous.room);
        const p = { id, socket, name: user.name || id, className: latest.className, pet, room,
          x: position.x, y: position.y, path: [], mask: 0, facing: 'front', locked: false, active: true,
          seenAt: now(), inputAt: now(), pending: null, lastTicket: null, emote: null, emoteUntil: 0, emoteAt: -Infinity };
        players.set(id, p); socket.join(p.room); roster(p.room); if (previous && previous.room !== room) roster(previous.room);
        const gardenState = await garden.snapshotFor(p); current(socket);
        return { self: { ...appearance(p), x: p.x, y: p.y, facing: p.facing, moving: false }, state, dailyCap: settings.dailyCap, peers: [...players.values()].filter(peer => peer.room === p.room).map(appearance), day: state.day, garden: gardenState };
      } finally { joining = false; }
    });
    handle('park:move', async body => {
      const p = current(socket), rules = await worldPromise;
      availableForActivity(p);
      if (p.game) fail('請先結束小遊戲再移動。');
      if (!p.active) fail('請先返回樂園畫面。');
      const target = { x: body.x, y: body.y };
      if (typeof target.x !== 'number' || typeof target.y !== 'number' || !rules.walkable(target.x, target.y)) fail('這裏暫時走不到。', 400);
      const path = rules.findPath(p, target); if (!path.length) fail('請點選步道附近的位置。');
      p.pending = null; p.seated = null; p.mask = 0; p.path = path; p.seenAt = now(); return { destination: path[path.length - 1], path };
    });
    handle('park:input', body => {
      const p = current(socket); if (!Number.isInteger(body.mask) || body.mask < 0 || body.mask > 15) fail('無效的移動操作。', 400);
      if (social.isBusy(p.id)) { p.mask = 0; return {}; }
      p.mask = p.active && !p.game ? body.mask : 0; p.inputAt = now(); p.seenAt = now();
      if (body.stop === true) { p.path = []; if (!p.pending?.challenge) p.pending = null; }
      if (p.mask) { p.path = []; p.pending = null; p.seated = null; } return {};
    });
    handle('park:presence', async body => {
      const p = await allowed(socket); if (typeof body.active !== 'boolean') fail('無效的在線狀態。', 400);
      p.active = body.active; p.seenAt = now(); if (!p.active) { p.mask = 0; p.path = []; if (!p.pending?.challenge) p.pending = null; }
      if (!p.active) social.cancelPlayer(p.id, 'unavailable');
      if (!p.active && p.game) { p.game.state.paused = true; p.game.input = {}; }
      return { day: pets.hkDay(new Date(now())) };
    });
    handle('park:quest', async body => {
      const p = await allowed(socket), rules = await worldPromise;
      availableForActivity(p);
      if (p.game || !p.active) fail('請先返回樂園。');
      const quest = rules.QUESTS.find(q => q.id === body.questId);
      if (!quest || !near(p, rules.OBJECTS.find(o => o.id === quest.npc), rules)) fail('請先走到委託的 NPC 身旁。');
      return repo.accept(p.id, quest.id, { now: now(), position: p, canCommit: () => { current(socket); availableForActivity(p); if (!p.active || !near(p, rules.OBJECTS.find(o => o.id === quest.npc), rules)) fail('請留在 NPC 身旁接受委託。'); } });
    });
    handle('park:begin', async body => {
      const p = await allowed(socket), rules = await worldPromise, object = rules.OBJECTS.find(o => o.id === body.objectId);
      availableForActivity(p);
      if (!object || !p.active || p.game || !near(p, object, rules)) fail('請先走到物件旁邊。');
      const state = await repo.read(p.id, now());
      current(socket); availableForActivity(p);
      if (object.game || rules.activityModes(object, state).length) fail('請完成這個地點的活動。');
      p.path = []; p.mask = 0;
      p.pending = { id: randomUUID(), objectId: object.id, dueAt: now() + rules.INTERACTION_MS, day: pets.hkDay(new Date(now())) };
      return { ticket: p.pending };
    });
    handle('park:finish', async body => {
      const p = await allowed(socket), rules = await worldPromise;
      availableForActivity(p);
      if (p.lastTicket?.id === body.ticketId) return p.lastTicket.result;
      const ticket = p.pending, object = rules.OBJECTS.find(o => o.id === ticket?.objectId);
      if (ticket?.challenge) fail('請完成活動的操作後提交答案。');
      if (!ticket || ticket.id !== body.ticketId || !object || !p.active || !near(p, object, rules) || ticket.day !== pets.hkDay(new Date(now()))) fail('互動已中斷，請再試一次。');
      if (now() < ticket.dueAt || now() - ticket.dueAt > 30000) fail('請完成互動後再領取進度。');
      const result = await repo.interact(p.id, object.id, { now: now(), position: p, canCommit: () => { current(socket); if (p.pending !== ticket || !p.active || !near(p, object, rules)) fail('互動已中斷，請再試一次。'); } });
      p.lastTicket = { id: ticket.id, result }; p.pending = null;
      p.seated = object.kind === 'bench' ? object.id : null;
      ns.to(p.room).emit('park:effect', { playerId: p.id, objectId: object.id, at: now() });
      return result;
    });
    handle('park:challenge', async body => {
      const p = await allowed(socket), rules = await worldPromise, activities = await activitiesPromise;
      availableForActivity(p);
      const object = rules.OBJECTS.find(o => o.id === body.objectId), state = await repo.read(p.id, now());
      current(socket); availableForActivity(p);
      if (!object || p.game || !p.active || !near(p, object, rules) || !rules.activityModes(object, state).includes(body.mode)) fail('請先走到活動地點。');
      if (body.mode === 'code' && !['mushrooms', 'pond', 'forest-sign'].every(id => state.quests.treasure?.steps.includes(id))) fail('先找齊蘑菇、睡蓮池及森林路牌的三條線索。');
      const challenge = activities.createChallenge(body.mode, object.id, parseInt(randomUUID().slice(0, 8), 16));
      const ticket = { id: randomUUID(), objectId: object.id, day: pets.hkDay(new Date(now())), dueAt: now() + challenge.minimumMs, challenge, attemptAt: 0 };
      p.path = []; p.mask = 0; p.pending = ticket;
      return { ticket: { id: ticket.id, dueAt: ticket.dueAt }, challenge: activities.publicChallenge(challenge) };
    });
    handle('park:solve', async body => {
      const p = await allowed(socket), rules = await worldPromise, activities = await activitiesPromise;
      availableForActivity(p);
      if (p.lastTicket?.id === body.ticketId) return p.lastTicket.result;
      const ticket = p.pending, object = rules.OBJECTS.find(o => o.id === ticket?.objectId);
      if (!ticket?.challenge || ticket.id !== body.ticketId || !object || !p.active || !near(p, object, rules) || ticket.day !== pets.hkDay(new Date(now())) || now() - ticket.dueAt > 600000) fail('活動已中斷，請重新開始。');
      if (now() < ticket.dueAt) fail('先完成活動，再提交答案。');
      if (now() - ticket.attemptAt < 450) fail('慢慢觀察，再試一次。'); ticket.attemptAt = now();
      if (!activities.verifyChallenge(ticket.challenge, body.answer)) fail('還差一點！看看提示，再試一次。', 422);
      const result = await repo.interact(p.id, object.id, { now: now(), position: p, mode: ticket.challenge.mode, canCommit: () => { current(socket); if (p.pending !== ticket || !p.active || !near(p, object, rules)) fail('活動已中斷。'); } });
      p.lastTicket = { id: ticket.id, result }; p.pending = null;
      ns.to(p.room).emit('park:effect', { playerId: p.id, objectId: object.id, at: now() }); return result;
    });
    handle('park:cancel', async () => { const p = current(socket); p.pending = null; return {}; });
    handle('park:game:start', async body => {
      const p = await allowed(socket), rules = await worldPromise, games = await gamesPromise;
      current(socket); availableForActivity(p);
      const object = rules.OBJECTS.find(o => (o.game === body.kind || o.games?.includes(body.kind)) && (body.objectId === undefined || o.id === body.objectId));
      if (!object || !p.active || !near(p, object, rules)) fail('請先走到廣場的小遊戲攤位。');
      if (p.game) fail('請先結束目前的小遊戲。');
      if (body.kind === 'flight' && body.craft !== undefined && (typeof body.craft !== 'string' || !Object.hasOwn(games.FLIGHT_CRAFT, body.craft))) fail('請選擇有效的飛行器。', 400);
      p.path = []; p.mask = 0; p.pending = null;
      p.game = { id: randomUUID(), objectId: object.id, day: pets.hkDay(new Date(now())), startedAt: now(), inputAt: now(), accumulator: 0, inputSeq: 0, frameAt: 0, input: {}, state: games.createGame(body.kind, parseInt(randomUUID().slice(0, 8), 16), { craft: body.craft }) };
      return { session: p.game.id, state: p.game.state };
    });
    handle('park:game:input', body => {
      const p = current(socket), game = p.game;
      if (!game || body.session !== game.id || !p.active) fail('小遊戲已中斷。');
      if (!Number.isInteger(body.mask) || body.mask < 0 || body.mask > 63 || body.x !== undefined && (typeof body.x !== 'number' || !Number.isFinite(body.x) || body.x < 0 || body.x > 480) || body.y !== undefined && (typeof body.y !== 'number' || !Number.isFinite(body.y) || body.y < 0 || body.y > 720)) fail('無效的遊戲操作。', 400);
      if (body.presses !== undefined && (!Array.isArray(body.presses) || body.presses.length > 10 || body.presses.some(n => !Number.isSafeInteger(n) || n < 0 || n > 1000000000))) fail('無效的遊戲操作。', 400);
      for (const field of ['seq', 'shieldPress', 'specialPress']) if (body[field] !== undefined && (!Number.isSafeInteger(body[field]) || body[field] < 0 || body[field] > 1000000000)) fail('無效的遊戲操作。', 400);
      if (game.inputSeq && (body.seq === undefined || body.seq <= game.inputSeq)) return { stale: true };
      game.inputSeq = body.seq || 0;
      game.input = { mask: body.mask, x: body.x, y: body.y, seq: body.seq, presses: body.presses?.map((n,i) => Math.max(n,game.input.presses?.[i] || 0,game.state.leisure?.presses[i] || 0)),
        shieldPress: Math.max(game.state.shieldPress, game.input.shieldPress || 0, body.shieldPress || 0),
        specialPress: Math.max(game.state.specialPress, game.input.specialPress || 0, body.specialPress || 0) };
      game.inputAt = now(); p.seenAt = now(); return {};
    });
    handle('park:game:control', async body => {
      const p = await allowed(socket), game = p.game;
      if (!game || body.session !== game.id) fail('小遊戲已中斷。');
      if (body.action === 'cancel') { p.game = null; return {}; }
      if (!['pause', 'resume'].includes(body.action)) fail('無效的遊戲操作。', 400);
      if (body.action === 'resume' && (!p.active || game.day !== pets.hkDay(new Date(now())))) fail('請重新進入小遊戲。');
      game.state.paused = body.action === 'pause'; game.input = {}; game.inputAt = now(); p.seenAt = now();
      return { session: game.id, state: game.state };
    });
    handle('park:game:finish', async body => {
      const p = await allowed(socket), rules = await worldPromise, games = await gamesPromise;
      if (p.lastGame?.id === body.session) return p.lastGame.result;
      const game = p.game, object = rules.OBJECTS.find(o => o.id === game?.objectId);
      if (!game || body.session !== game.id || (game.state.status !== 'ended' && game.state.kind !== 'fishing') || !p.active || !near(p, object, rules) || game.day !== pets.hkDay(new Date(now()))) fail('請完成遊戲後結算。');
      if(game.settling)fail('正在保存釣獲，請稍候。');const wasPaused=game.state.paused;game.settling=true;game.state.paused=true;
      try{
      const result = await repo.recordGame(p.id, game.state.kind, games.gameResult(game.state), game.id, { now: now(), position: p, canCommit: () => { current(socket); if (p.game !== game || !p.active) fail('小遊戲已中斷。'); } });
      p.lastGame = { id: game.id, result }; p.game = null; return result;
      }finally{game.settling=false;if(p.game===game)game.state.paused=wasPaused;}

    });
    handle('park:emote', async body => {
      const p = await allowed(socket), rules = await worldPromise;
      if (!p.active || !rules.EMOTES.includes(body.emote)) fail('無效的表情。', 400);
      if (now() - p.emoteAt < 2500) fail('稍等一下再打招呼。', 429);
      p.emoteAt = now(); p.emote = body.emote; p.emoteUntil = now() + 3500; return {};
    });
    handle('park:state', async () => { const p = await allowed(socket); return { state: await repo.read(p.id, now()), ...(await repo.settings()) }; });
    socket.on('disconnect', () => {
      const p = players.get(socket.data.studentId); if (!p || p.socket !== socket) return;
      social.cancelPlayer(p.id, 'unavailable');
      players.delete(p.id); roster(p.room); void repo.savePosition(p.id, p).catch(() => {});
    });
  });
  const tick = setInterval(async () => {
    const [rules, games] = await Promise.all([worldPromise, gamesPromise]), time = now(), delta = (time - lastTick) / 1000; lastTick = time;
    const rooms = new Map();
    for (const p of players.values()) {
      if (time - p.inputAt > 450) p.mask = 0;
      if (time - p.seenAt > 15000) { p.path = []; p.mask = 0; p.active = false; }
      if (!p.game && !p.locked && p.active && !social.isBusy(p.id)) rules.stepPlayer(p, delta);
      const peers = rooms.get(p.room) || []; peers.push({ id: p.id, x: p.x, y: p.y, facing: p.facing,
        moving: !!p.mask || !!p.path.length, active: p.active, emote: time < p.emoteUntil ? p.emote : null, interacting: !!p.pending, seated: p.seated || null, activity: social.isBusy(p.id) ? 'duet' : p.game?.state.kind || null }); rooms.set(p.room, peers);
    }
    await social.tick();
    await garden.tick();
    for (const [room, peers] of rooms) ns.to(room).volatile.emit('park:frame', { peers, at: time });
  }, 100);
  // Arcade physics runs at 30 Hz rather than three steps in a 100 ms burst.
  // Snapshots are replaceable at 15 Hz; presentation runs at the device's RAF.
  let lastGameTick = now();
  const gameTick = setInterval(async () => {
    const games = await gamesPromise, time = now(), delta = Math.min(.25, Math.max(0, (time - lastGameTick) / 1000)); lastGameTick = time;
    for (const p of players.values()) {
      const game = p.game; if (!game) continue;
      if (!p.active || time - game.inputAt > 1800) { game.state.paused = true; game.input = {}; }
      if (time - game.startedAt > 900000 || game.day !== pets.hkDay(new Date(time))) { p.game = null; p.socket.emit('park:game:cancelled', { message: '活動時間已結束，請再開一局。' }); continue; }
      if (!p.locked && p.active && !game.state.paused) {
        game.accumulator += delta;
        while (game.accumulator + 1e-9 >= 1 / 30) { games.stepGame(game.state, game.input); game.accumulator -= 1 / 30; }
      }
      if (time >= game.frameAt) { game.frameAt = time + 1000 / 15 - (time - game.frameAt) % (1000 / 15); p.socket.volatile.emit('park:game:frame', { session: game.id, state: game.state }); }
    }
  }, 1000 / 30);
  const permissionTimer = setInterval(() => void checkAccess(), 2000);
  access.events.on('changed', checkAccess); tick.unref?.(); gameTick.unref?.(); permissionTimer.unref?.();
  const dispose = () => { disposed = true; social.dispose(); garden.dispose(); clearInterval(tick); clearInterval(gameTick); clearInterval(permissionTimer); access.events.off('changed', checkAccess); };
  io.httpServer?.once('close', dispose);
  return { dispose, players, social, garden, checkAccess };
};
