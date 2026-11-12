import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { chromium, webkit } from 'playwright';
import { requestJson, startQuestionSession } from '../tower-defense-app/public/js/session-start.js';

const root = resolve(import.meta.dirname, '..');
const output = resolve(process.env.TOWER_START_QA_OUT || 'tmp/tower-defense-preparation-20261113');
mkdirSync(output, { recursive: true });
const baseline = process.argv.includes('--baseline');
const require = createRequire(import.meta.url);
const clientRequire = createRequire(resolve(root, 'whiteboard-app/client/package.json'));
const { io: connect } = clientRequire('socket.io-client');
// Import the real router/socket code behind strict local stubs. No .env, school
// database, credentials or existing JSON data are loaded by this fixture.
for (const [file, exports] of [['../config', { isProd: false }],
  ['../game-app/repositories/questionSets.repo', { pgAvailable: () => false,
    getSetWithQuestions: () => { throw new Error('Fixture must never access a school question bank'); } }]]) {
  const filename = require.resolve(file);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
const questions = require('../tower-defense-app/routes/questions');
const register = require('../tower-defense-app/server/socket');
const { rooms } = require('../tower-defense-app/lib/classrooms');
const app = express();
const policies = new Map(), responses = new Map(), attempts = new Map();
app.use(express.json());
app.use((req, _res, next) => {
  const cookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('qa-student='));
  req.session = { studentId: req.get('x-qa-student') || cookie?.slice('qa-student='.length) || 'qa-default', role: 'student' };
  next();
});
app.get('/api/auth/me', (req, res) => res.json({ student: { id: req.session.studentId, name: 'Startup QA' } }));
app.post('/api/tower-defense/session', (req, res, next) => {
  const owner = req.session.studentId, policy = policies.get(owner) || {};
  const count = (attempts.get(owner) || 0) + 1;
  attempts.set(owner, count);
  if (policy.hang) return;
  if (count <= (policy.fail || 0)) return res.status(503).json({ success: false, message: 'Temporarily unavailable' });
  const json = res.json.bind(res);
  res.json = data => {
    const saved = responses.get(owner) || []; saved.push(data); responses.set(owner, saved);
    if (policy.drop && count === 1) { res.socket.destroy(); return res; }
    if (policy.delay) { setTimeout(() => json(data), policy.delay); return res; }
    return json(data);
  };
  next();
});
app.use('/api/tower-defense', questions);
// Managed worktrees live under .codex; sendFile otherwise ignores that ancestor.
app.get(['/tower-defense', '/tower-defense/preview'], (_req, res) => res.sendFile(resolve(root, 'tower-defense-app/public/index.html'), { dotfiles: 'allow' }));
app.get('/tower-defense/teacher/preview', (_req, res) => res.sendFile(resolve(root, 'tower-defense-app/public/teacher.html'), { dotfiles: 'allow' }));
if (baseline) {
  app.get('/tower-defense/js/main.js', (_req, res) => res.type('js').send(execFileSync('git',
    ['show', 'f6d569ec:tower-defense-app/public/js/main.js'], { encoding: 'utf8' })));
}
app.use('/tower-defense', express.static(resolve(root, 'tower-defense-app/public')));
app.use('/shared', express.static(resolve(root, 'shared')));
app.get('/vendor/phaser/4.2.1/phaser.min.js', (_req, res) => res.sendFile(resolve(root, 'node_modules/phaser/dist/phaser.min.js'), { dotfiles: 'allow' }));
app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ success: false, message: error.message }));
const server = createServer(app), io = new Server(server);
io.engine.use((req,_res,next)=>{const cookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('qa-student='));const owner=req.headers['x-qa-student']||cookie?.slice(11);req.session=owner?{studentId:owner}:null;next();});
register(io, app);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const actors = [];
const socket = async (owner) => {
  const actor = connect(`${base}/tower-defense`, { transports: ['websocket'], reconnection: false, extraHeaders:owner?{'x-qa-student':owner}:{} }); actors.push(actor);
  await new Promise((resolve, reject) => { actor.once('connect', resolve); actor.once('connect_error', reject); });
  return actor;
};
const emit = (actor, event, payload) => new Promise((resolve, reject) => {
  const ack = (error, data) => error ? reject(error) : resolve(data);
  if (payload === undefined) actor.timeout(5000).emit(event, ack);
  else actor.timeout(5000).emit(event, payload, ack);
});
async function classroom() {
  const teacher = await socket(), created = await emit(teacher, 'host:create', {});
  assert.equal(created.ok, true);
  return { teacher, code: created.code };
}
async function post(owner, path, body) {
  const response = await fetch(`${base}/api/tower-defense${path}`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-qa-student': owner }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
const chromePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const reports = [];

function blockedAudio({ mode }) {
  const Native = window.AudioContext || window.webkitAudioContext || class {
    constructor() { this.destination = {}; this.currentTime = 0; }
    createGain() { return { connect() {}, gain: { value: 1, cancelScheduledValues() {}, setTargetAtTime() {} } }; }
  };
  window.__qaAudioResumeCalls = 0;
  window.AudioContext = function () {
    const context = new Native();
    Object.defineProperty(context, 'state', { get: () => 'suspended' });
    context.resume = () => {
      window.__qaAudioResumeCalls++;
      if (mode === 'reject') return Promise.reject(new Error('Audio permission denied'));
      return new Promise(() => {});
    };
    return context;
  };
}
async function student(browser, owner, room, { audio = 'pending' } = {}) {
  const context = await browser.newContext({ viewport: baseline ? { width: 1366, height: 900 } : { width: 1024, height: 700 }, hasTouch: true, isMobile: true });
  await context.addCookies([{ name: 'qa-student', value: owner, url: base }]);
  if (audio) await context.addInitScript(blockedAudio, { mode: audio });
  const page = await context.newPage();
  page.on('pageerror', error => console.error('CLIENT ERROR', owner, error.message));
  page.on('dialog', dialog => void dialog.dismiss());
  await page.goto(`${base}/tower-defense?autojoin=1&room=${room.code}`);
  try { await page.waitForSelector('#menuScreen.active'); }
  catch (error) {
    await page.screenshot({ path: resolve(output, `${owner}-join-failure.png`) });
    console.error('JOIN DIAGNOSTIC', owner, await page.evaluate(() => ({ url: location.href,
      classroom: window.__towerDefense?.classroom, screen: document.querySelector('.screen.active')?.id,
      error: document.querySelector('#joinError')?.textContent,
      scripts: [...document.scripts].map(s => s.src) })));
    throw error;
  }
  await page.locator('[data-map="starport"]').tap();
  await page.waitForFunction(() => window.__towerDefense.classroom?.phase === 'lobby');
  for (let i = 0; i < 100 && !rooms.get(room.code)?.players.get(`s:${owner}`)?.mapId; i++) await page.waitForTimeout(20);
  assert.equal(rooms.get(room.code).players.get(`s:${owner}`).mapId, 'starport');
  return { context, page };
}
async function deployed(page) {
  try { await page.waitForSelector('#gameScreen.active canvas', { timeout: 15000 }); }
  catch(error){console.error('DEPLOY DIAGNOSTIC',await page.evaluate(()=>({url:location.href,classroom:window.__towerDefense?.classroom,audio:window.__towerDefense?.audioState,lastError:window.__towerDefense?.lastError,resumes:window.__qaAudioResumeCalls,button:document.querySelector('#startCampaignBtn')?.textContent,screen:document.querySelector('.screen.active')?.id})));throw error;}
  await page.waitForFunction(() => !!window.__towerDefense.scene);
}

try {
  let permanentCalls=0,fallbackCalls=0;
  await assert.rejects(startQuestionSession(async()=>{permanentCalls++;throw Object.assign(new Error('Forbidden'),{status:403});},{},new AbortController().signal,{fallback:()=>{fallbackCalls++;}}));
  assert.equal(permanentCalls,1);assert.equal(fallbackCalls,0);
  const load=await classroom();
  const students=await Promise.all(Array.from({length:25},async(_,i)=>{
    const owner=`prepared-${i}`,player=await socket(owner);
    await emit(player,'player:join',{code:load.code,studentId:'forged-other-owner'});
    assert(rooms.get(load.code).players.has(`s:${owner}`));
    await emit(player,'player:select-map',{mapId:'starport'});
    const body={roomCode:load.code,startRequestId:`prepared-start-key-${owner}`};
    if(i>=17)policies.set(owner,{hang:true});
    return{owner,player,body};
  }));
  for(const s of students.slice(0,17)){
    const response=await post(s.owner,'/session',s.body);assert.equal(response.status,201);
    s.sessionId=response.data.sessionId;
    assert.equal((await emit(s.player,'player:prepared',{ready:true,mapId:'starport',sessionId:s.sessionId})).ok,true);
  }
  assert.equal((await emit(load.teacher,'host:start')).ok,false,'teacher must wait for the other eight iPads');
  const {socketRequest}=await import('../tower-defense-app/public/js/session-start.js');
  await Promise.all(students.slice(17).map(async s=>{
    const result=await startQuestionSession((path,opt)=>requestJson(`${base}/api/tower-defense${path}`,{method:opt.method,headers:{'content-type':'application/json','x-qa-student':s.owner},body:JSON.stringify(opt.body),signal:opt.signal},{timeoutMs:80}),s.body,new AbortController().signal,{fallback:(body,signal)=>socketRequest(s.player,'question:session',body,signal)});
    s.sessionId=result.sessionId;
    assert.equal((await emit(s.player,'player:prepared',{ready:true,mapId:'starport',sessionId:s.sessionId})).ok,true);
  }));
  const start=await emit(load.teacher,'host:start');assert.equal(start.ok,true);assert(start.startedAt>Date.now()+1000);
  for(const s of students){
    policies.delete(s.owner);const late=await post(s.owner,'/session',s.body);
    assert.equal(late.data.sessionId,s.sessionId,'late HTTP must reuse the socket session');
  }
  const outsider=await socket('outsider');await emit(outsider,'player:join',{code:load.code,studentId:students[0].owner});
  const forged=await emit(outsider,'question:session',students[0].body);
  assert.equal(forged.success,true);assert.notEqual(forged.sessionId,students[0].sessionId,'authenticated outsider cannot acquire another owner session');
  const anon=await socket();assert.equal((await emit(anon,'question:session',students[0].body)).status,401);
  reports.push({scenario:'25 protocol pupils; 8 stalled HTTP paths recover via authenticated socket before teacher starts',ready:25});
  load.teacher.emit('host:close');
  for(const [engine,type,launch]of [['chromium',chromium,chromePath?{executablePath:chromePath}:{}],['webkit',webkit,{}]]){
    const browser=await type.launch({headless:true,...launch});
    try{
      const teacherContext=await browser.newContext({viewport:{width:1280,height:800}}),teacher=await teacherContext.newPage();
      await teacher.goto(`${base}/tower-defense/teacher/preview`);
      await teacher.waitForSelector('[data-set]');await teacher.locator('[data-set]').first().click();await teacher.locator('#createClassroomBtn').click();await teacher.waitForSelector('#teacherLobby.active');
      const room={code:(await teacher.locator('#roomCode').textContent()).trim()};
      const a=await student(browser,`${engine}-a`,room,{audio:null});
      const bContext=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true});
      await bContext.addCookies([{name:'qa-student',value:`${engine}-b`,url:base}]);
      const b=await bContext.newPage();const errors=[];b.on('pageerror',e=>errors.push(e.message));
      policies.set(`${engine}-b`,{hang:true});
      await b.goto(`${base}/tower-defense?autojoin=1&room=${room.code}`);await b.waitForSelector('#menuScreen.active');
      // The second iPad's image processing never completes until explicitly released.
      await b.evaluate(()=>{
        const d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');window.__held=[];window.__hold=true;
        Object.defineProperty(HTMLImageElement.prototype,'src',{...d,set(value){if(window.__hold&&String(value).startsWith('blob:'))window.__held.push([this,value]);else d.set.call(this,value);}});
        window.__release=()=>{Object.defineProperty(HTMLImageElement.prototype,'src',d);for(const [image,url]of window.__held)d.set.call(image,url);};
      });
      await b.locator('[data-map="starport"]').tap();
      await a.page.waitForFunction(()=>!!window.__towerDefense.scene);
      await b.waitForFunction(()=>window.__held.length>0);
      assert.equal(await teacher.locator('#startClassroomBtn').isDisabled(),true);assert.equal(rooms.get(room.code).phase,'lobby');
      assert.equal(await a.page.evaluate(()=>window.__towerDefense.simulation.state.paused),true);
      await a.page.screenshot({path:resolve(output,`${engine}-ready-waiting.png`)});
      if(engine==='chromium'){
        const requestCount=attempts.get(`${engine}-b`);
        await b.evaluate(()=>{window.__hold=false;});
        await b.waitForFunction(()=>!!window.__towerDefense.scene,null,{timeout:42000});
        assert.equal(attempts.get(`${engine}-b`),requestCount,'decode recovery must preserve the bank session');
        assert(await b.evaluate(()=>window.__towerDefense.diagnostics.some(e=>e.stage==='render-timeout')));
        await b.screenshot({path:resolve(output,`${engine}-decode-timeout-recovered.png`)});
      }else{await b.evaluate(()=>window.__release());await b.waitForFunction(()=>!!window.__towerDefense.scene);}
      for(let i=0;i<100&&!rooms.get(room.code).players.get(`s:${engine}-b`).prepared;i++)await b.waitForTimeout(20);
      // Refreshing a prepared pupil invalidates readiness until the new canvas
      // renders. The existing session can be reused safely across transports.
      policies.delete(`${engine}-b`);
      await b.reload();await b.waitForFunction(()=>!!window.__towerDefense.scene);
      for(let i=0;i<100&&!rooms.get(room.code).players.get(`s:${engine}-b`).prepared;i++)await b.waitForTimeout(20);
      const before=attempts.get(`${engine}-b`);
      await teacher.waitForFunction(()=>!document.querySelector('#startClassroomBtn').disabled);
      await teacher.screenshot({path:resolve(output,`${engine}-teacher-all-ready.png`)});
      await teacher.locator('#startClassroomBtn').click();await teacher.waitForSelector('#teacherLive.active');
      await Promise.all([a.page.waitForFunction(()=>document.querySelector('#battleGate').hidden),b.waitForFunction(()=>document.querySelector('#battleGate').hidden)]);
      assert.equal(attempts.get(`${engine}-b`),before,'teacher start performs no HTTP session request');
      assert.equal(await b.evaluate(()=>window.__towerDefense.simulation.state.paused),false);
      const timing=await Promise.all([a.page,b].map(p=>p.evaluate(()=>window.__towerDefense.diagnostics.find(e=>e.stage==='battle-start')?.durationMs)));
      assert(timing.every(ms=>Number.isFinite(ms)&&ms<250),`start scheduling excessive delay: ${timing}`);
      await b.screenshot({path:resolve(output,`${engine}-started.png`)});
      // Unrestorable GPU loss pauses play and rebuilds in Canvas, preserving the simulation.
      const lost=await a.page.evaluate(()=>{const gl=window.__towerDefense.scene.game.renderer.gl;window.__loss=gl?.getExtension('WEBGL_lose_context');if(!window.__loss)return false;window.__loss.loseContext();return true;});
      if(lost){
        await a.page.waitForFunction(()=>window.__towerDefense.simulation.state.paused);
        await a.page.waitForFunction(()=>window.__towerDefense.scene?.game.renderer.type===Phaser.CANVAS,null,{timeout:15000});
        await a.page.waitForFunction(()=>!window.__towerDefense.simulation.state.paused);
        await a.page.screenshot({path:resolve(output,`${engine}-canvas-recovered.png`)});
      }
      assert.deepEqual(errors,[]);reports.push({engine,scenario:'preparation barrier; socket fallback; reload; teacher start without HTTP; GPU recovery',startLatenessMs:timing,passed:true});
      teacher.once('dialog',d=>d.accept());await teacher.locator('#endClassroomBtn').click();await a.context.close();await bContext.close();await teacherContext.close();
    }finally{await browser.close();}
  }
  writeFileSync(resolve(output,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({passed:reports.length,output,reports},null,2));
  if(process.argv.includes('--full')){
    const result=await promisify(execFile)(process.execPath,['scripts/test-tower-defense-live.mjs'],{cwd:root,env:{...process.env,TOWER_DEFENSE_BASE_URL:base},maxBuffer:1024*1024});
    console.log(result.stdout);if(result.stderr)console.error(result.stderr);
  }
}finally{
  for(const actor of actors)actor.disconnect();rooms.clear();server.closeAllConnections();await new Promise(r=>io.close(r));await new Promise(r=>server.close(r));
}
