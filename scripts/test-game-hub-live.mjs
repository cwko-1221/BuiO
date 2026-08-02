import { chromium } from 'playwright';
import ExcelJS from 'exceljs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const base=process.env.GAME_HUB_BASE_URL||'http://127.0.0.1:3000';
const executablePath=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];
const screenshots={};
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

function watch(page,label){
  page.on('pageerror',error=>errors.push(`${label}: ${error.message}`));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().startsWith('Failed to load resource:'))errors.push(`${label}: ${message.text()}`);});
}

async function verifyQuestionBankEditor(page){
  await page.locator('#newSetBtn').click();
  await page.locator('#questionBankModal:not([hidden])').waitFor();
  assert(await page.locator('.editor-question').count()===3,'new question bank did not start with three manual question rows');
  assert(await page.locator('.editor-question').first().locator('.q-choice-input').count()===4,'manual question row does not contain four choices');
  assert(await page.locator('.editor-question').first().locator('input[type="radio"]').count()===4,'manual question row does not expose four correct-answer markers');

  const workbook=new ExcelJS.Workbook();
  const sheet=workbook.addWorksheet('Questions');
  sheet.addRow(['question','optionA','optionB','optionC','optionD','correctAnswer']);
  sheet.addRow(['香港的首都是甚麼？','香港','九龍','新界','沒有首都','D']);
  sheet.addRow(['2 + 3 = ?','4','5','6','7','B']);
  const buffer=Buffer.from(await workbook.xlsx.writeBuffer());
  await page.locator('#excelImportInput').setInputFiles({name:'課堂測試題庫.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
  await page.locator('#excelImportStatus').filter({hasText:'已匯入 2 題'}).waitFor();
  assert(await page.locator('.editor-question').count()===2,'Excel import did not replace editor questions');
  assert(await page.locator('#editorSetTitle').inputValue()==='課堂測試題庫','Excel filename was not used as the default title');
  assert(await page.locator('.editor-question').first().locator('.q-choice-input').evaluateAll(inputs=>inputs.map(input=>input.value)).then(values=>JSON.stringify(values)===JSON.stringify(['香港','九龍','新界','沒有首都'])),'Excel choices were not imported in A-D order');
  assert(await page.locator('.editor-question').first().locator('input[type="radio"]:checked').getAttribute('value')==='3','Excel correct answer was not mapped to option D');
  screenshots.questionBankEditor=join(tmpdir(),'buio-game-hub-question-bank-editor.png');
  await page.screenshot({path:screenshots.questionBankEditor});

  const downloadPromise=page.waitForEvent('download');
  await page.locator('#excelTemplateBtn').click();
  const download=await downloadPromise;
  assert(download.suggestedFilename()==='BuiO-question-bank-template.xlsx','Excel template filename is incorrect');
  await page.locator('#cancelEditorBtn').click();
  await page.locator('#questionBankModal[hidden]').waitFor({state:'attached'});
}

async function createRoom(game){
  const teacher=await context.newPage();watch(teacher,`${game}-teacher`);
  await teacher.goto(`${base}/games/preview?role=teacher`,{waitUntil:'networkidle'});
  await teacher.waitForSelector('#teacherView.active [data-select-set]');
  if(game==='climb'){
    await verifyQuestionBankEditor(teacher);
    const portalModules=await teacher.evaluate(async()=>{
      const {MODULES}=await import('/src/config.js');
      return MODULES.map(module=>({id:module.id,url:module.url,name:module.name}));
    });
    assert(portalModules.some(module=>module.id==='game'&&module.url==='/games'&&module.name==='module_game_name'),'portal game module does not open the unified hub');
    assert(!portalModules.some(module=>module.id==='towerDefense'),'portal still exposes a separate tower-defense module');
  }
  await teacher.locator('[data-select-set="demo"]').click();
  await teacher.locator(`[data-game="${game}"]`).click();
  if(game==='climb'){
    await teacher.locator('#durationSelect').selectOption('300');
    await teacher.locator('#maxEnergyInput').fill('120');
    await teacher.locator('#energyPerCorrectInput').fill('30');
  }
  screenshots[`${game}TeacherSetup`]=join(tmpdir(),`buio-game-hub-${game}-teacher.png`);
  await teacher.screenshot({path:screenshots[`${game}TeacherSetup`],fullPage:true});
  await teacher.locator('#createGameBtn').click();
  if(game==='climb'){
    await teacher.waitForURL(/\/game\/host\/preview/);
    await teacher.waitForLoadState('domcontentloaded');
    assert(!(await teacher.locator('#setupScreen').isVisible()),'legacy climb setup flashed during unified room creation');
    await teacher.waitForSelector('#lobbyScreen.active');
    const info=await teacher.locator('#lobbyInfo').textContent();
    assert(info.includes('示範題庫')&&info.includes('5 分鐘')&&info.includes('最高 120 能量')&&info.includes('每題 +30'),`climb settings were not handed off: ${info}`);
  }else{
    await teacher.waitForURL(/\/tower-defense\/teacher\/preview/);
    await teacher.waitForLoadState('domcontentloaded');
    assert(!(await teacher.locator('#teacherSetup').isVisible()),'legacy tower setup flashed during unified room creation');
    await teacher.waitForSelector('#teacherLobby.active');
    const info=await teacher.locator('#roomSummary').textContent();
    assert(info.includes('示範題庫')&&info.includes('固定守衛級'),`tower settings were not handed off: ${info}`);
  }
  const code=(await teacher.locator(game==='climb'?'#lobbyInfo':'#roomCode').textContent()).match(/\b\d{6}\b/)?.[0]
    || (game==='climb'?null:(await teacher.locator('#roomCode').textContent()).trim());
  if(game==='climb'){
    const sessions=await teacher.evaluate(()=>fetch('/api/game/sessions').then(response=>response.json()));
    const created=sessions.sessions.find(room=>room.setTitle.includes('示範題庫')&&room.settings.maxEnergy===120);
    assert(created,'climb room was not listed after automatic creation');
    return {teacher,code:created.code};
  }
  assert(/^\d{6}$/.test(code),`invalid tower room code: ${code}`);
  return {teacher,code};
}

async function joinFromHub(game,code){
  const student=await context.newPage();watch(student,`${game}-student`);
  await student.goto(`${base}/games/preview?role=student`,{waitUntil:'networkidle'});
  await student.waitForSelector(`#studentView.active [data-room-code="${code}"]`);
  const combinedTypes=await student.locator('[data-room-game]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.dataset.roomGame))]);
  screenshots[`${game}StudentHub`]=join(tmpdir(),`buio-game-hub-${game}-rooms.png`);
  await student.screenshot({path:screenshots[`${game}StudentHub`],fullPage:true});
  await student.locator(`[data-room-code="${code}"]`).click();
  if(game==='climb'){
    await student.waitForURL(/\/game\/preview/);
    await student.waitForSelector('#lobbyScreen.active');
    assert(await student.locator('#lobbySetTitle').textContent().then(text=>text.includes('示範題庫')),'climb student did not enter the original waiting interface');
  }else{
    await student.waitForURL(/\/tower-defense\/preview/);
    await student.waitForSelector('#menuScreen.active');
    const controls=await student.evaluate(()=>({maps:document.querySelectorAll('[data-map]').length,difficulties:document.querySelectorAll('[data-difficulty]').length,sets:document.querySelectorAll('#questionSetSelect').length}));
    assert(controls.maps===3&&controls.difficulties===0&&controls.sets===0,`tower student waiting interface is incorrect: ${JSON.stringify(controls)}`);
  }
  screenshots[`${game}StudentWaiting`]=join(tmpdir(),`buio-game-hub-${game}-student.png`);
  await student.screenshot({path:screenshots[`${game}StudentWaiting`],fullPage:true});
  return {student,combinedTypes};
}

try{
  const climb=await createRoom('climb');
  const climbStudent=await joinFromHub('climb',climb.code);
  await climbStudent.student.close();

  const tower=await createRoom('tower-defense');
  const towerStudent=await joinFromHub('tower-defense',tower.code);
  assert(towerStudent.combinedTypes.includes('climb')&&towerStudent.combinedTypes.includes('tower-defense'),`unified student room list did not include both games: ${JSON.stringify(towerStudent.combinedTypes)}`);
  await towerStudent.student.locator('[data-map="starport"]').click();
  await tower.teacher.waitForFunction(()=>document.querySelector('#teacherRoster')?.textContent.includes('星港迴廊'));
  await towerStudent.student.close();await tower.teacher.close();await climb.teacher.close();

  assert(!errors.length,`browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({climbRoom:climb.code,towerRoom:tower.code,studentRoomTypes:towerStudent.combinedTypes,screenshots},null,2));
}catch(error){
  console.error(JSON.stringify({errors,screenshots},null,2));
  throw error;
}finally{await browser.close();}
