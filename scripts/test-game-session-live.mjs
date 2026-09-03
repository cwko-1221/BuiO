import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const base=process.env.GAME_BASE_URL||'http://127.0.0.1:3000';
const executablePath=[
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].filter(Boolean).find(existsSync);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const context=await browser.newContext({viewport:{width:1280,height:720}});
const host=await context.newPage();
let roomCode=null;

try {
  await host.goto(`${base}/game/preview`);
  roomCode=await host.evaluate(()=>new Promise((resolve,reject)=>{
    const socket=window.__sessionQaHost=window.io('/game');
    socket.on('connect',()=>socket.emit('host:create',{setId:'demo',durationSec:480,hostName:'SessionQA'},response=>{
      if(response?.ok)resolve(response.code);else reject(new Error(response?.message||'host create failed'));
    }));
  }));

  const first=await context.newPage();
  await first.goto(`${base}/game/preview`);
  await first.waitForSelector('.room-row',{timeout:7000});
  await first.locator('.room-row').first().click();
  await first.waitForSelector('#lobbyScreen.active');
  const started=await host.evaluate(()=>new Promise(resolve=>window.__sessionQaHost.emit('host:start',resolve)));
  if(!started?.ok)throw new Error('host start failed');
  await first.waitForSelector('#gameScreen.active canvas',{timeout:10000});
  await first.waitForFunction(()=>window.__game?.scene?.getScene('GameScene')?.player);

  // This student did not exist when the teacher started the round.
  const late=await context.newPage();
  await late.goto(`${base}/game/preview`);
  await late.waitForSelector('.room-row',{timeout:7000});
  await late.locator('.room-row').first().click();
  await late.waitForSelector('#gameScreen.active canvas',{timeout:10000});
  await late.waitForFunction(()=>window.__game?.scene?.getScene('GameScene')?.player);
  const freshSpawn=await late.evaluate(()=>{
    const scene=window.__game.scene.getScene('GameScene');
    return {
      x:scene.player.x,y:scene.player.y,
      startX:scene.course.start.x,startY:scene.course.start.y,
      altitude:(scene.course.startAltitudeY-scene.player.y)/5
    };
  });
  if(Math.abs(freshSpawn.x-freshSpawn.startX)>5||Math.abs(freshSpawn.y-freshSpawn.startY)>100||freshSpawn.altitude>20){
    throw new Error(`late player did not spawn at start: ${JSON.stringify(freshSpawn)}`);
  }

  // Completing one client must end only that client's run.
  await first.evaluate(()=>window.__game.scene.getScene('GameScene').finish());
  await first.waitForSelector('#resultScreen.active',{timeout:5000});
  await late.waitForTimeout(900);
  if(!await late.locator('#gameScreen.active canvas').count())throw new Error('another player was forced out after the first summit');
  const before=await late.evaluate(()=>window.__game.scene.getScene('GameScene').player.x);
  await late.keyboard.down('ArrowRight');
  await late.waitForTimeout(350);
  await late.keyboard.up('ArrowRight');
  const after=await late.evaluate(()=>window.__game.scene.getScene('GameScene').player.x);
  if(after<=before+5)throw new Error('remaining player could not continue moving after another player finished');

  const session=await host.evaluate(async code=>(await (await fetch('/api/game/sessions')).json()).sessions.find(row=>row.code===code),roomCode);
  if(session?.phase!=='playing')throw new Error(`room ended after one summit: ${JSON.stringify(session)}`);
  const screenshot=join(tmpdir(),'buio-late-join-continues.png');
  await late.screenshot({path:screenshot});
  console.log(JSON.stringify({roomCode,freshSpawn,remainingPlayerMovedPx:Number((after-before).toFixed(1)),phase:session.phase,screenshot},null,2));
} finally {
  if(roomCode)await host.evaluate(()=>window.__sessionQaHost?.emit('host:close')).catch(()=>{});
  await browser.close();
}
