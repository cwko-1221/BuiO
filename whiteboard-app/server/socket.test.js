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

async function fixture(t, teacherReconnectGraceMs, serverOptions = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = req.get('x-test-role') === 'anonymous' ? null : { role: req.get('x-test-role') || 'teacher', studentId: req.get('x-test-id') || 'T1' };
    next();
  });
  const server = createServer(app);
  const io = new Server(server, serverOptions);
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
    checkpointStore: null, teacherReconnectGraceMs,
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

  return { api, client, join, baseUrl };
}

test('teacher disconnect defaults to two minutes without ending the classroom immediately', async t => {
  const f = await fixture(t);
  const teacher = await f.join('teacher', 'T1');
  const student = await f.join();
  const notice = nextEvent(student, 'teacher-connection', state => state.reconnecting);
  const before = Date.now();
  teacher.io.engine.close();
  const state = await notice;
  assert.ok(state.reconnectUntil >= before + 119_000 && state.reconnectUntil <= Date.now() + 120_000);
  assert.equal((await f.api('/api/whiteboard/sessions')).sessions.length, 1);
  assert.equal(student.received.some(item => item.event === 'error'), false);
});

test('a closed teacher tab expires without relying on any browser exit notification', async t => {
  const f = await fixture(t, 200);
  const teacher = await f.join('teacher', 'T1');
  const student = await f.join();
  const offline = nextEvent(student, 'teacher-connection', state => !state.connected);
  teacher.io.engine.close();
  await offline;
  const ended = nextEvent(student, 'error');
  await delay(30);
  assert.equal((await f.api('/api/whiteboard/sessions')).sessions.length, 1);
  assert.match(await ended, /老師連線中斷超過保留時間/);
  assert.equal((await f.api('/api/whiteboard/sessions')).sessions.length, 0);
});

test('reload cancels expiry and preserves the original room and student boards', async t => {
  const f = await fixture(t, 200);
  const teacher = await f.join('teacher', 'T1');
  const student = await f.join();
  const saved = nextEvent(teacher, 'student-board-snapshot');
  student.emit('student-board-snapshot', snapshot);
  await saved;
  const original = (await f.api('/api/whiteboard/sessions')).sessions[0];
  teacher.io.engine.close();
  const resumed = await f.join('teacher', 'T1');
  await delay(250);
  const session = (await f.api('/api/whiteboard/sessions')).sessions[0];
  assert.equal(session.startTime, original.startTime);
  assert.equal(session.teacherConnected, true);
  assert.equal(resumed.received.find(item => item.event === 'student-board-snapshot').value.imageData, snapshot.imageData);
  assert.equal(student.received.some(item => ['clear-board', 'error'].includes(item.event)), false);
});

test('28 simultaneous writers send live strokes only to the teacher and restore 14 disconnected boards', async t => {
  const f = await fixture(t, 2000, { perMessageDeflate: { threshold: 512 } });
  const teacher = await f.join('teacher', 'T1');
  const students = await Promise.all(Array.from({ length: 28 }, (_, i) => f.join('student', `LOAD${i}`)));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jm1cAAAAASUVORK5CYII=', 'base64');
  const count = 120;
  const allDraws = new Promise((resolve, reject) => {
    let received = 0;
    const timeout = setTimeout(() => reject(Error('Teacher missed live points')), 5000);
    teacher.on('draw', () => { if (++received === count * 28) { clearTimeout(timeout); resolve(); } });
  });
  for (let point = 0; point < count; point++) {
    for (const student of students) student.emit('draw', { state: point === 0 ? 'start' : point === count - 1 ? 'end' : 'move', x: point / count, y: 0.5, color: '#111827', size: 1.5 });
    if (point % 8 === 0) await delay(2);
  }
  await allDraws;
  const boards = students.map((_, i) => ({ imageData: png, baseImageData: null, strokes: [{ color: '#111827', size: 3, points: [{ x: i / 28, y: 0.5 }] }], shapes: [] }));
  await Promise.all(students.map((student, i) => new Promise(resolve => student.emit('student-board-snapshot', boards[i], result => { assert.equal(result.success, true); resolve(); }))));
  await delay(50);
  assert.equal(teacher.received.filter(item => item.event === 'draw').length, count * 28);
  for (const student of students) {
    assert.equal(student.connected, true);
    assert.equal(student.received.filter(item => item.event === 'draw').length, 0, 'classmates must receive no unnecessary pen traffic');
  }
  const checkpoint = teacher.received.find(item => item.event === 'student-board-snapshot').value;
  assert.deepEqual(Object.keys(checkpoint).sort(), ['boardGeneration', 'imageData', 'liveOrder', 'shapes', 'studentId']);
  for (let i = 0; i < 14; i++) students[i].io.engine.close();
  await delay(30);
  const restored = await Promise.all(Array.from({ length: 14 }, (_, i) => f.join('student', `LOAD${i}`)));
  for (let i = 0; i < restored.length; i++) {
    const board = restored[i].received.find(item => item.event === 'student-board-snapshot').value;
    assert.deepEqual(Buffer.from(board.imageData), png);
    assert.deepEqual(board.strokes, boards[i].strokes.map(stroke => ({ ...stroke, isEraser: false })));
  }
  t.diagnostic(`${count * 28} live points delivered once each; previous room broadcast would deliver ${count * 28 * 28} copies (96.4% fewer); all 14 boards restored`);
});

test('anonymous sockets and HTTP requests cannot create or list classrooms', async t => {
  const f = await fixture(t);
  assert.equal((await f.api('/api/whiteboard/sessions',undefined,{role:'anonymous'})).status,401);
  const socket = connectSocket(f.baseUrl,{autoConnect:false,forceNew:true,reconnection:false,transports:['websocket'],auth:{}});
  t.after(()=>socket.disconnect());
  const rejected=nextEvent(socket,'connect_error');socket.connect();assert.match((await rejected).message,/登入/);
});

test('binary PNG snapshots remain lossless through teacher and student reconnects', async t => {
  const f=await fixture(t);const teacher=await f.join('teacher','T1');const student=await f.join();
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jm1cAAAAASUVORK5CYII=','base64');
  const board=nextEvent(teacher,'student-board-snapshot');student.emit('student-board-snapshot',{imageData:png,baseImageData:null,strokes:[],shapes:[]});
  assert.deepEqual(Buffer.from((await board).imageData),png);student.disconnect();
  const restored=await f.client();const received=nextEvent(restored,'student-board-snapshot');restored.emit('join-room',{roomId:'lesson',isTeacher:false});
  assert.deepEqual(Buffer.from((await received).imageData),png);
});

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
  assert.equal(resumed.received.find(item => item.event === 'student-board-snapshot').value.imageData, snapshot.imageData);
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
  assert.equal(resumed.received.find(item => item.event === 'student-board-snapshot').value.imageData, snapshot.imageData);
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


test('accepted checkpoints identify precisely which student and teacher live edits they cover', async t => {
  const f=await fixture(t,undefined,{repairIntervalMs:20});
  const teacher=await f.join('teacher','T1'),student=await f.join();
  const boardGeneration=student.received.find(item=>item.event==='teacher-connection').value.boardGeneration;
  const studentEdit=nextEvent(teacher,'draw');
  student.emit('draw',{state:'start',x:.1,y:.2,strokeId:'student-stroke',size:3,surfaceWidth:1200,surfaceHeight:900,boardGeneration});
  const live=await studentEdit;
  const packet={protocol:2,epoch:'causal-test',seq:1,replace:true,start:0,baseImageData:null,boardGeneration,
    strokes:[{id:'student-stroke',points:[{x:.1,y:.2}],size:3,color:'#111827',surfaceWidth:1200,surfaceHeight:900}],shapes:[]};
  const send=body=>new Promise((resolve,reject)=>student.timeout(2000).emit('student-board-snapshot',body,(error,result)=>error?reject(error):resolve(result)));
  const firstSnapshot=nextEvent(teacher,'student-board-snapshot');
  assert.equal((await send(packet)).success,true);
  const first=await firstSnapshot;
  assert.equal(first.liveOrder.student,live.liveOrder.order);
  assert.equal(first.strokes[0].surfaceWidth,1200);assert.equal(first.strokes[0].surfaceHeight,900);
  assert.equal(first.strokes[0].id,'student-stroke');
  const echo=nextEvent(teacher,'draw'),forward=nextEvent(student,'teacher-draw');
  teacher.emit('teacher-draw',{studentId:'student:S1',state:'start',x:.5,y:.5,eventId:'teacher-event',strokeId:'teacher-stroke',boardGeneration});
  const teacherEdit=await echo,received=await forward;
  assert.equal(teacherEdit.eventId,'teacher-event');assert.equal(received.liveOrder.order,teacherEdit.liveOrder.order);
  assert.equal(teacherEdit.liveOrder.epoch,live.liveOrder.epoch);assert.ok(teacherEdit.liveOrder.order>live.liveOrder.order);
  const reconciled=nextEvent(teacher,'student-board-snapshot',value=>value.liveOrder.teacher===teacherEdit.liveOrder.order);
  assert.equal((await send({...packet,seq:2,teacherEpoch:teacherEdit.liveOrder.epoch,teacherOrder:teacherEdit.liveOrder.order})).success,true);
  const second=await reconciled;
  assert.equal(second.liveOrder.student,live.liveOrder.order);
});

test('live edits queued before a classroom clear cannot reappear afterwards', async t => {
  const f=await fixture(t),teacher=await f.join('teacher','T1'),student=await f.join();
  const oldGeneration=student.received.find(item=>item.event==='teacher-connection').value.boardGeneration;
  const cleared=nextEvent(student,'clear-board');teacher.emit('clear-board');
  const state=await cleared;assert.notEqual(state.boardGeneration,oldGeneration);
  const delivered=nextEvent(teacher,'draw');
  student.emit('draw',{state:'start',x:.1,y:.1,strokeId:'obsolete',boardGeneration:oldGeneration});
  student.emit('draw',{state:'start',x:.2,y:.2,strokeId:'current',boardGeneration:state.boardGeneration});
  assert.equal((await delivered).strokeId,'current');
  assert.equal(teacher.received.filter(item=>item.event==='draw'&&item.value.strokeId==='obsolete').length,0);
});


test('legacy teacher gestures are forwarded without being echoed back as student ink', async t => {
  const f=await fixture(t),teacher=await f.join('teacher','T1'),student=await f.join();
  const forwarded=nextEvent(student,'teacher-draw');
  teacher.emit('teacher-draw',{studentId:'student:S1',state:'start',x:.1,y:.1,strokeId:'legacy-teacher'});
  assert.equal((await forwarded).strokeId,'legacy-teacher');
  const barrier=nextEvent(teacher,'draw');
  student.emit('draw',{state:'start',x:.2,y:.2,strokeId:'ordering-barrier'});
  assert.equal((await barrier).strokeId,'ordering-barrier');
  assert.equal(teacher.received.filter(item=>item.event==='draw'&&item.value.strokeId==='legacy-teacher').length,0);
});
