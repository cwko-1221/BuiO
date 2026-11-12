'use strict';

const setsRepo = require('../../game-app/repositories/questionSets.repo');
const demoSet = require('../../game-app/lib/demoSet');
const defaultSet = require('../lib/defaultQuestions');
const config = require('../../config');
const { startSession, sessions: questionSessions } = require('../lib/questionSessions');
const {
  MAP_IDS,
  rooms,
  connectedPlayers,
  makeCode,
  playerKey,
  publicSessions,
  roster,
} = require('../lib/classrooms');

async function loadQuestionSet(setId) {
  if (!setId || setId === defaultSet.id) return defaultSet;
  if (setId === demoSet.id) return demoSet;
  if (!setsRepo.pgAvailable()) {
    const error = new Error('目前只可使用內置題庫。');
    error.statusCode = 503;
    throw error;
  }
  const set = await setsRepo.getSetWithQuestions(setId);
  if (!set?.questions?.length) {
    const error = new Error('找不到所選題庫。');
    error.statusCode = 404;
    throw error;
  }
  if (set.questions.some(question => question.choices.length !== 4)) {
    const error = new Error('塔防題庫的每一題必須有四個選項。');
    error.statusCode = 400;
    throw error;
  }
  return set;
}

module.exports = function registerTowerDefenseClassrooms(io, app) {
  const nsp = io.of('/tower-defense');

  function emitRoster(room) {
    nsp.to(room.hostSocket).emit('classroom:roster', roster(room));
  }

  function closeRoom(room, message) {
    rooms.delete(room.code);
    nsp.to(room.code).emit('classroom:closed', { message });
  }

  app.get('/api/tower-defense/sessions', (_req, res) => {
    res.json({ success: true, sessions: publicSessions() });
  });

  nsp.on('connection', socket => {
    let startSecond = 0, startCount = 0, diagnosticMinute = 0, diagnosticCount = 0;
    socket.on('question:session', (body, ack) => {
      if (typeof ack !== 'function') return;
      const owner = socket.request.session?.studentId;
      const preview = !config.isProd && socket.handshake.auth?.preview === true;
      if (!owner && !preview) return ack({ success: false, status: 401, message: '請先登入平台。' });
      const second = Math.floor(Date.now() / 1000);
      if (second !== startSecond) { startSecond = second; startCount = 0; }
      if (++startCount > 4) return ack({ success: false, status: 429, message: '請稍後再試。' });
      if (!body || typeof body !== 'object' || body.roomCode !== socket.data.code || socket.data.role !== 'player') {
        return ack({ success: false, status: 403, message: '你尚未加入這個塔防房間。' });
      }
      try {
        const result = startSession(owner || 'preview-player', body, { preview, prepare: true });
        console.log('[tower-start]', JSON.stringify({ stage: 'socket-session', attemptId: body.startRequestId, success: true }));
        ack(result);
      } catch (error) {
        ack({ success: false, status: error.status || 500, message: error.status ? error.message : '暫時未能建立答題連線。' });
      }
    });
    socket.on('client:diagnostic', data => {
      if (!socket.request.session?.studentId || !data || typeof data !== 'object') return;
      const minute = Math.floor(Date.now() / 60000);
      if (minute !== diagnosticMinute) { diagnosticMinute = minute; diagnosticCount = 0; }
      if (++diagnosticCount > 100) return;
      if (typeof data.traceId !== 'string' || !/^[\w-]{16,80}$/.test(data.traceId)) return;
      const stages = ['http-start', 'http-ok', 'http-failed', 'socket-start', 'socket-ok', 'socket-failed', 'assets-start', 'assets-progress', 'first-frame', 'battle-start', 'render-timeout', 'context-lost', 'context-restored', 'retry-scene', 'start-failed'];
      if (!stages.includes(data.stage)) return;
      const safe = { build: '20261113-recovery-1', traceId: data.traceId, stage: data.stage,
        elapsedMs: Math.min(3600000, Math.max(0, Number(data.elapsedMs) || 0)), transport: socket.conn.transport.name };
      for (const key of ['durationMs', 'status', 'progress', 'inflight', 'processing']) {
        if (Number.isFinite(data[key])) safe[key] = Math.max(0, Math.min(3600000, data[key]));
      }
      console.log('[tower-start]', JSON.stringify(safe));
    });
    socket.on('host:create', async ({ setId, hostName }, ack) => {
      try {
        const set = await loadQuestionSet(String(setId || defaultSet.id));
        const code = makeCode();
        const room = {
          code,
          hostSocket: socket.id,
          hostName: String(hostName || '老師').trim().slice(0, 30) || '老師',
          phase: 'lobby',
          set,
          difficulty: 'guardian',
          createdAt: Date.now(),
          startedAt: null,
          players: new Map(),
        };
        rooms.set(code, room);
        socket.data.role = 'host';
        socket.data.code = code;
        socket.join(code);
        ack?.({
          ok: true,
          code,
          setTitle: set.title,
          questionCount: set.questions.length,
          difficulty: 'guardian',
        });
      } catch (error) {
        console.error('[tower-defense] host:create', error);
        ack?.({ ok: false, message: error.message || '建立房間失敗。' });
      }
    });

    socket.on('host:start', ack => {
      const room = rooms.get(socket.data.code);
      if (!room || room.hostSocket !== socket.id || room.phase !== 'lobby') {
        return ack?.({ ok: false, message: '房間狀態不正確。' });
      }
      const players = connectedPlayers(room);
      if (!players.length) return ack?.({ ok: false, message: '未有學生加入。' });
      const unready = [...room.players.values()].filter(player => !player.connected || !player.mapId || !player.prepared);
      if (unready.length) {
        return ack?.({ ok: false, message: `仍有 ${unready.length} 位學生未完成戰場準備。` });
      }
      room.phase = 'playing';
      room.startedAt = Date.now() + 1500;
      for (const player of players) player.status = 'ready';
      nsp.to(room.code).emit('classroom:start', {
        startedAt: room.startedAt,
        difficulty: 'guardian',
        setTitle: room.set.title,
      });
      emitRoster(room);
      ack?.({ ok: true, startedAt: room.startedAt });
    });

    socket.on('host:end', ack => {
      const room = rooms.get(socket.data.code);
      if (!room || room.hostSocket !== socket.id) return ack?.({ ok: false });
      room.phase = 'ended';
      const results = roster(room).sort((a, b) => b.score - a.score);
      nsp.to(room.code).emit('classroom:ended', { results });
      rooms.delete(room.code);
      ack?.({ ok: true, results });
    });

    socket.on('host:close', () => {
      const room = rooms.get(socket.data.code);
      if (room?.hostSocket === socket.id) closeRoom(room, '老師已關閉房間。');
    });

    socket.on('player:join', ({ code, name, studentId }, ack) => {
      // An authenticated socket can join only as its signed-in account.
      studentId = socket.request.session?.studentId || studentId;
      const room = rooms.get(String(code || '').trim());
      if (!room) return ack?.({ ok: false, message: '找不到這個房間，請重新選擇。' });
      if (room.phase === 'ended') return ack?.({ ok: false, message: '這個課堂已經結束。' });
      const key = playerKey(studentId, socket.id);
      let player = room.players.get(key);
      if (!player) {
        player = {
          key,
          name: String(name || '學生').trim().slice(0, 30) || '學生',
          studentId: studentId || null,
          socketId: socket.id,
          connected: true,
          joinedAt: Date.now(),
          mapId: null,
          prepared: false,
          status: 'choosing',
          wave: 0,
          score: 0,
          quizCorrect: 0,
          quizAnswered: 0,
        };
        room.players.set(key, player);
      } else {
        if (player.socketId !== socket.id) player.prepared = false;
        player.socketId = socket.id;
        player.connected = true;
        player.name = String(name || player.name).trim().slice(0, 30) || player.name;
      }
      socket.data.role = 'player';
      socket.data.code = room.code;
      socket.data.playerKey = key;
      socket.join(room.code);
      emitRoster(room);
      ack?.({
        ok: true,
        code: room.code,
        playerKey: key,
        hostName: room.hostName,
        setTitle: room.set.title,
        phase: room.phase,
        mapId: player.mapId,
        difficulty: 'guardian',
        startedAt: room.startedAt,
        serverNow: Date.now(),
      });
    });

    socket.on('player:select-map', ({ mapId }, ack) => {
      const room = rooms.get(socket.data.code);
      const player = room?.players.get(socket.data.playerKey);
      if (!room || !player || !MAP_IDS.has(mapId)) {
        return ack?.({ ok: false, message: '無法選擇這個戰場。' });
      }
      if (!['lobby', 'playing'].includes(room.phase) || !['choosing', 'ready'].includes(player.status)) {
        return ack?.({ ok: false, message: '戰役已經開始，不能更換戰場。' });
      }
      player.mapId = mapId;
      player.prepared = false;
      player.status = 'deploying';
      emitRoster(room);
      ack?.({ ok: true, mapId, shouldStart: room.phase === 'playing' });
    });

    socket.on('player:prepared', ({ ready, mapId, sessionId } = {}, ack) => {
      const room = rooms.get(socket.data.code), player = room?.players.get(socket.data.playerKey);
      if (!room || !player || player.socketId !== socket.id || player.mapId !== mapId) return ack?.({ ok: false });
      const questionSession = questionSessions.get(sessionId);
      const owner = socket.request.session?.studentId;
      const preview = !config.isProd && socket.handshake.auth?.preview === true;
      if (ready && (!questionSession || questionSession.roomCode !== room.code || (!preview && questionSession.owner !== owner))) return ack?.({ ok: false });
      player.prepared = ready === true;
      player.status = player.prepared ? 'ready' : 'deploying';
      emitRoster(room); ack?.({ ok: true, phase: room.phase, startedAt: room.startedAt, serverNow: Date.now() });
    });

    socket.on('player:state', raw => {
      const room = rooms.get(socket.data.code);
      const player = room?.players.get(socket.data.playerKey);
      if (!room || !player || room.phase !== 'playing') return;
      player.status = ['playing', 'won', 'lost'].includes(raw?.status) ? raw.status : 'playing';
      player.wave = Math.min(15, Math.max(0, Math.round(Number(raw?.wave) || 0)));
      player.score = Math.max(0, Math.round(Number(raw?.score) || 0));
      player.quizCorrect = Math.max(0, Math.round(Number(raw?.quizCorrect) || 0));
      player.quizAnswered = Math.max(player.quizCorrect, Math.round(Number(raw?.quizAnswered) || 0));
      emitRoster(room);
    });

    socket.on('disconnect', () => {
      const room = rooms.get(socket.data.code);
      if (!room) return;
      if (socket.data.role === 'host' && room.hostSocket === socket.id) {
        return closeRoom(room, '老師已離開，房間已關閉。');
      }
      const player = room.players.get(socket.data.playerKey);
      if (!player) return;
      if (player.socketId !== socket.id) return;
      player.connected = false;
      player.prepared = false;
      // Keep a disconnected pupil visible. Starting must not silently exclude
      // the iPad that is struggling to prepare; reconnect restores its seat.
      emitRoster(room);
    });
  });
};

module.exports.loadQuestionSet = loadQuestionSet;
