import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import bcrypt from 'bcryptjs';
import {chromium} from 'playwright';
import {INPUT as I,VERSION} from '../pet-app/lib/brawl/catalog.mjs';

const fighters=['one-piece-luffy','spy-family-anya','doraemon','argentina-number-10','naruto-uzumaki'];
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-utility-live-')),dbFile=path.join(temp,'db.json');
const out=path.resolve(process.env.PET_PLAYTEST_DIR||'artifacts/pet-playtest/skills-v11/browser');await fs.mkdir(out,{recursive:true});
await fs.writeFile(dbFile,JSON.stringify({users:[{studentid:'S001',name:'技能測試',passwordhash:bcrypt.hashSync('test',4),role:'student',classname:'5A',language:'zh-HK'}],studentStats:[],questionLogs:[],_logId:0}));
process.env.BUIO_JSON_DB_FILE=dbFile;process.env.SUPABASE_DB_URL='';
const require=createRequire(import.meta.url),pets=require('../pet-app/repositories/pet.repo'),store=require('../db/jsonStore');await pets.ensureStudent('S001');
const fixture=store.load();for(const speciesId of fighters)fixture.petInstances.push({petId:randomUUID(),studentId:'S001',speciesId,xp:0,stage:1,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});
Object.assign(fixture.petProfiles[0],{activePetId:fixture.petInstances[0].petId,starterEggClaimed:true});fixture.petWallets[0].balance=2500;store.save();
const port=await new Promise(resolve=>{const listener=net.createServer();listener.listen(0,'127.0.0.1',()=>{const port=listener.address().port;listener.close(()=>resolve(port));});});
const baseURL=`http://127.0.0.1:${port}`,server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),MOCK_AUTH:'0',NODE_ENV:'development',PET_APP_DIST_DIR:process.env.PET_APP_DIST_DIR||path.resolve('pet-app/dist')},stdio:['ignore','pipe','pipe']});
let logs='',browser,page;server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const errors=[],failures=[],checks=[];const pass=label=>{checks.push(label);console.log('✓ '+label);};
const shot=name=>page.screenshot({path:path.join(out,name+'.png')});
const state=()=>page.evaluate(()=>structuredClone(window.__petGame.scene.getScene('Brawl').runtime.state));
async function start(id){
 if(await page.locator('[data-brawl="pause"]').count()){await page.locator('[data-brawl="pause"]').click();await page.locator('[data-brawl="lobby"]').click();}
 await page.locator('[data-brawl="mode"][data-id="practice"]').click();await page.locator(`[data-brawl="fighter"][data-id="${id}"]`).click();await page.locator('[data-brawl="start"]').first().click();
 await page.waitForFunction(()=>window.__petGame?.scene.isActive('Brawl')&&!document.querySelector('.brawl-loading'));
 await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.__normalUpdate??=scene.update;scene.update=(_t,delta)=>scene.draw(Math.min(delta,50));scene.sys.sceneUpdate=scene.update;const [a,b]=scene.runtime.state.actors;a.x=36000;b.x=70000;a.y=b.y=45500;scene.draw(16);});
 assert.equal((await state()).actors[0].kind,id);
}
const ticks=(n,mask=0)=>page.evaluate(({n,mask})=>{const scene=window.__petGame.scene.getScene('Brawl'),events=[];for(let t=0;t<n;t++){scene.runtime.step(t===0?mask:0);events.push(...scene.runtime.state.events);scene.draw(16);}return events;},{n,mask});
const input=async(bit,steps=1)=>{const [x,y]=await page.locator('[data-battle-key="'+bit+'"]').evaluate(el=>{const b=el.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];});await page.touchscreen.tap(x,y);await page.evaluate(n=>{const scene=window.__petGame.scene.getScene('Brawl');for(let t=0;t<n;t++){scene.runtime.step();scene.draw(16);}},steps);};
try{
 const deadline=Date.now()+20000;while(true){try{if((await fetch(baseURL+'/health')).ok)break;}catch{}if(Date.now()>deadline)throw Error('server startup timeout');await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,channel:'chrome'});const context=await browser.newContext({baseURL,viewport:{width:1024,height:768},hasTouch:true,isMobile:true});
 assert.equal((await context.request.post('/api/auth/login',{data:{studentId:'S001',password:'test'}})).status(),200);
 const catalog=await (await context.request.get('/api/pet/brawl/catalog')).json();assert.equal(catalog.version,VERSION);assert.ok(catalog.assets.skillFx['gum-pistol']);
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>{if(!r.failure()?.errorText.includes('ERR_ABORTED'))failures.push(r.url());});
 await page.goto('/pet');await page.locator('[data-tab="brawl"]').click();
 await start('one-piece-luffy');await input(I.SKILL1);await ticks(21);await shot('01-luffy-pistol-right');
 let fx=await page.evaluate(()=>window.__petGame.scene.getScene('Brawl').elemental.sprites.filter(s=>s.visible).map(s=>({texture:s.texture.key,frame:s.frame.name,flip:s.flipX,x:s.x,width:s.displayWidth})));assert.ok(fx.some(s=>s.texture==='brawl-skill-gum-pistol'&&s.frame>0));
 await start('one-piece-luffy');await input(I.SKILL2);await ticks(28);await shot('02-luffy-gatling-right');
 fx=await page.evaluate(()=>window.__petGame.scene.getScene('Brawl').elemental.sprites.filter(s=>s.visible).map(s=>({texture:s.texture.key,frame:s.frame.name,flip:s.flipX})));assert.ok(fx.some(s=>s.texture==='brawl-skill-gum-gatling'));
 await start('one-piece-luffy');await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.runtime.state.actors[0].x=85000;scene.runtime.state.actors[0].facing=-1;scene.runtime.state.actors[1].x=51000;});await input(I.SKILL2);await ticks(28);await shot('03-luffy-gatling-left');
 fx=await page.evaluate(()=>window.__petGame.scene.getScene('Brawl').elemental.sprites.filter(s=>s.visible).map(s=>({texture:s.texture.key,flip:s.flipX})));assert.ok(fx.some(s=>s.texture==='brawl-skill-gum-gatling'&&s.flip));
 pass('Owned Luffy selected through the lobby; both new sprites load and animate, including correctly mirrored left-facing Gatling');

 await start('spy-family-anya');await page.evaluate(()=>{const s=window.__petGame.scene.getScene('Brawl').runtime.state;s.actors[1].x=s.actors[0].x+5500;});await input(I.SKILL1);await ticks(41);assert.ok((await state()).actors[1].readUntil>(await state()).tick);await shot('04-anya-mark');
 await input(I.ATTACK);await ticks(9);let s=await state();assert.ok(s.actors[1].mindStunUntil>s.tick);await shot('05-anya-mark-hit-stun');
 await ticks(95);await input(I.SKILL2);await ticks(15);assert.equal((await state()).actors[0].wardMeleeLeft,3);assert.match(await page.locator('#brawlHint').innerText(),/近攻 3\/3/);await shot('06-anya-ward');
 pass('Anya mark, bonus hit, visible stun label, three-heart ward and remaining-charge HUD render on iPad');

 await start('doraemon');await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.update=scene.__normalUpdate;scene.sys.sceneUpdate=scene.update;window.__startTick=scene.runtime.state.tick;});
 await page.touchscreen.tap(...await page.locator(`[data-battle-key="${I.SKILL2}"]`).evaluate(el=>{const b=el.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];}));
 await page.waitForFunction(()=>window.__petGame.scene.getScene('Brawl').runtime.state.actors[0].flightUntil>window.__petGame.scene.getScene('Brawl').runtime.state.tick);
 await page.touchscreen.tap(...await page.locator('.brawl-attack').evaluate(el=>{const b=el.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];}));
 await page.waitForTimeout(100);await shot('07-doraemon-flight-ray');assert.match(await page.locator('.brawl-attack').innerText(),/射線 2\/3/);assert.match(await page.locator('#brawlHint').innerText(),/竹蜻蜓/);
 const airAnchor=await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl'),a=scene.runtime.state.actors[0],v=scene.views.get(a.id),point=scene.runtime.assets.fighters[a.kind].clips.flightAttack.emitters[0],ray=scene.elemental.stats.emitters['air-ray'];return {ray,expected:{x:v.x+a.facing*point.x,y:v.y-v.z+point.y}};});assert.ok(Math.hypot(airAnchor.ray.x-airAnchor.expected.x,airAnchor.ray.y-airAnchor.expected.y)<.1,'aerial ray stays attached to the raised hand while ascending');
 await page.keyboard.down('KeyJ');await page.waitForTimeout(1100);await page.keyboard.up('KeyJ');assert.equal((await state()).actors[0].flightShots,0);await shot('08-doraemon-three-rays');
 await page.waitForFunction(()=>!window.__petGame.scene.getScene('Brawl').runtime.state.actors[0].flightUntil);await page.waitForFunction(()=>document.querySelector('.brawl-attack').textContent.includes('攻擊'));assert.match(await page.locator('.brawl-attack').innerText(),/攻擊/);
 const sizes=await page.locator('.brawl-buttons button').evaluateAll(nodes=>nodes.map(el=>{const b=el.getBoundingClientRect();return {w:b.width,h:b.height};}));assert.ok(sizes.every(b=>b.w>=64&&b.h>=64));
 pass('Real touch activates four-second Take-copter and aerial ray; held keyboard fires the remaining two; landing restores attack text and iPad controls are at least 64px');

 await start('argentina-number-10');await page.evaluate(()=>{const s=window.__petGame.scene.getScene('Brawl').runtime.state;s.actors[0].x=85000;s.actors[0].facing=1;s.actors[1].x=35000;s.actors[1].y=56500;});await input(I.SKILL2);await ticks(28);s=await state();assert.ok(s.projectiles[0].dx<0&&s.projectiles[0].dy>0);await shot('09-homing-ball-behind');await ticks(130);assert.equal((await state()).actors[1].hp,99999-25);
 pass('Homing football visibly turns back toward a rear target in a different depth lane and lands exactly once');

 await start('naruto-uzumaki');await input(I.SKILL1);await ticks(130);s=await state();const clones=s.actors.filter(a=>a.cloneOwner);assert.equal(clones.length,2);assert.ok(clones.every(a=>a.x>50000));
 const labels=await page.evaluate(()=>[...window.__petGame.scene.getScene('Brawl').views.values()].filter(v=>v.status.visible).map(v=>v.status.text));assert.ok(!labels.some(t=>/分身|Clone|\d+\.\d+s/.test(t)));const hidden=await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');return scene.runtime.state.actors.filter(a=>a.cloneOwner).every(a=>!scene.views.get(a.id).status.visible);});assert.ok(hidden);await shot('10-naruto-ai-clones');
 await ticks(clones[0].cloneExpires-s.tick);s=await state();assert.equal(s.actors.filter(a=>a.cloneOwner).length,0);await shot('11-naruto-expiry-smoke');
 await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.runtime.state.actors[0].mp=0;scene.runtime.state.actors[0].cooldowns=[0,0];scene.runtime.changed();});assert.match(await page.locator('#brawlCooldown0').innerText(),/MP 不足/);assert.equal(await page.locator(`[data-battle-key="${I.SKILL1}"]`).getAttribute('aria-disabled'),'true');await shot('12-mana-state');
 pass('Two distinct Naruto actors pursue without owner movement, have no clone labels or countdowns, expire after three seconds with smoke, and skill buttons clearly show insufficient MP');
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);assert.equal(JSON.parse(await fs.readFile(dbFile,'utf8')).petWallets[0].balance,2500);for(const name of ['failure.txt','failure.json','failure.png'])await fs.rm(path.join(out,name),{force:true});await fs.writeFile(path.join(out,'results.json'),JSON.stringify({pass:true,checks,errors,failures,version:VERSION},null,2));
}catch(error){if(page){await shot('failure');await fs.writeFile(path.join(out,'failure.json'),JSON.stringify(await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');return {state:scene.runtime.state,paused:scene.runtime.paused(),update:scene.update.toString(),sysUpdate:scene.sys.sceneUpdate.toString()};}),null,2));}await fs.writeFile(path.join(out,'failure.txt'),error.stack+'\n'+logs);throw error;}finally{await browser?.close();server.kill();await new Promise(r=>server.once('exit',r));const resolved=path.resolve(temp);assert.ok(resolved.startsWith(path.join(os.tmpdir(),'buio-utility-live-')));await fs.rm(resolved,{recursive:true,force:true});}
