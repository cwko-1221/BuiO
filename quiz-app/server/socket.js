'use strict';

const { randomBytes, timingSafeEqual } = require('crypto');
const config = require('../../config');
const setsRepo = require('../../game-app/repositories/questionSets.repo');
const demoSet = require('../../game-app/lib/demoSet');
const towerSet = require('../../tower-defense-app/lib/defaultQuestions');
const { QuizRoom } = require('../lib/QuizRoom');

module.exports = function registerQuiz(io, app) {
  const nsp = io.of('/quiz');
  const rooms = new Map();
  const isPreview = socket => !config.isProd && config.isExplicitDevelopment && socket.handshake.auth?.preview === true;
  const session = socket => socket.request.session;
  const teacher = socket => session(socket)?.role === 'teacher' || isPreview(socket);
  const sameSecret = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const first = Buffer.from(a), second = Buffer.from(b);
    return first.length === second.length && timingSafeEqual(first, second);
  };

  nsp.use((socket, next) => {
    if (session(socket)?.studentId || isPreview(socket)) return next();
    next(new Error('請先登入平台。'));
  });

  app.get('/api/quiz-mode/sessions', (req, res) => {
    if (!req.session?.studentId && !(!config.isProd && config.isExplicitDevelopment && req.get('x-buio-preview') === '1')) {
      return res.status(401).json({ success: false, message: '請先登入平台。' });
    }
    res.set('Cache-Control', 'no-store').json({ success: true, sessions: [...rooms.values()]
      .filter(room => room.phase !== 'ended' && room.hostConnected)
      .map(room => ({ code: room.code, hostName: room.hostName, phase: room.phase, setTitle: room.setTitle,
        players: [...room.players.values()].filter(p => p.connected).length })) });
  });

  function broadcast(room) {
    if (room.hostConnected) nsp.to(room.hostSocket).emit('quiz:state', room.hostView());
    for (const player of room.players.values()) if (player.connected) nsp.to(player.socketId).emit('quiz:state', room.playerView(player.key));
  }

  function close(room, message = '老師已關閉房間。') {
    clearTimeout(room.questionTimer); clearTimeout(room.hostTimer); clearTimeout(room.expiryTimer);
    rooms.delete(room.code);
    nsp.to(room.code).emit('quiz:closed', { message });
    nsp.in(room.code).socketsLeave(room.code);
  }

  function endQuestion(room) {
    clearTimeout(room.questionTimer);
    if (room.endQuestion()) broadcast(room);
  }

  function expire(room) {
    clearTimeout(room.expiryTimer);
    room.expiryTimer = setTimeout(() => close(room, '課堂房間已到期。'), 2 * 60 * 60 * 1000);
    room.expiryTimer.unref?.();
  }

  function owned(socket) {
    const room = rooms.get(socket.data.code);
    if (!room || socket.data.role !== 'host' || room.hostSocket !== socket.id) throw new Error('只有老師可以操作此課堂。');
    return room;
  }

  nsp.on('connection', socket => {
    function handle(event, fn) {
      socket.on(event, async (payload, ack) => {
        if (typeof payload === 'function') { ack = payload; payload = {}; }
        if (typeof ack !== 'function') ack = () => {};
        try { ack({ ok: true, ...await fn(payload || {}) }); }
        catch (error) { ack({ ok: false, message: error.message || '操作失敗，請重試。' }); }
      });
    }

    handle('host:create', async ({ setId = 'demo', hostName, seconds, limit }) => {
      if (!teacher(socket)) throw new Error('只有老師可以建立課堂。');
      if (socket.data.creating) throw new Error('正在建立課堂，請稍候。');
      if (socket.data.code && rooms.has(socket.data.code)) throw new Error('請先關閉目前的房間。');
      socket.data.creating = true;
      try {
        let set = setId === demoSet.id ? demoSet : setId === towerSet.id ? towerSet : null;
        if (!set) {
          set = await setsRepo.getSetWithQuestions(String(setId));
          if (!set || set.createdBy !== session(socket)?.studentId) throw new Error('找不到所選題庫。');
        }
        if (!set.questions.length || set.questions.some(q => q.choices.length !== 4)) throw new Error('問答模式的每題需要四個選項。');
        if (!socket.connected) throw new Error('連線已中斷。');
        let code;
        do { code = String(100000 + Math.floor(Math.random() * 900000)); } while (rooms.has(code));
        const questionLimit = Math.min(200, Math.max(0, Math.round(Number(limit) || 0)));
        const room = new QuizRoom({ code, set, hostName: String(hostName || '老師').trim().slice(0, 30), seconds, limit: questionLimit });
        room.hostToken = randomBytes(24).toString('hex');
        room.owner = session(socket)?.studentId || null;
        room.hostSocket = socket.id;
        rooms.set(code, room);
        socket.data = { role: 'host', code };
        socket.join(code);
        expire(room);
        return { code, hostToken: room.hostToken, state: room.hostView() };
      } finally { socket.data.creating = false; }
    });

    handle('host:resume', ({ code, hostToken }) => {
      const room = rooms.get(String(code));
      if (!teacher(socket) || !room || !sameSecret(hostToken, room.hostToken)
        || (room.owner && room.owner !== session(socket)?.studentId)) throw new Error('無法恢復這個課堂。');
      if (room.hostSocket !== socket.id) {
        const previous = nsp.sockets.get(room.hostSocket);
        previous?.leave(room.code);
        previous?.emit('quiz:replaced');
      }
      clearTimeout(room.hostTimer);
      room.hostSocket = socket.id; room.hostConnected = true;
      socket.data = { role: 'host', code: room.code }; socket.join(room.code);
      if (room.phase === 'question' && Date.now() >= room.closesAt) endQuestion(room);
      broadcast(room);
      return { code: room.code, state: room.hostView() };
    });

    handle('host:next', () => {
      const room = owned(socket);
      room.startQuestion();
      expire(room);
      room.questionTimer = setTimeout(() => endQuestion(room), room.closesAt - Date.now());
      broadcast(room);
      return {};
    });
    handle('host:reveal', () => { const room = owned(socket); endQuestion(room); return {}; });
    handle('host:leaderboard', () => { const room = owned(socket); room.showLeaderboard(); broadcast(room); return {}; });
    handle('host:end', () => {
      const room = owned(socket); clearTimeout(room.questionTimer); room.finish(); broadcast(room); return {};
    });
    handle('host:close', () => { close(owned(socket)); return {}; });

    handle('player:join', ({ code, name, playerToken }) => {
      if (socket.data.role === 'host') throw new Error('老師不能使用同一連線作答。');
      const room = rooms.get(String(code || '').trim());
      if (!room) throw new Error('找不到這個課堂，請檢查房間號碼。');
      const studentId = session(socket)?.studentId;
      if (!studentId && !/^[a-zA-Z0-9-]{20,80}$/.test(String(playerToken))) throw new Error('玩家識別碼無效。');
      const key = studentId ? `student:${studentId}` : `preview:${playerToken}`;
      if (socket.data.code && socket.data.code !== room.code) {
        const old = rooms.get(socket.data.code), player = old?.players.get(socket.data.playerKey);
        if (player?.socketId === socket.id) { player.connected = false; broadcast(old); }
        socket.leave(socket.data.code);
      }
      const existing = room.players.get(key);
      const player = room.join(key, String(name || studentId || '學生').trim().slice(0, 30) || '學生');
      if (existing?.socketId && existing.socketId !== socket.id) {
        const previous = nsp.sockets.get(existing.socketId);
        previous?.leave(room.code); previous?.emit('quiz:replaced');
      }
      player.socketId = socket.id;
      socket.data = { role: 'player', code: room.code, playerKey: key }; socket.join(room.code);
      if (room.phase === 'question' && Date.now() >= room.closesAt) endQuestion(room);
      broadcast(room);
      return { state: room.playerView(key) };
    });

    handle('player:answer', ({ roundId, choice }) => {
      const room = rooms.get(socket.data.code);
      const player = room?.players.get(socket.data.playerKey);
      if (socket.data.role !== 'player' || !room || player?.socketId !== socket.id) throw new Error('請先加入課堂。');
      if (room.phase === 'question' && Date.now() >= room.closesAt) endQuestion(room);
      const complete = room.answer(player.key, roundId, choice);
      if (complete) endQuestion(room);
      else {
        nsp.to(room.hostSocket).emit('quiz:progress', { roundId: room.roundId, answered: room.answers.size, total: room.participants.size });
        nsp.to(player.socketId).emit('quiz:state', room.playerView(player.key));
      }
      return { accepted: true };
    });

    socket.on('disconnect', () => {
      const room = rooms.get(socket.data.code);
      if (!room) return;
      if (socket.data.role === 'host' && room.hostSocket === socket.id) {
        room.hostConnected = false;
        broadcast(room);
        room.hostTimer = setTimeout(() => close(room, '老師離線超時，課堂已關閉。'), 120000);
        room.hostTimer.unref?.();
      } else {
        const player = room.players.get(socket.data.playerKey);
        if (player?.socketId === socket.id) { player.connected = false; broadcast(room); }
      }
    });
  });

  io.httpServer?.once('close', () => { for (const room of rooms.values()) close(room); });
};
