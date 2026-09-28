import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import bcrypt from 'bcryptjs';
import {chromium} from 'playwright';

const root=path.resolve('.');
const port=await new Promise(resolve=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-room-actions-'));
const dbFile=path.join(temp,'db.json');
const artifacts=path.resolve(process.env.PET_PLAYTEST_DIR||'artifacts/pet-playtest/room-actions-20260928');
await fs.mkdir(artifacts,{recursive:true});
await fs.writeFile(dbFile,JSON.stringify({users:[{studentid:'S001',name:'按鈕排版測試',passwordhash:bcrypt.hashSync('test',4),role:'student',classname:'5A',language:'zh-HK'}],studentStats:[],questionLogs:[],_logId:0}));
const server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),BUIO_JSON_DB_FILE:dbFile,MOCK_AUTH:'1',NODE_ENV:'development',SUPABASE_DB_URL:''},stdio:['ignore','pipe','pipe']});
let logs='',browser,page;
server.stdout.on('data',data=>logs+=data);server.stderr.on('data',data=>logs+=data);
const errors=[],layouts=[];
try {
  const baseURL=`http://127.0.0.1:${port}`;
  const deadline=Date.now()+20000;
  while(true){try{if((await fetch(baseURL+'/health')).ok)break;}catch{}if(Date.now()>deadline)throw new Error('isolated server startup');await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({baseURL,viewport:{width:1440,height:900}});
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await context.request.get('/api/auth/me');
  await page.goto('/pet');await page.locator('[data-action="hatch"]').click();
  await page.locator('.reveal-card').waitFor();await page.locator('[data-action="back-home"]').click();
  const buttons=page.locator('#roomBar .room-bar-actions > button');
  assert.equal(await buttons.count(),6);
  const actions=await buttons.evaluateAll(nodes=>nodes.map(n=>n.dataset.action));
  assert.deepEqual(actions,['play','sleep','decorate','open-feed','open-outfit','arcade-prize-bag']);
  for(const [width,height] of [[1440,900],[1180,820],[900,900],[877,900],[768,1024],[561,844],[560,844],[390,844],[320,740]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(150);
    const boxes=await buttons.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
    const rows=[];
    for(const box of boxes){let row=rows.find(r=>Math.abs(r.y-box.y)<1);if(!row){row={y:box.y,count:0};rows.push(row);}row.count++;assert.ok(box.width>=44&&box.height>=44,'accessible touch target');assert.ok(box.x>=0&&box.x+box.width<=width+.5,'button fits viewport');}
    const counts=rows.map(row=>row.count);
    assert.deepEqual(counts,width>560?[6]:[3,3],`${width}px only permits 6 or 3+3`);
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(a.x+a.width<=b.x+.5||b.x+b.width<=a.x+.5||a.y+a.height<=b.y+.5||b.y+b.height<=a.y+.5,'buttons never overlap');}
    layouts.push({width,height,rows:counts});
    if([1440,1180,877,560,390,320].includes(width))await page.locator('#roomBar').screenshot({path:path.join(artifacts,`room-actions-${width}.png`)});
  }
  await page.locator('#roomBar [data-action="arcade-prize-bag"]').click();
  await page.locator('.arcade-prize-picker').first().waitFor();
  await page.keyboard.press('Escape');assert.equal(await buttons.count(),6,'closing the prize bag preserves the action grid');
  assert.deepEqual(errors,[]);
  const report={pass:true,layouts,errors};await fs.writeFile(path.join(artifacts,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} catch(error){await page?.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});console.error(JSON.stringify({pass:false,error:error.stack,errors,logs:logs.slice(-1200)}));process.exitCode=1;}
finally{await browser?.close();server.kill();}
