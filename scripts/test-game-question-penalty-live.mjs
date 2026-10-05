import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require=createRequire(import.meta.url),demo=require('../game-app/lib/demoSet');
const base=process.env.GAME_BASE_URL||'http://127.0.0.1:3000';
const output=resolve('artifacts/game-question-penalty-20261006');
mkdirSync(output,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const context=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true});
context.on('page',page=>page.on('dialog',dialog=>void dialog.dismiss()));
const page=await context.newPage(),host=await context.newPage(),client=await context.newPage();
const errors=[];
for(const p of [page,host,client])p.on('pageerror',error=>errors.push(error.message));
let code;
const emit=(p,name,event,payload)=>p.evaluate(({name,event,payload})=>new Promise((resolve,reject)=>{
  const ack=(error,response)=>error?reject(new Error(`${event} timed out`)):resolve(response);
  if(payload===undefined)window[name].timeout(5000).emit(event,ack);
  else window[name].timeout(5000).emit(event,payload,ack);
}),{name,event,payload});
const connect=(p,name)=>p.evaluate(name=>new Promise((resolve,reject)=>{
  const socket=window[name]=window.io('/game',{forceNew:true,reconnection:false});
  socket.on('connect',resolve);socket.on('connect_error',reject);
}),name);
const answerOnServer=async correct=>{
  const question=await emit(client,'__penaltyPlayer','player:question');
  assert.equal(question.ok,true);
  const source=demo.questions.find(q=>q.question===question.question);
  const correctIndex=question.choices.indexOf(source.choices[source.correctIndex]);
  return emit(client,'__penaltyPlayer','player:answer',{choice:correct?correctIndex:(correctIndex+1)%question.choices.length});
};
try {
  await page.goto(`${base}/game/preview?preview&altitude=0`);
  await page.bringToFront();
  await page.waitForFunction(()=>window.__game?.scene.getScene('GameScene')?.player);
  const answerInPreview=async correct=>{
    await page.locator('#answerBtn').click();
    await page.waitForSelector('#qOverlay.open .q-choice');
    await page.locator('.q-choice').nth(correct?2:0).click();
    if(correct)await page.waitForSelector('#qOverlay',{state:'hidden'});
  };
  for(let i=0;i<2;i++){await answerInPreview(false);await page.locator('#qClose').click();}
  await answerInPreview(true);
  assert.equal(await page.evaluate(()=>window.__game.scene.getScene('GameScene').energy),65,'incorrect preview answers do not award energy');
  for(let i=0;i<2;i++){await answerInPreview(false);await page.locator('#qClose').click();}
  assert.equal(await page.locator('#answerBtn').isDisabled(),false,'two consecutive errors remain playable');
  await answerInPreview(false);
  assert.equal(await page.locator('#answerBtn').isDisabled(),true);
  await page.waitForSelector('#qCooldown:not([hidden])');
  assert.match(await page.locator('#qFeedback').textContent(),/3/);
  await page.screenshot({path:resolve(output,'ipad-penalty-modal.png')});
  await page.locator('#qClose').click();
  await page.locator('#answerBtn').dispatchEvent('click');
  assert.equal(await page.locator('#qOverlay').evaluate(el=>el.classList.contains('open')),false,'programmatic clicks cannot reopen questions during cooldown');
  const before=await page.evaluate(()=>window.__game.scene.getScene('GameScene').player.x);
  const right=await page.locator('#btnRight').boundingBox();
  await page.mouse.move(right.x+right.width/2,right.y+right.height/2);await page.mouse.down();
  await page.waitForFunction(before=>window.__game.scene.getScene('GameScene').player.x>before+10,before,{timeout:2500});
  await page.mouse.up();
  const after=await page.evaluate(()=>window.__game.scene.getScene('GameScene').player.x);
  assert.ok(after>before+10,'climbing remains available during the answer penalty');
  await page.screenshot({path:resolve(output,'ipad-penalty-climbing.png')});
  await page.waitForFunction(()=>!document.getElementById('answerBtn').disabled,null,{timeout:6000});
  await answerInPreview(false);await page.locator('#qClose').click();
  assert.equal(await page.locator('#answerBtn').isDisabled(),false,'the streak restarts after expiry');

  await Promise.all([host.goto(`${base}/game/preview`),client.goto(`${base}/game/preview`)]);
  await connect(host,'__penaltyHost');await connect(client,'__penaltyPlayer');
  const created=await emit(host,'__penaltyHost','host:create',{setId:'demo',hostName:'PenaltyQA'});
  code=created.code;
  await emit(client,'__penaltyPlayer','player:join',{code,name:'PenaltyQA',studentId:'penalty-qa'});
  await emit(host,'__penaltyHost','host:start');
  assert.equal((await answerOnServer(false)).wrongStreak,1);
  assert.equal((await answerOnServer(false)).wrongStreak,2);
  assert.equal((await answerOnServer(true)).wrongStreak,0);
  await answerOnServer(false);await answerOnServer(false);
  const punished=await answerOnServer(false);
  assert.equal(punished.cooldownMs,5000);
  const blocked=await emit(client,'__penaltyPlayer','player:question');
  assert.equal(blocked.reason,'answer-cooldown');assert.equal(blocked.ok,false);
  assert.ok(blocked.cooldownMs>0&&blocked.cooldownMs<=5000);
  assert.equal(blocked.question,undefined);
  const blockedAnswer=await emit(client,'__penaltyPlayer','player:answer',{choice:0});
  assert.equal(blockedAnswer.reason,'answer-cooldown');
  await client.evaluate(()=>window.__penaltyPlayer.disconnect());
  await connect(client,'__penaltyPlayer');
  const resumed=await emit(client,'__penaltyPlayer','player:join',{code,name:'PenaltyQA',studentId:'penalty-qa'});
  assert.equal(resumed.resume.answerPenalty.wrongStreak,3);
  assert.ok(resumed.resume.answerPenalty.cooldownMs>0&&resumed.resume.answerPenalty.cooldownMs<=blocked.cooldownMs,'reconnecting preserves the original deadline');
  const blockedAfterReconnect=await emit(client,'__penaltyPlayer','player:question');
  assert.equal(blockedAfterReconnect.reason,'answer-cooldown');
  await client.waitForTimeout(blockedAfterReconnect.cooldownMs+50);
  const afterExpiry=await answerOnServer(false);
  assert.equal(afterExpiry.wrongStreak,1);assert.equal(afterExpiry.cooldownMs,0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({preview:'countdown, correct reset, energy, blocked reopen and movement passed',
    server:{punished:punished.cooldownMs,blocked:blocked.cooldownMs,reconnected:resumed.resume.answerPenalty.cooldownMs,afterExpiry},output},null,2));
} finally {
  if(code)await host.evaluate(()=>window.__penaltyHost?.emit('host:close')).catch(()=>{});
  await browser.close();
}
