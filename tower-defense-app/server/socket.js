'use strict';

const setsRepo = require('../../game-app/repositories/questionSets.repo');
const demoSet = require('../../game-app/lib/demoSet');
const defaultSet = require('../lib/defaultQuestions');
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
      const unready = players.filter(player => !player.mapId);
      if (unready.length) {
        return ack?.({ ok: false, message: `仍有 ${unready.length} 位學生未選擇戰場。` });
      }
      room.phase = 'playing';
      room.startedAt = Date.now();
      for (const player of players) player.status = 'deploying';
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
          status: 'choosing',
          wave: 0,
          score: 0,
          quizCorrect: 0,
          quizAnswered: 0,
        };
        room.players.set(key, player);
      } else {
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
      player.status = room.phase === 'playing' ? 'deploying' : 'ready';
      emitRoster(room);
      ack?.({ ok: true, mapId, shouldStart: room.phase === 'playing' });
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
      player.connected = false;
      if (room.phase === 'lobby') room.players.delete(player.key);
      emitRoster(room);
    });
  });
};

module.exports.loadQuestionSet = loadQuestionSet;
