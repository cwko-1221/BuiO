import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';
const require=createRequire(import.meta.url); const { catalog }=require('../pet-app/lib/catalog.js');

const reservePort = () => new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const port=await reservePort(); const baseURL=`http://127.0.0.1:${port}`;
const tempDir=await fs.mkdtemp(path.join(os.tmpdir(),'buio-pet-live-')); const databaseFile=path.join(tempDir,'db.json');
// PET_PLAYTEST_DIR lets concurrent workstreams capture to their own folder instead of
// overwriting each other's screenshots in the shared default.
const artifactDir=path.resolve(process.env.PET_PLAYTEST_DIR||'artifacts/pet-playtest'); await fs.mkdir(artifactDir,{recursive:true});
await fs.writeFile(databaseFile,JSON.stringify({
  users:[
    {studentid:'S001',name:'陳小星',passwordhash:bcrypt.hashSync('student123',4),role:'student',classname:'5A',classno:1,language:'zh-HK'},
    {studentid:'S002',name:'李月兒',passwordhash:bcrypt.hashSync('student123',4),role:'student',classname:'5A',classno:2,language:'zh-HK'},
    {studentid:'T001',name:'黃老師',passwordhash:bcrypt.hashSync('teacher123',4),role:'teacher',classname:'',classno:null,language:'zh-HK'},
  ],studentStats:[],questionLogs:[],_logId:0,
},null,2));

const server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),BUIO_JSON_DB_FILE:databaseFile,MOCK_AUTH:'1',NODE_ENV:'development',SUPABASE_DB_URL:''},stdio:['ignore','pipe','pipe']});
let logs=''; server.stdout.on('data',(chunk)=>logs+=chunk); server.stderr.on('data',(chunk)=>logs+=chunk);
const waitForServer=async()=>{for(let index=0;index<80;index+=1){try{const response=await fetch(`${baseURL}/health`);if(response.ok)return;}catch{}await new Promise((resolve)=>setTimeout(resolve,125));}throw new Error(`Server did not start.\n${logs}`);};
const waitImages=async(page)=>page.waitForFunction(()=>[...document.images].filter((image)=>image.offsetParent!==null).every((image)=>image.complete&&image.naturalWidth>0));

let browser;
try {
  await waitForServer();
  const anonymous=await fetch(`${baseURL}/pet`,{redirect:'manual'}); assert.equal(anonymous.status,302);
  assert.equal((await fetch(`${baseURL}/pet/assets/art/manifest.json`)).status,404);
  assert.equal((await fetch(`${baseURL}${catalog.pets[0].art[0]}`)).status,200);
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({baseURL,viewport:{width:1440,height:900},deviceScaleFactor:1});
  const page=await context.newPage(); const errors=[];
  page.on('pageerror',(error)=>errors.push(`pageerror: ${error.message}`));
  page.on('console',(message)=>{if(message.type()==='error')errors.push(`console: ${message.text()}`);});
  await context.request.get('/api/auth/me');
  await page.goto('/pet',{waitUntil:'networkidle'});
  await page.locator('[data-action="hatch"]').waitFor();
  await page.screenshot({path:path.join(artifactDir,'01-starter-egg-desktop.png')});
  await page.locator('[data-action="hatch"]').click();
  await page.locator('.reveal-card').waitFor(); await waitImages(page);
  await page.screenshot({path:path.join(artifactDir,'02-hatch-reveal-desktop.png')});
  await page.locator('.modal-card [data-action="back-home"]').click();
  await page.locator('#game-root canvas').waitFor();
  await page.locator('[data-tab="collection"]').click(); await page.locator('.pet-card').first().waitFor();
  assert.equal(await page.locator('.pet-card').count(),20);
  await page.setViewportSize({width:1180,height:820}); await page.screenshot({path:path.join(artifactDir,'03-collection-ipad-landscape.png')});
  await page.locator('[data-tab="shop"]').click(); await page.locator('.shop-feature').waitFor();
  assert.match(await page.locator('.shop-feature').innerText(),/55%/);

  await page.locator('[data-tab="home"]').click(); await page.locator('.home-panel').waitFor();
  await page.locator('[data-action="decorate"]').click(); await page.locator('#roomTheme').waitFor();
  await page.screenshot({path:path.join(artifactDir,'06-decoration-ipad-landscape.png')});
  await page.locator('[data-tab="home"]').click(); await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(250);
  await page.screenshot({path:path.join(artifactDir,'07-home-mobile.png')});

  const teacherContext=await browser.newContext({baseURL,viewport:{width:1440,height:900}});
  const login=await teacherContext.request.post('/api/auth/login',{data:{studentId:'T001',password:'teacher123'}}); assert.equal(login.status(),200);
  const teacherPage=await teacherContext.newPage();
  teacherPage.on('pageerror',(error)=>errors.push(`teacher pageerror: ${error.message}`));
  teacherPage.on('console',(message)=>{if(message.type()==='error')errors.push(`teacher console: ${message.text()}`);});
  await teacherPage.goto('/pet',{waitUntil:'networkidle'}); await teacherPage.locator('.teacher-shell').waitFor();
  assert.equal(await teacherPage.locator('[data-student]').count(),2);
  await teacherPage.locator('[data-student="S001"]').check();
  await teacherPage.locator('#grantAmount').fill('250'); await teacherPage.locator('#previewGrant').click();
  await teacherPage.locator('.grant-confirm').waitFor(); await teacherPage.screenshot({path:path.join(artifactDir,'08-teacher-grant-confirmation.png')});
  await teacherPage.locator('#commitGrant').click(); await teacherPage.locator('#grantMessage').waitFor();
  await teacherPage.waitForFunction(()=>document.querySelector('#grantMessage')?.textContent?.includes('250'));
  await teacherPage.screenshot({path:path.join(artifactDir,'09-teacher-grant-complete.png')});
  await page.setViewportSize({width:1180,height:820}); await page.reload({waitUntil:'networkidle'});
  await page.locator('#coinBalance').waitFor(); assert.equal((await page.locator('#coinBalance').innerText()).replace(/,/g,''),'250');
  assert.deepEqual(errors,[]);
  await teacherContext.close(); await context.close();
  console.log(`✓ protected student and teacher role routing`);
  console.log(`✓ hatch, collection, decoration and grant flows`);
  console.log(`✓ desktop, iPad landscape and mobile screenshots: ${artifactDir}`);
  console.log(`✓ no browser console or uncaught page errors`);
} finally {
  if(browser) await browser.close();
  server.kill(); await new Promise((resolve)=>setTimeout(resolve,250));
  await fs.rm(tempDir,{recursive:true,force:true});
}
