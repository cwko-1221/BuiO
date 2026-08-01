import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require=createRequire(import.meta.url);
const questionSet=require('../tower-defense-app/lib/defaultQuestions.js');
const answerByPrompt=new Map(questionSet.questions.map(question=>[question.question,question.choices[question.correctIndex]]));
const base=process.env.TOWER_DEFENSE_BASE_URL||'http://127.0.0.1:3000';
const executablePath=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage();
const errors=[];
const screenshots={};

const assert=(condition,message)=>{if(!condition)throw new Error(message);};
page.on('console',message=>{if(message.type()==='error'&&!message.text().startsWith('Failed to load resource:'))errors.push(message.text());});
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});

async function gotoMenu(){
  await page.goto(`${base}/tower-defense/preview`,{waitUntil:'networkidle'});
  await page.waitForSelector('#menuScreen.active');
}

async function startMap(mapId,difficulty='guardian'){
  await gotoMenu();
  await page.locator(`[data-map="${mapId}"]`).click();
  await page.locator(`[data-difficulty="${difficulty}"]`).click();
  await page.locator('#startCampaignBtn').click();
  await page.waitForSelector('#gameScreen.active canvas',{timeout:15000});
  await page.waitForFunction(id=>window.__towerDefense?.simulation?.state?.mapId===id,mapId);
  await page.waitForFunction(()=>window.__towerDefense?.scene&&window.__towerDefense.audioState.musicActive);
}

async function worldClick(x,y){
  const canvas=page.locator('#gameCanvas canvas');
  const box=await canvas.boundingBox();
  assert(box,'game canvas has no bounding box');
  await page.mouse.click(box.x+x/1280*box.width,box.y+y/720*box.height);
}

async function answerQuestion({correct=true,capturePath=null}={}){
  await page.locator('#quizBtn').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-choice]').length===4);
  const prompt=await page.locator('#questionPrompt').textContent();
  const correctChoice=answerByPrompt.get(prompt);
  assert(correctChoice,`unknown built-in question: ${prompt}`);
  if(capturePath){
    await page.waitForTimeout(350);
    await page.screenshot({path:capturePath,fullPage:true});
  }
  const before=await page.evaluate(()=>({
    gold:window.__towerDefense.simulation.state.gold,
    answered:window.__towerDefense.simulation.state.stats.quizAnswered,
    correct:window.__towerDefense.simulation.state.stats.quizCorrect,
  }));
  const choices=page.locator('[data-choice]');
  if(correct)await choices.filter({hasText:correctChoice}).click();
  else{
    const labels=await choices.allTextContents();
    const wrongIndex=labels.findIndex(label=>!label.includes(correctChoice));
    assert(wrongIndex>=0,'could not find an incorrect answer choice');
    await choices.nth(wrongIndex).click();
  }
  await page.waitForSelector(`#questionFeedback.${correct?'correct':'wrong'}`);
  await page.waitForFunction(expected=>window.__towerDefense.simulation.state.stats.quizAnswered===expected,before.answered+1);
  const after=await page.evaluate(()=>({
    gold:window.__towerDefense.simulation.state.gold,
    answered:window.__towerDefense.simulation.state.stats.quizAnswered,
    correct:window.__towerDefense.simulation.state.stats.quizCorrect,
    paused:window.__towerDefense.simulation.state.paused,
  }));
  if(correct){
    assert(after.gold>before.gold,`correct answer did not grant crystal coins: ${JSON.stringify({before,after})}`);
    assert(after.correct===before.correct+1,'correct answer did not update quiz stats');
  }else{
    assert(after.gold===before.gold,`incorrect answer changed crystal coins: ${JSON.stringify({before,after})}`);
    assert(after.correct===before.correct,'incorrect answer changed correct-answer stats');
  }
  await page.waitForFunction(()=>!document.querySelector('#questionPanel').classList.contains('open'));
  return {prompt,before,after};
}

try{
  await gotoMenu();
  const apiShape=await page.evaluate(async()=>{
    const headers={'Content-Type':'application/json','x-buio-preview':'1'};
    const session=await fetch('/api/tower-defense/session',{method:'POST',headers,body:JSON.stringify({setId:'crystal-academy'})}).then(response=>response.json());
    const question=await fetch('/api/tower-defense/question',{method:'POST',headers,body:JSON.stringify({sessionId:session.sessionId})}).then(response=>response.json());
    return {sessionOk:session.success,questionOk:question.success,questionKeys:Object.keys(question.question||{})};
  });
  assert(apiShape.sessionOk&&apiShape.questionOk&&!apiShape.questionKeys.includes('correctIndex'),`question API leaks or failed: ${JSON.stringify(apiShape)}`);
  const menuCounts=await page.evaluate(()=>({
    maps:document.querySelectorAll('[data-map]').length,
    difficulties:document.querySelectorAll('[data-difficulty]').length,
  }));
  assert(menuCounts.maps===3&&menuCounts.difficulties===3,`incomplete campaign selector: ${JSON.stringify(menuCounts)}`);
  screenshots.menu=join(tmpdir(),'buio-crystal-bastion-menu.png');
  await page.screenshot({path:screenshots.menu,fullPage:true});

  await startMap('starport');
  const battleCounts=await page.evaluate(()=>({
    towers:document.querySelectorAll('[data-tower]').length,
    abilities:document.querySelectorAll('[data-ability]').length,
    audio:window.__towerDefense.audioState,
  }));
  assert(battleCounts.towers===6&&battleCounts.abilities===3,`incomplete battle UI: ${JSON.stringify(battleCounts)}`);
  assert(battleCounts.audio.contextState!=='unavailable'&&battleCounts.audio.musicActive,`audio engine did not start: ${JSON.stringify(battleCounts.audio)}`);

  const mutedBefore=battleCounts.audio.muted;
  await page.locator('#audioBtn').click();
  await page.waitForFunction(value=>window.__towerDefense.audioState.muted===value,!mutedBefore);
  const muteStored=await page.evaluate(()=>localStorage.getItem('buio-td-muted'));
  assert(muteStored===(!mutedBefore?'1':'0'),'mute preference was not persisted');
  await page.locator('#audioBtn').click();
  await page.waitForFunction(value=>window.__towerDefense.audioState.muted===value,mutedBefore);

  await page.locator('#pauseBtn').click();
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.paused);
  const pausedElapsed=await page.evaluate(()=>window.__towerDefense.simulation.state.elapsed);
  await page.waitForTimeout(180);
  const pausedElapsedAfter=await page.evaluate(()=>window.__towerDefense.simulation.state.elapsed);
  assert(Math.abs(pausedElapsedAfter-pausedElapsed)<.03,'simulation advanced while paused');
  await page.locator('#pauseBtn').click();
  await page.waitForFunction(()=>!window.__towerDefense.simulation.state.paused);
  for(const expected of [2,3,1]){
    await page.locator('#speedBtn').click();
    await page.waitForFunction(speed=>window.__towerDefense.simulation.state.speed===speed,expected);
  }
  await page.locator('#helpBtn').click();
  await page.waitForSelector('#helpModal.open');
  assert(await page.evaluate(()=>window.__towerDefense.simulation.state.paused),'help modal must pause gameplay');
  await page.locator('[data-close-modal="helpModal"]').click();
  await page.waitForFunction(()=>!window.__towerDefense.simulation.state.paused);

  await page.locator('[data-tower="bolt"]').click();
  await worldClick(330,90);
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.towers.length===1);
  assert(await page.locator('#towerPanel').evaluate(panel=>panel.classList.contains('open')),'built tower did not open its management panel');

  screenshots.question=join(tmpdir(),'buio-crystal-bastion-question.png');
  await answerQuestion({correct:true,capturePath:screenshots.question});
  const beforeUpgrade=await page.evaluate(()=>({
    level:window.__towerDefense.simulation.state.towers[0].level,
    gold:window.__towerDefense.simulation.state.gold,
  }));
  await page.locator('#upgradeTowerBtn').click();
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.towers[0]?.level===2);
  await page.locator('#targetModeSelect').selectOption('strongest');
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.towers[0]?.targetMode==='strongest');
  const afterUpgrade=await page.evaluate(()=>({
    level:window.__towerDefense.simulation.state.towers[0].level,
    gold:window.__towerDefense.simulation.state.gold,
    totalSpent:window.__towerDefense.simulation.state.towers[0].totalSpent,
  }));
  assert(afterUpgrade.level===beforeUpgrade.level+1&&afterUpgrade.gold<beforeUpgrade.gold,`tower upgrade failed: ${JSON.stringify({beforeUpgrade,afterUpgrade})}`);

  await answerQuestion({correct:true});
  const beforeSell=await page.evaluate(()=>({
    gold:window.__towerDefense.simulation.state.gold,
    refund:Math.floor(window.__towerDefense.simulation.state.towers[0].totalSpent*.7),
  }));
  await page.locator('#sellTowerBtn').click();
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.towers.length===0);
  const afterSellGold=await page.evaluate(()=>window.__towerDefense.simulation.state.gold);
  assert(afterSellGold===beforeSell.gold+beforeSell.refund,`tower sell refund failed: ${JSON.stringify({beforeSell,afterSellGold})}`);

  for(const [type,x,y] of [['bolt',330,90],['cannon',90,300],['frost',330,450]]){
    await page.locator(`[data-tower="${type}"]`).click();
    await worldClick(x,y);
  }
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.towers.length===3);
  await answerQuestion({correct:false});

  await page.evaluate(()=>{
    const scene=window.__towerDefense.scene;
    scene.__qaRenderedEvents=[];
    const original=scene.renderEvent.bind(scene);
    scene.renderEvent=event=>{scene.__qaRenderedEvents.push(event.type);return original(event);};
  });
  await page.locator('#nextWaveBtn').click();
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.phase==='wave');
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.enemies.length>0,{timeout:5000});

  await page.evaluate(()=>{window.__towerDefense.simulation.state.focus=100;});
  await page.waitForFunction(()=>!document.querySelector('[data-ability="stasis"]').disabled);
  await page.locator('[data-ability="stasis"]').click();
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.stasisTime>0&&window.__towerDefense.simulation.state.abilities.stasis>0);
  await page.evaluate(()=>{window.__towerDefense.simulation.state.focus=100;});
  await page.waitForFunction(()=>!document.querySelector('[data-ability="overdrive"]').disabled);
  await page.locator('[data-ability="overdrive"]').click();
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.overdriveTime>0&&window.__towerDefense.simulation.state.abilities.overdrive>0);
  await page.evaluate(()=>{window.__towerDefense.simulation.state.focus=100;});
  await page.waitForFunction(()=>!document.querySelector('[data-ability="meteor"]').disabled);
  await page.locator('[data-ability="meteor"]').click();
  await page.waitForSelector('[data-ability="meteor"].targeting');
  const meteorTarget=await page.evaluate(()=>{
    const enemy=window.__towerDefense.simulation.state.enemies[0];
    return {
      x:Math.max(100,Math.min(1180,enemy?.x??640)),
      y:Math.max(100,Math.min(620,enemy?.y??360)),
    };
  });
  await worldClick(meteorTarget.x,meteorTarget.y);
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.abilities.meteor>0);
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.towers.some(tower=>tower.damage>0),undefined,{timeout:15000});
  await page.waitForFunction(()=>{
    const events=window.__towerDefense.scene.__qaRenderedEvents||[];
    return events.includes('ability')&&events.includes('shot')&&events.includes('impact');
  },undefined,{timeout:15000});

  screenshots.battle=join(tmpdir(),'buio-crystal-bastion-live.png');
  await page.screenshot({path:screenshots.battle,fullPage:true});
  const starportReport=await page.evaluate(()=>({
    map:window.__towerDefense.simulation.state.mapId,
    mapName:document.querySelector('#mapName').textContent,
    wave:window.__towerDefense.simulation.state.wave,
    enemies:window.__towerDefense.simulation.state.enemies.length,
    towers:window.__towerDefense.simulation.state.towers.length,
    quizCorrect:window.__towerDefense.simulation.state.stats.quizCorrect,
    quizAnswered:window.__towerDefense.simulation.state.stats.quizAnswered,
    goldFromQuiz:window.__towerDefense.simulation.state.stats.goldFromQuiz,
    renderedEvents:[...new Set(window.__towerDefense.scene.__qaRenderedEvents)],
    canvas:{width:document.querySelector('#gameCanvas canvas').width,height:document.querySelector('#gameCanvas canvas').height},
  }));

  await page.evaluate(()=>{
    const simulation=window.__towerDefense.simulation;
    simulation.togglePause(true);simulation.waveQueue=[];simulation.state.enemies=[];
    ['drone','runner','guard','wisp','medic','shielder','splitter','phantom','shard','leviathan']
      .forEach((type,index)=>simulation.spawnEnemy(type,{progress:430+index*225}));
  });
  await page.waitForFunction(()=>window.__towerDefense.scene.enemyViews.size===10);
  const artBefore=await page.evaluate(()=>{
    const scene=window.__towerDefense.scene,simulation=window.__towerDefense.simulation,wisp=simulation.state.enemies.find(enemy=>enemy.type==='wisp');
    return {wispY:scene.enemyViews.get(wisp.id).container.y};
  });
  await page.waitForTimeout(260);
  const artRuntime=await page.evaluate(()=>{
    const scene=window.__towerDefense.scene,simulation=window.__towerDefense.simulation,wisp=simulation.state.enemies.find(enemy=>enemy.type==='wisp');
    return {
      wispY:scene.enemyViews.get(wisp.id).container.y,
      enemyTextures:[...new Set([...scene.enemyViews.values()].map(view=>view.sprite.texture.key))],
      towerTextures:[...new Set([...scene.towerViews.values()].map(view=>view.sprite.texture.key))],
      enemyFrames:scene.enemyViews.size,
    };
  });
  assert(Math.abs(artRuntime.wispY-artBefore.wispY)>.25,`enemy idle animation did not move: ${JSON.stringify({artBefore,artRuntime})}`);
  assert(artRuntime.enemyTextures.includes('td-enemies')&&artRuntime.enemyTextures.includes('td-bosses')&&artRuntime.towerTextures.includes('td-towers'),`production sprite atlases are not active: ${JSON.stringify(artRuntime)}`);
  screenshots.enemyRoster=join(tmpdir(),'buio-crystal-bastion-enemy-roster.png');
  await page.screenshot({path:screenshots.enemyRoster,fullPage:true});

  await page.setViewportSize({width:1024,height:700});
  await page.waitForTimeout(300);
  const compactLayout=await page.evaluate(()=>({
    dockVisible:getComputedStyle(document.querySelector('.tower-dock')).display!=='none',
    canvasVisible:!!document.querySelector('#gameCanvas canvas')?.getBoundingClientRect().width,
    overflowX:document.documentElement.scrollWidth-document.documentElement.clientWidth,
  }));
  assert(compactLayout.dockVisible&&compactLayout.canvasVisible&&compactLayout.overflowX<=1,`compact layout failed: ${JSON.stringify(compactLayout)}`);
  screenshots.compact=join(tmpdir(),'buio-crystal-bastion-compact.png');
  await page.screenshot({path:screenshots.compact,fullPage:true});

  await page.setViewportSize({width:600,height:900});
  await page.waitForTimeout(200);
  const portraitLayout=await page.evaluate(()=>({
    rotateNotice:getComputedStyle(document.querySelector('#rotateNotice')).display,
    screenVisibility:getComputedStyle(document.querySelector('#gameScreen')).visibility,
    overflowX:document.documentElement.scrollWidth-document.documentElement.clientWidth,
  }));
  assert(portraitLayout.rotateNotice==='grid'&&portraitLayout.screenVisibility==='hidden'&&portraitLayout.overflowX<=1,`portrait rotate guidance failed: ${JSON.stringify(portraitLayout)}`);
  screenshots.portrait=join(tmpdir(),'buio-crystal-bastion-portrait.png');
  await page.screenshot({path:screenshots.portrait,fullPage:true});
  await page.setViewportSize({width:1440,height:900});
  await page.waitForTimeout(250);

  await page.evaluate(()=>{
    const simulation=window.__towerDefense.simulation;
    simulation.togglePause(false);
    simulation.state.lives=1;
    simulation.state.phase='wave';
    simulation.waveQueue=[];
    simulation.spawnEnemy('guard',{progress:simulation.pathLength+1});
    simulation.update(1/30);
  });
  await page.waitForSelector('#endModal.open');
  assert((await page.locator('#endTitle').textContent())==='晶核已失守','loss result modal did not render');
  screenshots.loss=join(tmpdir(),'buio-crystal-bastion-loss.png');
  await page.screenshot({path:screenshots.loss,fullPage:true});

  const mapReports=[{id:'starport',name:starportReport.mapName,weather:'stars'}];
  for(const [mapId,expectedName,weather] of [['moonwood','月影森徑','fireflies'],['embercore','熔火核心','embers']]){
    await startMap(mapId);
    const runtime=await page.evaluate(()=>({
      id:window.__towerDefense.simulation.state.mapId,
      name:document.querySelector('#mapName').textContent,
      weather:window.__towerDefense.simulation.map.weather,
      audio:window.__towerDefense.audioState,
      canvasReady:!!document.querySelector('#gameCanvas canvas')?.getBoundingClientRect().width,
    }));
    assert(runtime.id===mapId&&runtime.name===expectedName&&runtime.weather===weather&&runtime.canvasReady,`${mapId} runtime failed: ${JSON.stringify(runtime)}`);
    assert(runtime.audio.musicActive,`${mapId} music theme did not start`);
    screenshots[mapId]=join(tmpdir(),`buio-crystal-bastion-${mapId}.png`);
    await page.screenshot({path:screenshots[mapId],fullPage:true});
    mapReports.push({id:runtime.id,name:runtime.name,weather:runtime.weather});
  }

  await page.evaluate(()=>{
    const simulation=window.__towerDefense.simulation;
    simulation.state.wave=15;
    simulation.state.phase='wave';
    simulation.waveQueue=[];
    simulation.state.enemies=[];
    simulation.finishWave();
  });
  await page.waitForSelector('#endModal.open');
  const victory=await page.evaluate(()=>({
    title:document.querySelector('#endTitle').textContent,
    description:document.querySelector('#endDescription').textContent,
    completed:window.__towerDefense.profile.completed,
    persisted:JSON.parse(localStorage.getItem('buio-crystal-bastion-profile-v1')||'{}').completed||[],
  }));
  assert(victory.title==='晶核安全！'&&victory.description.includes('15 波')&&victory.completed.includes('embercore')&&victory.persisted.includes('embercore'),`victory/progression flow failed: ${JSON.stringify(victory)}`);
  screenshots.victory=join(tmpdir(),'buio-crystal-bastion-victory.png');
  await page.screenshot({path:screenshots.victory,fullPage:true});

  assert(errors.length===0,`browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({
    menu:menuCounts,
    starport:starportReport,
    maps:mapReports,
    compactLayout,
    portraitLayout,
    victory,
    screenshots,
  },null,2));
}catch(error){
  screenshots.failure=join(tmpdir(),'buio-crystal-bastion-failure.png');
  await page.screenshot({path:screenshots.failure,fullPage:true}).catch(()=>{});
  console.error(JSON.stringify({browserErrors:errors,screenshots},null,2));
  throw error;
}finally{
  await browser.close();
}
