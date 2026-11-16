import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const bcrypt=createRequire(import.meta.url)('bcryptjs');
const folder=await mkdtemp(path.join(tmpdir(),'buio-changes-')),database=path.join(folder,'fixture.json'),port=Number(process.env.MATERIAL_PLATFORM_PORT||3187),base=`http://127.0.0.1:${port}`;
const evidence=path.resolve('tmp/material-changes-platform');await mkdir(evidence,{recursive:true});
await writeFile(database,JSON.stringify({users:['S201','S202'].map(studentid=>({studentid,name:studentid,role:'student',passwordhash:bcrypt.hashSync('123456',4),classname:'P4',classno:1,language:'zh-HK'})),studentStats:[],questionLogs:[],_logId:0}));
const server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),BUIO_JSON_DB_FILE:database,SUPABASE_DB_URL:'',NODE_ENV:'development',GOOGLE_API_KEY:'',GOOGLE_CREDENTIALS_JSON:'',GOOGLE_APPLICATION_CREDENTIALS:''},stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',data=>output+=data);server.stderr.on('data',data=>output+=data);
const browser=await chromium.launch({channel:'msedge',headless:true});
async function ready(){for(let i=0;i<100;i++){try{if((await fetch(`${base}/health`)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(output);}
async function auth(context,id){const response=await context.request.post(`${base}/api/auth/login`,{data:{studentId:id,password:'123456'}});assert.equal(response.status(),200);assert.equal((await response.json()).success,true);}
async function dismissChapter(page){await page.waitForFunction(()=>['chapter','observe','hypothesis','lab','analysis','complete'].includes(window.__changeLabTest?.state().phase));if(await page.locator('.chapter-card:visible').count())await page.locator('.chapter-card').click();}
async function begin(page){await page.locator('.observation-figure').waitFor();await page.locator('[data-action="wonder"]').click();await page.locator('[data-action="hypothesis"]').click();await dismissChapter(page);await page.locator('[data-prediction="1"]').click();await page.locator('[data-action="begin"]').click();}
async function question(page,id,group){
  await page.locator(`[data-observation-stage="${group}"]`).waitFor({timeout:45000});
  const correct={ice:{hot:'liquidChoice',cold:'solidChoice',verdict:'reversible'},chocolate:{hot:'liquidChoice',cold:'solidChoice',verdict:'reversible'},charcoal:{hot:'ashChoice',cold:'ashRemains',verdict:'irreversible'}}[id][group];
  await page.locator(`[data-observation-choice="${correct}"]`).click();await page.locator('[data-action="confirm-observation"]').click();
  if(group!=='cold')await page.locator('#dialog').waitFor({state:'hidden'});
}
async function touchMove(page,id,target){
  await page.waitForTimeout(400);const from=await page.evaluate(id=>window.__changeLabTest.screenPoint(id),id),to=await page.evaluate(id=>window.__changeLabTest.screenPoint(id),target);
  const client=await page.context().newCDPSession(page);await client.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x,y:from.y}]});
  for(let i=1;i<=22;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/22,y:from.y+(to.y-from.y)*i/22}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await client.detach();
  await page.waitForFunction(({id,target})=>window.__changeLabTest.state().samples[id].location===target,{id,target});
}
try{
  await ready();
  for(const route of ['/science-lab/material-changes','/science-lab/material-changes/','/science-lab/material-changes/index.html']){
    const response=await fetch(base+route,{redirect:'manual'});assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/');
  }
  const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addInitScript(()=>{window.__CHANGE_LAB_QA__=true;});await auth(context,'S201');
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  const response=await page.goto(base+'/science-lab');assert.equal(response.status(),200);await page.locator('[data-experiment="material-changes"]').waitFor();
  assert.equal(await page.locator('[data-experiment]').count(),9);assert.match(await page.locator('#progressCount').innerText(),/0 \/ 9/);
  await page.locator('[data-experiment="material-changes"]').click();await page.waitForURL('**/science-lab/material-changes/**');await dismissChapter(page);
  assert.match(await page.locator('#brandName').innerText(),/奇趣科學島/);assert.equal(await page.locator('#platformMap').isVisible(),true);
  await page.screenshot({path:path.join(evidence,'01-island-observation.png')});
  await page.locator('#settingsButton').click();
  assert.equal(await page.locator('#dialog.settings-dialog').isVisible(),true);assert.equal(await page.locator('.toggle-row').count(),3);
  await page.locator('label.toggle-row:has(#contrastToggle)').click();await page.locator('#qualitySelect').selectOption('low');await page.locator('#speedSelect').selectOption('360');
  await page.screenshot({path:path.join(evidence,'02-shared-settings.png')});
  await page.locator('[data-action="close"]').click();assert.equal(await page.locator('body.high-contrast').count(),1);
  await begin(page);await page.locator('[data-material="ice"]').click();await page.keyboard.press('h');await question(page,'ice','hot');
  await page.reload();await page.waitForFunction(()=>window.__changeLabTest?.state().phase==='lab');
  assert.equal(await page.evaluate(()=>window.__changeLabTest.state().samples.ice.observations.hot),'liquidChoice');assert.equal(await page.evaluate(()=>window.__changeLabTest.state().activeId),'ice');
  assert.equal(await page.evaluate(()=>window.__changeLabTest.state().settings.quality),'low');
  await page.keyboard.press('f');await question(page,'ice','cold');await question(page,'ice','verdict');
  for(const id of ['chocolate','charcoal']){await page.locator(`[data-material="${id}"]`).click();await page.keyboard.press('h');await question(page,id,'hot');await page.keyboard.press('c');await question(page,id,'cold');await question(page,id,'verdict');}
  await page.screenshot({path:path.join(evidence,'03-island-laboratory.png')});
  await page.locator('#analyseButton').click();await dismissChapter(page);await page.locator('[data-conclusion="1"]').click();await page.locator('[data-challenge="yes"]').click();
  await page.waitForFunction(()=>window.__changeLabTest.state().phase==='complete');assert.equal(await page.locator('#completionCount').innerText(),'1 / 9');
  await page.locator('#platformHome').click();await page.locator('[data-experiment="material-changes"].completed').waitFor();assert.equal(await page.locator('#progressCount').innerText(),'1 / 9');
  await page.locator('#notebookButton').click();assert.equal(await page.locator('[data-notebook-id="material-changes"] .entry-stars').innerText(),'★★★');await page.keyboard.press('Escape');
  await auth(context,'S202');await page.goto(base+'/science-lab');await page.locator('[data-experiment="material-changes"]').waitFor();assert.equal(await page.locator('#progressCount').innerText(),'0 / 9');
  await page.goto(base+'/science-lab/material-changes/?lang=en-US');await dismissChapter(page);assert.equal(await page.locator('#brandName').innerText(),'Wonder Lab');assert.equal(await page.locator('#completionCount').innerText(),'0 / 9');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(evidence,'04-island-mobile-english.png')});
  await page.locator('#settingsButton').click();await page.locator('#languageSelect').selectOption('zh');await page.locator('[data-action="close"]').click();
  assert.equal(await page.locator('#brandName').innerText(),'奇趣科學島');assert.match(await page.locator('#platformMap').getAttribute('href'),/lang=zh-HK/);
  await begin(page);await page.locator('[data-material="ice"]').click();
  await touchMove(page,'ice','heat');await question(page,'ice','hot');
  await page.screenshot({path:path.join(evidence,'05-island-mobile-lab.png')});
  await touchMove(page,'ice','freeze');await question(page,'ice','cold');await question(page,'ice','verdict');
  await page.locator('#platformHome').click();await page.locator('[data-experiment="air-expansion"]').click();await page.locator('#stageScreen').waitFor({state:'visible'});assert.match(await page.locator('#labTitle').innerText(),/空氣/);
  assert.deepEqual(errors,[]);await context.close();
  await writeFile(path.join(evidence,'report.json'),JSON.stringify({passed:true,checks:['Protected HTML and direct-index route','Native ninth catalogue card and original-air navigation','Island branding, shared settings and 3D quality','Account-scoped checkpoint after heating and page reload','Three real materials, analysis and completion reflected in island progress/notebook','Second account isolation on the same browser','English/Chinese skin, mobile overflow and return to map']},null,2));
  console.log('Material Changes island integration passed.');
}finally{await browser.close();server.kill();}
