import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const root=path.resolve('.'),require=createRequire(path.join(root,'pet-app/package.json'));
const {createServer}=require('vite');
const artifacts=path.resolve(process.env.PET_PLAYTEST_DIR||'artifacts/pet-playtest/arcade-art-redraw-20260927');
await fs.mkdir(artifacts,{recursive:true});
const vite=await createServer({root:path.join(root,'pet-app'),base:'/',server:{port:0,host:'127.0.0.1',hmr:false},logLevel:'error'});
await vite.listen();
const address=vite.httpServer.address(),baseURL=`http://127.0.0.1:${address.port}`;
let browser;
const errors=[];
try {
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:930},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/prize-art-review',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#eee9e1;color:#3b3445;font-family:system-ui,sans-serif}
    header{height:122px;padding:30px 46px}h1{margin:0;font-size:30px;font-weight:700}p{margin:7px 0;color:#776d77;font-size:14px}
    #grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;padding:0 42px 30px}.card{height:362px;position:relative}
    .art{height:303px;background:#f7f4ee;border-radius:24px;overflow:hidden}.label{text-align:center;padding-top:12px;font-size:17px;font-weight:600}
    canvas{position:absolute;left:0;top:0;pointer-events:none}small{display:block;font-size:12px;font-weight:400;color:#8c7e87;margin-top:3px}
    @media(max-width:600px){header{height:106px;padding:24px}h1{font-size:23px}#grid{grid-template-columns:repeat(2,1fr);gap:12px;padding:0 16px 24px}.card{height:229px}.art{height:177px;border-radius:18px}.label{font-size:14px;padding-top:10px}p{font-size:12px}}
    </style></head><body><header><h1>PET ARCADE · 新獎品造型</h1><p>原創 3D 玩具系列 · 無金幣底座 · 四類獎品／八款造型</p></header><div id="grid"></div><script type="module">
    import * as THREE from '/node_modules/three/build/three.module.js';
    import {RoomEnvironment} from '/node_modules/three/examples/jsm/environments/RoomEnvironment.js';
    import {loadPrizeVisuals,createPrizeVisual} from '/src/game/ArcadePrizeVisual.ts';
    const specs=[['ruby',0,'切面紅寶石','50 金幣'],['pet',0,'奶油貓公仔','寵物券'],['wearable',0,'緞帶蝴蝶結','飾物券'],['furniture',0,'薄荷軟墊沙發','家具券'],['ruby',1,'玫紅寶石','50 金幣'],['pet',1,'焦糖狗公仔','寵物券'],['wearable',1,'花飾小禮帽','飾物券'],['furniture',1,'暖光蘑菇燈','家具券']];
    grid.innerHTML=specs.map(s=>'<div class="card"><div class="art"></div><div class="label">'+s[2]+'<small>'+s[3]+'</small></div></div>').join('');
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(1);renderer.setClearColor(0,0);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(31,1,.01,10);camera.position.set(.72,.58,1.25);camera.lookAt(0,.045,0);
    const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=.48;
    scene.add(new THREE.HemisphereLight(0xfff5e5,0xc8bbd0,2.2));const key=new THREE.DirectionalLight(0xfff3df,3.5);key.position.set(-1.5,2.5,2);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-1;key.shadow.camera.right=1;key.shadow.camera.top=1;key.shadow.camera.bottom=-1;key.shadow.bias=-.001;key.shadow.normalBias=.012;scene.add(key);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshStandardMaterial({color:0xf7f4ee,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.22;floor.receiveShadow=true;scene.add(floor);
    const templates=await loadPrizeVisuals();const toys=specs.map(([kind,variant])=>{const toy=createPrizeVisual({id:kind+variant,kind,variant,status:'board'},templates);scene.add(toy);return toy;});
    function render(){renderer.setSize(innerWidth,document.documentElement.scrollHeight,false);renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true);document.querySelectorAll('.art').forEach((element,index)=>{const r=element.getBoundingClientRect();toys.forEach((toy,i)=>toy.visible=i===index);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setViewport(r.left,renderer.domElement.height-r.bottom,r.width,r.height);renderer.setScissor(r.left,renderer.domElement.height-r.bottom,r.width,r.height);renderer.render(scene,camera);});}
    addEventListener('resize',render);render();window.artReady=true;window.artDrawCalls=renderer.info.render.calls;
    </script></body></html>`}));
  await page.goto(baseURL+'/prize-art-review');
  await page.waitForFunction(()=>window.artReady);
  await page.screenshot({path:path.join(artifacts,'prize-art-sheet-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(250);
  await page.screenshot({path:path.join(artifacts,'prize-art-sheet-phone.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,variants:8,errors,artifacts}));
} catch(error) {console.error(JSON.stringify({pass:false,error:error.message,errors}));process.exitCode=1;}
finally {await browser?.close();await vite.close();}
