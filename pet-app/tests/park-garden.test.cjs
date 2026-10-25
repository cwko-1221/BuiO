'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'buio-park-garden-'));
process.env.BUIO_JSON_DB_FILE = path.join(temp, 'db.json'); process.env.SUPABASE_DB_URL = '';
fs.writeFileSync(process.env.BUIO_JSON_DB_FILE, JSON.stringify({ users:[], studentStats:[], questionLogs:[] }));
const rules = import('../lib/park-garden.mjs'), repo = require('../repositories/park-garden.repo'), store = require('../../db/jsonStore'), createGarden = require('../server/park-garden');
const now = Date.parse('2026-10-25T09:00:00+08:00');
after(() => { if (path.dirname(temp) === path.resolve(os.tmpdir()) && path.basename(temp).startsWith('buio-park-garden-')) fs.rmSync(temp, { recursive:true,force:true }); });
const actor = id => ({ id, name:id==='A'?'小晴':'阿樂' });
function command(state,id,action,requestId,seed) { return { plotId:id,action,requestId,day:state.day,revision:state.plots[id].revision,...(seed?{seed}:{}) }; }

test('shared flowers need real planting, two water actions and elapsed growth; helpers and bouquets are authoritative', async () => {
  const r=await rules,s=r.blankGarden(r.gardenDay(now));
  assert.throws(()=>r.applyGardenAction(s,actor('A'),command(s,'sun','harvest','early-harvest'),now));
  r.applyGardenAction(s,actor('A'),command(s,'sun','plant','plant-request','sunflowers'),now);
  assert.equal(r.publicGarden(s,now).plots.sun.stage,'thirsty');
  r.applyGardenAction(s,actor('A'),command(s,'sun','water','water-first'),now+500);
  assert.throws(()=>r.applyGardenAction(s,actor('A'),command(s,'sun','water','water-fast'),now+1000),{status:429});
  r.applyGardenAction(s,actor('B'),command(s,'sun','water','water-help'),now+1000);
  assert.equal(r.publicGarden(s,now+1000).plots.sun.stage,'growing');
  assert.throws(()=>r.applyGardenAction(s,actor('B'),command(s,'sun','harvest','harvest-fast'),now+2000));
  assert.equal(r.publicGarden(s,now+21000).plots.sun.stage,'ready');
  const c=command(s,'sun','harvest','harvest-real');
  r.applyGardenAction(s,actor('B'),c,now+21000);
  assert.equal(s.bouquets,1);assert.equal(s.plots.sun.cycle,1);assert.equal(s.plots.sun.seed,null);
  assert.equal(r.applyGardenAction(s,actor('B'),c,now+22000).repeated,true);assert.equal(s.bouquets,1);
  assert.equal(s.contributions.A.plant,1);assert.equal(s.contributions.A.water,1);assert.equal(s.contributions.B.water,1);assert.equal(s.contributions.B.harvest,1);
  assert.equal(r.publicGarden(s,now+22000).plots.sun.lastHarvest.name,'阿樂');
});

test('a solo gardener can grow flowers after a pause; stale revisions, substituted request IDs and day replay cannot change another crop', async () => {
  const r=await rules,s=r.blankGarden(r.gardenDay(now));
  const planted=command(s,'moon','plant','plant-solo','tulips');r.applyGardenAction(s,actor('A'),planted,now);
  assert.equal(r.applyGardenAction(s,actor('A'),planted,now+300).repeated,true);
  assert.throws(()=>r.applyGardenAction(s,actor('A'),{...planted,seed:'daisies'},now+400),{status:400});
  assert.throws(()=>r.applyGardenAction(s,actor('A'),{...planted,requestId:'new-plant'},now+600));
  r.applyGardenAction(s,actor('A'),command(s,'moon','water','solo-water-a'),now+1000);
  r.applyGardenAction(s,actor('A'),command(s,'moon','water','solo-water-b'),now+5000);
  r.applyGardenAction(s,actor('A'),command(s,'moon','harvest','solo-harvest'),now+25000);
  assert.equal(s.bouquets,1);
  assert.throws(()=>r.applyGardenAction(s,actor('A'),{...command(s,'moon','plant','tomorrow','tulips'),day:'2026-10-26'},now+26000));
  assert.throws(()=>r.applyGardenAction(s,actor('A'),{...command(s,'moon','plant','bad-time','tulips')},Infinity),{status:400});
  assert.throws(()=>r.applyGardenAction(s,actor('A'),{...command(s,'moon','plant','fake-plot','tulips'),plotId:'__proto__'},now+26000));
  assert.equal({}.plant,undefined);
});

test('persistent JSON changes are atomic, idempotent across retries and process reloads, isolated by class/day and roll back failed writes', async () => {
  let state=await repo.read('park:2026:5A',now);
  const plant=command(state,'star','plant','repo-plant','daisies');
  const results=await Promise.all([repo.act('park:2026:5A',actor('A'),plant,{now}),repo.act('park:2026:5A',actor('A'),plant,{now})]);
  assert.equal(results.filter(v=>v.result.repeated).length,1);state=await repo.read('park:2026:5A',now);assert.equal(state.revision,1);
  assert.equal((await repo.read('park:2026:5B',now)).plots.star.stage,'empty');
  assert.equal((await repo.read('park:2026:5A',now+86400000)).plots.star.stage,'empty');
  const before=structuredClone(store.load().petParkGardens),save=store.save;store.save=()=>{throw Error('disk interrupted');};
  await assert.rejects(repo.act('park:2026:5A',actor('B'),command(state,'star','water','repo-fail'),{now:now+1000}),/disk interrupted/);store.save=save;
  assert.deepEqual(store.load().petParkGardens,before);
  await assert.rejects(repo.act('park:2026:5A',actor('B'),command(state,'star','water','repo-locked'),{now:now+1000,canCommit:()=>{throw Error('locked');}}),/locked/);
  state=(await repo.act('park:2026:5A',actor('B'),command(state,'star','water','repo-water'),{now:now+1000})).state;assert.equal(state.plots.star.waterCount,1);
  delete require.cache[require.resolve('../repositories/park-garden.repo')];const reloaded=require('../repositories/park-garden.repo');assert.deepEqual((await reloaded.read('park:2026:5A',now+2000)).plots.star,state.plots.star);
  assert.equal(store.load().petWallets,undefined,'decorative garden never touches currency');
  const disk=JSON.parse(fs.readFileSync(process.env.BUIO_JSON_DB_FILE,'utf8'));assert.equal(disk.petParkGardens[0].state.plots.star.water.length,1);
  const cold=spawnSync(process.execPath,['-e',`require(${JSON.stringify(require.resolve('../repositories/park-garden.repo'))}).read('park:2026:5A',${now+2000}).then(s=>console.log(JSON.stringify(s)))`],{env:{...process.env,SUPABASE_DB_URL:''},encoding:'utf8'});
  assert.equal(cold.status,0,cold.stderr);assert.deepEqual(JSON.parse(cold.stdout).plots.star,state.plots.star,'a fresh process reads the saved crop');
});

async function fixture() {
  const [{GARDEN_PLOTS},w]=await Promise.all([import('../lib/park-layout-v4.mjs'),import('../lib/park-world.mjs')]);
  let clock=now;const players=new Map(),handlers=new Map(),events=[];
  const point=GARDEN_PLOTS[0].at;
  function player(id,room='5A'){const socket={connected:true,data:{studentId:id}};const value={id,name:id,room,x:point.x,y:point.y,active:true,locked:false,game:null,pending:null,socket};players.set(id,value);return value;}
  const a=player('A'),b=player('B'),c=player('C','5B');
  let allowedCalls=0,lockOnCommit=false;
  const current=s=>{const p=players.get(s.data.studentId);if(!p||p.socket!==s||p.locked)throw Object.assign(Error('locked'),{status:423});return p;};
  const allowed=async s=>{const p=current(s);allowedCalls++;if(lockOnCommit&&allowedCalls>=2){p.locked=true;throw Object.assign(Error('locked during commit'),{status:423});}return p;};
  const r=await rules,states=new Map();const fakeRepo={read:async(room,t)=>r.publicGarden(states.get(room)||r.blankGarden(r.gardenDay(t)),t),act:async(room,actor,c,options)=>{await options.canCommit();const state=structuredClone(states.get(room)||r.blankGarden(r.gardenDay(options.now)));const result=r.applyGardenAction(state,actor,c,options.now);states.set(room,state);return{state:r.publicGarden(state,options.now),result};}};
  const value=createGarden({players,now:()=>clock,current,allowed,emitRoom:(room,event)=>events.push({room,event}),repo:fakeRepo,isBusy:id=>players.get(id)?.socialBusy});
  for(const p of players.values()){const h=new Map();value.attach(p.socket,(event,fn)=>h.set(event,fn));handlers.set(p.id,h);}
  return{...value,a,b,c,events,players,world:w,lockDuringCommit:()=>{allowedCalls=0;lockOnCommit=true;},unlock:()=>{lockOnCommit=false;for(const p of players.values())p.locked=false;},request:(id,event,body={})=>handlers.get(id).get('park:garden:'+event)(body),advance:ms=>{clock+=ms;}};
}

test('two nearby same-class players persist and observe the same bloom, while cross-class readers see their own beds',async()=>{
  const f=await fixture();let state=(await f.request('A','state')).state;
  state=(await f.request('A','act',command(state,'sun','plant','server-plant','sunflowers'))).state;f.advance(600);
  state=(await f.request('B','act',command(state,'sun','water','server-water'))).state;
  assert.equal(state.plots.sun.waterCount,1);assert.deepEqual((await f.request('A','state')).state,state);
  assert.equal((await f.request('C','state')).state.plots.sun.stage,'empty');
  assert.ok(f.events.some(e=>e.room==='5A'&&e.event.state.plots.sun.waterCount===1));assert.ok(!f.events.some(e=>e.room==='5B'));
  f.advance(600);state=(await f.request('A','act',command(state,'sun','water','server-help'))).state;f.advance(20000);await f.tick();
  assert.ok(f.events.some(e=>e.event.state.plots.sun.stage==='ready'));state=(await f.request('B','state')).state;
  await f.request('B','act',command(state,'sun','harvest','server-harvest'));assert.equal((await f.request('A','state')).state.bouquets,1);f.dispose();
});

test('garden commits reject distance, blocked line of sight, stale sockets, inactivity, solo/duet activity and lock races',async()=>{
  const f=await fixture(),state=(await f.request('A','state')).state,c=command(state,'sun','plant','guarded-plant','sunflowers');
  for(const [key,value]of[['active',false],['locked',true],['game',{}],['socialBusy',true],['pending',{}]]){const before=f.a[key];f.a[key]=value;await assert.rejects(f.request('A','act',c));f.a[key]=before;}
  f.a.x+=1000;await assert.rejects(f.request('A','act',c));f.a.x-=1000;
  const old=f.a.socket;f.a.socket={...old};await assert.rejects(f.request('A','act',c));f.a.socket=old;
  f.a.y-=110;await assert.rejects(f.request('A','act',c),'cannot act through the raised garden bed');f.a.y+=110;
  f.a.locked=true;await assert.rejects(f.request('A','state'));f.a.locked=false;
  f.lockDuringCommit();await assert.rejects(f.request('A','act',c),{status:423});assert.equal(f.a.pending,null);f.a.locked=false;
  f.dispose();await assert.rejects(f.request('A','act',c));
});

test('shared scenery uses its actual work point, broadcasts only to classmates and rechecks a teacher lock before commit',async()=>{
  const f=await fixture(),{SCENE_PROJECTS}=await import('../lib/park-projects.mjs'),spec=SCENE_PROJECTS[0];
  let state=(await f.request('A','state')).state;
  const c=requestId=>({plotId:spec.id,action:'contribute',seed:spec.choices[0].id,requestId,day:state.day,revision:state.projects[spec.id].revision});
  await assert.rejects(f.request('A','act',c('project-too-far')));
  Object.assign(f.a,spec.at);Object.assign(f.b,spec.at);
  for(const [key,value]of[['active',false],['game',{}],['socialBusy',true],['pending',{}]]){const previous=f.a[key];f.a[key]=value;await assert.rejects(f.request('A','act',c('project-busy')));f.a[key]=previous;}
  state=(await f.request('A','act',c('project-a'))).state;f.advance(600);
  state=(await f.request('B','act',c('project-b'))).state;
  assert.equal(state.projects[spec.id].count,2);assert.equal((await f.request('C','state')).state.projects[spec.id].count,0);
  assert.ok(f.events.some(e=>e.room==='5A'&&e.event.state.projects[spec.id].count===2));assert.ok(!f.events.some(e=>e.room==='5B'));
  f.advance(600);f.lockDuringCommit();await assert.rejects(f.request('A','act',c('project-lock-race')),{status:423});assert.equal(f.a.pending,null);f.unlock();
  assert.equal((await f.request('B','state')).state.projects[spec.id].count,2);f.dispose();
});
