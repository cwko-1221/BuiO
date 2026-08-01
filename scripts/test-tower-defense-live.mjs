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
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];
page.on('console',message=>{if(message.type()==='error'&&!message.text().startsWith('Failed to load resource:'))errors.push(message.text());});
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});

try{
  await page.goto(`${base}/tower-defense/preview`,{waitUntil:'networkidle'});
  await page.waitForSelector('#menuScreen.active');
  const apiShape=await page.evaluate(async()=>{
    const headers={'Content-Type':'application/json','x-buio-preview':'1'};
    const session=await fetch('/api/tower-defense/session',{method:'POST',headers,body:JSON.stringify({setId:'crystal-academy'})}).then(response=>response.json());
    const question=await fetch('/api/tower-defense/question',{method:'POST',headers,body:JSON.stringify({sessionId:session.sessionId})}).then(response=>response.json());
    return {sessionOk:session.success,questionOk:question.success,questionKeys:Object.keys(question.question||{})};
  });
  if(!apiShape.sessionOk||!apiShape.questionOk||apiShape.questionKeys.includes('correctIndex'))throw new Error(`question API leaks or failed: ${JSON.stringify(apiShape)}`);
  const counts=await page.evaluate(()=>({maps:document.querySelectorAll('[data-map]').length,difficulties:document.querySelectorAll('[data-difficulty]').length}));
  if(counts.maps!==3||counts.difficulties!==3)throw new Error(`incomplete campaign selector: ${JSON.stringify(counts)}`);
  const menuScreenshot=join(tmpdir(),'buio-crystal-bastion-menu.png');
  await page.screenshot({path:menuScreenshot,fullPage:true});
  await page.locator('#startCampaignBtn').click();
  await page.waitForSelector('#gameScreen.active canvas',{timeout:15000});
  await page.waitForFunction(()=>window.__towerDefense?.simulation?.state?.phase==='build');
  const towerCount=await page.locator('[data-tower]').count();
  const abilityCount=await page.locator('[data-ability]').count();
  if(towerCount!==6||abilityCount!==3)throw new Error(`incomplete battle UI: ${towerCount} towers, ${abilityCount} abilities`);

  const canvas=page.locator('#gameCanvas canvas');
  const box=await canvas.boundingBox();
  if(!box)throw new Error('game canvas has no bounding box');
  const worldClick=async(x,y)=>page.mouse.click(box.x+x/1280*box.width,box.y+y/720*box.height);
  await page.locator('[data-tower="bolt"]').click();await worldClick(330,90);
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.towers.length===1);
  const afterBuild=await page.evaluate(()=>({gold:window.__towerDefense.simulation.state.gold,towers:window.__towerDefense.simulation.state.towers.length,panel:document.querySelector('#towerPanel').classList.contains('open')}));
  if(afterBuild.towers!==1||afterBuild.gold>=360||!afterBuild.panel)throw new Error(`tower build UI failed: ${JSON.stringify(afterBuild)}`);

  await page.locator('#quizBtn').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-choice]').length===4);
  const prompt=await page.locator('#questionPrompt').textContent();
  const correctChoice=answerByPrompt.get(prompt);
  if(!correctChoice)throw new Error(`unknown built-in question: ${prompt}`);
  await page.waitForTimeout(350);
  const questionScreenshot=join(tmpdir(),'buio-crystal-bastion-question.png');
  await page.screenshot({path:questionScreenshot,fullPage:true});
  const beforeQuiz=await page.evaluate(()=>window.__towerDefense.simulation.state.gold);
  await page.locator('[data-choice]').filter({hasText:correctChoice}).click();
  await page.waitForSelector('#questionFeedback.correct');
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.stats.quizCorrect===1);
  const afterQuiz=await page.evaluate(()=>({gold:window.__towerDefense.simulation.state.gold,focus:window.__towerDefense.simulation.state.focus}));
  if(afterQuiz.gold<=beforeQuiz||afterQuiz.focus<=0)throw new Error(`quiz reward failed: ${JSON.stringify({beforeQuiz,afterQuiz})}`);
  await page.waitForFunction(()=>!document.querySelector('#questionPanel').classList.contains('open'));

  await page.locator('[data-tower="cannon"]').click();await worldClick(90,300);
  await page.locator('[data-tower="frost"]').click();await worldClick(330,450);
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.towers.length===3);

  await page.locator('#nextWaveBtn').click();
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.phase==='wave');
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.enemies.length>0,{timeout:5000});
  await page.waitForFunction(()=>window.__towerDefense.simulation.state.towers.some(tower=>tower.damage>0),{timeout:15000});
  const screenshot=join(tmpdir(),'buio-crystal-bastion-live.png');
  await page.screenshot({path:screenshot,fullPage:true});
  const report=await page.evaluate(()=>({
    map:window.__towerDefense.simulation.state.mapId,wave:window.__towerDefense.simulation.state.wave,
    enemies:window.__towerDefense.simulation.state.enemies.length,towers:window.__towerDefense.simulation.state.towers.length,
    quizCorrect:window.__towerDefense.simulation.state.stats.quizCorrect,gold:window.__towerDefense.simulation.state.gold,
    focus:window.__towerDefense.simulation.state.focus,canvas:{width:document.querySelector('#gameCanvas canvas').width,height:document.querySelector('#gameCanvas canvas').height}
  }));
  await page.setViewportSize({width:1024,height:700});
  await page.waitForTimeout(300);
  const compactLayout=await page.evaluate(()=>({dockVisible:getComputedStyle(document.querySelector('.tower-dock')).display!=='none',canvasVisible:!!document.querySelector('#gameCanvas canvas')?.getBoundingClientRect().width,overflowX:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
  if(!compactLayout.dockVisible||!compactLayout.canvasVisible||compactLayout.overflowX>1)throw new Error(`compact layout failed: ${JSON.stringify(compactLayout)}`);
  const compactScreenshot=join(tmpdir(),'buio-crystal-bastion-compact.png');
  await page.screenshot({path:compactScreenshot,fullPage:true});
  if(errors.length)throw new Error(`browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({...report,screenshots:{menuScreenshot,questionScreenshot,battleScreenshot:screenshot,compactScreenshot}},null,2));
}catch(error){
  const failureScreenshot=join(tmpdir(),'buio-crystal-bastion-failure.png');
  await page.screenshot({path:failureScreenshot,fullPage:true}).catch(()=>{});
  console.error(JSON.stringify({browserErrors:errors,failureScreenshot},null,2));
  throw error;
}finally{await browser.close();}
