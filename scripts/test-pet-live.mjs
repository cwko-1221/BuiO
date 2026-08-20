import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

/** Slots on the equipment board, and how many of them have no collection behind them yet. */
const OUTFIT_SLOT_COUNT=9; const OUTFIT_SEALED_COUNT=4;
const require=createRequire(import.meta.url); const { catalog }=require('../pet-app/lib/catalog.js');

const reservePort = () => new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const port=await reservePort(); const baseURL=`http://127.0.0.1:${port}`;
const tempDir=await fs.mkdtemp(path.join(os.tmpdir(),'buio-pet-live-')); const databaseFile=path.join(tempDir,'db.json');
// PET_PLAYTEST_DIR lets concurrent workstreams capture to their own folder instead of
// overwriting each other's screenshots in the shared default.
const artifactDir=path.resolve(process.env.PET_PLAYTEST_DIR||'artifacts/pet-playtest'); await fs.mkdir(artifactDir,{recursive:true});
await fs.writeFile(databaseFile,JSON.stringify({
  users:[
    {studentid:'S001',name:'陳小星',passwordhash:bcrypt.hashSync('student123',4),role:'student',classname:'5A',classno:1,language:'zh-HK'},
    {studentid:'S002',name:'李月兒',passwordhash:bcrypt.hashSync('student123',4),role:'student',classname:'5A',classno:2,language:'zh-HK'},
    {studentid:'T001',name:'黃老師',passwordhash:bcrypt.hashSync('teacher123',4),role:'teacher',classname:'',classno:null,language:'zh-HK'},
  ],studentStats:[],questionLogs:[],_logId:0,
},null,2));

const server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),BUIO_JSON_DB_FILE:databaseFile,MOCK_AUTH:'1',NODE_ENV:'development',SUPABASE_DB_URL:''},stdio:['ignore','pipe','pipe']});
let logs=''; server.stdout.on('data',(chunk)=>logs+=chunk); server.stderr.on('data',(chunk)=>logs+=chunk);
const waitForServer=async()=>{for(let index=0;index<80;index+=1){try{const response=await fetch(`${baseURL}/health`);if(response.ok)return;}catch{}await new Promise((resolve)=>setTimeout(resolve,125));}throw new Error(`Server did not start.\n${logs}`);};
const waitImages=async(page)=>page.waitForFunction(()=>[...document.images].filter((image)=>image.offsetParent!==null).every((image)=>image.complete&&image.naturalWidth>0));

let browser;
try {
  await waitForServer();
  const anonymous=await fetch(`${baseURL}/pet`,{redirect:'manual'}); assert.equal(anonymous.status,302);
  assert.equal((await fetch(`${baseURL}/pet/assets/art/manifest.json`)).status,404);
  assert.equal((await fetch(`${baseURL}${catalog.pets[0].art[0]}`)).status,200);
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({baseURL,viewport:{width:1440,height:900},deviceScaleFactor:1});
  const page=await context.newPage(); const errors=[];
  page.on('pageerror',(error)=>errors.push(`pageerror: ${error.message}`));
  page.on('console',(message)=>{if(message.type()==='error')errors.push(`console: ${message.text()}`);});
  await context.request.get('/api/auth/me');
  await page.goto('/pet',{waitUntil:'networkidle'});
  await page.locator('[data-action="hatch"]').waitFor();
  await page.screenshot({path:path.join(artifactDir,'01-starter-egg-desktop.png')});
  await page.locator('[data-action="hatch"]').click();
  await page.locator('.reveal-card').waitFor(); await waitImages(page);
  await page.screenshot({path:path.join(artifactDir,'02-hatch-reveal-desktop.png')});
  await page.locator('.modal-card [data-action="back-home"]').click();
  await page.locator('#game-root canvas').waitFor();
  await page.locator('[data-tab="collection"]').click(); await page.locator('.pet-card').first().waitFor();
  // Browsing tabs do not show the room at all.
  assert.equal(await page.locator('#petMain').getAttribute('data-layout'),'full');
  assert.equal(await page.locator('.room-stage').isVisible(),false);
  assert.equal(await page.locator('.pet-card').count(),20);
  await page.setViewportSize({width:1180,height:820}); await page.screenshot({path:path.join(artifactDir,'03-collection-ipad-landscape.png')});
  await page.locator('[data-tab="shop"]').click(); await page.locator('.shop-feature').waitFor();
  assert.match(await page.locator('.shop-feature').innerText(),/55%/);

  // The room tab now puts its controls in a bar above a full-width play surface rather than
  // in a side panel, so assert on the bar and that the room genuinely owns the full width.
  await page.locator('[data-tab="home"]').click(); await page.locator('.room-bar-actions').waitFor();
  assert.equal(await page.locator('#petMain').getAttribute('data-layout'),'room');
  assert.equal(await page.locator('.side-panel').isVisible(),false);
  // Returning from a browsing tab un-hides the stage. Measuring the parent synchronously
  // then leaves Phaser sizing the canvas to 0x0, so the room renders nothing despite the
  // scene being active — assert the canvas actually has a size on the way back.
  await page.waitForFunction(()=>{
    const c=document.querySelector('#game-root canvas');
    return !!c && c.clientWidth>200 && c.clientHeight>200;
  },null,{timeout:4000}).catch(async()=>{
    const box=await page.locator('#game-root canvas').boundingBox();
    throw new assert.AssertionError({message:`room canvas stayed collapsed on return: ${JSON.stringify(box)}`,actual:box,expected:'sized'});
  });
  const stageWidth=(await page.locator('.room-stage').boundingBox()).width;
  const mainWidth=(await page.locator('#petMain').boundingBox()).width;
  assert.equal(Math.round(stageWidth),Math.round(mainWidth),'the room must span the full width of the app on the room tab');
  await page.locator('[data-action="decorate"]').click(); await page.locator('[data-action="open-themes"]').waitFor();
  // Native <select> popups are drawn by the OS and cannot be styled, so the decorate bar
  // must not contain any.
  assert.equal(await page.locator('.decor-head select').count(),0,'decorate controls must not use native selects');
  // Inventory counts track what is already in the room, in real time.
  // Pin the id first: ":not([disabled])" is re-evaluated on every use, so after the piece is
  // disabled the same locator would silently resolve to the next available button.
  const spareId=await page.locator('.decor-strip [data-action="add-furniture"]:not([disabled])').first().getAttribute('data-id');
  const spare=page.locator(`[data-action="add-furniture"][data-id="${spareId}"]`);
  assert.equal(await spare.locator('small').innerText(),'×1');
  await spare.click();
  await page.waitForFunction((id)=>document.querySelector(`[data-action="add-furniture"][data-id="${id}"]`)?.hasAttribute('disabled'),spareId);
  assert.equal(await spare.locator('small').innerText(),'×0');
  assert.equal(await spare.isDisabled(),true,'a placed piece must leave the selectable strip');
  // A piece has to land where the drag showed it. It was being snapped to the middle of its
  // footprint while dragging and anchored on the front edge once dropped, so every piece fell
  // half its own depth below the cell it had been shown on.
  const carried = await page.evaluate(() => {
    const scene = window.__petGame.scene.getScene('Bedroom');
    const placement = scene.placements[scene.placements.length - 1];
    const [w, h] = scene.footprintOf(placement.itemId, placement.rotation);
    const shownWhileDragging = scene.gridToScreen(placement.x + w / 2, placement.y + h / 2);
    const whereItLands = scene.footprintCentre(placement);
    return { shownWhileDragging, whereItLands };
  });
  assert.ok(Math.hypot(carried.shownWhileDragging.x - carried.whereItLands.x,
    carried.shownWhileDragging.y - carried.whereItLands.y) < 0.5,
    'a dropped piece does not land where the drag showed it');

  // One press is one step, however many times the room has been rebuilt. The listeners were
  // registered with inline arrows and so could never be taken off, and a second copy joined them
  // on every restart until a single press on Bigger took a one-tile chest straight to nine.
  const stepped = await page.evaluate(() => {
    const scene = window.__petGame.scene.getScene('Bedroom');
    const placement = scene.placements[scene.placements.length - 1];
    // Somewhere it has room to grow, so the step is refused for no reason other than the bug.
    for (let y = 0; y < 10; y += 1) for (let x = 0; x < 14; x += 1) {
      if (!scene.fits(placement.itemId, x, y, placement.rotation, placement.id, (placement.size || 0) + 1)) continue;
      placement.x = x; placement.y = y;
      const start = placement.size || 0;
      scene.game.events.emit('room:grow-selected', placement.id);
      const once = placement.size || 0;
      scene.game.events.emit('room:shrink-selected', placement.id);
      return { start, once, back: placement.size || 0 };
    }
    return null;
  });
  assert.ok(stepped, 'nowhere in the room a piece could be grown, so one press could not be checked');
  assert.equal(stepped.once - stepped.start, 1, 'one press on Bigger moved more than one step');
  assert.equal(stepped.back, stepped.start, 'Smaller did not undo one press of Bigger');

  // Bigger and smaller step the footprint a tile on each side, so a one-tile chest becomes four,
  // and the piece stays centred on the floor it now occupies rather than on the floor it used to.
  const resized = await page.evaluate(() => {
    const scene = window.__petGame.scene.getScene('Bedroom');
    const placement = scene.placements[scene.placements.length - 1];
    const before = scene.footprintOf(placement.itemId, placement.rotation, placement.size);
    scene.game.events.emit('room:grow-selected', placement.id);
    const after = scene.footprintOf(placement.itemId, placement.rotation, placement.size);
    const piece = scene.furniture.get(placement.id);
    const [w, h] = after;
    const left = scene.gridToScreen(placement.x, placement.y + h / 2);
    const right = scene.gridToScreen(placement.x + w, placement.y + h / 2);
    // The container sits where the piece meets the floor and the art is centred on it, so the
    // container's own x is the middle of the piece.
    return { before, after, middleOfFloor: (left.x + right.x) / 2, middleOfPiece: piece ? piece.x : null };
  });
  if (resized.middleOfPiece !== null && resized.after[0] > resized.before[0]) {
    assert.ok(Math.abs(resized.middleOfFloor - resized.middleOfPiece) < 2,
      'a resized piece is not centred on the floor it occupies');
  }

  await page.screenshot({path:path.join(artifactDir,'06-decoration-ipad-landscape.png')});
  await page.locator('[data-tab="home"]').click(); await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(250);
  await page.screenshot({path:path.join(artifactDir,'07-home-mobile.png')});

  const teacherContext=await browser.newContext({baseURL,viewport:{width:1440,height:900}});
  const login=await teacherContext.request.post('/api/auth/login',{data:{studentId:'T001',password:'teacher123'}}); assert.equal(login.status(),200);
  const teacherPage=await teacherContext.newPage();
  teacherPage.on('pageerror',(error)=>errors.push(`teacher pageerror: ${error.message}`));
  teacherPage.on('console',(message)=>{if(message.type()==='error')errors.push(`teacher console: ${message.text()}`);});
  await teacherPage.goto('/pet',{waitUntil:'networkidle'}); await teacherPage.locator('.teacher-shell').waitFor();
  assert.equal(await teacherPage.locator('[data-student]').count(),2);
  await teacherPage.locator('[data-student="S001"]').check();
  await teacherPage.locator('#grantAmount').fill('250'); await teacherPage.locator('#previewGrant').click();
  await teacherPage.locator('.grant-confirm').waitFor(); await teacherPage.screenshot({path:path.join(artifactDir,'08-teacher-grant-confirmation.png')});
  await teacherPage.locator('#commitGrant').click(); await teacherPage.locator('#grantMessage').waitFor();
  await teacherPage.waitForFunction(()=>document.querySelector('#grantMessage')?.textContent?.includes('250'));
  await teacherPage.screenshot({path:path.join(artifactDir,'09-teacher-grant-complete.png')});
  await page.setViewportSize({width:1180,height:820}); await page.reload({waitUntil:'networkidle'});
  await page.locator('#coinBalance').waitFor(); assert.equal((await page.locator('#coinBalance').innerText()).replace(/,/g,''),'250');
  // A worn item has to ride the pose, not sit at a fixed spot on the canvas. The head travels up
  // to 45px on a 160px cell inside a single action, so a crown pinned to the resting anchors
  // slides off the head as soon as the creature breathes — and a crown whose size wobbles frame
  // to frame means the landmark track is spiking rather than tracking. Nothing about either is
  // visible from the DOM, so this reaches into the running scene.
  const buy=await context.request.post('/api/pet/shop/purchase',{data:{itemId:'head-01',quantity:1},headers:{'Idempotency-Key':'live-crown'}});
  assert.equal(buy.status(),201);
  // The purchase went through the API, so the open page still holds the old inventory.
  await page.reload({waitUntil:'networkidle'}); await page.locator('#game-root canvas').waitFor();
  // Equip through the board the way a child does, rather than through the API, so the slots and
  // the drag gesture are covered too. Native HTML5 dragging is dead on iOS, so this is a pointer
  // gesture: press the tile, move, and drop it on the slot that accepts it.
  await page.locator('[data-action="open-outfit"]').click(); await page.locator('.gear-board').waitFor();
  assert.equal(await page.locator('.gear-slot').count(),OUTFIT_SLOT_COUNT);
  assert.equal(await page.locator('.gear-slot.sealed').count(),OUTFIT_SEALED_COUNT);
  await page.locator('.gear-tile[data-id="head-01"]').scrollIntoViewIfNeeded();
  const tile=await page.locator('.gear-tile[data-id="head-01"]').boundingBox();
  const target=await page.locator('.gear-slot[data-slot="head"]').boundingBox();
  await page.mouse.move(tile.x+tile.width/2,tile.y+tile.height/2); await page.mouse.down();
  for(let step=1;step<=6;step+=1){
    await page.mouse.move(
      tile.x+tile.width/2+((target.x+target.width/2)-(tile.x+tile.width/2))*step/6,
      tile.y+tile.height/2+((target.y+target.height/2)-(tile.y+tile.height/2))*step/6);
    await page.waitForTimeout(25);
  }
  assert.equal(await page.locator('.gear-ghost-drag').count(),1,'nothing is following the pointer during a drag');
  assert.equal(await page.locator('.gear-slot[data-slot="head"].over').count(),1,'the receiving slot does not light up');
  await page.mouse.up();
  await page.locator('.gear-slot[data-slot="head"].filled').waitFor({timeout:8000});
  await page.screenshot({path:path.join(artifactDir,'11-equipment-board.png')});
  // The figure in the middle previews the outfit by stacking the pieces over one atlas cell, all
  // sized and positioned in fractions of that cell. A piece can legitimately come out wider than
  // the cell — a crown on a round-bodied creature, a pair of wings — and the page's global
  // img rule quietly capped those at the stack's width while their offsets still assumed the
  // full size, which slid the whole outfit up and to the left. Assert what is drawn is the size
  // it was told to be.
  // A creature whose pose sheet has not been imported has no anchors to hang an outfit on, so
  // the board shows its still portrait instead of a stack. That is the intended fallback, and the
  // sizing this guards only exists on the stack.
  const previewShown=await page.evaluate(()=>Boolean(document.querySelector('.gear-figure .figure-stack, .gear-figure img')));
  assert.ok(previewShown,'the equipment board shows no creature at all');
  const previewFits=await page.evaluate(()=>{
    const stack=document.querySelector('.figure-stack'); if(!stack) return [];
    const width=stack.getBoundingClientRect().width;
    return [...document.querySelectorAll('.figure-piece')].map((piece)=>({
      declared:Math.round(width*parseFloat(piece.style.width)/100),
      drawn:Math.round(piece.getBoundingClientRect().width),
      capped:getComputedStyle(piece).maxWidth,
    }));
  });
  for(const piece of previewFits){
    assert.equal(piece.capped,'none','a preview piece must not be capped to the stack width');
    assert.ok(Math.abs(piece.drawn-piece.declared)<=1,`preview piece drawn at ${piece.drawn}px but sized ${piece.declared}px`);
  }
  await page.locator('.picker-head [data-action="close-modal"]').click();

  // The frames below only mean something on a creature whose pose sheet has been imported — the
  // rest are still on placeholder art and hold one picture by design. Buy an animated species
  // and make it the active pet, so the outfit is checked against art that actually moves.
  const animated=catalog.pets.filter((pet)=>pet.animated&&pet.rarity!=='epic');
  assert.ok(animated.length,'no animated species to check a moving outfit against');
  const wanted=animated[0].id;
  await page.locator('[data-tab="shop"]').click();
  await page.locator('[data-action="shop-category"][data-id="eggs"]').click();
  const buyAnimated=page.locator(`[data-action="buy-direct-egg"][data-id="${wanted}"]`);
  await buyAnimated.waitFor();
  if(await buyAnimated.isEnabled()) { await buyAnimated.click(); await buyAnimated.waitFor(); }
  await page.locator('[data-tab="collection"]').click();
  const choose=page.locator(`.pet-card:has(img[src*="${wanted}-"]) [data-action="activate"]`);
  await choose.waitFor();
  if(await choose.isEnabled()) await choose.click();
  await page.waitForFunction((id)=>document.querySelector(`.pet-card:has(img[src*="${id}-"]) [data-action="activate"]`)?.hasAttribute('disabled'),wanted,{timeout:15000});

  await page.reload({waitUntil:'networkidle'}); await page.locator('#game-root canvas').waitFor();
  await page.waitForFunction(()=>window.__petGame?.scene?.getScene('Bedroom')?.avatar?.worn?.length>0,null,{timeout:15000});
  const worn=await page.evaluate(async()=>{
    const avatar=window.__petGame.scene.getScene('Bedroom').avatar; const out=[];
    for(let index=0;index<40;index+=1){
      out.push({cell:Number(avatar.sprite?.frame?.name),y:Number(avatar.worn[0].image.y.toFixed(2)),scale:Number(avatar.worn[0].image.scaleX.toFixed(4)),shaded:!!avatar.worn[0].shade,tint:avatar.worn[0].image.tintTopLeft});
      await new Promise((resolve)=>setTimeout(resolve,40));
    }
    return out;
  });
  const seen=(key)=>new Set(worn.map((sample)=>sample[key])).size;
  assert.ok(seen('cell')>1,'the pet never changed frame, so the outfit check proved nothing');
  assert.ok(seen('y')>1,'the crown held one position across frames - it is not following the head');
  assert.equal(seen('scale'),1,'the crown resized between frames - the landmark track is spiking');
  assert.ok(worn[0].shaded,'the crown casts no contact shadow');
  assert.notEqual(worn[0].tint,0xffffff,'the crown is not picking up the room light');
  await page.screenshot({path:path.join(artifactDir,'10-outfit-ipad-landscape.png')});

  // The child points at the floor and the pet goes there. It has to arrive, sort by the row it
  // stands on so the furniture in front of it covers it, never cross a wardrobe on the way, and
  // stay put when nobody is asking - a pet that strolls off on its own makes the tap feel
  // ignored. The whole grid also has to be on screen, or the far rows cannot be tapped at all.
  await page.locator('[data-tab="home"]').click(); await page.locator('#game-root canvas').waitFor();
  await page.waitForFunction(()=>window.__petGame?.scene?.getScene('Bedroom')?.avatar,null,{timeout:15000});
  await page.waitForTimeout(600);
  const reachable=await page.evaluate(()=>{
    const scene=window.__petGame.scene.getScene('Bedroom'); const camera=scene.cameras.main;
    return [[0,0],[13,0],[0,9],[13,9]].every(([x,y])=>{
      const point=scene.gridToScreen(x+0.5,y+1);
      return point.x>=0&&point.y>=0&&point.x<=camera.width&&point.y<=camera.height;
    });
  });
  assert.ok(reachable,'part of the placement grid is off screen, so the far rows cannot be tapped');

  // Somewhere free to send it, deliberately off the middle of its cell: the creature walks the
  // floor rather than the grid, so it has to stop where it was sent and not on the nearest cell.
  const destination=await page.evaluate(()=>{
    const scene=window.__petGame.scene.getScene('Bedroom');
    const blocked=scene.blockedCells();
    const here=scene.cellUnder(scene.petSpot);
    for(let y=9;y>=0;y-=1)for(let x=13;x>=0;x-=1){
      if(!blocked.has(x+':'+y)&&(x!==here.x||y!==here.y)) return {x:x+0.28,y:y+0.72};
    }
    return null;
  });
  assert.ok(destination,'the room has no free cell to send the pet to');
  const spot=await page.evaluate((at)=>{
    const game=window.__petGame; const scene=game.scene.getScene('Bedroom');
    const point=scene.gridToScreen(at.x,at.y);
    const box=game.canvas.getBoundingClientRect(); const scale=box.width/scene.cameras.main.width;
    return {x:box.x+point.x*scale,y:box.y+point.y*scale};
  },destination);
  await page.mouse.click(spot.x,spot.y);
  await page.waitForFunction((want)=>{
    const scene=window.__petGame.scene.getScene('Bedroom');
    return Math.abs(scene.petSpot.x-want.x)<0.06&&Math.abs(scene.petSpot.y-want.y)<0.06;
  },destination,{timeout:20000});
  const arrival=await page.evaluate(()=>{
    const scene=window.__petGame.scene.getScene('Bedroom');
    return {spot:scene.petSpot,cell:scene.cellUnder(scene.petSpot),depth:scene.avatar.depth,blocked:[...scene.blockedCells()]};
  });
  assert.ok(Math.abs(arrival.spot.x-Math.round(arrival.spot.x))>0.05,'the pet snapped to a cell instead of stopping where it was sent');
  assert.equal(Math.round((arrival.depth-20-arrival.spot.y)*1000)/1000,0.5,'depth does not follow where the pet stands');
  assert.ok(!arrival.blocked.includes(arrival.cell.x+':'+arrival.cell.y),'the pet ended up standing on furniture');

  await page.waitForTimeout(3000);
  const unattended=await page.evaluate(()=>window.__petGame.scene.getScene('Bedroom').petSpot);
  assert.ok(Math.hypot(unattended.x-arrival.spot.x,unattended.y-arrival.spot.y)<0.1,'the pet wandered off on its own instead of waiting to be told');

  assert.deepEqual(errors,[]);
  await teacherContext.close(); await context.close();
  console.log(`✓ protected student and teacher role routing`);
  console.log(`✓ hatch, collection, decoration and grant flows`);
  console.log(`✓ desktop, iPad landscape and mobile screenshots: ${artifactDir}`);
  console.log(`✓ equipment board: ${OUTFIT_SLOT_COUNT} slots, drag-to-equip, ${OUTFIT_SEALED_COUNT} awaiting art`);
  console.log(`✓ the board previews the outfit on the creature at the size it computed`);
  console.log(`✓ the whole floor is reachable and the creature walks where it is told`);
  console.log(`✓ worn items track the pose, cast contact shadows and take the room light`);
  console.log(`✓ no browser console or uncaught page errors`);
} finally {
  if(browser) await browser.close();
  server.kill(); await new Promise((resolve)=>setTimeout(resolve,250));
  await fs.rm(tempDir,{recursive:true,force:true});
}
