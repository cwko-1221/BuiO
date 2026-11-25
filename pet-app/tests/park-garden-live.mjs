// Actual signed-in classmates operate the shared garden through its real UI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';
import { GARDEN_PLOTS } from '../lib/park-layout-v4.mjs';
import { walkable, clearLine } from '../lib/park-world.mjs';
const output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'artifacts/pet-playtest/park-garden');await fs.mkdir(output,{recursive:true});
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'buio-park-garden-live-'));
process.env.BUIO_JSON_DB_FILE=path.join(temporary,'db.json');process.env.SUPABASE_DB_URL='';
const passwordhash=bcrypt.hashSync('test',4),users=[{studentid:'S001',name:'小晴',classname:'5A',role:'student'},{studentid:'S002',name:'阿樂',classname:'5A',role:'student'},{studentid:'S003',name:'小悠',classname:'5B',role:'student'},{studentid:'T001',name:'老師',role:'teacher'}].map(u=>({...u,language:'zh-HK',passwordhash}));
await fs.writeFile(process.env.BUIO_JSON_DB_FILE,JSON.stringify({users,studentStats:[],questionLogs:[],_logId:0}));
const require=createRequire(import.meta.url),pets=require('../repositories/pet.repo'),repo=require('../repositories/park.repo'),store=require('../../db/jsonStore');
const first=GARDEN_PLOTS[0].at;let second;
for(let dy=50;dy<=130&&!second;dy+=20)for(let dx=60;dx<=130&&!second;dx+=20){const point={x:first.x+dx,y:first.y+dy};if(Math.hypot(dx,dy)<165&&walkable(point.x,point.y)&&clearLine(first,point))second=point;}
assert.ok(second,'two students can stand by the same garden bed');
for(const[i,user]of users.filter(u=>u.role==='student').entries()){
 await pets.ensureStudent(user.studentid);const data=store.load(),petId=randomUUID();
 data.petInstances.push({petId,studentId:user.studentid,speciesId:i===1?'pudding-pig':'starpatch-cat',xp:0,stage:1,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});Object.assign(data.petProfiles.find(p=>p.studentId===user.studentid),{activePetId:petId,starterEggClaimed:true});store.save();await repo.savePosition(user.studentid,i===1?second:first);
}
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
const server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),MOCK_AUTH:'0',NODE_ENV:'development',PET_APP_DIST_DIR:path.resolve(process.env.PET_APP_TEST_DIST||'pet-app/dist')},stdio:['ignore','pipe','pipe']});
let browser,logs='';const pages=[],contexts=[],errors=[],checks=[];server.stdout.on('data',c=>logs+=c);server.stderr.on('data',c=>logs+=c);
const shot=(page,name)=>page.screenshot({path:path.join(output,name+'.png')});
const ready=page=>page.waitForFunction(()=>window.__petPark?.garden?.state&&window.__petPark.client.ready&&window.__petPark.scene?.actors.size&&document.querySelector('[data-park-loading]')?.hidden,{}, {timeout:40000});
const pass=message=>{checks.push(message);console.log('✓ '+message);};
const request=(page,event,body={})=>page.evaluate(({event,body})=>window.__petPark.client.request('park:garden:'+event,body),{event,body});
async function openBed(page,id){const plot=GARDEN_PLOTS.find(p=>p.id===id),point=await page.evaluate(({x,y})=>{const c=window.__petPark.scene.cameras.main,r=document.querySelector('.park-canvas canvas').getBoundingClientRect();return{x:r.x+(x-c.worldView.x)*c.zoom,y:r.y+(y-c.worldView.y)*c.zoom};},{x:plot.x+plot.width/2,y:plot.y+plot.height/2});await page.mouse.click(point.x,point.y);await page.locator('.park-garden-panel').waitFor();}
try{
 const baseURL=`http://127.0.0.1:${port}`,deadline=Date.now()+30000;while(true){try{if((await fetch(baseURL+'/health')).ok)break;}catch{}if(Date.now()>deadline)throw Error('Garden test server startup timeout');await new Promise(r=>setTimeout(r,150));}
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const[i,id]of['S001','S002','S003'].entries()){
  const context=await browser.newContext({baseURL,viewport:i===1?{width:390,height:844}:{width:1440,height:960},hasTouch:i===1});contexts.push(context);assert.equal((await context.request.post('/api/auth/login',{data:{studentId:id,password:'test'}})).status(),200);
  const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.stack||e.message));page.on('response',r=>{if(r.url().includes('/pet/assets/')&&r.status()>=400)errors.push(r.status()+' '+r.url());});await page.goto('/pet');await page.locator('[data-tab="park"]').click();await ready(page);
  await page.evaluate(()=>{window.__gardenEvidence=[];window.__gardenCommands=[];window.__petPark.client.addEventListener('garden',event=>window.__gardenEvidence.push(event.detail));const call=window.__petPark.client.request.bind(window.__petPark.client);window.__petPark.client.request=(event,body)=>{if(event==='park:garden:act')window.__gardenCommands.push(structuredClone(body));return call(event,body);};});
 }
 const[a,b,c]=pages;
 await openBed(a,'sun');await a.locator('[data-garden="seed"][data-seed="tulips"]').click();await a.locator('[data-garden="plant"]').click();
 await a.waitForFunction(()=>window.__petPark.garden.state.plots.sun.stage==='thirsty');await b.waitForFunction(()=>window.__petPark.garden.state.plots.sun.seed==='tulips');assert.equal((await request(c,'state')).state.plots.sun.stage,'empty');await shot(a,'01-planted-seed');
 await a.waitForTimeout(600);await openBed(b,'sun');await b.locator('[data-garden="water"]').click();await a.waitForFunction(()=>window.__petPark.garden.state.plots.sun.waterCount===1);await shot(b,'02-phone-helping-water');
 await a.waitForTimeout(600);await a.locator('[data-garden="water"]').click();await a.waitForFunction(()=>window.__petPark.garden.state.plots.sun.stage==='growing');await b.waitForFunction(()=>window.__petPark.garden.state.plots.sun.stage==='growing');
 const growing=await a.evaluate(()=>window.__petPark.garden.state);assert.equal(growing.plots.sun.contributors.length,2);assert.ok(growing.plots.sun.readyAt-growing.at>=19000);
 await assert.rejects(request(a,'act',{plotId:'sun',action:'harvest',requestId:randomUUID(),revision:growing.plots.sun.revision,day:growing.day}));
 assert.equal(await c.evaluate(()=>window.__gardenEvidence.filter(e=>e.state?.plots.sun.seed).length),0);await shot(a,'03-classmates-growing');await a.locator('[data-garden="close"]').click();await shot(a,'03b-growing-in-world');await shot(b,'04-phone-growing');pass('two real classmates plant and water through scene clicks and buttons; growth and both helpers are shared only within their class');
 await a.waitForFunction(()=>window.__petPark.garden.state.plots.sun.stage==='ready',{}, {timeout:26000});await b.waitForFunction(()=>window.__petPark.garden.state.plots.sun.stage==='ready');await shot(a,'05-bloom-ready');
 await b.locator('[data-garden="harvest"]').click();await a.waitForFunction(()=>window.__petPark.garden.state.bouquets===1&&window.__petPark.garden.state.plots.sun.stage==='empty');
 const harvest=await b.evaluate(()=>window.__gardenCommands.filter(c=>c.action==='harvest').at(-1));const repeated=await request(b,'act',harvest);assert.equal(repeated.result.repeated,true);assert.equal(repeated.state.bouquets,1);await shot(b,'06-phone-class-bouquet');
 assert.equal((await request(c,'state')).state.bouquets,0);pass('server time prevents early harvest; a full bloom yields one class bouquet and duplicate packets cannot duplicate it');
 await a.reload();await ready(a);assert.equal(await a.evaluate(()=>window.__petPark.garden.state.bouquets),1);assert.equal(await a.evaluate(()=>window.__petPark.garden.state.plots.sun.lastHarvest.name),'阿樂');
 await openBed(a,'sun');await a.locator('[data-garden="plant"]').click();await a.waitForFunction(()=>window.__petPark.garden.state.plots.sun.stage==='thirsty');await a.locator('[data-garden="close"]').click();await a.reload();await ready(a);assert.equal(await a.evaluate(()=>window.__petPark.garden.state.plots.sun.stage),'thirsty');pass('page reload restores both class bouquet history and an unfinished planted crop');
 await openBed(a,'sun');const teacher=await browser.newContext({baseURL});contexts.push(teacher);await teacher.request.post('/api/auth/login',{data:{studentId:'T001',password:'test'}});assert.equal((await teacher.request.post('/api/pet/teacher/access',{data:{action:'lock',classes:['5A'],endsAt:null,note:'上課了'}})).status(),200);await a.locator('.pet-access-overlay').waitFor();await b.locator('.pet-access-overlay').waitFor();assert.equal(await a.locator('.park-garden-panel').count(),0);await shot(a,'07-garden-teacher-lock');
 await teacher.request.post('/api/pet/teacher/access',{data:{action:'unlock',classes:['5A']}});await ready(a);await ready(b);assert.equal(await a.evaluate(()=>window.__petPark.garden.state.plots.sun.stage),'thirsty');assert.ok(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));pass('teacher lock closes gardening controls; unlock restores the persisted crop and phone layout has no horizontal overflow');
 assert.deepEqual(errors,[]);const report={pass:true,checks,errors,browser:'Windows Chrome; authenticated desktop and touch phone contexts',physicalMobileVerified:false};await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await Promise.all(pages.map((p,i)=>shot(p,'failure-'+i).catch(()=>{})));await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:error.stack,errors,logs:logs.slice(-5000)},null,2));console.error(error.stack);process.exitCode=1;}finally{await browser?.close();server.kill();if(path.dirname(temporary)===path.resolve(os.tmpdir())&&path.basename(temporary).startsWith('buio-park-garden-live-'))await fs.rm(temporary,{recursive:true,force:true});}
