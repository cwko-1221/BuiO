const serverI18n = require('../../shared/server-i18n');
const { randomUUID } = require('crypto');

const MAX_BUZZER_DISPLAY_COUNT = 12;
const MIN_BUZZER_DURATION_SECONDS = 10;
const MAX_BUZZER_DURATION_SECONDS = 300;

module.exports = function(io, app) {
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

  function getRoom(roomId) {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        teacherSocket: null,
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
  app.get('/api/room-type/:roomId', (req, res) => {
    const room = rooms.get(req.params.roomId);
    res.json(room ? { exists: true, type: room.type } : { exists: false, type: null });
  });

  // ========================================
  // 白板課堂 API (供 Portal 查詢)
  // ========================================
  app.get('/api/whiteboard/sessions', (req, res) => {
    const activeSessions = [];
    for (const [roomId, room] of rooms.entries()) {
      activeSessions.push({
        teacherId: roomId,
        teacherName: roomId,
        roomCode: roomId,
        startTime: room.startTime,
        active: !!room.teacherSocket
      });
    }
    res.json({ success: true, sessions: activeSessions });
  });

  app.post('/api/whiteboard/sessions/end', (req, res) => {
    const { roomId } = req.body;
    if (roomId) {
      const room = rooms.get(roomId);
      if (room?.buzzerTimer) clearTimeout(room.buzzerTimer);
      rooms.delete(roomId);
      io.to(roomId).emit('clear-board');
      notifyRoom(roomId, '老師已結束課堂');
    }
    res.json({ success: true });
  });

  io.on('connection', (socket) => {
    console.log(`[WB] User connected: ${socket.id}`);

    socket.on('join-room', ({ roomId, name, isTeacher, roomType }) => {
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.name = name;
      socket.data.isTeacher = isTeacher;
      socket.data.role = socket.request.session?.role || null;
      socket.data.studentId = socket.data.role === 'student' && socket.request.session?.studentId
        ? String(socket.request.session.studentId)
        : null;
      console.log(`[WB] ${name} (${isTeacher ? 'Teacher' : 'Student'}) joined room: ${roomId}`);
      const room = getRoom(roomId);
      if (isTeacher) {
        room.teacherSocket = socket.id;
        if (roomType) room.type = roomType;
        if (room.image) socket.emit('room-image', room.image);
        emitStudentList(roomId);
        emitBuzzerState(roomId);
        for (const participantKey of room.studentBoards.keys()) emitBoardSnapshotToSocket(roomId, participantKey, socket.id);
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
        if (room.locked) socket.emit('lock-board');
        emitBuzzerState(roomId);
        emitBoardSnapshot(roomId, participantKey, socket.id);
      }
      socket.to(roomId).emit('user-joined', { name, isTeacher });
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
      const isPngSnapshot = typeof data?.imageData === 'string'
        && data.imageData.startsWith('data:image/png;base64,')
        && data.imageData.length <= 5_000_000;
      if (!room || socket.data.isTeacher || !participantKey || !isPngSnapshot) return;

      const hasVectorState = Array.isArray(data.strokes)
        && (data.baseImageData === null
          || (typeof data.baseImageData === 'string'
            && data.baseImageData.startsWith('data:image/png;base64,')
            && data.baseImageData.length <= 5_000_000));
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

    socket.on('disconnect', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;

      if (socket.data.isTeacher && room.teacherSocket === socket.id) {
        // Closing the teacher tab ends the lesson: clear the room, evict
        // students, and tell anyone polling /api/whiteboard/sessions that
        // there is no active session anymore.
        clearTimeout(room.buzzerTimer);
        rooms.delete(roomId);
        io.to(roomId).emit('clear-board');
        notifyRoom(roomId, '老師已結束課堂');
        return;
      }

      const participantKey = room.studentSocketKeys.get(socket.id);
      room.studentSocketKeys.delete(socket.id);
      const participant = participantKey ? room.students.get(participantKey) : null;
      participant?.sockets.delete(socket.id);
      if (participantKey && participant && participant.sockets.size === 0) room.students.delete(participantKey);
      emitStudentList(roomId);
      if (!room.teacherSocket && room.students.size === 0) rooms.delete(roomId);
      socket.to(roomId).emit('user-left', { name: socket.data.name });
    });
  });
};
