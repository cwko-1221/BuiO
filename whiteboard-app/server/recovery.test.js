const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const { io: connect } = require('../client/node_modules/socket.io-client');
const register = require('./socket');
const { createStore } = require('./checkpoints');
const stroke = x => ({ color: '#111827', size: 2, points: [{ x, y: .2 }, { x: .5, y: .5 }] });
const event = (socket, name) => new Promise((resolve,reject) => {
  const timer = setTimeout(() => reject(Error('Missing '+name)), 5000);
  socket.once(name, value => { clearTimeout(timer); resolve(value); });
});
const send = (socket, data) => new Promise((resolve,reject) => socket.timeout(5000).emit('student-board-snapshot', data, (err,result) => err ? reject(err) : resolve(result)));

async function server(file) {
  const app = express(); app.use(express.json());
  app.use((req,res,next) => { req.session = { studentId: req.get('x-user') || 'T1', role: 'teacher' }; next(); });
  const http = createServer(app), io = new Server(http), clients = [];
  io.use((socket,next) => { socket.request.session = socket.handshake.auth; next(); });
  const api = register(io, app, { checkpointStore: createStore({ mode: 'json', file }), repairIntervalMs: 20 });
  await api.ready(); await new Promise(resolve => http.listen(0,'127.0.0.1',resolve));
  const url = 'http://127.0.0.1:'+http.address().port;
  async function join(id, role='student') {
    const socket = connect(url, { forceNew:true, reconnection:false, transports:['websocket'], auth:{studentId:id,role} });
    clients.push(socket); await event(socket,'connect');
    const ready = event(socket,'teacher-connection');
    socket.emit('join-room',{roomId:'lesson',isTeacher:role==='teacher'});
    return { socket, notice: await ready };
  }
  return { api, url, join, async close() { await api.flush(); clients.forEach(s=>s.disconnect()); await new Promise(resolve=>io.close(resolve)); } };
}

test('incremental checkpoints survive cold room restoration; end, clear and ownership stay authoritative', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'wb-recovery-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true})); const file=path.join(dir,'boards.json');
  let f=await server(file);
  try {
    const teacher=(await f.join('T1','teacher')).socket;
    const {socket:student,notice}=await f.join('S1');
    let packet={protocol:2,boardGeneration:notice.boardGeneration,epoch:'one',seq:1,replace:true,start:0,baseImageData:null,strokes:[stroke(.1)],shapes:[]};
    assert.equal((await send(student,packet)).success,true);
    packet={...packet,seq:2,replace:false,start:0,strokes:[stroke(.1),stroke(.3)]};
    assert.equal((await send(student,packet)).success,true);
    assert.equal((await send(student,packet)).success,true);
    assert.equal(f.api.rooms.get('lesson').studentBoards.get('student:S1').strokes.length,2);
    const clear=event(student,'clear-board'); teacher.emit('clear-board'); const cleared=await clear;
    assert.equal((await send(student,{...packet,seq:3})).needsReset,true,'old input cannot resurrect cleared ink');
    packet={...packet,boardGeneration:cleared.boardGeneration,epoch:'after-clear',seq:1,replace:true,start:0,strokes:[stroke(.7)]};
    assert.equal((await send(student,packet)).success,true);
    teacher.emit('lock-board'); await event(student,'lock-board');
    await f.close(); f=await server(file);
    assert.equal(f.api.rooms.get('lesson').locked,true);
    assert.equal(f.api.rooms.get('lesson').studentBoards.get('student:S1').strokes[0].pointData[0],.7);
    const intruder=connect(f.url,{forceNew:true,reconnection:false,auth:{studentId:'T2',role:'teacher'}});
    await event(intruder,'connect');const denied=event(intruder,'error');intruder.emit('join-room',{roomId:'lesson',isTeacher:true});
    assert.match(await denied,/自己的課堂/);intruder.disconnect();
    await f.join('T1','teacher');
    const result=await fetch(f.url+'/api/whiteboard/sessions/end',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roomId:'lesson'})});
    assert.equal(result.status,200);await f.close();f=await server(file);
    assert.equal(f.api.rooms.size,0,'an explicitly ended class cannot return after restart');
  } finally { await f.close(); }
});

test('legacy binary PNG checkpoints remain readable after a disk-backed restart', async t => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wb-png-recovery-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'boards.json');let f=await server(file);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jm1cAAAAASUVORK5CYII=','base64');
  try {
    await f.join('T1','teacher');const {socket}=await f.join('S1');
    assert.equal((await send(socket,{imageData:png,baseImageData:png,strokes:[],shapes:[]})).success,true);
    await f.close();f=await server(file);
    const restored=f.api.rooms.get('lesson').studentBoards.get('student:S1');
    assert.ok(Buffer.isBuffer(restored.imageData));assert.deepEqual(restored.imageData,png);
    assert.deepEqual(restored.baseImageData,png);
  }finally{await f.close();}
});
