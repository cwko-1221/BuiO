import RAPIER from '@dimforge/rapier3d';
import type { BufferGeometry, Vector3 } from 'three';
import { ground, GATE, SPAWN, WIDTH, DEPTH, type Point } from './island';
import type { IslandCollider } from './world';

const CENTER=.51;
const STEP=1/60;
const GRAVITY=16.5;
const JUMP_VELOCITY=5.6;
const SNAP_TO_GROUND=.24;
export const WALK_SPEED=1.9;
export const RUN_SPEED=3.55;
type FootPosition={x:number;y:number;z:number};
export function createMovement(surfaces:BufferGeometry[], boxes:IslandCollider[], options:{start?:Point;radius?:number}={}) {
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  const supports=new Set<number>();
  const noCamera=new Set<number>();
  const dynamicBodies=new Map<string,{body:RAPIER.RigidBody;halfH:number}>();
  world.timestep=STEP;
  for(const surface of surfaces) {
    const position=surface.getAttribute('position').array;
    const surfaceCollider=world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(position),new Uint32Array(surface.index!.array)));
    supports.add(surfaceCollider.handle);
  }
  for(const b of boxes) {
    const axis=Math.sin(b.yaw*.5);
    let shape=RAPIER.ColliderDesc.cuboid(b.w*.5,b.h*.5,b.d*.5);
    if(b.shape==='round'&&Math.abs(b.w-b.d)<.012)shape=RAPIER.ColliderDesc.cylinder(b.h*.5,b.w*.5);
    else if(b.shape==='round'){
      const points=[];
      for(let i=0;i<12;i++){
        const t=i*Math.PI/6,x=Math.cos(t)*b.w*.5,z=Math.sin(t)*b.d*.5;
        points.push(x,-b.h*.5,z,x,b.h*.5,z);
      }
      shape=RAPIER.ColliderDesc.convexHull(new Float32Array(points))??shape;
    }
    let collider:RAPIER.Collider;
    if(b.dynamic) {
      const dynBody=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(b.x,b.y,b.z));
      collider=world.createCollider(shape.setRotation({x:0,y:axis,z:0,w:Math.cos(b.yaw*.5)}),dynBody);
      dynamicBodies.set(b.dynamic,{body:dynBody,halfH:b.h*.5});
    } else {
      collider=world.createCollider(shape.setTranslation(b.x,b.y,b.z)
        .setRotation({x:0,y:axis,z:0,w:Math.cos(b.yaw*.5)}));
    }
    if(b.walkable)supports.add(collider.handle);
    if(b.noCamera)noCamera.add(collider.handle);
  }
  const start=options.start??SPAWN, radius=Math.max(.29,Math.min(.44,options.radius??.29));
  const startY=ground(...start), body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(start[0],startY+CENTER+.05,start[1]));
  const avatar=world.createCollider(RAPIER.ColliderDesc.capsule(CENTER-radius,radius),body);
  const controller=world.createCharacterController(.025);
  controller.setMaxSlopeClimbAngle(37*Math.PI/180);
  controller.setMinSlopeSlideAngle(45*Math.PI/180);
  controller.enableAutostep(.23,.27,false);
  controller.enableSnapToGround(SNAP_TO_GROUND);
  world.step();
  let backlog=0,fall=0,stride=0,speed=0,heading=0,running=false,grounded=true,airTime=0,coyote=0,jumpQueue=0;
  let snapEnabled=true;
  const position=()=>{const p=body.translation();return {x:p.x,y:p.y-CENTER,z:p.z};};
  let previous=position();
  const cameraProbe=new RAPIER.Ball(.20), rotation={x:0,y:0,z:0,w:1};
  const supportRay=new RAPIER.Ray({x:0,y:0,z:0},{x:0,y:-1,z:0});
  const footPatch:readonly [number,number,number][]=[[0,0,2],[.14,0,1],[-.14,0,1],[0,.14,1],[0,-.14,1]];
  const isFloor=(collider:RAPIER.Collider)=>supports.has(collider.handle);
  const canStep=(px:number,pz:number)=>px>=.5&&pz>=.5&&px<=WIDTH-.5&&pz<=DEPTH-.5&&ground(px,pz)>=GATE;
  const setSnap=(on:boolean)=>{
    if(on===snapEnabled)return;
    snapEnabled=on;
    if(on)controller.enableSnapToGround(SNAP_TO_GROUND);
    else controller.disableSnapToGround();
  };
  const launch=()=>{
    fall=JUMP_VELOCITY;
    grounded=false;
    airTime=0;
    coyote=0;
    jumpQueue=0;
    setSnap(false);
  };
  return {
    position,
    sample() {
      const current=position(),blend=backlog/STEP;
      return {x:previous.x+(current.x-previous.x)*blend,y:previous.y+(current.y-previous.y)*blend,
        z:previous.z+(current.z-previous.z)*blend};
    },
    motion(){return {speed,heading,running,grounded,verticalSpeed:fall};},
    jump(){
      if(grounded||coyote>0){launch();return true;}
      jumpQueue=.14;
      return false;
    },
    groundUnder(p:FootPosition,maxDrop=4.5) {
      supportRay.origin.x=p.x;supportRay.origin.y=p.y+.25;supportRay.origin.z=p.z;
      const hit=world.castRayAndGetNormal(supportRay,maxDrop+.25,false,undefined,undefined,avatar,body,isFloor);
      return hit&&hit.normal.y>=.55?supportRay.origin.y-hit.timeOfImpact:ground(p.x,p.z);
    },
    support(p:FootPosition) {
      let centerY:number|undefined, sumY=0, weightY=0, nx=0, ny=0, nz=0;
      const samples:{y:number;normal:{x:number;y:number;z:number};w:number}[]=[];
      for(const [ox,oz,w] of footPatch) {
        supportRay.origin.x=p.x+ox;supportRay.origin.y=p.y+.27;supportRay.origin.z=p.z+oz;
        const hit=world.castRayAndGetNormal(supportRay,.59,false,undefined,undefined,avatar,body,isFloor);
        if(hit&&hit.normal.y>=.64){
          const y=supportRay.origin.y-hit.timeOfImpact;
          if(ox===0&&oz===0)centerY=y;
          samples.push({y,normal:hit.normal,w});
        }
      }
      if(!samples.length)return {y:p.y,normal:{x:0,y:1,z:0}};
      const refY=centerY??samples[0].y;
      for(const s of samples){
        if(Math.abs(s.y-refY)>.14)continue;
        if(Math.abs(s.y-refY)<=.07){sumY+=s.y*s.w;weightY+=s.w;}
        nx+=s.normal.x*s.w;ny+=s.normal.y*s.w;nz+=s.normal.z*s.w;
      }
      const nLen=Math.hypot(nx,ny,nz);
      return {
        y:weightY?sumY/weightY:refY,
        normal:nLen>0?{x:nx/nLen,y:ny/nLen,z:nz/nLen}:{x:0,y:1,z:0},
      };
    },
    step(dt:number, direction:Point, options?:{run?:boolean}) {
      backlog=Math.min(backlog+dt,.12);
      jumpQueue=Math.max(0,jumpQueue-dt);
      let travelled=0, netX=0, netZ=0, steps=0;
      const sprinting=!!options?.run;
      running=sprinting;
      const magnitude=Math.hypot(...direction);
      const topSpeed=sprinting?RUN_SPEED:WALK_SPEED;
      const target=Math.min(1,magnitude)*topSpeed;
      while(backlog>=STEP) {
        backlog-=STEP;
        const p=body.translation();
        previous={x:p.x,y:p.y-CENTER,z:p.z};
        stride=target===0?0:stride+Math.max(-36*STEP,Math.min(30*STEP,target-stride));
        const scale=magnitude?stride*STEP/magnitude:0;
        let x=direction[0]*scale,z=direction[1]*scale;
        if((x||z)&&!canStep(p.x+x,p.z+z)) {
          // Slide smoothly along the wet-sand contour instead of hard-halting.
          if(x&&canStep(p.x+x,p.z))z=0;
          else if(z&&canStep(p.x,p.z+z))x=0;
          else {x=0;z=0;}
        }
        fall=Math.max(-14,fall-GRAVITY*STEP);
        const rising=fall>0;
        setSnap(grounded&&!rising);
        const dy=rising?fall*STEP:fall*STEP-.024;
        controller.computeColliderMovement(avatar,{x,y:dy,z});
        const m=controller.computedMovement();
        if(rising && m.y<fall*STEP*.25)fall=0;
        const onFloor=fall<=0 && controller.computedGrounded();
        if(onFloor){
          fall=0;grounded=true;airTime=0;coyote=.11;
          setSnap(true);
          if(jumpQueue>0)launch();
        } else {
          airTime+=STEP;
          coyote=Math.max(0,coyote-STEP);
          if(airTime>.08||rising)grounded=false;
        }
        body.setNextKinematicTranslation({x:p.x+m.x,y:p.y+m.y,z:p.z+m.z});
        world.step();
        const distance=Math.hypot(m.x,m.z);
        travelled+=distance;
        netX+=m.x;netZ+=m.z;
        steps++;
      }
      if(steps>0){
        const windowTime=steps*STEP;
        speed=target>0?travelled/windowTime:0;
        if(Math.hypot(netX,netZ)>.22*windowTime)heading=Math.atan2(netX,netZ);
      }
      return travelled;
    },
    visibility(subject:Vector3,eye:Vector3) {
      const dx=eye.x-subject.x,dy=eye.y-subject.y,dz=eye.z-subject.z,length=Math.hypot(dx,dy,dz);
      if(length<.1)return 1;
      const direction={x:dx/length,y:dy/length,z:dz/length};
      const isCameraBlocker=(c:RAPIER.Collider)=>!noCamera.has(c.handle);
      const hit=world.castShape(subject,rotation,direction,cameraProbe,.06,length,false,undefined,undefined,avatar,body,isCameraBlocker);
      return hit ? Math.max(.28,(hit.time_of_impact-.08)/length) : 1;
    },
    moveDynamic(id:string,x:number,y:number,z:number) {
      const entry=dynamicBodies.get(id);
      if(entry)entry.body.setNextKinematicTranslation({x,y:y+entry.halfH,z});
    },
    release(){world.removeCharacterController(controller);world.free();},
  };
}
