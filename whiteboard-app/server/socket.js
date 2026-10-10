const serverI18n = require('../../shared/server-i18n');
const { randomUUID } = require('crypto');
const audience = require('../../shared/classroom-audience');
const { requireAuth, requireTeacher } = require('../../math-app/middleware/auth');

const MAX_BUZZER_DISPLAY_COUNT = 12;
const MIN_BUZZER_DURATION_SECONDS = 10;
const MAX_BUZZER_DURATION_SECONDS = 300;
const TEACHER_RECONNECT_GRACE_MS = 10 * 60 * 1000;

module.exports = function(io, app, {
  teacherReconnectGraceMs = TEACHER_RECONNECT_GRACE_MS,
  rosterProvider = audience.roster,
} = {}) {
  // A room holds students who may have chosen different languages, so the
  // notice is rendered per socket rather than broadcast as one string.
  const notifyRoom = (roomId, message) => {
    for (const socket of io.sockets.adapter.rooms.get(roomId) || []) {
      const client = io.sockets.sockets.get(socket);
      if (!client) continue;
      const lang = serverI18n.resolveLang({ headers: client.handshake.headers });
      client.emit('error', lang === 'en-US' ? serverI18n.translate(message) : message);
    }
  };

  const rooms = new Map();
  app.use('/api/whiteboard', requireAuth);
  const fail = (message, status = 403) => { throw Object.assign(new Error(message), { status }); };
  const wrap = handler => async (req, res) => {
    try { await handler(req, res); }
    catch (error) { res.status(error.status || 503).json({ success: false, message: error.status ? error.message : '未能讀取課堂設定，請稍後重試。' }); }
  };

  function canSee(room, session, students = []) {
    if (!session?.studentId || !['teacher', 'student'].includes(session.role)) return false;
    if (!room.audienceRules.length || session?.role === 'teacher') return true;
    return session?.role === 'student' && audience.matchesRules(
      students.find(row => row.studentId === session.studentId), room.audienceRules,
    );
  }

  function requireOwner(room, session) {
    if (!room) fail('課堂已關閉，請重新開啟。', 404);
    if (session?.role !== 'teacher' || room.ownerId !== String(session.studentId)) fail('只可設定自己的課堂。');
  }

  function getRoom(roomId) {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        teacherSocket: null,
        ownerId: null,
        audienceRules: [],
        teacherReconnectTimer: null,
        teacherDisconnectedAt: null,
        students: new Map(), // stable participant key -> { name, studentId, sockets: Set }
        studentSocketKeys: new Map(), // socket id -> stable participant key
        studentBoards: new Map(), // stable participant key -> last saved board snapshot
        image: null,
        type: 'whiteboard',
        locked: false,
        startTime: Date.now(),
        buzzer: null,
        buzzerTimer: null,
      });
    }
    return rooms.get(roomId);
  }

  function emitTeacherConnection(roomId, target = roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    io.to(target).emit('teacher-connection', {
      connected: !!room.teacherSocket,
      reconnecting: !!room.teacherReconnectTimer,
      reconnectUntil: room.teacherDisconnectedAt === null
        ? null
        : room.teacherDisconnectedAt + teacherReconnectGraceMs,
    });
  }

  function endRoom(roomId, message) {
    const room = rooms.get(roomId);
    if (!room) return;
    clearTimeout(room.teacherReconnectTimer);
    clearTimeout(room.buzzerTimer);
    rooms.delete(roomId);
    io.to(roomId).emit('clear-board');
    notifyRoom(roomId, message);
  }

  function emitStudentList(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.teacherSocket) return;
    const studentList = [];
    for (const [participantKey, participant] of room.students) {
      studentList.push({ socketId: participantKey, name: participant.name, studentId: participant.studentId || null });
    }
    io.to(room.teacherSocket).emit('student-list', studentList);
  }

  function emitBoardSnapshot(roomId, participantKey, studentSocketId = null) {
    const room = rooms.get(roomId);
    const snapshot = room?.studentBoards.get(participantKey);
    if (!room || !snapshot) return;
    const payload = { studentId: participantKey, ...snapshot };
    if (room.teacherSocket) io.to(room.teacherSocket).emit('student-board-snapshot', payload);
    if (studentSocketId) io.to(studentSocketId).emit('student-board-snapshot', payload);
  }

  function emitBoardSnapshotToSocket(roomId, participantKey, socketId) {
    const snapshot = rooms.get(roomId)?.studentBoards.get(participantKey);
    if (snapshot) io.to(socketId).emit('student-board-snapshot', { studentId: participantKey, ...snapshot });
  }

  function normalizeBoardShapes(shapes) {
    if (!Array.isArray(shapes)) return [];
    return shapes.slice(0, 500).filter((shape) => shape && typeof shape === 'object'
      && ['triangle', 'square', 'circle', 'parallelogram', 'diamond'].includes(shape.shape)
      && typeof shape.id === 'string' && shape.id.length <= 100
      && ['startX', 'startY', 'endX', 'endY'].every((key) => Number.isFinite(shape[key]) && Math.abs(shape[key]) <= 10)
      && typeof shape.color === 'string' && /^#[\da-f]{3,8}$/i.test(shape.color)
      && Number.isFinite(shape.size) && shape.size >= 0 && shape.size <= 100)
      .map(({ id, shape, startX, startY, endX, endY, color, size }) => ({ id, shape, startX, startY, endX, endY, color, size }));
  }

  function isPngSnapshot(value) {
    if (typeof value === 'string') return value.startsWith('data:image/png;base64,') && value.length <= 5_000_000;
    return Buffer.isBuffer(value) && value.length >= 8 && value.length <= 3_750_000
      && value.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  }

  function normalizeBoardStrokes(strokes) {
    if (!Array.isArray(strokes)) return [];
    let remainingPoints = 60_000;
    const normalized = [];
    for (const stroke of strokes.slice(-2_000)) {
      if (!stroke || typeof stroke !== 'object' || !Array.isArray(stroke.points) || remainingPoints <= 0) continue;
      const points = [];
      for (const point of stroke.points) {
        if (remainingPoints <= 0) break;
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
          || Math.abs(point.x) > 10 || Math.abs(point.y) > 10) continue;
        points.push({ x: point.x, y: point.y });
        remainingPoints -= 1;
      }
      if (!points.length) continue;
      normalized.push({
        color: typeof stroke.color === 'string' && /^#[\da-f]{3,8}$/i.test(stroke.color) ? stroke.color : '#111827',
        size: Number.isFinite(stroke.size) && stroke.size > 0 && stroke.size <= 100 ? stroke.size : 3,
        isEraser: stroke.isEraser === true,
        points,
      });
    }
    return normalized;
  }

  function buzzerSummary(round) {
    if (!round) return { roundId: null, active: false, endsAt: null, displayCount: null, responseCount: 0, serverNow: Date.now() };
    return {
      roundId: round.id,
      active: round.active,
      endsAt: round.endsAt,
      durationSeconds: round.durationSeconds,
      displayCount: round.displayCount,
      responseCount: round.responses.length,
      dismissed: round.dismissed,
      serverNow: Date.now(),
    };
  }

  function emitBuzzerState(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    const summary = buzzerSummary(room.buzzer);
    io.to(roomId).emit('buzzer-update', summary);

    if (room.teacherSocket) {
      const teacher = io.sockets.sockets.get(room.teacherSocket);
      if (teacher) {
        const responses = room.buzzer?.responses.slice(0, room.buzzer.displayCount).map(response => ({
          ...response,
          verdict: room.buzzer.grades[response.socketId]?.verdict || null,
          coins: room.buzzer.grades[response.socketId]?.coins || 0,
        })) || [];
        teacher.emit('buzzer-teacher-state', {
          ...summary,
          showResults: !!room.buzzer && !room.buzzer.active && !room.buzzer.dismissed,
          submittedSocketIds: room.buzzer?.responses.map(response => response.socketId) || [],
          submittedStudentIds: room.buzzer?.responses.map(response => response.studentId).filter(Boolean) || [],
          responses,
        });
      }
    }

    for (const [participantKey, participant] of room.students) {
      const response = room.buzzer?.responses.find(item => item.socketId === participantKey);
      const grade = response ? room.buzzer.grades[response.socketId] : null;
      const submitted = !!response;
      const locked = !!room.buzzer && !room.buzzer.dismissed
        && (!room.buzzer.active || submitted);
      for (const socketId of participant.sockets) {
        io.to(socketId).emit('buzzer-player-state', {
          ...summary,
          submitted,
          locked,
          verdict: grade?.verdict || null,
          coins: grade?.coins || 0,
        });
      }
    }
  }

  function closeBuzzerRound(roomId, roundId) {
    const room = rooms.get(roomId);
    if (!room?.buzzer || room.buzzer.id !== roundId || !room.buzzer.active) return;
    room.buzzer.active = false;
    clearTimeout(room.buzzerTimer);
    room.buzzerTimer = null;
    emitBuzzerState(roomId);
  }

  // Room type lookup endpoint (used by whiteboard client)
  app.get('/api/classroom-audience/options', requireTeacher, wrap(async (_req, res) => {
    res.json({ success: true, ...await rosterProvider() });
  }));

  app.get('/api/whiteboard/sessions/:roomId/audience', requireTeacher, wrap(async (req, res) => {
    const room = rooms.get(req.params.roomId);
    requireOwner(room, req.session);
    res.json({ success: true, audienceRules: room.audienceRules, audienceLabel: audience.describeRules(room.audienceRules) });
  }));

  app.put('/api/whiteboard/sessions/:roomId/audience', requireTeacher, wrap(async (req, res) => {
    const roomId = req.params.roomId;
    const room = rooms.get(roomId);
    requireOwner(room, req.session);
    const rules = audience.normalizeRules(req.body?.audienceRules);
    const { students } = await rosterProvider();
    if (rules.length && !students.some(student => audience.matchesRules(student, rules))) fail('所選班級或組別沒有學生。', 400);
    if (rooms.get(roomId) !== room) fail('課堂已關閉，請重新開啟。', 404);
    room.audienceRules = rules;
    // Enforce the new scope for connected students too, while keeping saved
    // boards available if their accounts become eligible again later.
    for (const [key, participant] of room.students) {
      if (canSee(room, { role: 'student', studentId: participant.studentId }, students)) continue;
      for (const id of participant.sockets) {
        const client = io.sockets.sockets.get(id);
        if (client) {
          const lang = serverI18n.resolveLang({ headers: client.handshake.headers });
          client.emit('error', lang === 'en-US' ? serverI18n.translate('你不屬於這個課堂。') : '你不屬於這個課堂。');
          client.leave(roomId);
          room.studentSocketKeys.delete(id);
        }
      }
      room.students.delete(key);
    }
    emitStudentList(roomId);
    const payload = { audienceRules: rules, audienceLabel: audience.describeRules(rules) };
    if (room.teacherSocket) io.to(room.teacherSocket).emit('room-audience', payload);
    res.json({ success: true, ...payload });
  }));

  app.get('/api/room-type/:roomId', requireAuth, wrap(async (req, res) => {
    const room = rooms.get(req.params.roomId);
    const students = room?.audienceRules.length && req.session?.role === 'student' ? (await rosterProvider()).students : [];
    res.json(room && canSee(room, req.session, students) ? { exists: true, type: room.type } : { exists: false, type: null });
  }));

  // ========================================
  // 白板課堂 API (供 Portal 查詢)
  // ========================================
  async function listSessions(session) {
    const activeSessions = [];
    const needsRoster = session?.role === 'student' && [...rooms.values()].some(room => room.audienceRules.length);
    const students = needsRoster ? (await rosterProvider()).students : [];
    for (const [roomId, room] of rooms.entries()) {
      if (!canSee(room, session, students)) continue;
      activeSessions.push({
        teacherId: roomId,
        teacherName: roomId,
        roomCode: roomId,
        startTime: room.startTime,
        active: !!room.teacherSocket || !!room.teacherReconnectTimer,
        teacherConnected: !!room.teacherSocket,
        audienceLabel: audience.describeRules(room.audienceRules),
      });
    }
    return activeSessions;
  }
  app.get('/api/whiteboard/sessions', wrap(async (req, res) => {
    res.json({ success: true, sessions: await listSessions(req.session) });
  }));

  app.post('/api/whiteboard/sessions/end', requireTeacher, wrap(async (req, res) => {
    const { roomId } = req.body || {};
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) requireOwner(room, req.session);
      endRoom(roomId, '老師已結束課堂');
    }
    res.json({ success: true });
  }));

  io.use((socket, next) => {
    const session = socket.request.session;
    next(session?.studentId && ['teacher', 'student'].includes(session.role)
      ? undefined : new Error('請先登入'));
  });
  io.on('connection', (socket) => {
    console.log(`[WB] User connected: ${socket.id}`);

    socket.on('join-room', async ({ roomId, name, isTeacher, roomType, audienceRules } = {}) => {
      try {
        const session = socket.request.session || {};
        if (!session.studentId || !['teacher', 'student'].includes(session.role)) fail('請先登入。', 401);
        if (typeof roomId !== 'string' || !roomId.trim() || roomId.length > 100 || /[\x00-\x1f]/.test(roomId)) fail('課堂編號不正確。', 400);
        isTeacher = isTeacher === true;
        name = String(session.studentName || session.studentId).slice(0, 120);
        const existingRoom = rooms.get(roomId);
        if (isTeacher) {
          if (session.role !== 'teacher') fail('只可設定自己的課堂。');
          if (existingRoom?.ownerId && (session.role !== 'teacher' || existingRoom.ownerId !== String(session.studentId))) fail('只可設定自己的課堂。');
          if (!existingRoom && audienceRules !== undefined && audience.normalizeRules(audienceRules).length && session.role !== 'teacher') fail('請先以老師帳戶登入。');
        } else if (existingRoom?.audienceRules.length) {
          const { students } = await rosterProvider();
          if (rooms.get(roomId) !== existingRoom) fail('課堂已關閉，請重新開啟。', 404);
          if (!canSee(existingRoom, session, students)) fail('你不屬於這個課堂。');
        }
        // Only teachers create rooms. A student reconnecting after an actual
        // end/expiry must not silently create an empty replacement classroom.
        if (!isTeacher && !rooms.has(roomId)) {
          const lang = serverI18n.resolveLang({ headers: socket.handshake.headers });
          const message = '老師尚未開啟課堂，或課堂已關閉';
          socket.emit('error', lang === 'en-US' ? serverI18n.translate(message) : message);
          return;
        }
        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.name = name;
        socket.data.isTeacher = isTeacher;
        socket.data.role = socket.request.session?.role || null;
        socket.data.studentId = socket.data.role === 'student' && socket.request.session?.studentId
          ? String(socket.request.session.studentId)
          : null;
        console.log('[WB] Participant joined', { role: isTeacher ? 'teacher' : 'student' });
        const room = getRoom(roomId);
        if (isTeacher) {
          if (!existingRoom) room.audienceRules = audience.normalizeRules(audienceRules);
          if (session.role === 'teacher') room.ownerId = String(session.studentId);
          clearTimeout(room.teacherReconnectTimer);
          room.teacherReconnectTimer = null;
          room.teacherDisconnectedAt = null;
          room.teacherSocket = socket.id;
          if (roomType) room.type = roomType;
          if (room.image) socket.emit('room-image', room.image);
          emitStudentList(roomId);
          emitBuzzerState(roomId);
          for (const participantKey of room.studentBoards.keys()) emitBoardSnapshotToSocket(roomId, participantKey, socket.id);
          emitTeacherConnection(roomId);
          socket.emit('room-audience', { audienceRules: room.audienceRules, audienceLabel: audience.describeRules(room.audienceRules) });
        } else {
          const participantKey = socket.data.studentId ? `student:${socket.data.studentId}` : `guest:${socket.id}`;
          socket.data.studentKey = participantKey;
          let participant = room.students.get(participantKey);
          if (!participant) {
            participant = { name, studentId: socket.data.studentId, sockets: new Set() };
            room.students.set(participantKey, participant);
          } else if (name) {
            participant.name = name;
          }
          participant.sockets.add(socket.id);
          room.studentSocketKeys.set(socket.id, participantKey);
          emitStudentList(roomId);
          if (room.image) socket.emit('room-image', room.image);
          emitBuzzerState(roomId);
          emitBoardSnapshot(roomId, participantKey, socket.id);
          emitTeacherConnection(roomId, socket.id);
        }
        socket.emit(room.locked ? 'lock-board' : 'unlock-board');
        socket.to(roomId).emit('user-joined', { name, isTeacher });
      } catch (error) {
        const lang = serverI18n.resolveLang({ headers: socket.handshake.headers });
        const message = error.status ? error.message : '未能讀取課堂設定，請稍後重試。';
        socket.emit('error', lang === 'en-US' ? serverI18n.translate(message) : message);
      }
    });

    socket.on('buzzer-start', ({ displayCount, durationSeconds } = {}) => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;
      if (!socket.data.isTeacher || socket.data.role !== 'teacher' || room?.teacherSocket !== socket.id) {
        socket.emit('buzzer-error', '請以老師帳戶登入後使用搶答。');
        return;
      }
      const count = Number(displayCount);
      const duration = Number(durationSeconds);
      if (!Number.isInteger(count) || count < 1 || count > MAX_BUZZER_DISPLAY_COUNT
        || !Number.isInteger(duration) || duration < MIN_BUZZER_DURATION_SECONDS || duration > MAX_BUZZER_DURATION_SECONDS) {
        socket.emit('buzzer-error', '顯示人數須為 1–12 人，時間須為 10–300 秒。');
        return;
      }
      if (room.buzzer?.active) {
        socket.emit('buzzer-error', '目前已有一場搶答進行中。');
        return;
      }
      const now = Date.now();
      const round = {
        id: randomUUID(),
        active: true,
        startedAt: now,
        endsAt: now + duration * 1000,
        durationSeconds: duration,
        displayCount: count,
        responses: [],
        grades: {},
        dismissed: false,
      };
      room.buzzer = round;
      room.buzzerTimer = setTimeout(() => closeBuzzerRound(roomId, round.id), duration * 1000);
      emitBuzzerState(roomId);
    });

    socket.on('buzzer-press', () => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;
      const participantKey = room?.studentSocketKeys.get(socket.id);
      if (!room || socket.data.isTeacher || !participantKey) return;
      const round = room.buzzer;
      if (!round?.active || Date.now() >= round.endsAt) {
        if (round?.active) closeBuzzerRound(roomId, round.id);
        socket.emit('buzzer-error', '搶答時間已結束。');
        return;
      }
      const participant = room.students.get(participantKey);
      let response = round.responses.find(item => item.socketId === participantKey);
      if (!response) {
        response = {
          identity: participantKey,
          socketId: participantKey,
          studentId: participant?.studentId || null,
          name: participant?.name || '學生',
          rank: round.responses.length + 1,
          buzzedAt: Date.now(),
        };
        round.responses.push(response);
      }
      emitBuzzerState(roomId);
    });

    socket.on('buzzer-judge', ({ roundId, responseId, verdict, coins } = {}) => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;
      const round = room?.buzzer;
      if (!socket.data.isTeacher || socket.data.role !== 'teacher' || room?.teacherSocket !== socket.id
        || !round || round.id !== roundId || round.active) return;
      const response = round.responses.find(item => item.socketId === responseId
        && item.rank <= round.displayCount);
      if (!response || !['correct', 'wrong'].includes(verdict)) return;
      const amount = verdict === 'correct' ? Number(coins) : 0;
      if (!Number.isInteger(amount) || amount < 0 || amount > 10000) return;
      round.grades[response.socketId] = { verdict, coins: amount };
      const participant = room.students.get(response.socketId);
      for (const socketId of participant?.sockets || []) io.to(socketId).emit('buzzer-player-state', {
        ...buzzerSummary(round), submitted: true, locked: !round.dismissed, verdict, coins: amount,
      });
      emitBuzzerState(roomId);
    });

    socket.on('buzzer-dismiss', ({ roundId } = {}) => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;
      if (!socket.data.isTeacher || socket.data.role !== 'teacher' || room?.teacherSocket !== socket.id
        || !room.buzzer || room.buzzer.id !== roundId || room.buzzer.active) return;
      room.buzzer.dismissed = true;
      emitBuzzerState(roomId);
    });

    socket.on('draw', (data) => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;
      const participantKey = room?.studentSocketKeys.get(socket.id);
      if (roomId && !socket.data.isTeacher && participantKey) {
        socket.to(roomId).emit('draw', {
          ...data,
          studentId: participantKey,
          studentName: room.students.get(participantKey)?.name || socket.data.name,
        });
      }
    });

    socket.on('teacher-draw', (data) => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;
      const participant = room?.students.get(data?.studentId);
      if (!socket.data.isTeacher || room?.teacherSocket !== socket.id || !participant) return;
      for (const socketId of participant.sockets) io.to(socketId).emit('teacher-draw', data);
    });

    socket.on('teacher-board-sync', (data) => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;
      const isPngSnapshot = typeof data?.imageData === 'string'
        && data.imageData.startsWith('data:image/png;base64,')
        && data.imageData.length <= 5_000_000;
      const canSyncStudent = socket.data.isTeacher
        && room?.teacherSocket === socket.id
        && room.students.has(data?.studentId);

      if (canSyncStudent && isPngSnapshot) {
        room.studentBoards.set(data.studentId, {
          imageData: data.imageData,
          baseImageData: data.imageData,
          strokes: [],
          shapes: [],
        });
        const participant = room.students.get(data.studentId);
        for (const socketId of participant.sockets) io.to(socketId).emit('teacher-board-sync', {
          version: data.version,
          imageData: data.imageData
        });
      }
    });

    socket.on('student-board-snapshot', (data) => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;
      const participantKey = room?.studentSocketKeys.get(socket.id);
      if (!room || socket.data.isTeacher || !participantKey || !isPngSnapshot(data?.imageData)) return;

      const hasVectorState = Array.isArray(data.strokes)
        && (data.baseImageData === null
          || isPngSnapshot(data.baseImageData));
      room.studentBoards.set(participantKey, {
        imageData: data.imageData,
        baseImageData: hasVectorState ? data.baseImageData : data.imageData,
        strokes: hasVectorState ? normalizeBoardStrokes(data.strokes) : [],
        shapes: normalizeBoardShapes(data.shapes),
      });
      // Keep the teacher's offscreen board aligned with the last completed
      // student edit; other tabs restore the snapshot when they join.
      emitBoardSnapshot(roomId, participantKey);
    });

    socket.on('student-clear', () => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;
      const participantKey = room?.studentSocketKeys.get(socket.id);
      if (roomId && !socket.data.isTeacher && participantKey) {
        room.studentBoards.delete(participantKey);
        socket.to(roomId).emit('student-clear', { studentId: participantKey, studentName: socket.data.name });
      }
    });

    socket.on('clear-board', () => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;
      if (roomId && socket.data.isTeacher && room?.teacherSocket === socket.id) {
        room.studentBoards.clear();
        io.to(roomId).emit('clear-board');
      }
    });

    socket.on('lock-board', () => {
      const roomId = socket.data.roomId;
      if (roomId && socket.data.isTeacher) {
        const room = rooms.get(roomId);
        if (room) room.locked = true;
        socket.to(roomId).emit('lock-board');
      }
    });

    socket.on('unlock-board', () => {
      const roomId = socket.data.roomId;
      if (roomId && socket.data.isTeacher) {
        const room = rooms.get(roomId);
        if (room) room.locked = false;
        socket.to(roomId).emit('unlock-board');
      }
    });

    socket.on('upload-image', (imageData) => {
      const roomId = socket.data.roomId;
      if (roomId && socket.data.isTeacher) {
        const room = rooms.get(roomId);
        if (room) {
          room.image = imageData;
          socket.to(roomId).emit('room-image', imageData);
          socket.emit('image-uploaded', true);
        }
      }
    });

    socket.on('disconnect', (reason) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;

      if (socket.data.isTeacher && room.teacherSocket === socket.id) {
        // A transport timeout is not an instruction to end the lesson. Keep
        // the same room and board state while the teacher reconnects.
        room.teacherSocket = null;
        room.teacherDisconnectedAt = Date.now();
        room.teacherReconnectTimer = setTimeout(() => {
          // A replaced room or a newer teacher connection must not be expired
          // by an old socket's timer.
          if (rooms.get(roomId) !== room || room.teacherSocket) return;
          endRoom(roomId, '老師連線中斷超過保留時間，課堂已關閉，請重新加入新課堂');
        }, teacherReconnectGraceMs);
        room.teacherReconnectTimer.unref?.();
        emitTeacherConnection(roomId);
        console.log(`[WB] Teacher disconnected (${reason}); retaining room for reconnect: ${roomId}`);
        return;
      }

      const participantKey = room.studentSocketKeys.get(socket.id);
      room.studentSocketKeys.delete(socket.id);
      const participant = participantKey ? room.students.get(participantKey) : null;
      participant?.sockets.delete(socket.id);
      if (participantKey && participant && participant.sockets.size === 0) room.students.delete(participantKey);
      emitStudentList(roomId);
      if (!room.teacherSocket && !room.teacherReconnectTimer && room.students.size === 0) rooms.delete(roomId);
      socket.to(roomId).emit('user-left', { name: socket.data.name });
    });
  });
  return { listSessions };
};
