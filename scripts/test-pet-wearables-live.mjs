import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const reservePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const port=await reservePort(); const baseURL=`http://127.0.0.1:${port}`;
const tempDir=await fs.mkdtemp(path.join(os.tmpdir(),'buio-pet-wearables-'));
const databaseFile=path.join(tempDir,'db.json');
const artifactDir=path.resolve(process.env.PET_WEARABLE_PLAYTEST_DIR||'artifacts/pet-wearable-directions');
await fs.mkdir(artifactDir,{recursive:true});
await fs.writeFile(databaseFile,JSON.stringify({
  users:[{studentid:'S001',name:'陳小星',passwordhash:bcrypt.hashSync('student123',4),role:'student',classname:'5A',classno:1,language:'zh-HK'}],
  studentStats:[],questionLogs:[],_logId:0,
},null,2));

const server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),BUIO_JSON_DB_FILE:databaseFile,MOCK_AUTH:'1',NODE_ENV:'development',SUPABASE_DB_URL:''},stdio:['ignore','pipe','pipe']});
let logs=''; server.stdout.on('data',(chunk)=>logs+=chunk); server.stderr.on('data',(chunk)=>logs+=chunk);
const waitForServer=async()=>{for(let i=0;i<80;i+=1){try{if((await fetch(`${baseURL}/health`)).ok)return;}catch{}await new Promise((resolve)=>setTimeout(resolve,125));}throw new Error(`Server did not start.\n${logs}`);};
const ok=async(response,label)=>{const body=await response.json().catch(()=>null);assert.equal(response.ok(),true,`${label}: ${response.status()} ${JSON.stringify(body)}`);return body;};

let browser;
try{
  await waitForServer();
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({baseURL,viewport:{width:1180,height:820},deviceScaleFactor:1});
  const page=await context.newPage(); const errors=[];
  page.on('pageerror',(error)=>errors.push(`pageerror: ${error.message}`));
  page.on('console',(message)=>{if(message.type()==='error')errors.push(`console: ${message.text()}`);});
  await context.request.get('/api/auth/me');
  await ok(await context.request.post('/api/pet/dev/unlimited-money'),'unlimited money');
  await ok(await context.request.post('/api/pet/starter-egg/hatch',{headers:{'Idempotency-Key':'wearables-starter'}}),'starter');
  for(const speciesId of ['starpatch-cat','cloud-ear-dog','pudding-pig']){
    await ok(await context.request.post('/api/pet/eggs/purchase',{data:{kind:'direct',speciesId},headers:{'Idempotency-Key':`wearables-${speciesId}`}}),speciesId);
  }
  for(const itemId of ['head-17','head-20','neck-10','back-02']){
    await ok(await context.request.post('/api/pet/shop/purchase',{data:{itemId,quantity:1},headers:{'Idempotency-Key':`wearables-${itemId}`}}),itemId);
  }
  await ok(await context.request.put('/api/pet/room',{data:{themeId:'sunny-oak',visibility:'private',placements:[]}}),'empty room');
  const bootstrap=await ok(await context.request.get('/api/pet/bootstrap'),'bootstrap');
  const petIds=new Map(bootstrap.pets.map((pet)=>[pet.speciesId,pet.id]));
  for(const speciesId of ['starpatch-cat','cloud-ear-dog','pudding-pig']) assert.ok(petIds.has(speciesId),`${speciesId} was not owned`);

  await page.goto('/pet',{waitUntil:'networkidle'});
  await page.locator('#game-root canvas').waitFor();
  const outfits={helmet:['head-20','neck-10','back-02'],ears:['head-17','neck-10','back-02']};
  const facings=['front','right','back','left'];
  for(const [speciesId,petId] of petIds){
    if(!['starpatch-cat','cloud-ear-dog','pudding-pig'].includes(speciesId))continue;
    await ok(await context.request.post(`/api/pet/pets/${petId}/activate`),`activate ${speciesId}`);
    for(const [outfit,wearableIds] of Object.entries(outfits)){
      await ok(await context.request.put(`/api/pet/pets/${petId}/outfit`,{data:{wearableIds}}),`${speciesId} ${outfit}`);
      await page.reload({waitUntil:'networkidle'}); await page.locator('#game-root canvas').waitFor();
      await page.waitForFunction(()=>window.__petGame?.scene?.getScene('Bedroom')?.avatar?.worn?.length===3,null,{timeout:15000});
      for(const facing of facings){
        await page.evaluate((way)=>window.__petGame.scene.getScene('Bedroom').avatar.play('idle',way),facing);
        await page.waitForTimeout(260);
        const state=await page.evaluate(()=>{
          const scene=window.__petGame.scene.getScene('Bedroom'); const avatar=scene.avatar;
          const body=avatar.sprite; const back=avatar.worn.find((piece)=>piece.slotKey==='back');
          const head=avatar.worn.find((piece)=>piece.slotKey==='head'); const neck=avatar.worn.find((piece)=>piece.slotKey==='neck');
          const canvas=document.querySelector('#game-root canvas');
          const rect=canvas.getBoundingClientRect(); const camera=scene.cameras.main;
          const sx=(camera.x+(avatar.x-camera.scrollX)*camera.zoom)*(rect.width/canvas.width)+rect.x;
          const sy=(camera.y+(avatar.y-camera.scrollY)*camera.zoom)*(rect.height/canvas.height)+rect.y;
          return {
            backIndex:avatar.getIndex(back.image),bodyIndex:avatar.getIndex(body),
            overlayIndex:back.overlay?avatar.getIndex(back.overlay):-1,overlayVisible:Boolean(back.overlay?.visible),
            neckIndex:avatar.getIndex(neck.image),neckVisible:Boolean(neck.image.visible),
            neckShadeVisible:Boolean(neck.shade?.visible),headIndex:avatar.getIndex(head.image),
            backTexture:back.image.texture.key,headTexture:head.image.texture.key,
            headWidth:head.image.displayWidth,bodyWidth:body.displayWidth,sx,sy,
          };
        });
        if(facing==='front'||facing==='right') assert.ok(state.backIndex<state.bodyIndex,`${speciesId} ${facing}: folded wings must remain behind the body`);
        if(facing==='back'){
          assert.ok(state.backIndex<state.bodyIndex,`${speciesId} back: wing base must be behind the body`);
          assert.equal(state.overlayVisible,true,`${speciesId} back: harness overlay is hidden`);
          assert.ok(state.overlayIndex>state.bodyIndex,`${speciesId} back: harness must cross in front of the body`);
          assert.equal(state.neckVisible,false,`${speciesId} back: front-only neckwear is visible from behind`);
          assert.equal(state.neckShadeVisible,false,`${speciesId} back: neckwear shadow is visible from behind`);
          assert.ok(state.headIndex>state.overlayIndex,`${speciesId} back: headwear must stay above the rear harness`);
        }else assert.equal(state.overlayVisible,false,`${speciesId} ${facing}: rear harness overlay leaked into another view`);
        if(facing!=='back') assert.equal(state.neckVisible,true,`${speciesId} ${facing}: neckwear did not return after leaving rear view`);
        if(outfit==='helmet') assert.ok(state.headWidth>=state.bodyWidth*.72,`${speciesId} ${facing}: helmet is too small to enclose the head`);
        const clip={x:Math.max(0,Math.min(880,state.sx-150)),y:Math.max(0,Math.min(520,state.sy-190)),width:300,height:300};
        await page.screenshot({path:path.join(artifactDir,`${speciesId}-${outfit}-${facing}.png`),clip});
      }
    }
  }
  assert.deepEqual(errors,[],errors.join('\n'));
  console.log(`✓ three pets × two outfits × four directions: ${artifactDir}`);
  console.log('✓ neckwear is hidden from behind and returns in front/profile views');
  console.log('✓ helmet scale encloses each head; folded wings stay behind; rear harness crosses in front');
  await context.close();
}finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
  await fs.rm(tempDir,{recursive:true,force:true});
}
