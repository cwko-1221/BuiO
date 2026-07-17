import { chromium } from 'playwright';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

const base=process.env.GAME_BASE_URL||'http://127.0.0.1:3000';
const installedBrowsers=[
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].filter(Boolean);
const executablePath=installedBrowsers.find(existsSync);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const context=await browser.newContext({viewport:{width:1280,height:720}});
const host=await context.newPage();
let roomCode=null;

try {
  await host.goto(`${base}/game/preview`);
  roomCode=await host.evaluate(()=>new Promise((resolve,reject)=>{
    const socket=window.__qaHost=window.io('/game');
    socket.on('connect',()=>socket.emit('host:create',{setId:'demo',durationSec:480,hostName:'LatencyQA'},response=>{
      if (response?.ok) resolve(response.code);
      else reject(new Error(response?.message||'host create failed'));
    }));
  }));

  const driver=await context.newPage();
  const viewer=await context.newPage();
  await Promise.all([driver.goto(`${base}/game/preview`),viewer.goto(`${base}/game/preview`)]);
  await Promise.all([driver.waitForSelector('.room-row',{timeout:7000}),viewer.waitForSelector('.room-row',{timeout:7000})]);
  await Promise.all([driver.locator('.room-row').first().click(),viewer.locator('.room-row').first().click()]);
  await Promise.all([driver.waitForSelector('#lobbyScreen.active'),viewer.waitForSelector('#lobbyScreen.active')]);
  const started=await host.evaluate(()=>new Promise(resolve=>window.__qaHost.emit('host:start',resolve)));
  if (!started?.ok) throw new Error('host start failed');
  await Promise.all([
    driver.waitForSelector('#gameScreen.active canvas',{timeout:10000}),
    viewer.waitForSelector('#gameScreen.active canvas',{timeout:10000})
  ]);
  await driver.waitForTimeout(1800);

  await driver.keyboard.down('ArrowRight');
  const samples=[];
  for (let index=0;index<16;index++) {
    await driver.waitForTimeout(100);
    const [local,remote]=await Promise.all([
      driver.evaluate(()=>{const scene=window.__game.scene.getScene('GameScene');return{x:scene.player.x,vx:scene.playerBody.velocity.x};}),
      viewer.evaluate(()=>{const scene=window.__game.scene.getScene('GameScene');const ghosts=[...scene.ghosts.values()];const ghost=ghosts.sort((a,b)=>Math.abs(b.state.snapshot?.vx||0)-Math.abs(a.state.snapshot?.vx||0))[0];return ghost?{x:ghost.sprite.x,count:scene.ghosts.size}:null;})
    ]);
    samples.push({
      timeMs:(index+1)*100,driverX:local.x,driverVx:local.vx,
      ghostX:remote?.x??null,lagPx:remote?Math.abs(local.x-remote.x):null
    });
  }
  await driver.keyboard.up('ArrowRight');

  const screenshot=join(tmpdir(),'buio-network-shadow.png');
  await viewer.screenshot({path:screenshot});
  const steady=samples.filter(sample=>sample.timeMs>=600&&sample.ghostX!==null);
  const average=steady.reduce((sum,sample)=>sum+sample.lagPx,0)/steady.length;
  const maximum=Math.max(...steady.map(sample=>sample.lagPx));
  const report={
    roomCode,samples,
    steadyAverageLagPx:Number(average.toFixed(1)),
    steadyMaximumLagPx:Number(maximum.toFixed(1)),
    estimatedAverageLagMs:Number((average/(5.6*60)*1000).toFixed(0)),
    screenshot
  };
  console.log(JSON.stringify(report,null,2));
  if (!steady.length||average>55||maximum>95) throw new Error(`remote ghost latency exceeds budget: average=${average.toFixed(1)}px max=${maximum.toFixed(1)}px`);
} finally {
  if (roomCode) await host.evaluate(()=>window.__qaHost?.emit('host:close')).catch(()=>{});
  await browser.close();
}
