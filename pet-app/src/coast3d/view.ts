import * as T from 'three';
import type { Locale, PetDefinition } from '../types';
import { loadWalker } from '../coast/pet-model';
import { contactShadow, disposeGroup } from '../coast/scenery';
import { ASSETS } from './assets';
import { BRIDGE_CHECKPOINTS, DISTRICTS, SPAWN, district, dist, ground, nearestTrail, onStairTread, route, visibleFoot, type Point } from './island';
import { CAMERA, FollowCamera } from './follow-camera';
import { createMovement, WALK_SPEED } from './movement';
import type { ArtMaterials } from './terrain';
import { capModelTextures, CLUTTER_LAYER, createIsland, lighting, OFFICIAL_ASSET_IDS, officialModels, overviewCamera, type LoadProgress } from './world';
import '../coast/coast.css';
import './view.css';

const moves:Record<string,Point>={KeyW:[0,-1],ArrowUp:[0,-1],KeyS:[0,1],ArrowDown:[0,1],
  KeyA:[-1,0],ArrowLeft:[-1,0],KeyD:[1,0],ArrowRight:[1,0]};
const cameraKeys:Record<string,readonly [yaw:number,pitch:number]>={KeyQ:[-.10,0],KeyE:[.10,0],PageUp:[0,-.09],PageDown:[0,.09]};
const STILL:Point=[0,0];
function unit(x:number,z:number):Point {const l=Math.hypot(x,z);return l>0?[x/l,z/l]:[0,0];}
const nextFrame=(signal:AbortSignal)=>new Promise<void>(resolve=>{
  if(signal.aborted||document.hidden){resolve();return;}
  let settled=false;
  const finish=()=>{if(!settled){settled=true;resolve();}};
  requestAnimationFrame(finish);
  setTimeout(finish,40);
});
const releaseWalker = (walker:Awaited<ReturnType<typeof loadWalker>>|undefined)=>{
  walker?.pivot.removeFromParent();walker?.release();
};

export class Coast3dView {
  private readonly scene=new T.Scene();
  private readonly camera=new FollowCamera();
  private readonly abort=new AbortController();
  private readonly prefersReduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly held=new Set<string>();
  private readonly framing=new T.Vector3();
  private readonly up=new T.Vector3(0,1,0);
  private readonly floorNormal=new T.Vector3(0,1,0);
  private readonly visualNormal=new T.Vector3(0,1,0);
  private footY?:number;
  private visualSpeed=0;
  private moveHold=0;
  private renderer?:T.WebGLRenderer;
  private sun?:T.DirectionalLight;
  private petShadow?:ReturnType<typeof contactShadow>;
  private island?: ReturnType<typeof createIsland>;
  private walker?: Awaited<ReturnType<typeof loadWalker>>;
  private walk?: ReturnType<typeof createMovement>;
  private resize?:ResizeObserver;
  private frame=0;
  private last=0;
  private queued:Point[]=[];
  private target='';
  private analog:Point=STILL;
  private releasePointers?:()=>void;
  private overview=false;
  private mapCamera=overviewCamera(1);
  private locked=false;
  private stall=0;
  private shadowCell='';

  constructor(private readonly root:HTMLElement,private readonly options:{locale:Locale;definition:PetDefinition;close:()=>void;requireFinal?:boolean}) {
    const t=(zh:string,en:string)=>this.t(zh,en);
    root.className='moonbay moonbay-3d';
    root.innerHTML=`
      <div class="moonbay-world"></div>
      <div class="moonbay-hud">
        <div class="moonbay-area" aria-live="polite"><strong>${t('月灣廣場','Crescent Square')}</strong><small class="coast3d-guide" hidden></small></div>
        <div class="moonbay-actions">
          <button type="button" data-coast="turn">${t('鏡頭回正','Reset camera')}</button>
          <button type="button" data-coast="map" aria-pressed="false">${t('全島地圖','Island map')}</button>
          <button type="button" data-coast="home">${t('回房間','My room')}</button>
        </div>
      </div>
      <div class="coast3d-map-marker" hidden aria-hidden="true"></div>
      <div class="coast3d-destinations" aria-label="${t('選擇目的地','Choose a destination')}" hidden>
        ${DISTRICTS.map(d=>`<button type="button" data-coast-place="${d.id}"><i style="--district:${d.tint}"></i>${this.t(d.zh,d.en)}</button>`).join('')}
      </div>
      <div class="coast3d-joystick" aria-label="${t('移動搖桿','Movement joystick')}" role="group" aria-hidden="true"><span></span></div>
      <p class="moonbay-hint"><span class="coast3d-hint-desktop">${t('方向鍵移動 · 左右／上下拖曳轉鏡頭','Arrow keys to move · Drag sideways or vertically to look')}</span><span class="coast3d-hint-touch">${t('按住左邊滑動移動 · 右邊滑動控制視角','Hold and drag left side to move · Drag right side to look')}</span></p>
      <div class="moonbay-status" role="status">
        <div class="coast3d-status-head">
          <span class="coast3d-status-text">${t('正在載入海岸小鎮…','Loading Moonbay Coast…')}</span>
          <span class="coast3d-status-pct">0%</span>
        </div>
        <div class="coast3d-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-progress="0">
          <span class="coast3d-progress-bar"></span>
        </div>
      </div>`;
    this.bind();
  }
  private t(zh:string,en:string){return this.options.locale==='zh-HK'?zh:en;}
  private get status(){return this.root.querySelector<HTMLElement>('.moonbay-status')!;}
  private highestProgress=0;
  private setProgress(percent:number,label?:string) {
    if(this.abort.signal.aborted)return;
    const clamped=Math.max(this.highestProgress,Math.min(100,Math.round(percent)));
    this.highestProgress=clamped;
    const status=this.status;
    delete status.dataset.mode;
    if(label)status.querySelector('.coast3d-status-text')!.textContent=label;
    status.querySelector('.coast3d-status-pct')!.textContent=`${clamped}%`;
    const bar=status.querySelector<HTMLElement>('.coast3d-progress')!;
    bar.setAttribute('aria-valuenow',String(clamped));
    bar.dataset.progress=String(clamped);
    status.querySelector<HTMLElement>('.coast3d-progress-bar')!.style.width=`${clamped}%`;
  }
  private showStatusNote(text:string) {
    const status=this.status;
    status.dataset.mode='notice';
    status.querySelector('.coast3d-status-text')!.textContent=text;
    status.hidden=false;
  }

  async open() {
    const signal=this.abort.signal;
    try {
      const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
      this.renderer=renderer;
      const coarsePointer=matchMedia('(pointer: coarse)').matches;
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,coarsePointer?1.25:1.5));
      renderer.outputColorSpace=T.SRGBColorSpace;
      renderer.toneMapping=T.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.02;
      renderer.shadowMap.enabled=true;
      renderer.shadowMap.type=T.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate=false;
      this.camera.camera.layers.enable(CLUTTER_LAYER);
      this.mapCamera.layers.enable(CLUTTER_LAYER);
      renderer.domElement.setAttribute('aria-label',this.t('完整 3D 海岸小鎮','Full 3D Moonbay Coast'));
      this.root.querySelector('.moonbay-world')!.append(renderer.domElement);
      renderer.domElement.addEventListener('webglcontextlost', e=>{e.preventDefault();cancelAnimationFrame(this.frame);this.fail();},{signal});
      const preview=import.meta.env.DEV||import.meta.env.VITE_COAST3D_PREVIEW==='1';
      const sources=preview&&!this.options.requireFinal?import('./trial-models'):undefined;
      let loadedAssets=0,totalAssets=0,registrations=0;
      const expectedRegistrations=sources?5:2;
      const loadingModelsText=this.t('正在載入島嶼模型…','Loading island models…');
      const progress:LoadProgress={
        addTotal:(n:number)=>{totalAssets+=n;registrations++;},
        step:()=>{
          loadedAssets++;
          const denom=registrations>=expectedRegistrations?Math.max(1,totalAssets):Math.max(67,totalAssets);
          const pct=registrations>=expectedRegistrations
            ?5+Math.round(67*(loadedAssets/denom))
            :Math.min(18,5+Math.round(67*(loadedAssets/denom)));
          this.setProgress(pct,loadingModelsText);
        },
      };
      this.setProgress(5,loadingModelsText);
      progress.addTotal(1);
      const walkerTask=loadWalker(this.options.definition.id,1).finally(()=>progress.step());
      const trials=sources?.then(module=>module.loadTrialModels(progress))??Promise.resolve([]);
      const drafts=sources?.then(module=>module.loadSculptedModels(OFFICIAL_ASSET_IDS,progress))??Promise.resolve(new Map());
      const materials:Promise<ArtMaterials>=sources?.then(module=>module.loadArtMaterials(progress))??Promise.resolve({});
      const [walker,assets,additions,sculpted,surfaces]=await Promise.allSettled([walkerTask,officialModels(progress),trials,drafts,materials] as const);
      if(walker.status==='fulfilled')this.walker=walker.value;
      if(signal.aborted||walker.status==='rejected'||assets.status==='rejected'||additions.status==='rejected'||sculpted.status==='rejected'||surfaces.status==='rejected'){
        if(additions.status==='fulfilled')additions.value.forEach(item=>disposeGroup(item.object));
        if(sculpted.status==='fulfilled')sculpted.value.forEach(item=>disposeGroup(item.model));
        if(assets.status==='fulfilled')assets.value.forEach(item=>disposeGroup(item.model));
        if(surfaces.status==='fulfilled')for(const texture of Object.values(surfaces.value))texture?.dispose();
        if(signal.aborted){
          releaseWalker(this.walker);
          return;
        }
      }
      if(walker.status==='rejected')throw walker.reason;
      if(assets.status==='rejected')throw assets.reason;
      if(additions.status==='rejected')throw additions.reason;
      if(sculpted.status==='rejected')throw sculpted.reason;
      if(surfaces.status==='rejected')throw surfaces.reason;
      if(this.options.requireFinal && assets.value.size!==Object.keys(ASSETS).length)throw Error('Incomplete final Moonbay GLB collection');
      this.root.dataset.world='full-3d';
      this.root.dataset.models=String(assets.value.size);
      this.root.dataset.trialModels=String(additions.value.length);
      this.root.dataset.blenderModels=String(new Set([...assets.value.keys(),...sculpted.value.keys()]).size);
      this.root.dataset.previewModels=String([...sculpted.value].filter(([id,asset])=>asset.preview&&!assets.value.has(id)).length);
      this.root.dataset.joints=String(walker.value.joints);
      const maxTextureDim=coarsePointer?768:1024;
      for(const item of assets.value.values())capModelTextures(item.model,maxTextureDim);
      for(const item of sculpted.value.values())capModelTextures(item.model,maxTextureDim);
      for(const item of additions.value)capModelTextures(item.object,maxTextureDim);
      this.setProgress(75,this.t('正在建立島嶼地形與場景…','Building island & terrain…'));
      await nextFrame(signal);
      if(signal.aborted)return;
      this.island=createIsland(this.scene,assets.value,additions.value,sculpted.value,surfaces.value);
      const collisionSurfaces=[...this.island.pieces.map(p=>p.geometry),...this.island.structures];
      const radius=walker.value.radius;
      this.setProgress(82,this.t('正在建立移動與物理碰撞…','Building terrain physics…'));
      await nextFrame(signal);
      if(signal.aborted)return;
      this.walk=createMovement(collisionSurfaces,this.island.boxes,{radius});
      if (import.meta.env.DEV || import.meta.env.VITE_COAST3D_PREVIEW === '1') {
        const island=this.island;
        const trialPlacements=()=>additions.value.map(({id,placement,object,size})=>({
          id,area:placement.area,above:placement.above,position:object.position.toArray(),size:size.toArray(),
          roadDistance:nearestTrail(placement.x,placement.z).distance,
        }));
        const renderArt=(camera:T.PerspectiveCamera,focus?:[number,number,number])=>{
          camera.layers.enable(CLUTTER_LAYER);
          const fog=this.scene.fog,sun=this.sun!,pose=sun.position.clone(),target=sun.target.position.clone();
          const shadow=sun.shadow.camera;
          const bounds={left:shadow.left,right:shadow.right,top:shadow.top,bottom:shadow.bottom,far:shadow.far};
          this.scene.fog=null;island.showChunks(0,0,true);
          const point=focus??[121,4,95];
          sun.target.position.set(...point);
          sun.position.copy(sun.target.position).add(focus?new T.Vector3(-16,36,22):new T.Vector3(-77,172,105));
          if(!focus){Object.assign(shadow,{left:-141,right:141,top:109,bottom:-109,far:420});shadow.updateProjectionMatrix();}
          sun.target.updateMatrixWorld();renderer.shadowMap.needsUpdate=true;
          renderer.render(this.scene,camera);
          const image=renderer.domElement.toDataURL('image/png');
          sun.position.copy(pose);sun.target.position.copy(target);sun.target.updateMatrixWorld();
          Object.assign(shadow,bounds);shadow.updateProjectionMatrix();
          renderer.shadowMap.needsUpdate=true;this.scene.fog=fog;
          return image.split(',')[1];
        };
        const captureArt=(eye?:[number,number,number],focus?:[number,number,number],fov=48)=>{
          const sz=renderer.getSize(new T.Vector2());
          const camera=eye&&focus?new T.PerspectiveCamera(fov,sz.x/sz.y,.15,650):overviewCamera(sz.x/sz.y);
          if(eye&&focus){camera.position.set(...eye);camera.lookAt(...focus);}
          return renderArt(camera,focus);
        };
        const fountainFrame=(x:number,z:number,phase:number)=>{
          const sz=renderer.getSize(new T.Vector2()), shot=new FollowCamera();
          const subject={x,y:ground(x,z),z};
          shot.resize(sz.x/sz.y);shot.rotate(Math.atan2(x-121,z-88),CAMERA.minPitch-CAMERA.pitch);
          shot.turn(1/60,STILL,false,true);
          shot.follow(1/60,subject,this.walk!.visibility,true,island.moonBounds);
          const {min,max}=island.moonBounds, screen=new T.Vector3();
          const corners=[];
          for(const cx of [min.x,max.x])for(const cy of [min.y,max.y])for(const cz of [min.z,max.z]){
            screen.set(cx,cy,cz).project(shot.camera);corners.push([screen.x,screen.y]);
          }
          const feet=screen.set(x,subject.y,z).project(shot.camera).y;
          const oldTime=island.fountain.clock.value, oldPosition=walker.value.pivot.position.clone();
          try {
            island.fountain.clock.value=phase;walker.value.pivot.position.set(x,subject.y+.008,z);
            return {corners,feet,image:renderArt(shot.camera,[x,subject.y,z])};
          } finally {
            island.fountain.clock.value=oldTime;walker.value.pivot.position.copy(oldPosition);
          }
        };
        const probe=(start:Point,end:Point)=>{
          const simulated=createMovement(collisionSurfaces,island.boxes,{start,radius:.42});
          try {
            for(let i=0;i<32;i++)simulated.step(1/60,STILL);
            const direction=unit(end[0]-start[0],end[1]-start[1]);
            let finish=simulated.position();
            const contact=[];
            for(let i=0;i<Math.ceil(dist(start,end)*60/WALK_SPEED)+75;i++){
              if(dist([finish.x,finish.z],end)<.17)break;
              simulated.step(1/60,direction);finish=simulated.position();
              if(i%5===0)contact.push({at:finish,support:simulated.support(finish)});
            }
            return {finish,support:simulated.support(finish),contact};
          } finally {simulated.release();}
        };
        const run=(ends=['garden','market','observatory','marina','village','square'])=> {
          const walker=createMovement(collisionSurfaces,island.boxes,{radius});
          const report:Record<string,unknown>={};
          try {
            for(const end of ends) {
              const p=walker.position(), queue=route([p.x,p.z],end);
              let stalled=0,crossedWest=false,crossedEast=false;
              for(let i=0;i<6600 && queue.length;i++) {
                const here=walker.position(),aim=queue[0];
                const inside=([x0,x1,z0,z1]:readonly number[])=>here.x>x0&&here.x<x1&&here.z>z0&&here.z<z1;
                crossedWest=crossedWest||inside(BRIDGE_CHECKPOINTS.west);
                crossedEast=crossedEast||inside(BRIDGE_CHECKPOINTS.east);
                if(dist([here.x,here.z],aim)<.31)queue.shift();
                else if(walker.step(1/60,unit(aim[0]-here.x,aim[1]-here.z))>.001)stalled=0;
                else if(++stalled>85)break;
              }
              report[end]={arrived:!queue.length,position:walker.position(),blockedAt:queue[0],crossedWest,crossedEast};
            }
          } finally {walker.release();}
          return report;
        };
        Object.assign(window,{__moonbay3dAudit:run,__moonbay3dTrialPlacements:trialPlacements,__moonbay3dCaptureArt:captureArt,
          __moonbay3dPhysicsProbe:probe,__moonbay3dFountainFrame:fountainFrame});
        signal.addEventListener('abort',()=>{
          Reflect.deleteProperty(window,'__moonbay3dAudit');
          Reflect.deleteProperty(window,'__moonbay3dTrialPlacements');
          Reflect.deleteProperty(window,'__moonbay3dCaptureArt');
          Reflect.deleteProperty(window,'__moonbay3dPhysicsProbe');
          Reflect.deleteProperty(window,'__moonbay3dFountainFrame');
        },{once:true});
      }
      this.scene.add(walker.value.pivot);
      this.petShadow=contactShadow();
      this.petShadow.scale.setScalar(.24);
      this.scene.add(this.petShadow);
      this.sun=lighting(this.scene);
      if(coarsePointer){
        this.sun.shadow.mapSize.set(512,512);
        Object.assign(this.sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18});
        this.sun.shadow.camera.updateProjectionMatrix();
      }
      if(walker.value.companion) {
        const guide=this.root.querySelector<HTMLElement>('.coast3d-guide')!;
        guide.textContent=this.t('同行嚮導・金毛幼犬','Trail guide · Golden Pup');guide.hidden=false;
      }
      this.resize=new ResizeObserver(()=>this.fit());
      this.resize.observe(this.root);this.fit();
      const [sx,sz]=SPAWN, sy=ground(sx,sz);
      walker.value.pivot.position.set(sx,sy+.006,sz);
      this.camera.follow(1,{x:sx,y:sy,z:sz},this.walk.visibility,true,this.island.moonBounds);
      const shadowX=Math.round(sx/4)*4,shadowZ=Math.round(sz/4)*4,shadowY=Math.round(sy/2)*2;
      this.shadowCell=shadowX+':'+shadowZ+':'+shadowY;
      this.sun.target.position.set(shadowX,shadowY,shadowZ);
      this.sun.position.set(shadowX-16,shadowY+36,shadowZ+22);
      this.sun.target.updateMatrixWorld();
      renderer.shadowMap.needsUpdate=true;
      this.setProgress(88,this.t('正在準備光影與水面著色…','Preparing lighting & water shaders…'));
      await nextFrame(signal);
      if(signal.aborted)return;
      this.island.showChunks(sx,sz,true);
      await renderer.compileAsync(this.scene,this.camera.camera);
      if(signal.aborted)return;
      this.setProgress(95,this.t('正在預熱噴泉倒影…','Warming fountain reflection…'));
      await nextFrame(signal);
      if(signal.aborted)return;
      this.island.fountain.warm(renderer,this.scene);
      this.island.showChunks(sx,sz,false);
      if(signal.aborted)return;
      this.setProgress(100,this.t('載入完成！','Ready!'));
      this.status.hidden=true;
      this.root.dataset.ready='true';
      this.draw(performance.now());
    }catch(error){if(!signal.aborted){console.error('[moonbay 3d]',error);this.fail();}}
  }
  private fail() {
    this.showStatusNote(this.t('海岸小鎮未能載入，請返回房間再試。','The coast could not load. Return to your room and try again.'));
  }
  setLocked(value:boolean) {
    this.locked=value;
    if(value)this.clearInput();
    if(value)this.cancelRoute();
  }
  private clearInput(){this.held.clear();this.analog=STILL;this.releasePointers?.();}
  private cancelRoute() {this.target='';this.queued=[];this.stall=0;delete this.root.dataset.arrived;}
  private bind() {
    const {signal}=this.abort;
    window.addEventListener('keydown',e=>{
      if(this.locked||e.defaultPrevented)return;
      if(e.code==='Escape') {
        if(this.overview)this.setMap(false);else this.options.close();
      } else if(!this.overview && moves[e.code]) {
        e.preventDefault();
        if(!this.held.has(e.code)){this.cancelRoute();this.held.add(e.code);}
      } else if(!this.overview && cameraKeys[e.code]){
        e.preventDefault();this.camera.rotate(...cameraKeys[e.code]);
      }
    },{signal});
    window.addEventListener('keyup',e=>this.held.delete(e.code),{signal});
    const stop=()=>{this.clearInput();this.last=0;};
    window.addEventListener('blur',stop,{signal});document.addEventListener('visibilitychange',stop,{signal});
    this.root.addEventListener('click',e=>{
      if(this.locked)return;
      const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if(button?.dataset.coast==='home'){this.options.close();return;}
      if(!this.walk)return;
      if(button?.dataset.coast==='map')this.setMap(!this.overview);
      if(button?.dataset.coast==='turn')this.camera.reset();
      const destination=button?.dataset.coastPlace;
      if(destination && this.overview){
        const p=this.walk.position();
        this.cancelRoute();this.target=destination;
        this.queued=route([p.x,p.z],destination);
        this.setMap(false);
      }
    },{signal});
    const joystick=this.root.querySelector<HTMLElement>('.coast3d-joystick')!;
    const knob=joystick.querySelector('span')!;
    const drag=this.root.querySelector<HTMLElement>('.moonbay-world')!;
    const JOYSTICK_RADIUS=38,JOYSTICK_DEADZONE=6;
    let finger=-1,dragged=-1,originX=0,originY=0,previousX=0,previousY=0;
    function setKnob(x:number,z:number){knob.style.translate=`${x}px ${z}px`;}
    function hideStick(){delete joystick.dataset.active;joystick.setAttribute('aria-hidden','true');setKnob(0,0);}
    this.releasePointers=()=>{
      const stickId=finger,dragId=dragged;
      finger=dragged=-1;this.analog=STILL;hideStick();
      if(stickId!==-1 && drag.hasPointerCapture(stickId))drag.releasePointerCapture(stickId);
      if(dragId!==-1){
        if(drag.hasPointerCapture(dragId))drag.releasePointerCapture(dragId);
        this.camera.endManual();
      }
    };
    const moveStick=(e:PointerEvent)=>{
      if(e.pointerId!==finger)return;
      const rect=drag.getBoundingClientRect();
      const x=e.clientX-rect.left-originX,z=e.clientY-rect.top-originY;
      const length=Math.hypot(x,z), scale=length>JOYSTICK_RADIUS?JOYSTICK_RADIUS/length:1;
      setKnob(x*scale,z*scale);
      const strength=length>JOYSTICK_DEADZONE
        ? Math.min(1,(length-JOYSTICK_DEADZONE)/(JOYSTICK_RADIUS-JOYSTICK_DEADZONE))/length
        : 0;
      this.analog=[x*strength,z*strength];
    };
    drag.addEventListener('contextmenu',e=>{
      if(matchMedia('(pointer: coarse)').matches)e.preventDefault();
    },{signal});
    drag.addEventListener('pointerdown',e=>{
      if(this.locked||this.overview)return;
      if(e.pointerType==='mouse'&&e.button!==0)return;
      const rect=drag.getBoundingClientRect();
      const localX=e.clientX-rect.left,localY=e.clientY-rect.top;
      const touchControl=e.pointerType!=='mouse'||matchMedia('(pointer: coarse)').matches;
      if(touchControl)this.root.dataset.touched='true';
      if(touchControl&&localX<rect.width*.5){
        if(finger!==-1)return;
        this.cancelRoute();
        finger=e.pointerId;originX=localX;originY=localY;
        joystick.style.left=`${originX}px`;joystick.style.top=`${originY}px`;
        joystick.dataset.active='true';joystick.setAttribute('aria-hidden','false');
        this.analog=STILL;setKnob(0,0);
        drag.setPointerCapture(finger);
        return;
      }
      if(dragged!==-1)return;
      dragged=e.pointerId;previousX=e.clientX;previousY=e.clientY;
      drag.setPointerCapture(dragged);this.camera.beginManual();
    },{signal});
    drag.addEventListener('pointermove',e=>{
      if(e.pointerId===finger){moveStick(e);return;}
      if(e.pointerId!==dragged)return;
      this.camera.rotate((previousX-e.clientX)*.009,(e.clientY-previousY)*.007);
      previousX=e.clientX;previousY=e.clientY;
    },{signal});
    for(const name of ['pointerup','lostpointercapture','pointercancel'])drag.addEventListener(name,e=>{
      const id=(e as PointerEvent).pointerId;
      if(id===finger){finger=-1;this.analog=STILL;hideStick();}
      if(id===dragged){dragged=-1;this.camera.endManual();}
    },{signal});
  }
  private setMap(active:boolean) {
    this.overview=active;this.clearInput();
    this.root.dataset.overview=String(active);
    this.root.querySelector('[data-coast="map"]')!.setAttribute('aria-pressed',String(active));
    this.root.querySelector<HTMLElement>('.coast3d-destinations')!.hidden=!active;
    this.root.querySelector<HTMLElement>('.coast3d-map-marker')!.hidden=!active;
  }
  private fit() {
    const {clientWidth:w,clientHeight:h}=this.root;
    if(!w||!h)return;
    this.renderer?.setSize(w,h,false);this.camera.resize(w/h);this.mapCamera=overviewCamera(w/h);
    this.mapCamera.layers.enable(CLUTTER_LAYER);
  }
  private manualDirection():Point {
    let x=0,z=0;
    for(const e of this.held){x+=moves[e][0];z+=moves[e][1];}
    return this.held.size?unit(x,z):this.analog;
  }
  private routeDirection(here:Point):Point {
    while(this.queued.length && dist(here,this.queued[0])<.31)this.queued.shift();
    const target=this.queued[0];
    if(target)return unit(target[0]-here[0],target[1]-here[1]);
    if(this.target){this.root.dataset.arrived=this.target;this.target='';}
    return STILL;
  }
  private roadDirection([x,z]:Point,direction:Point):Point {
    if(!direction[0]&&!direction[1])return STILL;
    const road=nearestTrail(x,z);
    if(road.distance>=road.trail.width/2+1.6)return STILL;
    const a=road.trail.a.at,b=road.trail.b.at,heading=unit(b[0]-a[0],b[1]-a[1]);
    const overlap=heading[0]*direction[0]+heading[1]*direction[1];
    if(Math.abs(overlap)<.62*Math.hypot(...direction))return STILL;
    return overlap<0?[-heading[0],-heading[1]]:heading;
  }
  private draw=(time:number)=>{
    const dt=this.last?Math.max(0,Math.min(.10,(time-this.last)/1000)):0;this.last=time;
    if(!document.hidden){
      const travel=this.walk!,start=travel.position(),canMove=!this.locked&&!this.overview;
      const input=canMove?this.manualDirection():STILL;
      const manual=!!(input[0]||input[1]);
      const here:Point=[start.x,start.z];
      const course=manual?this.camera.groundDirection(input):canMove?this.routeDirection(here):STILL;
      // Recentring while deliberately walking backwards or strafing would turn
      // the input back towards itself. Follow roads on forward input or routes.
      const followRoad=travel.motion().speed>.20 && (!manual || input[1]<-.15&&-input[1]>=Math.abs(input[0])*.85);
      this.camera.turn(dt,followRoad?this.roadDirection(here,course):STILL,followRoad,this.prefersReduced);
      travel.step(dt,manual?this.camera.groundDirection(input):course);
      const p=travel.sample(),{speed,heading}=travel.motion();
      const rawMoved=speed>.06;
      if(rawMoved)this.moveHold=.10;else this.moveHold=Math.max(0,this.moveHold-dt);
      const moved=rawMoved||(canMove&&(manual||!!this.target)&&this.moveHold>0);
      this.visualSpeed=!moved?0:this.visualSpeed?this.visualSpeed+(speed-this.visualSpeed)*(1-Math.exp(-dt*16)):speed;
      if(this.target && !this.overview && dt) {
        this.stall=moved?0:this.stall+dt;
        if(this.stall>1.5){
          this.cancelRoute();
          this.showStatusNote(this.t('路線受阻，請沿步道移動。','The route is blocked. Move along the path.'));
          setTimeout(()=>{if(!this.abort.signal.aborted)this.status.hidden=true;},1600);
        }
      }
      const support=travel.support(p), stepHeight=this.island!.gazeboTread(p.x,visibleFoot(p.x,support.y,p.z),p.z);
      const stepped=onStairTread(p.x,support.y,p.z)||Math.abs(stepHeight-support.y)>.001;
      const targetNormal=stepped?this.up:support.normal;
      const targetY=stepHeight+.006;
      this.footY=this.footY===undefined||this.prefersReduced||Math.abs(targetY-this.footY)>1.2
        ? targetY
        : this.footY+(targetY-this.footY)*(1-Math.exp(-dt*18));
      this.floorNormal.set(targetNormal.x,targetNormal.y,targetNormal.z);
      if(this.prefersReduced)this.visualNormal.copy(this.floorNormal);
      else this.visualNormal.lerp(this.floorNormal,1-Math.exp(-dt*9)).normalize();
      this.walker!.pivot.position.set(p.x,this.footY,p.z);
      this.petShadow!.position.set(p.x,this.footY-.006,p.z).addScaledVector(this.visualNormal,.013);
      this.petShadow!.quaternion.setFromUnitVectors(this.up,this.visualNormal);
      this.walker!.update(dt,moved,heading,Math.max(.45,Math.min(1.5,this.visualSpeed/this.walker!.strideSpeed)),this.visualNormal);
      this.camera.follow(dt,{x:p.x,y:this.footY-.006,z:p.z},travel.visibility,this.prefersReduced,this.island!.moonBounds);
      const region=district(here);
      if(this.root.dataset.district!==region.id){this.root.dataset.district=region.id;this.root.querySelector('.moonbay-area strong')!.textContent=this.t(region.zh,region.en);}
      Object.assign(this.root.dataset,{x:p.x.toFixed(2),z:p.z.toFixed(2),height:p.y.toFixed(2),yaw:this.camera.yaw.toFixed(4),
        pitch:this.camera.pitch.toFixed(4),gait:moved?'Walk':'Idle'});
      if(import.meta.env.DEV||import.meta.env.VITE_COAST3D_PREVIEW==='1') {
        const feet=(1-this.framing.set(p.x,p.y,p.z).project(this.camera.camera).y)/2;
        const top=(1-this.framing.set(p.x,p.y+1,p.z).project(this.camera.camera).y)/2;
        this.root.dataset.projectedFeet=feet.toFixed(3);
        this.root.dataset.projectedMetre=(feet-top).toFixed(3);
        this.root.dataset.speed=speed.toFixed(2);
      }
      const shadowX=Math.round(p.x/4)*4,shadowZ=Math.round(p.z/4)*4,shadowY=Math.round(p.y/2)*2;
      const shadowCell=shadowX+':'+shadowZ+':'+shadowY;
      if(shadowCell!==this.shadowCell){
        this.shadowCell=shadowCell;
        this.sun!.target.position.set(shadowX,shadowY,shadowZ);
        this.sun!.position.set(shadowX-16,shadowY+36,shadowZ+22);
        this.sun!.target.updateMatrixWorld();
        this.renderer!.shadowMap.needsUpdate=true;
      }
      this.island!.water.material.uniforms.clock.value=this.prefersReduced?0:time/1000;
      this.island!.fountain.clock.value=this.island!.water.material.uniforms.clock.value;
      this.island!.waterfall.clock.value=this.island!.water.material.uniforms.clock.value;
      const fog=this.scene.fog;
      this.island!.showChunks(p.x,p.z,this.overview);
      if(this.overview){
        this.scene.fog=null;
        const marker=this.root.querySelector<HTMLElement>('.coast3d-map-marker')!;
        this.framing.set(p.x,p.y,p.z).project(this.mapCamera);
        marker.style.left=50+this.framing.x*50+'%';
        marker.style.top=50-this.framing.y*50+'%';
      }
      else this.island!.softenCanopies(this.camera.camera.position,this.walker!.pivot.position);
      this.renderer!.render(this.scene,this.overview?this.mapCamera:this.camera.camera);
      this.scene.fog=fog;
    }
    this.frame=requestAnimationFrame(this.draw);
  };
  destroy() {
    this.abort.abort();cancelAnimationFrame(this.frame);this.resize?.disconnect();
    this.walk?.release();this.island?.finish();releaseWalker(this.walker);
    if(this.petShadow)disposeGroup(this.petShadow);
    this.sun?.shadow.dispose();this.renderer?.dispose();this.renderer?.forceContextLoss();
    this.scene.clear();this.root.replaceChildren();
    for(const key of Object.keys(this.root.dataset))delete this.root.dataset[key];
  }
}
