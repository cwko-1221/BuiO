import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';
import { BRIDGE_CHECKPOINTS, terrain } from '../pet-app/src/coast3d/island.ts';
import { CAMERA } from '../pet-app/src/coast3d/follow-camera.ts';
import { TRIAL_MODELS } from '../pet-app/src/coast3d/trial-placements.ts';

const dist=path.resolve(process.env.PET_APP_DIST_DIR || path.join(os.tmpdir(),'moonbay3d-pet-dist'));
assert.ok((await readFile(path.join(dist,'index.html'),'utf8')).includes('/pet/assets/'),'Build the isolated Pet Paradise with VITE_COAST3D_PREVIEW=1');
assert.ok(terrain(76,130).y<0 && terrain(154,122).y<0 && terrain(129,136).y>2,'The two tidal coves sit on either side of the dry woodland neck');
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.resolve(root,process.env.MOONBAY_ART_OUTPUT||'artifacts/moonbay-3d');
await mkdir(output,{recursive:true});
const data=await mkdtemp(path.join(os.tmpdir(),'buio-coast-3d-')),database=path.join(data,'db.json');
await writeFile(database,JSON.stringify({users:[
  {studentid:'MAP3D',name:'海岸測試',classname:'5A',role:'student',language:'zh-HK',passwordhash:bcrypt.hashSync('moonbay-test-only',4)},
]}));
const probe=createServer().listen(0,'127.0.0.1');
await once(probe,'listening');const {port}=probe.address();
await new Promise(resolve=>probe.close(resolve));
const baseURL=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.js'],{windowsHide:true,cwd:root,
  env:{...process.env,PET_APP_DIST_DIR:dist,BUIO_JSON_DB_FILE:database,PORT:String(port),NODE_ENV:'development',MOCK_AUTH:'0',SUPABASE_DB_URL:''}});
let browser,logs='';
server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
const errors=[];
function watch(page) {
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error' && /shader|moonbay 3d|content security policy|couldn't load texture/i.test(m.text())) errors.push(m.text());});
}
const screen = '.moonbay-3d[data-ready="true"]';
function viewPose(view) {
  return view.evaluate(el=>({x:Number(el.dataset.x),z:Number(el.dataset.z),yaw:Number(el.dataset.yaw),pitch:Number(el.dataset.pitch)}));
}
async function waitForTravel(page,from,distance) {
  await page.waitForFunction(({x,z,distance})=>{
    const d=document.querySelector('.moonbay-3d').dataset;
    return Math.hypot(Number(d.x)-x,Number(d.z)-z)>distance;
  },{...from,distance});
}
function assertBearing(before,after,right,forward) {
  const x=after.x-before.x,z=after.z-before.z,length=Math.hypot(x,z);
  assert.ok(length>.2);
  const alignment=(x*(right*Math.cos(before.yaw)-forward*Math.sin(before.yaw))+
    z*(-right*Math.sin(before.yaw)-forward*Math.cos(before.yaw)))/length;
  assert.ok(alignment>.90,`Movement should follow the current camera bearing, got ${alignment.toFixed(3)} from ${JSON.stringify(before)} to ${JSON.stringify(after)}`);
}
async function enter(page) {
  await page.goto('/pet?coast3d=1');
  const entry=page.getByRole('button',{name:'海岸小鎮',exact:true});
  if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches))
    await entry.tap({timeout:60000});
  else await entry.click({timeout:60000});
  const view=page.locator(screen);
  try {await view.waitFor({timeout:35000});} catch(e) {throw Error('Internal world failed: '+errors.join('\n'),{cause:e});}
  assert.equal(await view.getAttribute('data-world'),'full-3d');
  assert.ok(Number(await view.getAttribute('data-joints'))>=3);
  return view;
}
try {
  for(let i=0;i<140;i++){
    if(await fetch(baseURL+'/health/live').then(r=>r.ok,()=>false))break;
    if(i===139||server.exitCode!==null)throw Error('Fixture server unavailable');
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({baseURL,viewport:{width:1100,height:740}});
  assert.equal((await context.request.post('/api/auth/login',{data:{studentId:'MAP3D',password:'moonbay-test-only'}})).status(),200);
  assert.equal((await context.request.post('/api/pet/starter-egg/hatch',{headers:{'Idempotency-Key':'3d-start'},data:{}})).status(),201);
  const page=await context.newPage();watch(page);
  let view=await enter(page);
  const placements=await page.evaluate(()=>window.__moonbay3dTrialPlacements());
  assert.deepEqual(placements.map(p=>p.id).sort(),Object.keys(TRIAL_MODELS).sort());
  assert.equal(new Set(placements.map(p=>p.area)).size,6);
  assert.ok(placements.every(p=>p.position[1]>.5 && p.size.every(n=>n>.05)));
  const stage=placements.find(p=>p.id==='stone-platform'), drum=placements.find(p=>p.id==='traditional-drum');
  assert.ok(drum.position[1]>=stage.position[1]-.01 && drum.position[1]<=stage.position[1]+stage.size[1]+.01);
  await writeFile(path.join(output,'trial-placements.json'),JSON.stringify(placements,null,2)+'\n');
  if(process.argv.includes('--trial-review')){
    const directory=path.join(output,'trials');
    await mkdir(directory,{recursive:true});
    for(const {id,position:[x,y,z],size:[width,height,depth]} of placements){
      const angle=TRIAL_MODELS[id].yaw+.29;
      const distance=Math.max(2.65,height*2.21,Math.max(width,depth)*1.33);
      const eye=[x+Math.sin(angle)*distance,y+height*.51+distance*.37,z+Math.cos(angle)*distance];
      const focus=[x,y+height*.49,z];
      const encoded=await page.evaluate(({eye,focus})=>window.__moonbay3dCaptureArt(eye,focus,38),{eye,focus});
      await writeFile(path.join(directory,id+'.png'),Buffer.from(encoded,'base64'));
    }
  }
  if(process.argv.includes('--art-review')){
    assert.equal(await view.getAttribute('data-blender-models'),'50');
    const cameras={
      'whole-island':[],
      'square':[[129,29,133],[121,7,88],55],
      'square-arrival':[[125,13.6,130],[121,7.7,106],53],
      'market':[[73,17,68],[68,7,45],55],
      'garden':[[50,16,111],[39,4.5,88],56],
      'observatory':[[164,26,74],[175,12,43],56],
      'waterfall':[[143,20,73],[154,9,49],58],
      'marina':[[216,16,116],[201,3.5,87],57],
      'village':[[148,15,172],[150,4,147],55],
      'village-overlook':[[142,36,194],[140,4.8,145],54],
      'west-bridge':[[62,5.6,142],[64,2.1,114],52],
      'east-bridge':[[158.8,5.4,118.5],[172,2.3,109],76],
      'west-cove':[[55,18,155],[57,2.7,130],62],
      'south-shore':[[151,11,198],[146,2.7,170],64],
    };
    for(const [id,args] of Object.entries(cameras)){
      const content=await page.evaluate(args=>window.__moonbay3dCaptureArt(...args),args);
      assert.ok(content.length>20000,id+' screenshot not rendered');
      await writeFile(path.join(output,'art-'+id+'.png'),Buffer.from(content,'base64'));
    }
    assert.deepEqual(errors,[]);
  }
  const physicsReview=process.argv.includes('--physics-review');
  if(physicsReview){
    const report=await page.evaluate(()=>{
      const rad=(r,a)=>[121+r*Math.sin(a),88+r*Math.cos(a)];
      return {
        gazebo:window.__moonbay3dPhysicsProbe([54.6,90],[52,82]),
        column:window.__moonbay3dPhysicsProbe([52,90],[52,82]),
        lamp:window.__moonbay3dPhysicsProbe([127.72,114.35],[127.72,109.6]),
        planter:window.__moonbay3dPhysicsProbe(rad(21.1,.79),rad(27.5,.79)),
        fountain:window.__moonbay3dPhysicsProbe([121,103.8],[121,96.9]),
        slope:window.__moonbay3dPhysicsProbe([58,91.5],[58,86]),
      };
    });
    await writeFile(path.join(output,'physics-probes.json'),JSON.stringify(report,null,2)+'\n');
    assert.ok(Math.hypot(report.gazebo.finish.x-52,report.gazebo.finish.z-82)<.28 && report.gazebo.support.y>3.96,JSON.stringify(report.gazebo.finish));
    const columnContact=report.column.contact.filter(({at})=>at.z>88.04&&at.z<88.18&&Math.abs(at.x-52)<.18);
    assert.ok(columnContact.length>=4,'The front column should stop straight-ahead motion');
    assert.ok(report.column.contact.filter(({at})=>at.z>87.35&&at.z<87.8).every(({at})=>Math.abs(at.x-52)>.52),
      'The walker should slide around the column to clear it');
    assert.ok(report.lamp.finish.z>112.40 && report.lamp.finish.z<113.1,JSON.stringify(report.lamp.finish));
    assert.ok(Math.hypot(report.planter.finish.x-121,report.planter.finish.z-88)<23.7,JSON.stringify(report.planter.finish));
    assert.ok(report.fountain.finish.z>98.7 && report.fountain.finish.z<99.4,JSON.stringify(report.fountain.finish));
    assert.ok(report.slope.contact.some(p=>p.support.normal.y<.997 && Math.abs(p.at.y-p.support.y)<.14),'No stable slope contact');
    const frames=await page.evaluate(()=>[window.__moonbay3dFountainFrame(121,100,.24),window.__moonbay3dFountainFrame(121,100,1.64)]);
    for(const [i,frame] of frames.entries()){
      await writeFile(path.join(output,`play-fountain-flow-${i+1}.png`),Buffer.from(frame.image,'base64'));
      assert.ok(frame.corners.every(([x,y])=>Math.abs(x)<.975&&Math.abs(y)<.975) && Math.abs(frame.feet)<.975,JSON.stringify({corners:frame.corners,feet:frame.feet}));
    }
    assert.notEqual(frames[0].image,frames[1].image,'The moving water did not change across animation phases');
  }
  await page.screenshot({path:path.join(output,'play-square.png')});
  const projected=await view.evaluate(el=>({feet:Number(el.dataset.projectedFeet),size:Number(el.dataset.projectedMetre)}));
  assert.ok(projected.feet>.58 && projected.feet<.69,JSON.stringify(projected));
  assert.ok(projected.size>.12 && projected.size<.20,JSON.stringify(projected));
  const traversal=await page.evaluate(()=>window.__moonbay3dAudit());
  await writeFile(path.join(output,'traversal-audit.json'),JSON.stringify(traversal,null,2)+'\n');
  assert.equal(Object.keys(traversal).length,6,JSON.stringify(traversal));
  assert.ok(Object.values(traversal).every(p=>p.arrived),JSON.stringify(traversal));
  assert.ok(traversal.garden.crossedWest && traversal.village.crossedEast);
  assert.ok(traversal.observatory.position.y>=12.6);
  const bridges=await page.evaluate(()=>window.__moonbay3dAudit(['west-south','west-north','square','east-south','east-north']));
  await writeFile(path.join(output,'bridge-traversal.json'),JSON.stringify(bridges,null,2)+'\n');
  assert.ok(Object.values(bridges).every(p=>p.arrived),JSON.stringify(bridges));
  assert.ok(bridges['west-south'].crossedWest && bridges['west-north'].crossedWest);
  assert.ok(bridges['east-south'].crossedEast && bridges['east-north'].crossedEast);

  // Backpedalling at the default camera angle must keep that angle stable.
  const spawn=await viewPose(view);
  await page.keyboard.down('ArrowDown');
  await waitForTravel(page,spawn,2.4);
  await page.keyboard.up('ArrowDown');
  const backing=await viewPose(view);
  assertBearing(spawn,backing,0,-1);
  assert.ok(Math.abs(backing.yaw)<.01,'Holding back must not swing the camera');
  await view.locator('[data-coast="map"]').click();
  await view.locator('[data-coast-place="garden"]').click();
  await page.waitForFunction(()=>Math.abs(Number(document.querySelector('.moonbay-3d').dataset.yaw))>.05);
  assert.equal(await view.getAttribute('data-gait'),'Walk','Travel along a route still steers the camera');
  await view.locator('[data-coast="home"]').click();
  view=await enter(page);

  if(process.argv.includes('--camera-capture')) {
    await page.evaluate(()=>{
      const canvas=document.querySelector('.moonbay-3d canvas'),stream=canvas.captureStream(30),chunks=[];
      const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4500000});
      recorder.ondataavailable=event=>chunks.push(event.data);
      window.coastCameraRecording={recorder,done:new Promise(resolve=>{
        recorder.onstop=()=>{
          stream.getTracks().forEach(track=>track.stop());
          const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));
        };
      })};
      recorder.start();
    });
  }
  const canvas=await view.locator('canvas').boundingBox(), initialPose=await viewPose(view);
  const mouseX=canvas.x+canvas.width*.73, mouseY=canvas.y+canvas.height*.48;
  const orbit=async (pixels,lift=0)=>{
    await page.mouse.move(mouseX,mouseY);await page.mouse.down();
    await page.mouse.move(mouseX-pixels,mouseY+lift,{steps:8});await page.mouse.up();
  };
  const reachPitch=(browserPage,value)=>browserPage.waitForFunction(pitch=>
    Math.abs(Number(document.querySelector('.moonbay-3d').dataset.pitch)-pitch)<.001,value);
  await orbit(0,-166);
  await reachPitch(page,CAMERA.minPitch);
  assert.ok(Math.abs((await viewPose(view)).yaw)<.001);
  await page.screenshot({path:path.join(output,'play-camera-low.png')});
  await page.keyboard.press('PageDown');
  await reachPitch(page,CAMERA.minPitch+.09);
  await orbit(0,180);
  await reachPitch(page,CAMERA.maxPitch);
  await page.screenshot({path:path.join(output,'play-camera-high.png')});
  await view.locator('[data-coast="turn"]').click();
  await reachPitch(page,CAMERA.pitch);
  await page.keyboard.down('ArrowUp');
  await waitForTravel(page,initialPose,.25);
  await orbit(174);
  await page.waitForFunction(()=>Number(document.querySelector('.moonbay-3d').dataset.yaw)>1.54);
  const afterTurn=await viewPose(view);
  await waitForTravel(page,afterTurn,.50);
  assertBearing(afterTurn,await viewPose(view),0,1);
  await page.keyboard.up('ArrowUp');
  const pivot=await viewPose(view);
  await page.keyboard.down('ArrowRight');
  await waitForTravel(page,pivot,.5);
  assertBearing(pivot,await viewPose(view),1,0);
  await page.keyboard.up('ArrowRight');
  await orbit(176);
  await page.waitForFunction(()=>Math.abs(Number(document.querySelector('.moonbay-3d').dataset.yaw))>3.11);
  const reversed=await viewPose(view);
  await page.keyboard.down('KeyW');
  await waitForTravel(page,reversed,.5);
  assertBearing(reversed,await viewPose(view),0,1);
  await page.keyboard.up('KeyW');
  if(process.argv.includes('--camera-capture')){
    const b64=await page.evaluate(()=>{const recording=window.coastCameraRecording;recording.recorder.stop();return recording.done;});
    await writeFile(path.join(output,'camera-follow.webm'),Buffer.from(b64,'base64'));
  }
  await page.screenshot({path:path.join(output,'play-turned.png')});
  await view.locator('[data-coast="turn"]').click();
  await page.waitForFunction(()=>Math.abs(Number(document.querySelector('.moonbay-3d').dataset.yaw))<.001);
  await reachPitch(page,CAMERA.pitch);
  await view.locator('[data-coast="map"]').click();
  assert.equal(await view.locator('[data-coast-place]:visible').count(),6);
  await page.screenshot({path:path.join(output,'play-overview.png')});
  if(!process.argv.includes('--smoke')){
    for(const place of ['garden','market','observatory','marina','village','square']){
      await view.locator(`[data-coast-place="${place}"]`).click();
      if(place==='garden'||place==='village') {
        const bounds=place==='garden'?BRIDGE_CHECKPOINTS.west:BRIDGE_CHECKPOINTS.east;
        await page.waitForFunction(([x0,x1,z0,z1])=>{
          const d=document.querySelector('.moonbay-3d').dataset;
          return Number(d.x)>x0 && Number(d.x)<x1 && Number(d.z)>z0 && Number(d.z)<z1 && d.gait==='Walk';
        },bounds,{timeout:105000});
        await page.screenshot({path:path.join(output,place==='garden'?'play-west-bridge.png':'play-east-bridge.png')});
      }
      try {await page.waitForFunction(id=>document.querySelector('.moonbay-3d').dataset.arrived===id,place,{timeout:135000});}
      catch(e){throw Error('Route '+place+' stalled at '+JSON.stringify(await view.evaluate(el=>({...el.dataset}))),{cause:e});}
      if(place==='observatory')assert.ok(Number(await view.getAttribute('data-height'))>=12.6);
      await page.screenshot({path:path.join(output,`play-${place}.png`)});
      await view.locator('[data-coast="map"]').click();
      console.log('3D traversal reached '+place);
    }
  }
  const storageState=await context.storageState();
  await context.close();
  const phone=await browser.newContext({baseURL,viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState});
  const mobile=await phone.newPage();watch(mobile);const mobileView=await enter(mobile);
  if(physicsReview){
    const frame=await mobile.evaluate(()=>window.__moonbay3dFountainFrame(121,100,.8));
    assert.ok(frame.corners.every(([x,y])=>Math.abs(x)<.985&&Math.abs(y)<.985)&&Math.abs(frame.feet)<.985,JSON.stringify(frame.corners));
    await writeFile(path.join(output,'play-fountain-phone.png'),Buffer.from(frame.image,'base64'));
  }
  const pad=mobileView.locator('.coast3d-joystick');
  assert.equal(await pad.isVisible(),false,'Virtual joystick must stay hidden when unpressed');
  const before=await viewPose(mobileView), phoneCanvas=await mobileView.locator('canvas').boundingBox();
  const press={x:phoneCanvas.x+phoneCanvas.width*.24,y:phoneCanvas.y+phoneCanvas.height*.72,id:0};
  const touch={...press,y:press.y-36};
  const session=await phone.newCDPSession(mobile);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[press]});
  await pad.waitFor({state:'visible'});
  const bDown=await pad.boundingBox();
  assert.ok(Math.abs((bDown.x+bDown.width*.5)-press.x)<2 && Math.abs((bDown.y+bDown.height*.5)-press.y)<2,'Joystick ring must spawn centered at the press location');
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch]});
  const bMove=await pad.boundingBox();
  assert.ok(Math.abs(bMove.x-bDown.x)<1 && Math.abs(bMove.y-bDown.y)<1,'Joystick ring must remain fixed when dragging thumb');
  await waitForTravel(mobile,before,.25);
  const pan={x:phoneCanvas.x+phoneCanvas.width*.88,y:phoneCanvas.y+phoneCanvas.height*.48,id:1};
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch,pan]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch,{...pan,x:pan.x-174,y:pan.y+92}]});
  await mobile.waitForFunction(()=>Number(document.querySelector('.moonbay-3d').dataset.yaw)>1.54);
  await reachPitch(mobile,CAMERA.maxPitch);
  const turned=await viewPose(mobileView);
  await waitForTravel(mobile,turned,.5);
  assertBearing(turned,await viewPose(mobileView),0,1);
  await mobile.screenshot({path:path.join(output,'play-phone.png')});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await pad.waitFor({state:'hidden'});
  await mobile.waitForFunction(()=>document.querySelector('.moonbay-3d').dataset.gait==='Idle');
  await mobileView.locator('[data-coast="home"]').tap();
  await mobile.waitForFunction(()=>window.__petGame?.scene.isActive('Bedroom'));
  assert.deepEqual(errors,[]);
  console.log('Verified desktop and touch pitch, orbit limits and reset, camera-relative keyboard and joystick movement, automatic route turns, and the island overview.');
} catch(error) {
  console.error(errors,logs.split('\n').slice(-12).join('\n'));throw error;
} finally {
  await browser?.close();
  if(server.exitCode===null){const done=once(server,'exit');server.kill();await done;}
  await rm(data,{recursive:true,force:true});
}
