import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const root = path.resolve('.');
const require = createRequire(path.join(root, 'pet-app/package.json'));
const { createServer } = require('vite');
const port = await new Promise((resolve) => { const socket = net.createServer(); socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); }); });
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-arcade-prizes-live-'));
const dbFile = path.join(temp, 'db.json');
const artifacts = path.resolve(process.env.PET_PLAYTEST_DIR || 'artifacts/pet-playtest/arcade-prizes-20260927');
await fs.mkdir(artifacts, { recursive: true });
await fs.writeFile(dbFile, JSON.stringify({ users: [{studentid:'S001',name:'獎品測試',passwordhash:bcrypt.hashSync('test',4),role:'student',classname:'5A',language:'zh-HK'}], studentStats:[],questionLogs:[],_logId:0 }));
const server = spawn(process.execPath, ['server.js'], { cwd:root, env:{...process.env,PORT:String(port),BUIO_JSON_DB_FILE:dbFile,MOCK_AUTH:'1',NODE_ENV:'development',SUPABASE_DB_URL:''}, stdio:['ignore','pipe','pipe'] });
let logs = ''; server.stdout.on('data', (data) => logs += data); server.stderr.on('data', (data) => logs += data);
const wait = async (predicate, description, timeout=20000) => { const end=Date.now()+timeout; while(Date.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,80));}throw new Error(description); };
const errors = [];
let browser, vite, page;
const browserDiagnostics=[];
try {
  const baseURL = `http://127.0.0.1:${port}`;
  await wait(async()=>{try{return(await fetch(baseURL+'/health')).ok;}catch{return false;}},'isolated server startup');
  browser = await chromium.launch({headless:true,channel:'chrome'});
  const context = await browser.newContext({baseURL,viewport:{width:1440,height:900}});
  page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(['error','warning'].includes(message.type()))browserDiagnostics.push(message.text());});
  await context.request.get('/api/auth/me'); await context.request.post('/api/pet/dev/unlimited-money');
  await page.goto('/pet'); await page.locator('[data-action="hatch"]').click();
  await page.locator('.reveal-card').waitFor(); await page.locator('[data-action="back-home"]').click();
  const bootstrap = () => context.request.get('/api/pet/bootstrap').then(r=>r.json());
  const firstStock=await (await context.request.post('/api/pet/coin-pusher/prizes')).json();
  assert.equal(firstStock.prizes.length,1,'new cabinet has one prize');
  assert.equal(firstStock.dropsUntilRestock,100);
  await page.locator('[data-tab="coinPusher"]').click();
  await wait(async()=>await page.locator('#coin-pusher-root').getAttribute('data-prize-count')==='1','new cabinet renders only one prize');
  await page.screenshot({path:path.join(artifacts,'new-cabinet-one-prize-desktop.png')});
  await page.locator('.coin-pusher-reset').click();
  assert.equal((await (await context.request.post('/api/pet/coin-pusher/prizes')).json()).prizes.length,1,'reset cannot mint extra initial prizes');
  await page.locator('.coin-pusher-back').click();
  // Earn the remaining three categories in this isolated fixture before running
  // the existing artwork, catch, +50 and voucher-redemption regression.
  for(let i=0;i<300;i++){
    const response=await context.request.post('/api/pet/coin-pusher/play',{headers:{'Idempotency-Key':`prize-qa-${i}`},data:{}});
    assert.equal(response.status(),200);
    if(i===98){const beforeRestock=await (await context.request.post('/api/pet/coin-pusher/prizes')).json();assert.equal(beforeRestock.prizes.length,1);assert.equal(beforeRestock.dropsUntilRestock,1);}
    if(i===99){const afterRestock=await (await context.request.post('/api/pet/coin-pusher/prizes')).json();assert.equal(afterRestock.prizes.length,2);assert.equal(afterRestock.dropsUntilRestock,100);}
  }
  const initial = await bootstrap();
  await page.reload(); // Clear the first preview's GLB byte cache before fault injection.
  let failedArtworkOnce=false,artworkRequests=0;
  await page.route('**/arcade-prizes-v2-*.glb',async route=>{
    artworkRequests++;
    if(!failedArtworkOnce){failedArtworkOnce=true;await route.fulfill({status:503,body:'artwork load fixture'});}
    else await route.continue();
  });
  await page.locator('[data-tab="coinPusher"]').click();
  await page.locator('.coin-pusher-retry').waitFor({state:'visible',timeout:30000});
  assert.equal((await bootstrap()).wallet.balance,initial.wallet.balance,'failed prize artwork spends and awards nothing');
  await page.locator('.coin-pusher-retry').click();
  await wait(async()=>await page.locator('#coin-pusher-root').getAttribute('data-prize-count')==='4','initial four physical prizes');
  assert.ok(artworkRequests>=2,'failed artwork is fetched again on retry, not cached forever');
  const lostContext=await page.locator('.coin-pusher-canvas').evaluate(canvas=>{
    const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
    const extension=gl?.getExtension('WEBGL_lose_context');
    if(!extension)return false;
    extension.loseContext();setTimeout(()=>extension.restoreContext(),600);return true;
  });
  assert.ok(lostContext,'test browser supports WebGL loss');
  await wait(async()=>await page.locator('#coin-pusher-root').getAttribute('data-webgl')==='lost','context loss registered');
  await wait(async()=>await page.locator('#coin-pusher-root').getAttribute('data-webgl')!=='lost'&&await page.locator('#coin-pusher-root').getAttribute('aria-busy')==='false','new prize GLBs survive context restoration');
  const stock = await (await context.request.post('/api/pet/coin-pusher/prizes')).json();
  const ids = stock.prizes.map(p=>p.id);
  for (const viewport of [{width:1440,height:900,name:'desktop'},{width:1180,height:820,name:'ipad-landscape'},{width:390,height:844,name:'phone'}]) {
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    await page.waitForTimeout(200);
    await page.screenshot({path:path.join(artifacts,`prizes-board-${viewport.name}.png`)});
    await page.locator('.coin-pusher-reset').click();
    await wait(async()=>await page.locator('#coin-pusher-root').getAttribute('data-prize-count')==='4','reset retains the same four prize bodies');
    assert.deepEqual((await (await context.request.post('/api/pet/coin-pusher/prizes')).json()).prizes.map(p=>p.id),ids);
  }
  assert.equal((await bootstrap()).wallet.balance,initial.wallet.balance,'reset and stock checks never pay/spend');
  await page.setViewportSize({width:1440,height:900});
  await page.locator('.coin-pusher-back').click();
  // Seed an isolated saved-world fixture just beyond the real support edge. No production
  // debug interface: the real IndexedDB restore, Rapier fall, catch event, API and wallet run.
  vite = await createServer({root:path.join(root,'pet-app'),server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error',ssr:{noExternal:['@dimforge/rapier3d']}});
  const {CoinPusherModel} = await vite.ssrLoadModule('/src/game/CoinPusherModel.ts');
  const dimensions = await vite.ssrLoadModule('/src/game/CoinPusherDimensions.ts');
  const model = new CoinPusherModel();
  for(const coin of [...model.coins]) model.removeCoin(coin);
  model.syncPrizes(stock.prizes);
  for(const [i,coin] of model.coins.entries()) coin.body.setTranslation({x:(i-1.5)*.65,y:.13,z:dimensions.MAIN_DECK_SUPPORT_FRONT_Z+.11},true);
  const snapshot = model.createSnapshot(); model.destroy();
  await page.goto('/health');
  await page.evaluate(async(model)=>{await new Promise((resolve,reject)=>{const open=indexedDB.open('buio-pet-coin-pusher',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result;const tx=db.transaction('studentSessions','readwrite');tx.objectStore('studentSessions').put({version:1,studentId:'S001',updatedAt:Date.now(),model,plays:[],payoutSequence:0,pendingPayouts:[],pendingPrizes:[]});tx.oncomplete=()=>{db.close();resolve();};};});},snapshot);
  let lostReply = false;
  const claims = [];
  await page.route('**/coin-pusher/prizes/*/claim',async(route)=>{
    const response=await route.fetch(); const body=await response.json(); claims.push(body);
    if(body.kind==='ruby'&&!lostReply){lostReply=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'lost committed ruby reply'})});}
    else await route.fulfill({response});
  });
  await page.goto('/pet'); await page.locator('[data-tab="coinPusher"]').click();
  await page.locator('.coin-pusher-reward-fly').filter({hasText:'+50'}).first().waitFor({state:'visible',timeout:30000});
  await page.screenshot({path:path.join(artifacts,'ruby-plus-50-desktop.png'),animations:'allow'});
  await wait(async()=>(await bootstrap()).wallet.balance===initial.wallet.balance+50,'one exact ruby +50 wallet credit');
  await wait(async()=>await page.locator('#coin-pusher-root').getAttribute('data-prize-count')==='0','all caught trophies disappear');
  await wait(async()=>{const prizes=(await (await context.request.post('/api/pet/coin-pusher/prizes')).json()).prizes;return prizes.filter(p=>p.status==='bag').length===3;},'three vouchers saved in server bag',30000);
  assert.ok(claims.filter(c=>c.kind==='ruby').length>=2,'lost committed ruby response was retried');
  const journal=JSON.parse(await fs.readFile(dbFile,'utf8'));
  assert.equal(journal.petCurrencyLedger.filter(x=>x.kind==='arcade_ruby').length,1);
  assert.equal(journal.petCoinPusherPayouts.length,0,'prizes never additionally receive ordinary +1');
  await page.reload(); await page.locator('[data-tab="coinPusher"]').click();
  await wait(async()=>await page.locator('#coin-pusher-root').getAttribute('aria-busy')==='false','restored cabinet ready');
  assert.equal(await page.locator('#coin-pusher-root').getAttribute('data-prize-count'),'0');
  assert.equal((await bootstrap()).wallet.balance,initial.wallet.balance+50);
  await page.locator('.coin-pusher-collection').click(); await page.locator('#modalRoot [data-action="arcade-prize-bag"]').click();
  await page.locator('.arcade-prize-card').first().waitFor();
  for(const viewport of [{width:1440,height:900,name:'desktop'},{width:1180,height:820,name:'ipad-landscape'},{width:390,height:844,name:'phone'}]){
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    await page.screenshot({path:path.join(artifacts,`prize-bag-${viewport.name}.png`)});
    const overflow=await page.locator('.arcade-prize-picker').first().evaluate(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth||r.top<0||r.bottom>innerHeight;});
    assert.equal(overflow,false,`${viewport.name} prize bag fits screen`);
  }
  const pet = stock.prizes.find(p=>p.kind==='pet');
  await page.locator(`[data-action="arcade-prize-picker"][data-id="${pet.id}"]`).click();
  const choiceIds=await page.locator('[data-action="arcade-prize-confirm"]').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));
  assert.ok(choiceIds.length>0);
  assert.ok(initial.catalog.pets.filter(p=>p.rarity==='epic').every(p=>!choiceIds.includes(p.id)));
  assert.ok(initial.pets.every(p=>!choiceIds.includes(p.speciesId)));
  await page.screenshot({path:path.join(artifacts,'pet-voucher-choices-phone.png')});
  const target = choiceIds[0]; await page.locator('[data-action="arcade-prize-confirm"]').first().click();
  await page.locator('[data-action="arcade-prize-redeem"]').click();
  await wait(async()=>(await bootstrap()).pets.some(p=>p.speciesId===target),'pet voucher grants selected pet');
  await wait(async()=>await page.locator('.arcade-prize-card').count()===2,'pet coupon consumed once');
  for(const kind of ['wearable','furniture']){
    const prize=stock.prizes.find(p=>p.kind===kind);
    await page.locator(`[data-action="arcade-prize-picker"][data-id="${prize.id}"]`).click();
    const state=await bootstrap(); const source=kind==='wearable'?state.catalog.wearables:state.catalog.furniture;
    const item=[...source].filter(p=>!state.inventory.some(i=>i.itemId===p.id&&i.quantity>0)).sort((a,b)=>b.price-a.price)[0];
    await page.locator(`[data-action="arcade-prize-confirm"][data-id="${item.id}"]`).click();
    await page.locator('[data-action="arcade-prize-redeem"]').click();
    await wait(async()=>(await bootstrap()).inventory.some(i=>i.itemId===item.id&&i.quantity===1),`${kind} voucher grants expensive item`);
    await wait(async()=>await page.locator('[data-action="arcade-prize-picker"]').count()===(kind==='wearable'?1:0),'voucher removed from bag');
  }
  assert.equal((await bootstrap()).wallet.balance,initial.wallet.balance+50,'redemptions cost no coins');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#modalRoot .modal-card').count(),0,'Escape closes bag, not bedroom exit');
  assert.equal(await page.locator('#coin-pusher-root').count(),1);
  await page.locator('.coin-pusher-back').click();
  await page.locator('#roomBar [data-action="arcade-prize-bag"]').click();
  await page.locator('.arcade-prize-picker').first().waitFor();
  assert.equal(await page.locator('.arcade-prize-card').count(),0,'redeemed bag is accessible in bedroom');
  assert.deepEqual(errors,[]);
  const report={pass:true,initialPrizes:1,restockDrops:100,artworkRetry:true,artworkContextRecovery:true,rubyCredit:50,vouchersRedeemed:3,duplicateRubyCredits:0,viewports:['desktop','ipad-landscape','phone'],errors};
  await fs.writeFile(path.join(artifacts,'report.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify(report));
} catch(error){
  await page?.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});
  console.error(JSON.stringify({pass:false,message:error.stack,errors,browserDiagnostics,pageText:await page?.locator('body').innerText().catch(()=>''),logs:logs.slice(-2000)}));process.exitCode=1;
}
finally{await browser?.close();await vite?.close();server.kill();}
