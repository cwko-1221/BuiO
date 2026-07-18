'use strict';

// "唔好望落嚟" (Don't Look Down) — live game socket server.
// Runs on its own namespace (/game) so its events never collide with the
// whiteboard module on the default namespace.
//
// Server responsibilities:
//   - rooms keyed by 6-digit join code, hosted by a teacher socket
//   - serving questions (choices shuffled per player) and validating answers,
//     so the correct answer never reaches the client before answering
//   - awarding energy for correct answers (with streak bonus)
//   - relaying player positions to the host board and other players
//   - recording summit finishes and building the final leaderboard

const setsRepo = require('../repositories/questionSets.repo');
const demoSet = require('../lib/demoSet');

const ENERGY_BASE_GAIN = 25;      // energy per correct answer
const ENERGY_STREAK_BONUS = 5;    // extra per consecutive correct (cap below)
const ENERGY_MAX_GAIN = 45;
const POSITION_BROADCAST_MS = 20;
const HOST_POSITION_DIVISOR = 5;

const playerRoom = code => `${code}:players`;

function realtimePosition(p) {
  return {
    id: p.key, name: p.name, x: p.x, y: p.y,
    vx: Math.round((p.vx || 0) * 100) / 100,
    vy: Math.round((p.vy || 0) * 100) / 100,
    facing: p.facing || 1, animation: p.animation || 'idle',
    seq: p.stateSeq || 0, f: !!p.finishedAt
  };
}

function makeCode(existing) {
  for (let i = 0; i < 100; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (!existing.has(code)) return code;
  }
  throw new Error('無法產生房間代碼');
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = function (io, app) {
  const nsp = io.of('/game');
  const rooms = new Map(); // code -> room

  function buildLeaderboard(room) {
    const players = [...room.players.values()];
    players.sort((a, b) => {
      // Summit finishers first (by finish order), then by best height.
      if (a.finishedAt && b.finishedAt) return a.finishedAt - b.finishedAt;
      if (a.finishedAt) return -1;
      if (b.finishedAt) return 1;
      return (b.bestProgress ?? b.bestHeight) - (a.bestProgress ?? a.bestHeight);
    });
    return players.map((p, i) => ({
      rank: i + 1,
      name: p.name,
      studentId: p.studentId,
      bestProgress: Math.round((p.bestProgress ?? p.bestHeight) * 1000) / 1000,
      bestHeight: Math.round((p.bestProgress ?? p.bestHeight) * 1000) / 1000,
      altitude: Math.round((p.altitude || 0) * 10) / 10,
      finished: !!p.finishedAt,
      correct: p.correct,
      wrong: p.wrong,
      connected: p.connected,
    }));
  }

  function roster(room) {
    return [...room.players.values()]
      .filter(p => p.connected)
      .map(p => ({ name: p.name, studentId: p.studentId }));
  }

  function endGame(room, reason) {
    if (room.phase === 'ended') return;
    room.phase = 'ended';
    clearInterval(room.posTimer);
    clearTimeout(room.endTimer);
    const leaderboard = buildLeaderboard(room);
    nsp.to(room.code).emit('game:over', { reason, leaderboard });
  }

  function destroyRoom(room, message) {
    clearInterval(room.posTimer);
    clearTimeout(room.endTimer);
    rooms.delete(room.code);
    nsp.to(room.code).emit('room:closed', { message });
  }

  // Active game sessions (for portal / debugging)
  app.get('/api/game/sessions', (req, res) => {
    const sessions = [];
    for (const room of rooms.values()) {
      sessions.push({
        code: room.code,
        hostName: room.hostName,
        phase: room.phase,
        players: room.players.size,
        setTitle: room.setTitle,
      });
    }
    res.json({ success: true, sessions });
  });

  nsp.on('connection', (socket) => {

    // ---------------- Teacher: host a game ----------------
    socket.on('host:create', async ({ setId, durationSec, hostName }, ack) => {
      try {
        let set;
        if (!setId || setId === demoSet.id) {
          set = demoSet;
        } else {
          set = await setsRepo.getSetWithQuestions(setId);
          if (!set || !set.questions.length) {
            return ack?.({ ok: false, message: '題庫不存在或沒有題目。' });
          }
        }
        const code = makeCode(rooms);
        const duration = Math.min(Math.max(Number(durationSec) || 480, 120), 1800);
        const room = {
          code,
          hostSocket: socket.id,
          hostName: String(hostName || '老師').slice(0, 30),
          phase: 'lobby',                       // lobby -> playing -> ended
          seed: Math.floor(Math.random() * 2 ** 31),
          durationSec: duration,
          startedAt: null,
          endTimer: null,
          posTimer: null,
          setTitle: set.title,
          questions: set.questions,
          players: new Map(),                   // playerKey -> player state
          crumbles: new Map(),                  // object id -> next allowed trigger time
          positionTick: 0,
        };
        rooms.set(code, room);
        socket.data.role = 'host';
        socket.data.code = code;
        socket.join(code);
        ack?.({ ok: true, code, setTitle: set.title, questionCount: set.questions.length, durationSec: duration });
      } catch (e) {
        console.error('[game] host:create', e);
        ack?.({ ok: false, message: e.message || '建立房間失敗' });
      }
    });

    socket.on('host:start', (ack) => {
      const room = rooms.get(socket.data.code);
      if (!room || room.hostSocket !== socket.id || room.phase !== 'lobby') return;
      if (room.players.size === 0) return ack?.({ ok: false, message: '未有學生加入。' });
      room.phase = 'playing';
      room.startedAt = Date.now();
      nsp.to(room.code).emit('game:start', {
        seed: room.seed,
        durationSec: room.durationSec,
        startedAt: room.startedAt,
      });
      // Players receive one compact room snapshot every 20ms. This keeps a
      // 20-player room at 50 Socket.IO callbacks per client instead of
      // relaying up to 1,200 individual callbacks every second.
      room.posTimer = setInterval(() => {
        const positions=[];
        for (const p of room.players.values()) {
          // A player who joins after the round starts has not sent a world
          // position yet. Do not briefly render the placeholder (0, 0),
          // which is beside the summit on this fixed map.
          if (!p.connected || !p.stateSeq) continue;
          positions.push(realtimePosition(p));
        }
        nsp.to(playerRoom(room.code)).volatile.emit('game:positions',positions);
        // The teacher board needs ranking fields but not a 50Hz refresh.
        if (++room.positionTick%HOST_POSITION_DIVISOR===0) {
          const hostPositions=positions.map(position=>{
            const p=room.players.get(position.id);
            return {...position,
            progress: Math.round((p.bestProgress ?? p.bestHeight) * 1000) / 1000,
            h: Math.round((p.bestProgress ?? p.bestHeight) * 1000) / 1000,
            altitude: Math.round((p.altitude || 0) * 10) / 10};
          });
          nsp.to(room.hostSocket).volatile.emit('game:positions',hostPositions);
        }
      }, POSITION_BROADCAST_MS);
      room.endTimer = setTimeout(() => endGame(room, 'time'), room.durationSec * 1000);
      ack?.({ ok: true });
    });

    socket.on('host:end', () => {
      const room = rooms.get(socket.data.code);
      if (!room || room.hostSocket !== socket.id) return;
      endGame(room, 'host');
    });

    socket.on('host:close', () => {
      const room = rooms.get(socket.data.code);
      if (!room || room.hostSocket !== socket.id) return;
      destroyRoom(room, '老師已關閉房間');
    });

    // ---------------- Student: join & play ----------------
    socket.on('player:join', ({ code, name, studentId }, ack) => {
      const room = rooms.get(String(code || '').trim());
      if (!room) return ack?.({ ok: false, message: '搵唔到呢個房間，請檢查代碼。' });
      if (room.phase === 'ended') return ack?.({ ok: false, message: '遊戲已經結束。' });

      const cleanName = String(name || '').trim().slice(0, 20) || '玩家';
      // Key players by studentId when available so a page refresh reconnects
      // to the same in-game progress instead of duplicating the player.
      const key = studentId ? `s:${studentId}` : `a:${socket.id}`;
      let player = room.players.get(key);
      const isNewPlayer = !player;
      if (!player) {
        player = {
          key,
          name: cleanName,
          studentId: studentId || null,
          x: 0, y: 0,
          bestHeight: 0,
          bestProgress: 0,
          altitude: 0,
          vx: 0,
          vy: 0,
          facing: 1,
          animation: 'idle',
          checkpoint: null,
          energy: 40,
          correct: 0,
          wrong: 0,
          streak: 0,
          finishedAt: null,
          pendingQuestion: null,
          connected: true,
          socketId: socket.id,
          stateAt: Date.now(),
          stateSeq: 0,
        };
        room.players.set(key, player);
      } else {
        player.connected = true;
        player.socketId = socket.id;
        player.name = cleanName;
      }

      socket.data.role = 'player';
      socket.data.code = room.code;
      socket.data.playerKey = key;
      socket.join(room.code);
      socket.join(playerRoom(room.code));

      nsp.to(room.hostSocket).emit('lobby:roster', roster(room));
      ack?.({
        ok: true,
        playerKey: key,
        phase: room.phase,
        hostName: room.hostName,
        setTitle: room.setTitle,
        seed: room.seed,
        durationSec: room.durationSec,
        startedAt: room.startedAt,
        // Only a genuine reconnect resumes saved coordinates. A student who
        // joins an already-running room must let the client use course.start.
        resume: room.phase === 'playing' && !isNewPlayer
          ? {
              x: player.x, y: player.y, energy: player.energy,
              bestProgress: player.bestProgress ?? player.bestHeight,
              bestHeight: player.bestProgress ?? player.bestHeight,
              altitude: player.altitude || 0,
              checkpoint: player.checkpoint,
              finished: !!player.finishedAt
            }
          : null,
      });
    });

    // Serve the next question: choices shuffled per request, the correct
    // answer index is remembered server-side only.
    socket.on('player:question', (ack) => {
      const room = rooms.get(socket.data.code);
      const player = room?.players.get(socket.data.playerKey);
      if (!room || !player || room.phase !== 'playing') return ack?.({ ok: false });

      const q = room.questions[Math.floor(Math.random() * room.questions.length)];
      const order = shuffled(q.choices.map((_, i) => i));
      player.pendingQuestion = { qRef: q, order };
      ack?.({
        ok: true,
        question: q.question,
        choices: order.map(i => q.choices[i]),
      });
    });

    socket.on('player:answer', ({ choice }, ack) => {
      const room = rooms.get(socket.data.code);
      const player = room?.players.get(socket.data.playerKey);
      if (!room || !player || room.phase !== 'playing') return ack?.({ ok: false });
      const pending = player.pendingQuestion;
      if (!pending) return ack?.({ ok: false });
      player.pendingQuestion = null;

      const picked = pending.order[Number(choice)];
      const correct = picked === pending.qRef.correctIndex;
      let gain = 0;
      if (correct) {
        player.correct++;
        player.streak++;
        gain = Math.min(ENERGY_BASE_GAIN + (player.streak - 1) * ENERGY_STREAK_BONUS, ENERGY_MAX_GAIN);
        player.energy = Math.min(player.energy + gain, 100);
      } else {
        player.wrong++;
        player.streak = 0;
      }
      ack?.({
        ok: true,
        correct,
        gain,
        energy: player.energy,
        streak: player.streak,
        correctChoice: pending.order.indexOf(pending.qRef.correctIndex),
      });
    });

    // Client physics is authoritative for position (fine for a classroom);
    // the server just clamps energy to what it has granted and tracks the
    // best height for the leaderboard.
    socket.on('player:state', ({ x, y, velocityX, velocityY, energy, progress, altitude, animation, facing, height, checkpoint }) => {
      const room = rooms.get(socket.data.code);
      const player = room?.players.get(socket.data.playerKey);
      if (!room || !player || room.phase !== 'playing') return;
      const previousAnimation=player.animation;
      const previousFacing=player.facing;
      player.x = Number(x) || 0;
      player.y = Number(y) || 0;
      player.vx = Number(velocityX) || 0;
      player.vy = Number(velocityY) || 0;
      player.facing = Number(facing) < 0 ? -1 : 1;
      player.animation = ['idle','run','jump','fall','land','celebrate'].includes(animation) ? animation : 'idle';
      player.altitude = Math.max(0, Number(altitude) || 0);
      player.stateAt = Date.now();
      player.stateSeq=(player.stateSeq||0)+1;
      if (checkpoint && typeof checkpoint === 'object') player.checkpoint = checkpoint;
      const h = Math.min(Math.max(Number(progress ?? height) || 0, 0), 1);
      if (h > player.bestProgress) player.bestProgress = h;
      if (h > player.bestHeight) player.bestHeight = h;
      const e = Number(energy);
      if (Number.isFinite(e)) player.energy = Math.min(Math.max(e, 0), Math.max(player.energy, 100));
      // Jump, landing and direction changes bypass the next 20ms aggregate
      // tick. They are rare, so this improves responsiveness without turning
      // a 20-player room into hundreds of per-player events every frame.
      if (player.animation!==previousAnimation||player.facing!==previousFacing) {
        socket.to(playerRoom(room.code)).volatile.emit('game:position',realtimePosition(player));
      }
    });

    // Crumbling supports are shared room state: when one player steps on one,
    // every client sees the same fall/disappear/restore cycle. The fixed map
    // uses stable `fixed-###` ids, and the cooldown rejects duplicate contact
    // events from the same landing.
    socket.on('game:crumble', ({ id } = {}) => {
      const room = rooms.get(socket.data.code);
      if (!room || room.phase !== 'playing' || socket.data.role !== 'player') return;
      const objectId = String(id || '');
      if (!/^fixed-\d{3}$/.test(objectId)) return;
      const now = Date.now();
      if ((room.crumbles.get(objectId) || 0) > now) return;
      room.crumbles.set(objectId, now + 4790);
      nsp.to(room.code).emit('game:crumble', { id: objectId });
      setTimeout(() => {
        if ((room.crumbles.get(objectId) || 0) <= Date.now()) room.crumbles.delete(objectId);
      }, 4900);
    });

    socket.on('player:summit', (ack) => {
      const room = rooms.get(socket.data.code);
      const player = room?.players.get(socket.data.playerKey);
      if (!room || !player || room.phase !== 'playing') return ack?.({ ok: false });
      if (player.finishedAt) {
        const finished=[...room.players.values()].filter(p=>p.finishedAt).sort((a,b)=>a.finishedAt-b.finishedAt);
        return ack?.({ok:true,place:finished.indexOf(player)+1,leaderboard:buildLeaderboard(room)});
      }
      player.finishedAt = Date.now();
      player.bestHeight = 1;
      player.bestProgress = 1;
      const place = [...room.players.values()].filter(p => p.finishedAt).length;
      nsp.to(room.code).emit('game:summit', { name: player.name, place });
      // Finishing is individual. The room remains playable until the teacher
      // ends it or the timer expires, even if all connected students finish.
      ack?.({ok:true,place,leaderboard:buildLeaderboard(room)});
    });

    // ---------------- Disconnects ----------------
    socket.on('disconnect', () => {
      const room = rooms.get(socket.data.code);
      if (!room) return;

      if (socket.data.role === 'host' && room.hostSocket === socket.id) {
        // Teacher tab closed = session over, same policy as the whiteboard.
        destroyRoom(room, '老師已離開，遊戲結束');
        return;
      }

      const player = room.players.get(socket.data.playerKey);
      if (player && player.socketId === socket.id) {
        player.connected = false;
        if (room.phase === 'lobby') room.players.delete(socket.data.playerKey);
        nsp.to(room.hostSocket).emit('lobby:roster', roster(room));
      }
    });
  });
};
