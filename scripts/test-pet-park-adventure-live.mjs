import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';
import { OBJECTS, QUESTS, interactionPoint } from '../pet-app/lib/park-world.mjs';
import {lanternHint} from '../pet-app/lib/park-leisure.mjs';
import {planGolf} from './lib/leisure-golf-planner.mjs';
import { PIPE_SOLUTION } from '../pet-app/lib/park-activities.mjs';
import { PARK_BRIDGES } from '../pet-app/lib/park-layout-v4.mjs';
const smoke = process.argv.includes('--smoke');
const build = path.resolve(process.env.PET_APP_TEST_DIST || 'pet-app/dist');
const output = path.resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) || 'artifacts/pet-playtest/adventure-v2'); await fs.mkdir(output, { recursive: true });
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-adventure-'));
process.env.BUIO_JSON_DB_FILE = path.join(temp, 'db.json'); process.env.SUPABASE_DB_URL = '';
const users = [{ studentid: 'S001', name: '小晴', classname: '5A', role: 'student' }, { studentid: 'S002', name: '阿樂', classname: '5A', role: 'student' }, { studentid: 'S003', name: '小悠', classname: '5B', role: 'student' }, { studentid: 'T001', name: '老師', role: 'teacher' }, ...Array.from({ length: 28 }, (_, i) => ({ studentid: `P${String(i + 1).padStart(3, '0')}`, name: `同學${i + 1}`, classname: '5A', role: 'student' }))].map(u => ({ ...u, language: 'zh-HK', passwordhash: bcrypt.hashSync('test', 4) }));
await fs.writeFile(process.env.BUIO_JSON_DB_FILE, JSON.stringify({ users, studentStats: [], questionLogs: [], _logId: 0 }));
const require = createRequire(import.meta.url), pets = require('../pet-app/repositories/pet.repo'), repo = require('../pet-app/repositories/park.repo'), store = require('../db/jsonStore');
const catalog = require('../pet-app/lib/catalog').catalog, wearable = catalog.wearables.find(w => w.id.startsWith('head-') && catalog.redrawnWearables?.[`starpatch-cat:1:${w.id}`]);
for (const [i, u] of users.filter(u => u.role === 'student').entries()) {
  await pets.ensureStudent(u.studentid); const data = store.load(), petId = randomUUID(), equippedWearables = !i && wearable ? [wearable.id] : [];
  data.petInstances.push({ petId, studentId: u.studentid, speciesId: i % 2 ? 'pudding-pig' : 'starpatch-cat', xp: 0, stage: 1, dailyXp: 0, dailyXpDate: '', equippedSkills: [], equippedWearables });
  for (const itemId of equippedWearables) data.petInventory.push({ studentId: u.studentid, itemId, quantity: 1 });
  Object.assign(data.petProfiles.find(p => p.studentId === u.studentid), { activePetId: petId, starterEggClaimed: true }); data.petWallets.find(w => w.studentId === u.studentid).balance = 100; store.save();
  if (u.studentid === 'S001') for (const q of QUESTS) await repo.accept(u.studentid, q.id);
  if (u.studentid === 'S002') await repo.savePosition(u.studentid, interactionPoint(OBJECTS.find(o => o.id === 'banana-game')));
}
const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const server = spawn(process.execPath, ['server.js'], { cwd: path.resolve('.'), windowsHide: true, env: { ...process.env, PORT: String(port), MOCK_AUTH: '0', NODE_ENV: 'development', PET_APP_DIST_DIR: build }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '', browser; const pages = [], contexts = [], errors = [], checks = [], metrics = {};
server.stdout.on('data', d => logs += d); server.stderr.on('data', d => logs += d);
const pass = s => { checks.push(s); console.log('✓ ' + s); };
const shot = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`) });
const ready = page => page.waitForFunction(() => window.__petPark?.client.ready && window.__petPark.scene?.actors.size && document.querySelector('[data-park-loading]')?.hidden, {}, { timeout: 35000 });
const request = (page, event, body = {}) => page.evaluate(({ event, body }) => window.__petPark.client.request(event, body), { event, body });
async function dismiss(page) {
  if (await page.locator('.park-activity-root').count()) await page.locator('[data-act="close"]').first().click();
  if (await page.locator('.park-dialog-close').count()) await page.locator('.park-dialog-close').click();
  if (await page.locator('.park-drawer header [data-park="close"]').count()) await page.locator('.park-drawer header [data-park="close"]').click();
}
async function walk(page, id, interact = true,venueMode='visit') {
  await dismiss(page); const point = interactionPoint(OBJECTS.find(o => o.id === id));
  await page.evaluate(({ id, point, interact }) => { const s = window.__petPark.scene; interact ? s.walkToObject(id) : s.walk(point.x, point.y); }, { id, point, interact });
  if (id === 'acorn-a') { await page.waitForTimeout(650); await shot(page, '04b-follow-route'); }
  await page.waitForFunction(({ x, y }) => { const p = window.__petPark?.client.frames.get('S001'); return p && !p.moving && Math.hypot(p.x - x, p.y - y) < 135; }, point, { timeout: 60000 });
  await page.waitForFunction(() => !window.__petPark.busy, {}, { timeout: 15000 });
  if(interact&&await page.locator('.park-leisure-venue').count())await page.locator('[data-venue="'+venueMode+'"]').click();
}
async function solve(page, mode, file) {
  await page.locator('.park-activity').waitFor();
  if (await page.locator(`[data-act="mode"][data-mode="${mode}"]`).count()) await page.locator(`[data-act="mode"][data-mode="${mode}"]`).click();
  await page.waitForFunction(mode => window.__petPark.activity?.challenge?.mode === mode, mode);
  if (file) await shot(page, file);
  if(mode==='maze'){
    const cells=await page.evaluate(()=>window.__petPark.activity.challenge.cells),queue=[[0]],seen=new Set([0]);let route;
    while(queue.length){const path=queue.shift(),at=path.at(-1);if(at===24){route=path;break;}for(const [i,d]of [-5,1,5,-1].entries())if(cells[at]>>i&1&&!seen.has(at+d)){seen.add(at+d);queue.push([...path,at+d]);}}
    for(const n of route.slice(1))await page.locator('[data-act="maze-cell"][data-index="'+n+'"]').click();
  }else if (mode === 'search') {
    const hint = await page.locator('.park-activity-lead b').innerText(); const hints = ['左上方', '上排中央', '右上方', '左下方', '下排中央', '右下方'];
    const index = hints.findIndex(s => hint.includes(s));
    if (file === '04d-search-retry') {
      const wrong = (index + 1) % 6; await page.locator(`[data-act="spot"][data-index="${wrong}"]`).click();
      await page.waitForFunction(() => !window.__petPark.activity.submitted);
      assert.equal(await page.locator(`[data-act="spot"][data-index="${wrong}"]`).isDisabled(), true);
      await page.locator(`[data-act="spot"][data-index="${index}"]`).click(); await page.waitForFunction(() => !window.__petPark.activity.submitted);
      assert.equal(await page.locator(`[data-act="spot"][data-index="${index}"]`).isDisabled(), false); await page.waitForTimeout(600);
    }
    await page.locator(`[data-act="spot"][data-index="${index}"]`).click();
  } else if (mode === 'water') {
    for (let i = 0; i < 3; i++) { await page.waitForFunction(() => { const a = window.__petPark.activity; return a && !a.submitted && Math.abs(a.gauge - a.challenge.targets[a.water.length]) < 5; }); await page.locator('[data-act="pour"]').click(); }
  } else if (mode === 'melody') {
    await page.waitForFunction(() => !window.__petPark.activity.listening);
    const notes = await page.evaluate(() => window.__petPark.activity.challenge.notes);
    for (const n of notes) await page.keyboard.press(String(n + 1));
  } else if (mode === 'sort') {
    const id = await page.evaluate(() => window.__petPark.activity.challenge.objectId);
    await page.locator(`[data-bin="${id === 'litter-a' ? 'paper' : id === 'litter-b' ? 'recycle' : 'compost'}"]`).click();
  } else if (mode === 'code') { await page.locator('.park-code-input input').fill('243'); assert.equal(await page.locator('.park-code-input input').inputValue(),'243'); await page.locator('[data-act="unlock"]').click(); }
  else if (mode === 'pipes') {
    for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) { if (await page.evaluate(({ i, goal }) => window.__petPark.activity.tiles[i] === goal, { i, goal: PIPE_SOLUTION[i] })) break; await page.locator(`[data-act="pipe"][data-index="${i}"]`).click(); }
    await shot(page, '09-pipes-connected'); await page.locator('[data-act="flow"]').click();
  }
  await page.locator('.park-activity-success').waitFor({ timeout: 12000 }); await dismiss(page);
}
async function pointerAt(page, x, y, touch = false) {
  const point = (x,y) => page.evaluate(({ x, y }) => { const park=window.__petPark,c=park.miniGame.scene.cameras.main,r=document.querySelector('.park-canvas canvas').getBoundingClientRect();return{x:r.x+(c.x+(x-c.worldView.x)*c.zoom)*r.width/park.game.scale.width,y:r.y+(c.y+(y-c.worldView.y)*c.zoom)*r.height/park.game.scale.height}; }, { x, y });
  if(!touch){const p=await point(x,y);return page.mouse.move(p.x,p.y);}
  const session=await page.context().newCDPSession(page),player=await page.evaluate(()=>window.__petPark.miniGame.scene.localPlayer),anchor={x:player.x,y:Math.min(690,player.y+35)};
  const start=await point(anchor.x,anchor.y),end=await point(anchor.x+x-player.x,anchor.y+y-player.y);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
}
async function playLeisure(page,kind){
  await page.waitForFunction(()=>window.__petPark.miniGame?.ready);await page.locator('[data-leisure="start"]').click();await page.waitForFunction(()=>window.__petPark.miniGame.phase==='playing');
  let previous='',held=false,lastFishingTap=0;const notes=new Set(),deadline=Date.now()+170000;
  const point=(x,y)=>page.evaluate(({x,y})=>{const m=window.__petPark.miniGame,r=document.querySelector('.park-leisure-stage canvas').getBoundingClientRect();if(m.kind==='lantern'&&r.width<600){x=(x-400)*1.3+400;y=(y-300)*1.3+300;}return{x:r.x+x/800*r.width,y:r.y+y/600*r.height};},{x,y});
  while(await page.evaluate(()=>window.__petPark.miniGame.state.status==='playing')){
    const s=await page.evaluate(()=>window.__petPark.miniGame.state),l=s.leisure;if(kind==='fishing'&&await page.locator('.fishing-catch-screen:not([hidden])').count()){await page.locator('[data-leisure="catch-next"]').click();await page.locator('.fishing-catch-screen').waitFor({state:'hidden'});continue;}if(s.paused){await page.locator('[data-leisure="resume"]').click();continue;}
    if(kind==='fishing'){
      if(['ready','caught','escaped','bite'].includes(l.phase)&&l.phase!==previous){if(held){await page.mouse.up();held=false;}await page.locator('[data-leisure="reel"]').click();}previous=l.phase;
      if(l.phase==='reeling'&&!l.surging&&l.tension<62&&Date.now()-lastFishingTap>250){lastFishingTap=Date.now();await page.locator('[data-leisure="reel"]').click();}
    }else if(kind==='rhythm'){for(const n of l.chart)if(!notes.has(n.id)&&n.at-s.t<.12&&n.at-s.t>-.16){notes.add(n.id);await page.keyboard.press(String(n.lane+1));}}
    else if(kind==='lantern'&&l.phase==='playing'){const i=lanternHint(l.tiles)[0],p=await point(270+i%3*130,180+Math.floor(i/3)*130);await page.mouse.click(p.x,p.y);await page.waitForFunction(({round,moves})=>{const l=window.__petPark.miniGame.state.leisure;return l.round!==round||l.moves>moves;},{round:l.round,moves:l.moves});}
    else if(kind==='golf'&&l.phase==='playing'&&!Math.hypot(l.ball.vx,l.ball.vy)){const plan=planGolf(s),a=await point(l.ball.x,l.ball.y),b=await point(plan.x,plan.y);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.up();await page.waitForFunction(({round,strokes})=>{const l=window.__petPark.miniGame.state.leisure;return l.round!==round||l.strokes>strokes;},{round:l.round,strokes:l.strokes});}
    if(Date.now()>deadline)throw Error(kind+' timed out');await page.waitForTimeout(60);
  }
  if(held)await page.mouse.up();if(kind==='fishing'&&await page.locator('.fishing-catch-screen:not([hidden])').count())await page.locator('[data-leisure="catch-next"]').click();assert.ok(await page.evaluate(()=>window.__petPark.miniGame.state.leisure.completed>=({fishing:2,rhythm:12,lantern:2,golf:2})[window.__petPark.miniGame.kind]));await page.locator('[data-leisure="finish"]').click();await page.locator('.park-leisure-root').waitFor({state:'detached'});
}
async function play(page, kind) {
  await page.locator('.park-mini-card').waitFor(); await shot(page, kind === 'banana' ? '11-banana-intro' : '14-flight-intro');
  await page.locator('[data-mini="start"]').click(); await page.waitForFunction(() => window.__petPark.miniGame?.phase === 'playing');
  let captured = false, bossShot = false, shields = 0; const deadline = Date.now() + 95000;
  while (await page.evaluate(() => window.__petPark.miniGame?.phase === 'playing')) {
    const s = await page.evaluate(() => window.__petPark.miniGame.state);
    if (!s) { await page.waitForTimeout(100); continue; }
    if (s.paused) { await page.locator('[data-mini="resume"]').click(); continue; }
    let target = { x: 240, y: 620 };
    if (kind === 'banana') {
      const viable = s.fruit.filter(f => f.kind !== 'acorn' && f.y < 620 && (628 - f.y) / f.vy > Math.abs(f.x - s.player.x) / 390 + .1).sort((a, b) => b.y - a.y);
      const fruit = viable[0]; if (fruit) target.x = fruit.x + (fruit.vx || 0) * (628 - fruit.y) / fruit.vy;
      const danger = s.fruit.find(f => f.kind === 'acorn' && f.y > 480 && Math.abs(f.x - target.x) < 55);
      if (danger) target.x = danger.x < 240 ? danger.x + 100 : danger.x - 100;
    } else {
      const enemy = s.enemies.find(e => e.boss) || s.enemies.filter(e => e.y > 10 && e.y < 490).sort((a, b) => Math.abs(a.x - s.player.x) - Math.abs(b.x - s.player.x))[0];
      target.x = enemy?.x || 240 + Math.sin(s.t * 1.4) * 140;
      const danger = s.sparks.filter(p => p.vy > 0).map(p => ({ ...p, impact: (620 - p.y) / p.vy })).filter(p => p.impact > 0 && p.impact < .8 && Math.abs(p.x + p.vx * p.impact - target.x) < 45)[0];
      if (danger) target.x = target.x < 240 ? target.x + 92 : target.x - 92;
      if (s.t > 19 + shields * 15 && shields < 3) { await page.keyboard.down('Space'); await page.waitForTimeout(180); await page.keyboard.up('Space'); shields++; }
      if (s.bossSpawned && !bossShot) { await shot(page, '16-flight-great-cloud'); bossShot = true; }
    }
    await pointerAt(page, Math.max(35, Math.min(445, target.x)), target.y);
    if (!captured && s.t > 8) {
      await shot(page, kind === 'banana' ? '12-banana-playing' : '15-flight-playing'); captured = true;
      if (kind === 'banana') { await page.locator('[data-mini="pause"]').click(); await page.locator('[data-mini="resume"]').waitFor(); const t = await page.evaluate(() => window.__petPark.miniGame.state.t); await page.waitForTimeout(750); assert.equal(await page.evaluate(() => window.__petPark.miniGame.state.t), t); await shot(page, '12b-game-paused'); await page.locator('[data-mini="resume"]').click(); }
    }
    if (Date.now() > deadline) throw Error('mini-game did not finish');
    await page.waitForTimeout(140);
  }
  const outcome = await page.evaluate(() => window.__petPark.miniGame.state);
  assert.ok(kind === 'banana' ? outcome.caught >= 8 : outcome.kills >= 6, JSON.stringify({ kind, score: outcome.score, caught: outcome.caught, kills: outcome.kills, lives: outcome.lives }));
  await shot(page, kind === 'banana' ? '13-banana-result' : '17-flight-result');
  const session = await page.evaluate(() => window.__petPark.miniGame.session);
  await page.locator('[data-mini="finish"]').click(); await page.locator('.park-mini-root').waitFor({ state: 'detached' });
  const state = await page.evaluate(() => window.__petPark.progress), balance = (await request(page, 'park:game:finish', { session, score: 999999 })).balance;
  assert.equal(balance, 100 + state.earned); metrics[kind] = { score: outcome.score, caught: outcome.caught, kills: outcome.kills, seconds: outcome.t, bossSeen: bossShot };
  pass(`${kind}: real pointer controls, authoritative target, result settlement and duplicate/forged score cannot add coins`);
}
try {
  const baseURL = `http://127.0.0.1:${port}`, deadline = Date.now() + 25000;
  while (true) { try { if ((await fetch(baseURL + '/health')).ok) break; } catch {} if (Date.now() > deadline) throw Error('server startup timeout'); await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [i, id] of ['S001', 'S002', 'T001'].entries()) {
    const context = await browser.newContext({ baseURL, viewport: i === 1 ? { width: 1024, height: 768 } : { width: 1440, height: 960 }, hasTouch: i === 1 }); contexts.push(context);
    assert.equal((await context.request.post('/api/auth/login', { data: { studentId: id, password: 'test' } })).status(), 200);
    const page = await context.newPage(); pages.push(page); page.on('pageerror', e => errors.push(e.stack || e.message));
    page.on('response', r => { if (r.url().includes('/pet/assets/') && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto('/pet'); if (i < 2) { await page.locator('[data-tab="park"]').click(); await ready(page); }
  }
  const [a, b, teacher] = pages;
  await a.waitForFunction(() => window.__petPark.scene.actors.size === 2); await shot(a, '01-home-loop');
  await a.locator('[data-park="map"]').click(); await shot(a, '02-loop-map'); await dismiss(a);
  await a.locator('[data-park="quests"]').first().click(); await a.locator('.park-more-quests').evaluate(e => e.open = true); assert.equal(await a.locator('.park-quest-card').count(), QUESTS.length); await shot(a, '03-twelve-requests'); await dismiss(a);
  assert.equal(await a.locator('[data-park-route]').count(), 0);
  assert.ok(await a.evaluate(() => ['park:ground:v4:0:0','park:material:grass','park:material:stone','park:material:soil','park:adventure:meadow'].every(key => window.__petPark.scene.textures.exists(key))));
  pass('native modular terrain, fourteen request cards and shared pets load without missing art or route overlay');
  if (process.argv.includes('--art-tour')) {
    const arrive = walk(a, 'bear', false);
    await a.waitForFunction(bridge => { const p = window.__petPark.client.frames.get('S001'); return Math.hypot(p.x - bridge.x - bridge.width/2, p.y - bridge.y - bridge.height/2) < 150; }, PARK_BRIDGES.find(b => b.id === 'stone'), { timeout: 30000 });
    await shot(a, '30-stone-bridge-walking'); await arrive; await dismiss(a); await shot(a, '31-fountain-plaza');
    await walk(a, 'deer', false); await dismiss(a); await shot(a, '32-botanical-garden');
    const forest = walk(a, 'squirrel', false);
    await a.waitForFunction(bridge => { const p = window.__petPark.client.frames.get('S001'); return Math.hypot(p.x - bridge.x - bridge.width/2, p.y - bridge.y - bridge.height/2) < 150; }, PARK_BRIDGES.find(b => b.id === 'wood'), { timeout: 30000 });
    await shot(a, '33-wood-bridge-walking'); await forest; await dismiss(a); await shot(a, '34-woodland');
    await a.setViewportSize({ width: 390, height: 844 }); await a.waitForTimeout(400); await shot(a, '35-phone-woodland'); await a.setViewportSize({ width: 1440, height: 960 }); await a.waitForTimeout(500);
    await a.evaluate(() => { const p = window.__petPark, c = p.scene.cameras.main; p.scene.setBlocked(true); c.stopFollow(); c.removeBounds(); c.setZoom(.96 * Math.min(c.width / 5120, c.height / 3584)); c.centerOn(2560, 1792); document.querySelector('.park-hud').style.visibility = 'hidden'; });
    await a.waitForTimeout(400);
    assert.ok(await a.evaluate(() => { const v = window.__petPark.scene.cameras.main.worldView; return v.x <= 0 && v.y <= 0 && v.right >= 5120 && v.bottom >= 3584; }));
    const clip = await a.evaluate(() => { const c = window.__petPark.scene.cameras.main, r = document.querySelector('.park-canvas canvas').getBoundingClientRect(); const width = 5120 * c.zoom, height = 3584 * c.zoom; return { x: r.x + (r.width - width) / 2, y: r.y + (r.height - height) / 2, width, height }; });
    await a.screenshot({ path: path.join(output, '36-complete-park.png'), clip });
    await a.evaluate(() => { const p = window.__petPark; p.scene.cameras.main.setBounds(0, 0, 5120, 3584); p.scene.cameras.main.startFollow(p.scene.follow, true, .14, .14); p.scene.resize(); document.querySelector('.park-hud').style.visibility = ''; p.scene.setBlocked(false); });
    await walk(a, 'post', false); await dismiss(a);
    pass('both painted bridges, all four districts, phone view and composed full map are inspected in the live game');
  }
  if (smoke) {
    await a.locator('[data-park="quests"]').first().click(); await a.locator('.park-more-quests').evaluate(e => e.open = true); await a.locator('[data-park="guide"][data-quest="acorns"]').click();
    await a.waitForFunction(() => window.__petPark.scene.route.length > 1); assert.match(await a.locator('[data-park-objective]').innerText(), /橡果/); await shot(a, '04c-tracked-walk');
    assert.equal(await a.locator('[data-park-route]').count(), 0);
    assert.ok(await a.evaluate(() => !window.__petPark.scene.targetMarker && !window.__petPark.scene.questMarkers));
    await a.keyboard.down('ArrowDown'); await a.waitForTimeout(120); await a.keyboard.up('ArrowDown'); await a.waitForFunction(() => window.__petPark.scene.route.length === 0);
    pass('tracking still walks to the next stop without any ground or map route graphics; manual input cancels walking');
    await walk(a, 'home-bench'); await solve(a, 'search', '04d-search-retry'); pass('a wrong search and a throttled retry leave the correct spot playable');
  }
  if (!smoke) {
    await walk(a, 'home-sign'); await walk(a, 'mailbox'); await walk(a, 'home-bench'); await solve(a, 'search', '04-leaf-search');
    for (const id of ['acorn-a', 'acorn-b', 'acorn-c']) { await walk(a, id); await solve(a, 'search'); }
    for (const id of ['litter-a', 'litter-b', 'litter-c']) { await walk(a, id); await solve(a, 'sort', id === 'litter-a' ? '05-sort-recycling' : undefined); }
    await walk(a, 'mushrooms'); await walk(a, 'forest-sign'); await walk(a, 'hollow'); await solve(a, 'maze', '06-courier-maze');
    await walk(a, 'hollow'); await solve(a, 'search');
    await walk(a, 'squirrel'); await dismiss(a); await shot(a, '07-forest-route');
    await walk(a, 'pond'); await walk(a, 'garden-sign');
    for (const id of ['flowers-a', 'flowers-b', 'flowers-c']) { await walk(a, id); await solve(a, 'water', id === 'flowers-a' ? '08-water-timing' : undefined); }
    await walk(a, 'sluice'); await solve(a, 'pipes', '09-waterworks'); await walk(a, 'deer'); await dismiss(a); await shot(a, '09b-garden-route');
    await walk(a, 'hollow'); await solve(a, 'code', '10-treasure-code');
    for (const id of ['chime', 'drum', 'bell']) { await walk(a, id); if(id==='chime')await solve(a,'melody');else await playLeisure(a,id==='drum'?'rhythm':'lantern'); }
    pass('complete real searches, sorting, water timing, one chime-memory game, a courier maze, rhythm drumming and lantern logic, pipe rotation, collected clues and treasure code');
    await walk(a, 'banana-game', false); await shot(a, '10b-banana-stand'); await a.evaluate(() => window.__petPark.scene.walkToObject('banana-game'));
    const beforeBanana=await a.evaluate(()=>window.__petPark.progress.earned);await play(a, 'banana');
    assert.equal(await a.evaluate(() => window.__petPark.progress.games.banana.earned), Math.min(8,50-beforeBanana));
    await walk(a, 'sky-game'); await play(a, 'flight');
    await walk(a, 'bear'); await dismiss(a); await walk(a, 'home-sign'); await walk(a, 'post'); await dismiss(a);
    await walk(a,'pond',true,'fishing');await playLeisure(a,'fishing');await walk(a,'garden-bench',true,'golf');await playLeisure(a,'golf');await walk(a,'deer');await dismiss(a);await walk(a,'bear');await dismiss(a);
    const progress = await a.evaluate(() => window.__petPark.progress); assert.equal(progress.earned, 50);
    for(const quest of QUESTS)assert.ok(progress.quests[quest.id]?.completedAt,`quest ${quest.id} was not handed in`);
    assert.equal(progress.bonusClaimed,true);metrics.completedQuests=QUESTS.map(q=>q.id);
    await a.reload(); await ready(a); assert.equal(await a.evaluate(() => window.__petPark.progress.earned), 50); pass('all14quest hand-ins and daily bonus complete; the shared50coin cap and saved progress survive refresh');
    const loadContext = await browser.newContext({ baseURL }), loadPage = await loadContext.newPage(); await loadPage.goto('/health'); await loadPage.addScriptTag({ url: baseURL + '/socket.io/socket.io.js' });
    for (let i = 1; i <= 28; i++) { await loadContext.request.post('/api/auth/login', { data: { studentId: `P${String(i).padStart(3, '0')}`, password: 'test' } }); await loadPage.evaluate(() => new Promise((resolve, reject) => { const s = window.io('/pet-park', { forceNew: true, transports: ['websocket'] }); (window.parkSockets ||= []).push(s); s.on('connect', () => s.emit('park:join', {}, r => r.success ? resolve() : reject(Error(r.message)))); s.on('connect_error', reject); })); }
    await a.waitForFunction(() => window.__petPark.scene.actors.size === 30, {}, { timeout: 30000 });
    const crowdPoint = await a.evaluate(() => { const p=window.__petPark.client.frames.get('S001'); return {x:p.x,y:p.y}; });
    await b.evaluate(p=>window.__petPark.scene.walk(p.x,p.y),crowdPoint); await b.waitForFunction(p=>{const f=window.__petPark.client.frames.get('S002');return f&&!f.moving&&Math.hypot(f.x-p.x,f.y-p.y)<135;},crowdPoint,{timeout:60000});
    metrics.crowd=[];
    for(const [page,label,viewport] of [[a,'desktop',{width:1440,height:960}],[b,'phone',{width:390,height:844}]]){
      await page.setViewportSize(viewport); await page.bringToFront(); await page.waitForTimeout(2200);
      const samples=[];for(let i=0;i<30;i++){samples.push(await page.evaluate(()=>window.__petPark.game.loop.actualFps));await page.waitForTimeout(120);}
      samples.sort((x,y)=>x-y);const result={label,viewport,actors:await page.evaluate(()=>window.__petPark.scene.actors.size),p10Fps:samples[3],medianFps:samples[15],samples};
      assert.ok(result.p10Fps>=24&&result.medianFps>=30,`${label}: crowd frame rate below playable budget`);metrics.crowd.push(result);await shot(page,label==='desktop'?'18-thirty-pets':'18b-thirty-pets-phone');
    }
    await b.setViewportSize({width:1024,height:768});await loadContext.close(); pass('30 authenticated students remain playable on desktop and emulated phone, with recorded frame-rate samples');
  }
  await b.evaluate(() => window.__petPark.scene.walkToObject('banana-game')); await b.locator('.park-mini-card').waitFor();
  await b.setViewportSize({ width: 390, height: 844 }); await shot(b, '19-phone-game-intro'); await b.locator('[data-mini="start"]').click(); await b.waitForFunction(() => window.__petPark.miniGame?.phase === 'playing');
  await pointerAt(b, 390, 620, true); await b.waitForTimeout(900); assert.ok(await b.evaluate(() => window.__petPark.miniGame.state.player.x > 330)); await shot(b, '20-phone-touch-game');
  await b.locator('[data-mini="pause"]').click(); await b.locator('[data-mini="resume"]').waitFor(); await shot(b, '21-phone-pause');
  await b.locator('.park-mini-card [data-mini="exit"]').click(); await b.locator('.park-mini-root').waitFor({ state: 'detached' });
  await b.evaluate(() => window.__petPark.scene.walkToObject('sky-game')); await b.locator('.park-mini-card [data-mini="start"]').waitFor({ timeout: 30000 }); await b.locator('[data-mini="start"]').click();
  await b.waitForFunction(() => window.__petPark.miniGame?.phase === 'playing');
  const shieldButton = await b.locator('[data-mini="shield"]').boundingBox(); await b.touchscreen.tap(shieldButton.x + shieldButton.width / 2, shieldButton.y + shieldButton.height / 2);
  await b.waitForFunction(() => window.__petPark.miniGame.state.shields === 2); await shot(b, '21b-phone-flight-shield'); await b.locator('[data-mini="pause"]').click();
  assert.ok(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await contexts[2].request.post('/api/pet/teacher/access', { data: { action: 'lock', classes: ['5A'], endsAt: null, note: '上課了' } }); await b.locator('.pet-access-overlay').waitFor(); assert.equal(await b.locator('.park-mini-root').count(), 0); await shot(b, '22-lock-during-game');
  await contexts[2].request.post('/api/pet/teacher/access', { data: { action: 'unlock', classes: ['5A'] } }); await ready(a); await ready(b); pass('phone touch control, pause, no horizontal overflow, teacher lock cancels the active game and unlock restores the park');
  await a.locator('[data-park="home"]').first().click(); await a.waitForFunction(() => !window.__petPark && window.__petGame?.scene.getScene('Bedroom')?.sys.isActive());
  assert.deepEqual(errors, []); const report = { pass: true, smoke, build, htmlSha256:createHash('sha256').update(await fs.readFile(path.join(build,'index.html'))).digest('hex'), checks, errors, metrics, browser: 'Windows Chrome; emulated tablet and phone', physicalMobileVerified: false }; await fs.writeFile(path.join(output, smoke ? 'smoke-report.json' : 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (e) {
  await Promise.all(pages.map((p, i) => shot(p, 'failure-' + i).catch(() => {})));
  const states = await Promise.all(pages.map(p => p.evaluate(() => ({ body: document.body.innerText.slice(-3000), player: window.__petPark?.client.frames.get('S001'), activity: window.__petPark?.activity?.challenge, game: window.__petPark?.miniGame?.state })).catch(() => null)));
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: e.stack, errors, states, logs: logs.slice(-6000) }, null, 2)); console.error(e.stack); process.exitCode = 1;
} finally { await browser?.close(); server.kill(); if (path.dirname(temp) === path.resolve(os.tmpdir()) && path.basename(temp).startsWith('buio-adventure-')) await fs.rm(temp, { recursive: true, force: true }); }
