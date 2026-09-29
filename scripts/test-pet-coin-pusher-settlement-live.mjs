import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const root=path.resolve('.');
const require=createRequire(path.join(root,'pet-app/package.json'));
const {createServer}=require('vite');
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const baseURL=`http://127.0.0.1:${port}`;
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-payout-qa-'));
const databaseFile=path.join(temp,'db.json');
const artifacts=path.resolve(process.env.PET_PLAYTEST_DIR||'artifacts/pet-playtest/settlement-20260929');
await fs.mkdir(artifacts,{recursive:true});
await fs.writeFile(databaseFile,JSON.stringify({users:[{studentid:'S001',name:'派彩測試',passwordhash:bcrypt.hashSync('test',4),role:'student',classname:'5A',language:'en-US'}],studentStats:[],questionLogs:[],_logId:0,petArcadePrizes:[{studentId:'S001',state:{issued:1000000,prizes:[]}}]}));
const server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),BUIO_JSON_DB_FILE:databaseFile,MOCK_AUTH:'1',NODE_ENV:'development',SUPABASE_DB_URL:''},stdio:['ignore','pipe','pipe']});
let logs='',browser,vite,page;
server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const wait=async(fn,label,timeout=30000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw new Error(label);};
const errors=[];
const report={};
try {
  await wait(async()=>{try{return(await fetch(baseURL+'/health')).ok;}catch{return false;}},'server boot');
  browser=await chromium.launch({headless:true,channel:'chrome'});
  vite=await createServer({root:path.join(root,'pet-app'),server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',ssr:{noExternal:['@dimforge/rapier3d']}});
  const {CoinPusherModel}=await vite.ssrLoadModule('/src/game/CoinPusherModel.ts');
  const model=new CoinPusherModel();for(const coin of [...model.coins])model.removeCoin(coin);
  const snapshot=model.createSnapshot();model.destroy();
  const contextFor=async(viewport)=>{
    const context=await browser.newContext({baseURL,viewport});
    await context.request.get('/api/auth/me');
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.addInitScript(()=>{window.__settlementNotices=[];new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof HTMLElement&&node.classList.contains('toast'))window.__settlementNotices.push(node.textContent);}).observe(document,{subtree:true,childList:true});});
    return {context,p};
  };
  const bootstrap=async context=>(await context.request.get('/api/pet/bootstrap')).json();
  const play=async context=>{const r=await context.request.post('/api/pet/coin-pusher/play',{headers:{'Idempotency-Key':randomUUID()},data:{}});assert.equal(r.status(),200);return r.json();};
  const event=(playId,amount=1)=>({playId,amount,eventId:randomUUID(),requestKey:randomUUID()});
  const seed=async(p,plays,pending)=>{
    await p.goto('/health');
    await p.evaluate(async({model,plays,pending})=>{await new Promise((resolve,reject)=>{const open=indexedDB.open('buio-pet-coin-pusher',1);open.onupgradeneeded=()=>open.result.createObjectStore('studentSessions',{keyPath:'studentId'});open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result;const tx=db.transaction('studentSessions','readwrite');tx.objectStore('studentSessions').put({version:1,studentId:'S001',updatedAt:Date.now(),model,plays,payoutSequence:0,pendingPayouts:pending});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});},{model:snapshot,plays,pending});
  };
  const saved=async p=>p.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('buio-pet-coin-pusher',1);open.onsuccess=()=>{const db=open.result;const tx=db.transaction('studentSessions','readonly');const req=tx.objectStore('studentSessions').get('S001');req.onsuccess=()=>resolve(req.result);tx.oncomplete=()=>db.close();};open.onerror=()=>reject(open.error);}));
  const open=async p=>{await p.goto('/pet');await p.locator('[data-tab="coinPusher"]').click();await wait(async()=>await p.locator('#coin-pusher-root').getAttribute('aria-busy')==='false','cabinet ready');};
  const settlementNoticeCount=async p=>p.evaluate(()=>window.__settlementNotices.filter(t=>/Rewards saved|獎勵已/.test(t)).length);

  // Replay a very old committed response after its play has already used all 100
  // catches. The production client must not resurrect that play or its old balance.
  const first=await contextFor({width:1440,height:900});page=first.p;
  await first.context.request.post('/api/pet/dev/unlimited-money');
  await page.goto('/pet');await page.locator('[data-action="hatch"]').click();await page.locator('.reveal-card').waitFor();
  const full=await play(first.context),old=event(full.playId);
  for(const e of [old,event(full.playId,19),...Array.from({length:4},()=>event(full.playId,20))]){
    const r=await first.context.request.post('/api/pet/coin-pusher/payout',{data:e,headers:{'Idempotency-Key':e.requestKey}});assert.equal(r.status(),200);
  }
  const overCap=event(full.playId);
  const refused=await first.context.request.post('/api/pet/coin-pusher/payout',{data:overCap,headers:{'Idempotency-Key':overCap.requestKey}});
  assert.equal(refused.status(),409,'the real server rejects an exhausted play');
  const refusal=await refused.json();assert.equal(refusal.message,'Coin-pusher payout limit reached');
  assert.equal(refusal.requestId,refused.headers()['x-request-id'],'settlement rejection has a traceable request id');
  const fresh=await play(first.context),freshEvent=event(fresh.playId),before=await bootstrap(first.context);
  await seed(page,[{playId:full.playId,remaining:0},{playId:fresh.playId,remaining:100}],[old,freshEvent]);
  await open(page);await wait(async()=>(await saved(page)).pendingPayouts.length===0,'cached and fresh payouts settle');
  assert.equal((await saved(page)).plays.some(p=>p.playId===full.playId),false,'cached reply cannot resurrect an exhausted play');
  assert.equal((await bootstrap(first.context)).wallet.balance,before.wallet.balance+1,'old event is not credited twice');
  await wait(async()=>Number((await page.locator('#coinBalanceHud').innerText()).replace(/,/g,''))===(await bootstrap(first.context)).wallet.balance,'HUD reflects current wallet, not historical reply');
  await page.screenshot({path:path.join(artifacts,'stale-response-desktop.png')});
  const dropsBefore=(await bootstrap(first.context)).wallet.balance;
  for(let i=0;i<12;i++){await wait(async()=>await page.locator('.coin-pusher-drop').isEnabled(),'paid drop ready');await page.locator('#coin-pusher-root canvas').focus();await page.keyboard.press('Space');await page.waitForTimeout(300);}
  assert.equal((await bootstrap(first.context)).wallet.balance,dropsBefore-12,'continuous keyboard drops cost exactly one each');
  await first.context.close();report.staleResponse=true;report.continuousPaidDrops=12;

  // Five simultaneous catch events would formerly create five red toasts and
  // 10 requests per retry cycle. Verify one notification and shared backoff.
  const outage=await contextFor({width:1180,height:820});page=outage.p;
  const paid=await play(outage.context),pending=Array.from({length:5},()=>event(paid.playId));
  await seed(page,[{playId:paid.playId,remaining:100}],pending);
  let unavailable=true;const attempts=[];
  await page.route('**/api/pet/coin-pusher/payout',async route=>{attempts.push({at:Date.now(),body:route.request().postDataJSON(),key:route.request().headers()['idempotency-key']});if(unavailable)await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'outage fixture'})});else await route.continue();});
  const balanceBefore=(await bootstrap(outage.context)).wallet.balance;
  await open(page);await wait(()=>attempts.length>=2,'first failed request and one safe immediate retry');
  await page.waitForTimeout(1800);assert.equal(attempts.length,2,'fresh catches respect the shared backoff');
  assert.equal(await settlementNoticeCount(page),1,'five catches show only one outage notice');
  assert.equal((await saved(page)).pendingPayouts.length,5,'unpaid rewards remain durable');
  await page.screenshot({path:path.join(artifacts,'outage-ipad-landscape.png')});
  await wait(()=>attempts.length>=4,'one delayed retry');
  assert.ok(attempts[2].at-attempts[1].at>=4800);
  assert.equal(await settlementNoticeCount(page),1,'the second failure does not notify again');
  unavailable=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await wait(async()=>(await saved(page)).pendingPayouts.length===0,'all saved catches recover',22000);
  assert.equal((await bootstrap(outage.context)).wallet.balance,balanceBefore+5);
  for(const p of pending)assert.ok(attempts.filter(a=>a.body.eventId===p.eventId).every(a=>a.key===p.requestKey),'retries keep the original identity');
  await page.screenshot({path:path.join(artifacts,'recovered-ipad-landscape.png')});
  await outage.context.close();report.outageNotices=1;report.recoveredCoins=5;

  const refresh=await contextFor({width:1440,height:900});page=refresh.p;
  const refreshPlay=await play(refresh.context),refreshEvent=event(refreshPlay.playId);
  await seed(page,[{playId:refreshPlay.playId,remaining:100}],[refreshEvent]);
  const refreshBalance=(await bootstrap(refresh.context)).wallet.balance;
  let payoutRequests=0,failRefresh=false,failedRefreshes=0;
  await page.route('**/api/pet/bootstrap',async route=>{
    if(failRefresh){failRefresh=false;failedRefreshes++;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'post-commit refresh fixture'})});}
    else await route.continue();
  });
  await page.route('**/api/pet/coin-pusher/payout',async route=>{
    payoutRequests++;const response=await route.fetch();assert.equal(response.status(),200);failRefresh=true;await route.fulfill({response});
  });
  await open(page);await wait(async()=>failedRefreshes===1&&(await saved(page)).pendingPayouts.length===0,'committed reward is complete despite failed UI refresh');
  await page.waitForTimeout(5500);assert.equal(payoutRequests,1,'a failed bootstrap must not resubmit a completed payout');
  assert.equal((await bootstrap(refresh.context)).wallet.balance,refreshBalance+1);
  await page.reload();await page.locator('[data-tab="coinPusher"]').click();
  await wait(async()=>await page.locator('#coin-pusher-root').getAttribute('aria-busy')==='false','reload with completed payout');
  assert.equal(payoutRequests,1,'completed reward is not requeued on reload');
  await refresh.context.close();report.failedPostCommitRefresh=true;

  for(const status of [429,401,409]){
    const test=await contextFor({width:390,height:844});page=test.p;
    const paid=await play(test.context),pending=[event(paid.playId)];
    await seed(page,[{playId:paid.playId,remaining:100}],pending);
    let reject=true;const attempts=[];
    await page.route('**/api/pet/coin-pusher/payout',async route=>{attempts.push(Date.now());if(reject)await route.fulfill({status,headers:status===429?{'Retry-After':'6'}:{},contentType:'application/json',body:JSON.stringify({success:false,message:'status fixture'})});else await route.continue();});
    await open(page);await wait(()=>attempts.length===1,`first ${status} rejection`);
    await page.waitForTimeout(3200);assert.equal(attempts.length,1,'no immediate retry for rate limits, auth or permanent rejection');
    assert.equal(await settlementNoticeCount(page),1);
    assert.equal((await saved(page)).pendingPayouts.length,1);
    await page.screenshot({path:path.join(artifacts,`status-${status}-phone.png`)});
    if(status===429){reject=false;await wait(async()=>(await saved(page)).pendingPayouts.length===0,'rate limit recovery');assert.ok(attempts[1]-attempts[0]>=5800,'Retry-After respected');}
    else{await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForTimeout(3500);assert.equal(attempts.length,1,'terminal rejections do not loop even on an online event');}
    await test.context.close();report[`status${status}`]=true;
  }
  const data=JSON.parse(await fs.readFile(databaseFile,'utf8'));
  assert.deepEqual(errors,[]);
  assert.ok(data.petCurrencyLedger.filter(r=>r.kind==='coin_pusher_payout').every(r=>r.delta===r.metadata.caughtCoins),'all new credits are one per catch');
  const result={pass:true,...report,errors};await fs.writeFile(path.join(artifacts,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){await page?.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});console.error(JSON.stringify({pass:false,error:error.stack,errors,logs:logs.slice(-1500)}));process.exitCode=1;}
finally{await browser?.close();await vite?.close();if(!server.killed)server.kill();}
