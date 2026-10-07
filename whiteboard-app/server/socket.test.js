const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { EventEmitter } = require('node:events');
const express = require('express');
const { Server } = require('socket.io');
const { io: connectSocket } = require('../client/node_modules/socket.io-client');
const registerWhiteboard = require('./socket');

function nextEvent(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 2000);
    function listener(value) {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(value);
    }
    socket.on(event, listener);
  });
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(t, teacherReconnectGraceMs = 2000) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { role: req.get('x-test-role') || 'teacher', studentId: req.get('x-test-id') || 'T1' };
    next();
  });
  const server = createServer(app);
  const io = new Server(server);
  // Use test identities only; production obtains these from signed sessions.
  io.use((socket, next) => {
    socket.request.session = socket.handshake.auth;
    next();
  });
  const students = [
    { studentId: 'S1', name: 'One', className: 'P1', chineseGroup: 'A', englishGroup: 'B', mathGroup: 'C' },
    { studentId: 'S2', name: 'Two', className: 'P1', chineseGroup: 'B', englishGroup: 'A', mathGroup: 'C' },
    { studentId: 'S3', name: 'Three', className: 'P2', chineseGroup: 'A', englishGroup: 'B', mathGroup: 'A' },
  ];
  registerWhiteboard(io, app, {
    teacherReconnectGraceMs,
    rosterProvider: async () => ({ academicYear: '2026-2027', students, classes: ['P1', 'P2'] }),
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  const api = async (path, body, { role = 'teacher', studentId = 'T1', method = body === undefined ? 'GET' : 'POST' } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method, headers: { 'Content-Type': 'application/json', 'x-test-role': role, 'x-test-id': studentId },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { ...await response.json(), status: response.status };
  };

  t.after(async () => {
    const { sessions } = await api('/api/whiteboard/sessions');
    for (const session of sessions) await api('/api/whiteboard/sessions/end', { roomId: session.roomCode });
    for (const client of clients) client.disconnect();
    await new Promise(resolve => io.close(resolve));
  });

  async function client(role = 'student', studentId = 'S1') {
    const socket = connectSocket(baseUrl, {
      autoConnect: false,
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
      auth: { role, studentId },
    });
    socket.received = [];
    socket.onAny((event, value) => socket.received.push({ event, value }));
    clients.push(socket);
    const connected = nextEvent(socket, 'connect');
    socket.connect();
    await connected;
    return socket;
  }

  async function join(role = 'student', studentId = 'S1', audienceRules) {
    const socket = await client(role, studentId);
    const ready = nextEvent(socket, 'teacher-connection');
    socket.emit('join-room', { roomId: 'lesson', name: studentId, isTeacher: role === 'teacher', roomType: 'class', audienceRules });
    await ready;
    return socket;
  }

  return { api, client, join };
}

const snapshot = {
  imageData: 'data:image/png;base64,AAAA',
  baseImageData: null,
  shapes: [],
  strokes: [{ color: '#111827', size: 3, isEraser: false, points: [{ x: 0.25, y: 0.5 }] }],
};

test('teacher transport loss preserves the room, boards, image, lock and buzzer on reconnect', async t => {
  const f = await fixture(t);
  const teacher = await f.join('teacher', 'T1');
  const student = await f.join();
  const saved = nextEvent(teacher, 'student-board-snapshot');
  student.emit('student-board-snapshot', snapshot);
  await saved;
  const imageUploaded = nextEvent(teacher, 'image-uploaded');
  teacher.emit('upload-image', 'data:image/png;base64,lesson');
  await imageUploaded;
  const locked = nextEvent(student, 'lock-board');
  teacher.emit('lock-board');
  await locked;
  const roundStarted = nextEvent(student, 'buzzer-player-state', state => state.active);
  teacher.emit('buzzer-start', { displayCount: 3, durationSeconds: 10 });
  const round = await roundStarted;
  const submitted = nextEvent(student, 'buzzer-player-state', state => state.submitted);
  student.emit('buzzer-press');
  await submitted;

  const offline = nextEvent(student, 'teacher-connection', state => !state.connected);
  teacher.io.engine.close();
  const connection = await offline;
  assert.equal(connection.reconnecting, true);
  assert.ok(connection.reconnectUntil > Date.now());
  assert.equal(student.received.some(item => ['clear-board', 'error'].includes(item.event)), false);
  const { sessions } = await f.api('/api/whiteboard/sessions');
  assert.equal(sessions[0].active, true);
  assert.equal(sessions[0].teacherConnected, false);

  const online = nextEvent(student, 'teacher-connection', state => state.connected);
  const resumed = await f.join('teacher', 'T1');
  await online;
  assert.equal(resumed.received.find(item => item.event === 'room-image').value, 'data:image/png;base64,lesson');
  assert.deepEqual(resumed.received.find(item => item.event === 'student-board-snapshot').value.strokes, snapshot.strokes);
  const restoredRound = resumed.received.find(item => item.event === 'buzzer-teacher-state').value;
  assert.equal(restoredRound.roundId, round.roundId);
  assert.equal(restoredRound.responseCount, 1);
  assert.equal(restoredRound.responses[0].studentId, 'S1');
  // The lock response follows the room status response on the wire.
  await delay(20);
  assert.ok(resumed.received.some(item => item.event === 'lock-board'));
  assert.equal((await f.api('/api/whiteboard/sessions')).sessions[0].startTime, sessions[0].startTime);
});

test('room survives everyone disconnecting and restores the same student board', async t => {
  const f = await fixture(t);
  const teacher = await f.join('teacher', 'T1');
  const student = await f.join();
  const saved = nextEvent(teacher, 'student-board-snapshot');
  student.emit('student-board-snapshot', snapshot);
  await saved;
  const offline = nextEvent(student, 'teacher-connection', state => !state.connected);
  teacher.io.engine.close();
  await offline;
  student.io.engine.close();

  const resumedTeacher = await f.join('teacher', 'T1');
  const resumedStudent = await f.join();
  assert.deepEqual(resumedStudent.received.find(item => item.event === 'student-board-snapshot').value.strokes, snapshot.strokes);
  const roster = nextEvent(resumedTeacher, 'student-list');
  await f.join('student', 'S1');
  assert.equal((await roster).length, 1);
});

test('explicit end is immediate during reconnect and cancels the old expiry timer', async t => {
  const f = await fixture(t, 150);
  const teacher = await f.join('teacher', 'T1');
  const student = await f.join();
  const offline = nextEvent(student, 'teacher-connection', state => !state.connected);
  teacher.io.engine.close();
  await offline;
  const ended = nextEvent(student, 'error');
  await f.api('/api/whiteboard/sessions/end', { roomId: 'lesson' });
  assert.equal(await ended, '老師已結束課堂');
  assert.equal((await f.api('/api/whiteboard/sessions')).sessions.length, 0);
  const newTeacher = await f.join('teacher', 'T1');
  await delay(220);
  assert.equal((await f.api('/api/whiteboard/sessions')).sessions[0].teacherConnected, true);
  assert.equal(newTeacher.received.some(item => item.event === 'error'), false);
});

test('grace expiry reports a network timeout, and a late student cannot recreate the room', async t => {
  const f = await fixture(t, 100);
  const teacher = await f.join('teacher', 'T1');
  const student = await f.join();
  const expired = nextEvent(student, 'error');
  teacher.io.engine.close();
  assert.match(await expired, /老師連線中斷超過保留時間/);
  assert.equal((await f.api('/api/whiteboard/sessions')).sessions.length, 0);
  const lateStudent = await f.client();
  const rejected = nextEvent(lateStudent, 'error');
  lateStudent.emit('join-room', { roomId: 'lesson', name: 'S1', isTeacher: false });
  assert.equal(await rejected, '老師尚未開啟課堂，或課堂已關閉');
  assert.equal((await f.api('/api/whiteboard/sessions')).sessions.length, 0);
});

test('a replaced teacher socket disconnecting does not interrupt the current teacher', async t => {
  const f = await fixture(t, 100);
  const oldTeacher = await f.join('teacher', 'T1');
  await f.join('teacher', 'T1');
  const student = await f.join();
  oldTeacher.io.engine.close();
  await delay(150);
  assert.equal((await f.api('/api/whiteboard/sessions')).sessions[0].teacherConnected, true);
  assert.equal(student.received.some(item => item.event === 'error' || (item.event === 'teacher-connection' && !item.value.connected)), false);
});

test('25 concurrent students remain in the same classroom while the teacher reconnects', async t => {
  const f = await fixture(t);
  const teacher = await f.join('teacher', 'T1');
  const students = await Promise.all(Array.from({ length: 25 }, (_, i) => f.join('student', `S${i + 1}`)));
  const offline = nextEvent(students[0], 'teacher-connection', state => !state.connected);
  teacher.io.engine.close();
  await offline;
  const resumedTeacher = await f.join('teacher', 'T1');
  assert.equal(resumedTeacher.received.find(item => item.event === 'student-list').value.length, 25);
  for (const student of students) {
    assert.equal(student.connected, true);
    assert.equal(student.received.some(item => ['error', 'clear-board'].includes(item.event)), false);
  }
});

test('connection notices distinguish local reconnect from teacher reconnect and detach on cleanup', async () => {
  const { watchRoomConnection } = await import('../client/src/utils/roomConnection.js');
  const socket = new EventEmitter();
  const statuses = [];
  const stop = watchRoomConnection(socket, status => statuses.push(status));
  socket.emit('connect');
  socket.emit('teacher-connection', { connected: true, reconnecting: false });
  socket.emit('teacher-connection', { connected: false, reconnecting: true });
  socket.emit('disconnect');
  socket.emit('connect');
  socket.emit('teacher-connection', { connected: true, reconnecting: false });
  assert.deepEqual(statuses, ['connecting', 'connecting', 'connected', 'teacher-reconnecting', 'reconnecting', 'connecting', 'connected']);
  stop();
  assert.equal(socket.eventNames().length, 0);
});

test('whiteboard audience filters the portal and direct joins using the authenticated student account', async t => {
  const f = await fixture(t);
  const rules = [
    { classNames: ['P1'], groupField: 'chineseGroup', groupNames: ['A'] },
    { classNames: ['P2'], groupField: 'englishGroup', groupNames: ['B'] },
  ];
  await f.join('teacher', 'T1', rules);
  for (const id of ['S1', 'S3']) {
    assert.equal((await f.api('/api/whiteboard/sessions', undefined, { role: 'student', studentId: id })).sessions.length, 1);
    await f.join('student', id);
  }
  assert.equal((await f.api('/api/whiteboard/sessions', undefined, { role: 'student', studentId: 'S2' })).sessions.length, 0);
  assert.equal((await f.api('/api/room-type/lesson', undefined, { role: 'student', studentId: 'S2' })).exists, false);
  const outsider = await f.client('student', 'S2');
  const rejected = nextEvent(outsider, 'error');
  outsider.emit('join-room', { roomId: 'lesson', name: 'S1', isTeacher: false });
  assert.equal(await rejected, '你不屬於這個課堂。');
  const spoofRejected = nextEvent(outsider, 'error');
  outsider.emit('join-room', { roomId: 'lesson', name: 'Teacher', isTeacher: true });
  assert.equal(await spoofRejected, '只可設定自己的課堂。');
});

test('visibility changes apply immediately and survive teacher reconnect; clearing them restores public access', async t => {
  const f = await fixture(t);
  const teacher = await f.join('teacher', 'T1');
  const student = await f.join('student', 'S1');
  const outsider = await f.join('student', 'S2');
  const saved = nextEvent(teacher, 'student-board-snapshot');
  student.emit('student-board-snapshot', snapshot);
  await saved;
  const excluded = nextEvent(outsider, 'error');
  const rules = [{ classNames: ['P1'], groupField: 'chineseGroup', groupNames: ['A'] }];
  const applied = await f.api('/api/whiteboard/sessions/lesson/audience', { audienceRules: rules }, { method: 'PUT' });
  assert.equal(applied.status, 200);
  assert.equal(await excluded, '你不屬於這個課堂。');
  const offline = nextEvent(student, 'teacher-connection', state => !state.connected);
  teacher.io.engine.close();
  await offline;
  const resumed = await f.join('teacher', 'T1', []);
  await delay(20);
  assert.deepEqual(resumed.received.find(item => item.event === 'room-audience').value.audienceRules, rules);
  assert.deepEqual(resumed.received.find(item => item.event === 'student-board-snapshot').value.strokes, snapshot.strokes);
  assert.equal((await f.api('/api/whiteboard/sessions', undefined, { role: 'student', studentId: 'S2' })).sessions.length, 0);
  await f.api('/api/whiteboard/sessions/lesson/audience', { audienceRules: [] }, { method: 'PUT' });
  assert.equal((await f.api('/api/whiteboard/sessions', undefined, { role: 'student', studentId: 'S2' })).sessions.length, 1);
  await f.join('student', 'S2');
});

test('only the owner can edit or end a school classroom; malformed settings do not open access', async t => {
  const f = await fixture(t);
  await f.join('teacher', 'T1', [{ classNames: ['P1'] }]);
  assert.equal((await f.api('/api/classroom-audience/options', undefined, { role: 'student', studentId: 'S1' })).status, 403);
  assert.equal((await f.api('/api/whiteboard/sessions/lesson/audience', { audienceRules: [] }, { method: 'PUT', studentId: 'T2' })).status, 403);
  assert.equal((await f.api('/api/whiteboard/sessions/end', { roomId: 'lesson' }, { role: 'student', studentId: 'S3' })).status, 403);
  assert.equal((await f.api('/api/whiteboard/sessions/lesson/audience', { audienceRules: [{ classNames: 'P2' }] }, { method: 'PUT' })).status, 400);
  assert.equal((await f.api('/api/whiteboard/sessions', undefined, { role: 'student', studentId: 'S3' })).sessions.length, 0);
});
