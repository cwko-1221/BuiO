import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm,mkdir,readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn,execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require=createRequire(import.meta.url);
const directory=await mkdtemp(path.join(os.tmpdir(),'buio-inquiry-live-'));
const qa=path.resolve('tmp/science-inquiry-qa');await mkdir(qa,{recursive:true});
const fixtureFile=path.join(directory,'fixture.json');
const mediaDirectory=path.join(directory,'media');
const videoFile=path.join(directory,'discovery.mp4');
const port=Number(process.env.SCIENCE_INQUIRY_PORT||3176);
const base=`http://127.0.0.1:${port}`;
const passwordhash=require('bcryptjs').hashSync('123456',4);
await writeFile(fixtureFile,JSON.stringify({users:[
  {studentid:'S001',name:'科學小偵探',role:'student',passwordhash,language:'zh-HK',classname:'P4',classno:1},
  {studentid:'S002',name:'好奇同學',role:'student',passwordhash,language:'zh-HK',classname:'P4',classno:2},
  {studentid:'T001',name:'科學老師',role:'teacher',passwordhash,language:'zh-HK'},
],studentStats:[],questionLogs:[],_logId:0}));
await promisify(execFile)(require('ffmpeg-static'),['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=1280x720:rate=30:duration=2',
  '-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-preset','ultrafast','-crf','0','-threads','2','-c:a','aac',videoFile],
{timeout:30000,windowsHide:true});
const server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),NODE_ENV:'development',SUPABASE_DB_URL:'',
  MOCK_AUTH:'0',BUIO_JSON_DB_FILE:fixtureFile,SCIENCE_INQUIRY_MEDIA_DIR:mediaDirectory,
  GOOGLE_API_KEY:'',GOOGLE_CREDENTIALS_JSON:'',GOOGLE_APPLICATION_CREDENTIALS:''},stdio:['ignore','pipe','pipe'],windowsHide:true});
let logs='';server.stdout.on('data',chunk=>logs+=chunk);server.stderr.on('data',chunk=>logs+=chunk);
let browser;
const errors=[];
async function login(context,id){const response=await context.request.post(`${base}/api/auth/login`,{data:{studentId:id,password:'123456'}});assert.equal(response.status(),200,await response.text());}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'page should fit viewport');}
try {
  let ready=false;
  for(let i=0;i<100;i++){try{if((await fetch(`${base}/health`)).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(ready,logs);
  assert.equal((await fetch(`${base}/api/science-inquiry/videos`)).status,401);
  const protectedPage=await fetch(`${base}/science-inquiry/index.html`,{redirect:'manual'});assert.equal(protectedPage.status,302);
  browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const student=await browser.newContext({viewport:{width:1440,height:1000},permissions:['camera','microphone']});
  const other=await browser.newContext({viewport:{width:1024,height:768}});
  const teacher=await browser.newContext({viewport:{width:1440,height:1000}});
  for(const context of [student,other,teacher])context.on('page',page=>{page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});});
  await login(student,'S001');await login(other,'S002');await login(teacher,'T001');
  assert.equal((await (await student.request.get(`${base}/api/science-inquiry/meta`)).json()).maxDuration,60);
  const studentPage=await student.newPage();await studentPage.goto(base);
  await studentPage.locator('[data-open-module="science-inquiry"]').waitFor();
  await studentPage.locator('[data-open-module="science-inquiry"]').click();
  await studentPage.getByRole('tab',{name:'我的探究'}).waitFor();await noOverflow(studentPage);
  await studentPage.screenshot({path:path.join(qa,'01-student-discover-desktop.png'),fullPage:true,animations:'disabled'});
  await studentPage.setViewportSize({width:390,height:844});
  await studentPage.getByRole('button',{name:'＋ 分享我的發現'}).click();
  assert.ok((await studentPage.locator('#fileLimit').textContent()).includes('最長 1 分鐘'));
  await studentPage.locator('#videoFile').setInputFiles(videoFile);
  await studentPage.locator('#videoTitle').fill('冰水杯外的水珠從哪裡來？');
  await studentPage.locator('#description').fill('我把冰水放在桌上，不久杯外就出現了小水珠。我想知道：水是從杯子裡滲出來的嗎？');
  await studentPage.getByLabel('科學疑問',{exact:true}).check();
  await noOverflow(studentPage);
  await studentPage.screenshot({path:path.join(qa,'02-student-upload-phone.png'),fullPage:true,animations:'disabled'});
  const uploaded=studentPage.waitForResponse(response=>response.url().endsWith('/api/science-inquiry/videos')&&response.request().method()==='POST',{timeout:90000});
  await studentPage.getByRole('button',{name:'提交老師審核 ↗'}).click();
  const uploadResponse=await uploaded;assert.equal(uploadResponse.status(),201,await uploadResponse.text());
  const {item}=await uploadResponse.json();assert.equal(item.status,'pending');assert.ok(item.videoBytes<item.originalBytes*.6);
  await studentPage.locator('#uploadDialog').waitFor({state:'hidden'});
  await studentPage.locator('.status-badge.pending').waitFor();
  await studentPage.screenshot({path:path.join(qa,'03-student-pending-phone.png'),fullPage:true,animations:'disabled'});
  const request=other.request;
  assert.equal((await request.get(`${base}${item.videoUrl}`)).status(),404);
  assert.equal((await request.get(`${base}${item.posterUrl}`)).status(),404);
  assert.equal((await request.get(`${base}/api/science-inquiry/videos?scope=review`)).status(),403);
  assert.equal((await request.post(`${base}/api/science-inquiry/videos/${item.id}/review`,{data:{status:'published',revision:0}})).status(),403);
  assert.equal((await request.put(`${base}/api/science-inquiry/videos/${item.id}/like`,{data:{liked:true}})).status(),404);
  assert.equal((await request.put(`${base}/api/science-inquiry/videos/${item.id}/like`,{headers:{'X-BuiO-Account':'S001'},data:{liked:true}})).status(),403);
  assert.equal((await student.request.get(`${base}${item.videoUrl}`,{headers:{Range:'bytes=0-1023'}})).status(),206);
  const teacherPage=await teacher.newPage();await teacherPage.goto(base);
  await teacherPage.locator('[data-open-module="science-inquiry"]').waitFor();
  await teacherPage.locator('[data-open-module="science-inquiry"]').click();
  assert.equal(await teacherPage.locator('#openUpload').isVisible(),false);
  await teacherPage.getByRole('tab',{name:'影片審核'}).click();await teacherPage.locator('.status-badge.pending').waitFor();
  await teacherPage.screenshot({path:path.join(qa,'04-teacher-review-desktop.png'),fullPage:true,animations:'disabled'});
  await teacherPage.locator('#videos video').evaluate(video=>video.play());
  await teacherPage.waitForFunction(()=>document.querySelector('#videos video')?.currentTime>0,{},{timeout:10000});
  await teacherPage.locator('#videos video').evaluate(video=>video.pause());
  await teacherPage.locator('[data-note]').fill('留心觀察生活中的變化，做得很好！');
  await teacherPage.getByRole('button',{name:'審核通過並發佈'}).click();await teacherPage.locator('#notice').filter({hasText:'審核結果已儲存'}).waitFor();
  const otherPage=await other.newPage();await otherPage.goto(`${base}/science-inquiry`);
  await otherPage.locator('.video-card').waitFor();await noOverflow(otherPage);
  await otherPage.locator('[data-like]').click();await otherPage.locator('[data-like][aria-pressed="true"]').waitFor();
  assert.equal(await otherPage.locator('[data-like] span').textContent(),'1');
  await otherPage.reload();await otherPage.locator('[data-like][aria-pressed="true"]').waitFor();
  assert.equal(await otherPage.locator('[data-like] span').textContent(),'1');
  await otherPage.locator('[data-like]').click();await otherPage.locator('[data-like][aria-pressed="false"]').waitFor();
  assert.equal(await otherPage.locator('[data-like] span').textContent(),'0');
  await otherPage.locator('[data-like]').click();await otherPage.locator('[data-like][aria-pressed="true"]').waitFor();
  await otherPage.screenshot({path:path.join(qa,'05-published-ipad.png'),fullPage:true,animations:'disabled'});
  const streamed=await request.get(`${base}${item.videoUrl}`,{headers:{Range:'bytes=0-1023'}});assert.equal(streamed.status(),206);assert.equal(streamed.headers()['cache-control'],'private, no-store');assert.equal((await streamed.body()).length,1024);
  await teacherPage.getByRole('button',{name:'已發佈',exact:true}).click();await teacherPage.locator('.video-card').waitFor();
  await teacherPage.locator('[data-note]').fill('請先遮蓋畫面中的姓名，再重新拍攝。');
  await teacherPage.getByRole('button',{name:'下架並退回'}).click();await teacherPage.locator('#notice').filter({hasText:'審核結果已儲存'}).waitFor();
  assert.equal((await request.get(`${base}${item.videoUrl}`,{headers:{Range:'bytes=1024-2047'}})).status(),404);
  assert.equal((await request.get(`${base}${item.posterUrl}`)).status(),404);
  await otherPage.reload();await otherPage.locator('.empty').filter({hasText:'好奇的眼睛'}).waitFor();
  await studentPage.getByRole('button',{name:'重新整理'}).click();await studentPage.locator('.status-badge.rejected').waitFor();
  assert.ok((await studentPage.locator('.review-note').textContent()).includes('請先遮蓋畫面中的姓名'));
  await studentPage.screenshot({path:path.join(qa,'06-student-feedback-phone.png'),fullPage:true,animations:'disabled'});
  // Exercise the browser's real MediaRecorder output, which has no WebM duration header.
  await studentPage.getByRole('button',{name:'＋ 分享我的發現'}).click();
  await studentPage.getByRole('button',{name:'開啟鏡頭錄影'}).click();await studentPage.locator('#stopRecording').waitFor();
  assert.ok((await studentPage.locator('#recordingStatus').textContent()).includes('/ 1:00'));
  await studentPage.waitForTimeout(1300);await studentPage.getByRole('button',{name:'停止錄影'}).click();
  await studentPage.locator('#selectedFile').filter({hasText:'science-discovery'}).waitFor();
  assert.equal(await studentPage.locator('#videoTitle').inputValue(),'');
  assert.equal(await studentPage.locator('#description').inputValue(),'');
  assert.equal(await studentPage.locator('#videoTitle').getAttribute('required'),null);
  assert.equal(await studentPage.locator('#description').getAttribute('required'),null);
  const recordedUpload=studentPage.waitForResponse(response=>response.url().endsWith('/api/science-inquiry/videos')&&response.request().method()==='POST',{timeout:90000});
  await studentPage.getByRole('button',{name:'提交老師審核 ↗'}).click();const recordedResponse=await recordedUpload;
  assert.equal(recordedResponse.status(),201,await recordedResponse.text());
  const recordedItem=(await recordedResponse.json()).item;
  assert.equal(recordedItem.title,'');assert.equal(recordedItem.description,'');
  await studentPage.locator('#uploadDialog').waitFor({state:'hidden'});
  await studentPage.locator(`[data-id="${recordedItem.id}"] h3`).filter({hasText:'未命名的探究'}).waitFor();
  // Check language follows the platform, plus malformed uploads have no media side effects.
  await otherPage.goto(`${base}/science-inquiry?lang=en`);await otherPage.getByRole('tab',{name:'Discover',exact:true}).waitFor();await noOverflow(otherPage);
  const bad=await student.request.post(`${base}/api/science-inquiry/videos`,{multipart:{title:'壞的影片',description:'這不是影片',kind:'question',video:{name:'invalid.mp4',mimeType:'video/mp4',buffer:Buffer.from('not a video')}}});assert.equal(bad.status(),400);
  assert.equal((await readdir(mediaDirectory)).length,2,'failed uploads must not leave stored media');
  // Media access errors from deliberately rejected requests above are API-only; browser pages stay clean.
  assert.deepEqual(errors,[]);
  await writeFile(path.join(qa,'result.json'),JSON.stringify({success:true,compression:{originalBytes:item.originalBytes,videoBytes:item.videoBytes},
    checks:['student upload','phone layout','teacher playback','approval','private pending media','published range streaming','likes persist/unlike','unpublish revokes media','teacher feedback','browser camera recording','English UI','invalid video cleanup'],browserErrors:errors},null,2));
  console.log('✓ Science Inquiry: real upload → compression → private pending → teacher playback/publish → classmate like/unlike → unpublish → feedback; live camera; desktop/iPad/phone; English; invalid media cleanup.');
  await writeFile(path.join(qa,'server.log'),logs);
  console.log(`QA evidence: ${qa}`);
} catch(error){await writeFile(path.join(qa,'server.log'),logs);throw error;}
finally{await browser?.close();server.kill();await new Promise(resolve=>server.exitCode!==null?resolve():server.once('exit',resolve));await rm(directory,{recursive:true,force:true});}
