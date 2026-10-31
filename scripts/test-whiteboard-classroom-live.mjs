import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const express = require('express');
const { Server } = require('socket.io');
const { chromium, webkit } = require('playwright');
const { io: connect } = createRequire(path.join(root, 'whiteboard-app/client/package.json'))('socket.io-client');
const register = require('../whiteboard-app/server/socket');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label, timeout = 10000) {
    const started = Date.now();
    while (!await predicate()) {
        if (Date.now() - started > timeout) throw Error(`Timed out: ${label}`);
        await sleep(30);
    }
}

const app = express();
app.use(express.json());
const identify = (req, _res, next) => {
    const id = /(?:^|;\s*)qa=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    req.session = id ? { studentId: id, studentName: id, role: id === 'T1' ? 'teacher' : 'student' } : null;
    next();
};
app.use(identify);
app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/pet/teacher/roster', (_req, res) => res.json({ students: [] }));
const server = createServer(app);
const io = new Server(server, { perMessageDeflate: { threshold: 512 }, maxHttpBufferSize: 10 * 1024 * 1024, pingInterval: 4000, pingTimeout: 20000 });
io.engine.use(identify);
// The socket suite verifies the 120-second production default. Shorten it only
// in this fixture so real browser close/reload tests finish promptly.
const reconnectGraceMs = 4000;
let explicitEndRequests = 0;
app.use('/api/whiteboard/sessions/end', (_req, _res, next) => { explicitEndRequests++; next(); });
const whiteboard = register(io, app, { checkpointStore: null, teacherReconnectGraceMs: reconnectGraceMs,
    rosterProvider: async () => ({ students: [], classes: [], academicYear: '2026-2027' }) });
const stats = new Map();
let suppressAck = false;
io.on('connection', socket => {
    const id = socket.request.session.studentId;
    if (!stats.has(id)) stats.set(id, { joins: 0, snapshots: 0, draws: 0, last: null });
    socket.use((packet, next) => {
        if (packet[0] === 'student-board-snapshot' && suppressAck && id === 'QA') packet[2] = () => {};
        next();
    });
    socket.onAny((event, data) => {
        const row = stats.get(id);
        if (event === 'join-room') row.joins++;
        if (event === 'draw') row.draws++;
        if (event === 'student-board-snapshot') { row.snapshots++; row.wireBytes = (row.wireBytes || 0) + JSON.stringify(data).length; queueMicrotask(() => { row.last = whiteboard.rooms.get(socket.data.roomId)?.studentBoards.get('student:'+id); }); }
    });
});
app.use('/shared', express.static(path.join(root, 'shared'), { dotfiles: 'allow' }));
app.use('/whiteboard', express.static(path.join(root, 'whiteboard-app/client/dist'), { dotfiles: 'allow' }));
app.use('/whiteboard', (_req, res) => res.sendFile(path.join(root, 'whiteboard-app/client/dist/index.html'), { dotfiles: 'allow' }));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const out = path.join(root, 'tmp/whiteboard-classroom');
await fs.mkdir(out, { recursive: true });
const results = [];

async function ink(page, strokes, offset = 0) {
    await page.evaluate(async ({ strokes, offset }) => {
        const canvas = document.querySelector('canvas[class*="_canvas_"]');
        const rect = canvas.getBoundingClientRect();
        for (let stroke = 0; stroke < strokes; stroke++) {
            const y = rect.top + (0.12 + ((stroke + offset) % 28) * 0.025) * rect.height;
            const point = (type, x, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
                bubbles: true, cancelable: true, pointerId: 1, pointerType: 'pen', isPrimary: true,
                buttons, clientX: rect.left + x * rect.width, clientY: y,
            }));
            point('pointerdown', 0.1, 1);
            for (let p = 1; p <= 15; p++) point('pointermove', 0.1 + p * 0.035, 1);
            point('pointerup', 0.65, 0);
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }, { strokes, offset });
}
async function revealStudent(page, name) {
    const tile = page.locator('[class*="studentTile"]').filter({ hasText: name }).locator('canvas');
    await page.locator('[class*="studentTile"]').first().waitFor({timeout:12000});
    const deadline=Date.now()+12000;
    while(Date.now()<deadline) {
        if (await tile.count()) { await tile.scrollIntoViewIfNeeded(); return tile; }
        const next=page.getByRole('button',{name:'Next →',exact:true});
        const previous=page.getByRole('button',{name:'← Previous',exact:true});
        if(await next.count() && await next.isEnabled()) await next.click();
        else { while(await previous.count() && await previous.isEnabled()) await previous.click(); }
        await sleep(150);
    }
    const names=await page.locator('[class*="studentTile"]').allTextContents();
    const members=[...whiteboard.rooms.values()].map(room=>({keys:[...room.students.keys()],teacher:!!room.teacherSocket}));
    throw Error('Student absent from all pages: '+name+' '+JSON.stringify({names,members}));
}
const canvasSize = page => page.locator('canvas[class*="_canvas_"]').evaluate(canvas => ({ width: canvas.width, height: canvas.height }));

try {
    for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
        stats.clear(); suppressAck = false; explicitEndRequests = 0;
        const browser = await engine.launch({ headless: true, ...(name === 'chromium' ? { channel: 'chrome' } : {}) });
        const clients = [];
        try {
            const teacherContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
            await teacherContext.addInitScript(() => {
                const originalClear = CanvasRenderingContext2D.prototype.clearRect;
                window.__visiblePaints = 0;
                CanvasRenderingContext2D.prototype.clearRect = function (...args) {
                    if (this.canvas.isConnected) window.__visiblePaints++;
                    return originalClear.apply(this,args);
                };
                const NativeImage = window.Image;
                window.Image = function (...args) {
                    const image = new NativeImage(...args);
                    Object.defineProperty(image, 'onload', { set(callback) {
                        image.addEventListener('load', event => setTimeout(() => callback.call(image, event), window.__decodeDelay || 0));
                    } });
                    return image;
                };
            });
            const studentContext = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
            await teacherContext.addCookies([{ name: 'qa', value: 'T1', url: base }]);
            await studentContext.addCookies([{ name: 'qa', value: 'QA', url: base }]);
            const teacher = await teacherContext.newPage(), student = await studentContext.newPage();
            const errors = [];
            teacher.on('pageerror', error => errors.push(error.message));
            student.on('pageerror', error => errors.push(error.message));
            const room = `load-${name}`;
            await student.addInitScript(() => { const encode=HTMLCanvasElement.prototype.toDataURL; window.__pngEncodes=0; const NativeImage=window.Image; window.Image=function(...args){const image=new NativeImage(...args);Object.defineProperty(image,'onload',{set(callback){image.addEventListener('load',event=>setTimeout(()=>callback.call(image,event),window.__studentDecodeDelay||0));}});return image;};window.Image.prototype=NativeImage.prototype; HTMLCanvasElement.prototype.toDataURL=function(...args){window.__pngEncodes++;return encode.apply(this,args);}; });
            await teacher.goto(`${base}/whiteboard/class-teacher?room=${room}`);
            await until(() => stats.get('T1')?.joins === 1, 'teacher room');
            await student.goto(`${base}/whiteboard/class-student?room=${room}&name=QA`);
            await until(() => stats.get('QA')?.joins === 1, 'student room');
            await student.locator('canvas[class*="_canvas_"]').waitFor({ state: 'visible' });
            await sleep(150);
            await ink(student, 25);
            await sleep(1800);
            assert.ok(stats.get('QA').snapshots <= 3, `coalesced 25 strokes, received ${stats.get('QA').snapshots} checkpoints`);
            await (await revealStudent(teacher,'QA')).waitFor();
            assert.ok(await teacher.locator('[class*="studentTile"]').filter({ hasText: 'QA' }).locator('canvas').evaluate(canvas => {
                const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                let ink = 0;
                for (let i = 0; i < data.length; i += 4) if (data[i] < 100 && data[i + 3] > 0) ink++;
                return ink > 100;
            }), 'teacher renders the actual saved board');

            assert.equal(await student.evaluate(() => window.__pngEncodes), 0, 'ordinary writing never encodes a full PNG');
            await sleep(250);
            const idlePaints = await teacher.evaluate(() => window.__visiblePaints);
            await sleep(500);
            assert.equal(await teacher.evaluate(() => window.__visiblePaints), idlePaints, 'idle boards do not redraw');

            // Lose the acknowledgement on a slow connection: one whole PNG is
            // allowed in flight, and the next checkpoint includes the newest ink.
            suppressAck = true;
            const before = stats.get('QA').snapshots;
            await ink(student, 8, 25);
            await until(() => stats.get('QA').snapshots > before, 'unacknowledged checkpoint');
            await ink(student, 8, 10);
            await sleep(1700);
            assert.equal(stats.get('QA').snapshots, before + 1);
            suppressAck = false;
            await until(() => stats.get('QA').snapshots > before + 1, 'latest checkpoint after lost ack');

            // Preserve new edits through transport loss instead of accepting the
            // server's older checkpoint on reconnect.
            await studentContext.setOffline(true);
            for (const socket of io.sockets.sockets.values()) if (socket.request.session.studentId === 'QA') socket.conn.close();
            await sleep(100);
            const savedBeforeOffline = stats.get('QA').snapshots;
            const strokesBeforeOffline = stats.get('QA').last.strokes.length;
            await ink(student, 5, 21);
            const offlineSize = await canvasSize(student);
            await sleep(100);
            assert.equal(stats.get('QA').snapshots, savedBeforeOffline);
            await studentContext.setOffline(false);
            await until(() => stats.get('QA').joins >= 2, 'automatic student reconnect');
            await until(() => stats.get('QA').snapshots > savedBeforeOffline, 'offline edits saved');
            // The reconnect notice changes the available canvas height. Compare
            // editable normalized strokes rather than PNG bytes at two sizes.
            assert.equal(stats.get('QA').last.strokes.length, strokesBeforeOffline + 5, 'stale server state must not replace offline ink');
            assert.ok(stats.get('QA').last.strokes.slice(-5).every(stroke => (stroke.pointData?.length / 2 || stroke.points?.length) > 10));
            console.log(JSON.stringify({ browser: name, offlineSize, onlineSize: await canvasSize(student), restoredStrokeCount: stats.get('QA').last.strokes.length }));

            // Force PNG decode to finish after newer live ink and after Clear.
            // Both cases used to let an older bitmap overwrite the teacher view.
            await teacher.evaluate(() => { window.__decodeDelay = 180; });
            const teacherSocket = [...io.sockets.sockets.values()].find(socket => socket.request.session.studentId === 'T1');
            const savedBoard = { studentId: 'student:QA', imageData: await student.locator('canvas[class*="_canvas_"]').evaluate(canvas => canvas.toDataURL('image/png')), shapes: [] };
            teacherSocket.emit('student-board-snapshot', savedBoard);
            for (const [state, x] of [['start', 0.1], ['move', 0.7], ['end', 0.75]]) {
                teacherSocket.emit('draw', { studentId: 'student:QA', state, x, y: 0.95, color: '#ff0000', size: 8 });
            }
            await sleep(500);
            const tile = teacher.locator('[class*="studentTile"]').filter({ hasText: 'QA' }).locator('canvas');
            assert.ok(await tile.evaluate(canvas => {
                const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                for (let i = 0; i < data.length; i += 4) if (data[i] > 180 && data[i + 1] < 80 && data[i + 2] < 80) return true;
                return false;
            }), 'new live ink survives delayed checkpoint decode');
            teacherSocket.emit('student-board-snapshot', savedBoard);
            teacherSocket.emit('clear-board');
            await sleep(500);
            assert.equal(await tile.evaluate(canvas => {
                const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                let ink = 0;
                for (let i = 0; i < data.length; i += 4) if (data[i] < 100 && data[i + 3] > 0) ink++;
                return ink;
            }), 0, 'delayed image must not resurrect a cleared board');
            await teacher.evaluate(() => { window.__decodeDelay = 0; });
            teacherSocket.emit('student-board-snapshot', savedBoard);
            await sleep(100);

            // Add 27 real Socket.IO writers beside the browser student.
            let peerDraws = 0;
            const classErrors = [];
            for (let i = 0; i < 27; i++) {
                const client = connect(base, { forceNew: true, transports: ['websocket'], extraHeaders: { Cookie: `qa=LOAD${i}` }, reconnection: false });
                clients.push(client);
                await new Promise(resolve => client.on('connect', resolve));
                client.on('draw', () => peerDraws++);
                client.on('error', message => classErrors.push(message));
                const ready = new Promise(resolve => client.once('teacher-connection', resolve));
                client.emit('join-room', { roomId: room, isTeacher: false }); await ready;
            }
            const healthTimes = [];
            for (let tick = 0; tick < 120; tick++) {
                for (const client of clients) client.emit('draw', { x: (tick % 60) / 60, y: 0.5, state: tick % 30 === 0 ? 'start' : tick % 30 === 29 ? 'end' : 'move', color: '#111827', size: 1.5 });
                if (tick % 10 === 0) {
                    const started = performance.now();
                    assert.equal((await fetch(`${base}/health/live`)).status, 200);
                    healthTimes.push(performance.now() - started);
                }
                await sleep(16);
            }
            assert.equal(peerDraws, 0);
            assert.ok(clients.every(client => client.connected));
            assert.deepEqual(errors, []);
            await teacher.screenshot({ path: path.join(out, `${name}-teacher.png`) });
            await student.screenshot({ path: path.join(out, `${name}-student.png`) });

            // Concurrent teacher and student ink, teacher erase reconciliation,
            // and a real long drawing that triggers rare raster compaction.
            const qaTile = teacher.locator('[class*="studentTile"]').filter({ hasText: 'QA' });
            await qaTile.click();
            const zoom = teacher.locator('canvas[class*="zoomCanvas"]');
            const zr = await zoom.boundingBox();
            await teacher.mouse.move(zr.x + zr.width * .15, zr.y + zr.height * .8);
            await teacher.mouse.down();
            await ink(student, 3, 4);
            await sleep(1600);
            await teacher.mouse.move(zr.x + zr.width * .8, zr.y + zr.height * .8, { steps: 12 });
            await teacher.mouse.up();
            await until(() => stats.get('QA').last.strokes.some(stroke => stroke.color === '#ef4444' && (stroke.pointData?.length || stroke.points?.length) > 4), 'concurrent teacher ink saved');
            await teacher.screenshot({ path: path.join(out, name + '-teacher-zoom.png') });
            await teacher.getByRole('button', { name: 'Eraser', exact: true }).click();
            await teacher.mouse.move(zr.x + zr.width * .4, zr.y + zr.height * .8);
            await teacher.mouse.down();
            await teacher.mouse.move(zr.x + zr.width * .6, zr.y + zr.height * .8, { steps: 8 });
            await teacher.mouse.up();
            await until(() => typeof whiteboard.rooms.get(room).studentBoards.get('student:QA')?.baseImageData === 'string', 'teacher erase reconciled');
            await teacher.locator('[class*="closeZoomBtn"]').click();
            await sleep(300);
            const encodesBefore = await student.evaluate(() => window.__pngEncodes);
            await ink(student, 450, 5);
            await until(async () => await student.evaluate(() => window.__pngEncodes) > encodesBefore, 'long drawing compacted');
            await until(() => stats.get('QA').last?.protocol === 2 && stats.get('QA').last.strokes.length < 400, 'compacted vectors acknowledged');
            await teacher.getByRole('button', { name: 'Next →', exact: true }).click();
            await teacher.screenshot({ path: path.join(out, name + '-second-page.png') });
            await teacher.getByRole('button', { name: '← Previous', exact: true }).click();

            // Clear also invalidates an already-decoding teacher erase bitmap.
            await student.evaluate(() => { window.__studentDecodeDelay = 250; });
            const studentSocket=[...io.sockets.sockets.values()].find(socket=>socket.request.session.studentId==='QA');
            const currentRoom=whiteboard.rooms.get(room);
            studentSocket.emit('teacher-board-sync',{imageData:savedBoard.imageData,boardGeneration:currentRoom.boardEpochs.get('student:QA')||currentRoom.boardGeneration});
            await teacher.getByRole('button',{name:'Clear All',exact:true}).click();
            await sleep(500);
            assert.equal(await student.locator('canvas[class*="_canvas_"]').evaluate(canvas=>{const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n;}),0,'late teacher bitmap cannot restore cleared student ink');
            await student.evaluate(() => { window.__studentDecodeDelay = 0; });

            // A teacher clear made during a student's network outage must
            // supersede that student's older offline edits on rejoin.
            const joinsBeforeClear = stats.get('QA').joins;
            await studentContext.setOffline(true);
            for (const socket of io.sockets.sockets.values()) if (socket.request.session.studentId === 'QA') socket.conn.close();
            await ink(student, 3, 7);
            await teacher.getByRole('button', { name: 'Clear All', exact: true }).click();
            await until(() => whiteboard.rooms.get(room).studentBoards.size === 0, 'teacher clear accepted');
            await studentContext.setOffline(false);
            await until(() => stats.get('QA').joins > joinsBeforeClear, 'student rejoins after missed clear');
            await sleep(1800);
            assert.ok(!whiteboard.rooms.get(room).studentBoards.get('student:QA')?.strokes?.length, 'offline ink cannot resurrect a teacher-cleared board');
            assert.equal(await student.locator('canvas[class*="_canvas_"]').evaluate(canvas => {
                const data = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
                let pixels=0;for(let i=3;i<data.length;i+=4)if(data[i])pixels++;return pixels;
            }), 0);

            const sessions = async () => (await (await fetch(`${base}/api/whiteboard/sessions`, { headers: { Cookie: 'qa=T1' } })).json()).sessions;
            const startTime = (await sessions())[0].startTime;
            const studentJoins = stats.get('QA').joins;
            const teacherJoins = stats.get('T1').joins;

            // Teacher transport loss keeps all 28 students in the same room.
            await teacherContext.setOffline(true);
            for (const socket of io.sockets.sockets.values()) if (socket.request.session.studentId === 'T1') socket.conn.close();
            await student.getByRole('status').filter({ hasText: '老師暫時斷線' }).waitFor();
            await ink(student, 2, 2);
            await sleep(1600);
            assert.equal((await sessions())[0].startTime, startTime);
            await teacherContext.setOffline(false);
            await until(() => stats.get('T1').joins > teacherJoins, 'teacher automatically reconnects');
            await (await revealStudent(teacher,'QA')).waitFor();

            // A real browser reload emits pagehide, then rejoins before expiry.
            // Delay loading its JS to exercise a slower replacement page.
            const joinsBeforeReload = stats.get('T1').joins;
            const slowReload = async route => { await sleep(500); await route.continue(); };
            await teacherContext.route('**/whiteboard/assets/*.js', slowReload);
            await teacher.reload();
            await until(() => stats.get('T1').joins > joinsBeforeReload, 'teacher reload rejoins');
            await teacherContext.unroute('**/whiteboard/assets/*.js', slowReload);
            await sleep(reconnectGraceMs + 100);
            assert.equal(explicitEndRequests, 0, 'reload must not request explicit end');
            assert.equal((await sessions())[0].startTime, startTime);
            assert.equal(stats.get('QA').joins, studentJoins, 'student never has to leave or rejoin');
            assert.deepEqual(classErrors, []);
            assert.ok(clients.every(client => client.connected));
            await student.locator('canvas[class*="_canvas_"]').waitFor({ state: 'visible' });
            await teacher.screenshot({ path: path.join(out, `${name}-after-teacher-reload.png`) });

            // Closing without a replacement page expires the same grace period.
            const closedAt = Date.now();
            await teacher.close(); // Must work even when unload handlers are skipped.
            assert.equal(teacher.isClosed(), true);
            await until(async () => (await sessions())[0]?.teacherConnected === false, 'server detects closed teacher tab', 30000);
            const closeDetectionMs = Date.now() - closedAt;
            assert.equal((await sessions()).length, 1, 'close initially retains room for reload');
            await until(async () => (await sessions()).length === 0, 'closed tab expires', reconnectGraceMs + 3000);
            await until(() => classErrors.length === 27, 'all student peers receive real class end');
            await student.getByText('老師連線中斷超過保留時間，課堂已關閉，請重新加入新課堂', { exact: true }).waitFor();
            assert.equal(explicitEndRequests, 0);
            assert.deepEqual(errors, []);
            results.push({ browser: name, strokesCoalesced: true, singleCheckpointInFlight: true, lostAckRecovered: true,
                offlineInkPreserved: true, delayedDecodePreservesInk: true, delayedDecodeRespectsClear: true,
                teacherDisconnectRetainsClass: true, teacherReloadRetainsClass: true, closedTeacherTabExpires: true,
                closeDetectionMs,
                idleBoardsDoNotRedraw: true, ordinaryCheckpointsEncodeNoPng: true,
                concurrentTeacherStudentInk: true, teacherEraseReconciled: true, longDrawingCompacted: true, paginationPainted: true, offlineTeacherClearWins: true, delayedTeacherBitmapRespectsClear: true,
                checkpointWireBytes: stats.get('QA').wireBytes, connectedParticipants: clients.length + 2, peerDraws, maxLocalHealthMs: Math.round(Math.max(...healthTimes)), pageErrors: errors });
        } finally {
            for (const client of clients) client.disconnect();
            await browser.close();
        }
    }
    const report = { scope: 'Local real whiteboard UI and Socket.IO; Windows browsers, not physical iPads or Render CPU quota', physicalIpadSafariVerified: false, results };
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
} finally {
    await new Promise(resolve => io.close(resolve));
}
