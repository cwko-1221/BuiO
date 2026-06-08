module.exports = function(io, app) {
  const rooms = new Map();

  function getRoom(roomId) {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { teacherSocket: null, students: new Map(), image: null, type: 'whiteboard', locked: false, startTime: Date.now() });
    }
    return rooms.get(roomId);
  }

  function emitStudentList(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.teacherSocket) return;
    const studentList = [];
    for (const [socketId, name] of room.students) {
      studentList.push({ socketId, name });
    }
    io.to(room.teacherSocket).emit('student-list', studentList);
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
      rooms.delete(roomId);
      io.to(roomId).emit('clear-board');
      io.to(roomId).emit('error', '老師已結束課堂');
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
      console.log(`[WB] ${name} (${isTeacher ? 'Teacher' : 'Student'}) joined room: ${roomId}`);
      const room = getRoom(roomId);
      if (isTeacher) {
        room.teacherSocket = socket.id;
        if (roomType) room.type = roomType;
        emitStudentList(roomId);
      } else {
        room.students.set(socket.id, name);
        emitStudentList(roomId);
        if (room.image) socket.emit('room-image', room.image);
        if (room.locked) socket.emit('lock-board');
      }
      socket.to(roomId).emit('user-joined', { name, isTeacher });
    });

    socket.on('draw', (data) => {
      const roomId = socket.data.roomId;
      if (roomId && !socket.data.isTeacher) {
        socket.to(roomId).emit('draw', { ...data, studentId: socket.id, studentName: socket.data.name });
      }
    });

    socket.on('teacher-draw', (data) => {
      if (socket.data.isTeacher && data.studentId) {
        socket.to(data.studentId).emit('teacher-draw', data);
      }
    });

    socket.on('student-clear', () => {
      const roomId = socket.data.roomId;
      if (roomId && !socket.data.isTeacher) {
        socket.to(roomId).emit('student-clear', { studentId: socket.id, studentName: socket.data.name });
      }
    });

    socket.on('clear-board', () => {
      const roomId = socket.data.roomId;
      if (roomId) io.to(roomId).emit('clear-board');
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
      if (roomId) {
        const room = rooms.get(roomId);
        if (room) {
          if (socket.data.isTeacher) {
            room.teacherSocket = null;
          } else {
            room.students.delete(socket.id);
            emitStudentList(roomId);
          }
          if (!room.teacherSocket && room.students.size === 0) rooms.delete(roomId);
        }
        socket.to(roomId).emit('user-left', { name: socket.data.name });
      }
    });
  });
};
