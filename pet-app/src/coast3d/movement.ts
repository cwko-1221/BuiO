import RAPIER from '@dimforge/rapier3d';
import type { BufferGeometry, Vector3 } from 'three';
import { ground, GATE, SPAWN, WIDTH, DEPTH, type Point } from './island';
import type { IslandCollider } from './world';

const CENTER=.51;
const STEP=1/60;
export const WALK_SPEED=1.9;
type FootPosition={x:number;y:number;z:number};
export function createMovement(surfaces:BufferGeometry[], boxes:IslandCollider[], options:{start?:Point;radius?:number}={}) {
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  const supports=new Set<number>();
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
    const collider=world.createCollider(shape.setTranslation(b.x,b.y,b.z)
      .setRotation({x:0,y:axis,z:0,w:Math.cos(b.yaw*.5)}));
    if(b.walkable)supports.add(collider.handle);
  }
  const start=options.start??SPAWN, radius=Math.max(.24,Math.min(.44,options.radius??.24));
  const startY=ground(...start), body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(start[0],startY+CENTER+.05,start[1]));
  const avatar=world.createCollider(RAPIER.ColliderDesc.capsule(CENTER-radius,radius),body);
  const controller=world.createCharacterController(.025);
  controller.setMaxSlopeClimbAngle(37*Math.PI/180);
  controller.setMinSlopeSlideAngle(45*Math.PI/180);
  controller.enableAutostep(.23,.27,false);
  controller.enableSnapToGround(.24);
  world.step();
  let backlog=0,fall=0,stride=0,speed=0,heading=0;
  const position=()=>{const p=body.translation();return {x:p.x,y:p.y-CENTER,z:p.z};};
  let previous=position();
  const cameraProbe=new RAPIER.Ball(.20), rotation={x:0,y:0,z:0,w:1};
  const supportRay=new RAPIER.Ray({x:0,y:0,z:0},{x:0,y:-1,z:0});
  const footPatch:readonly [number,number,number][]=[[0,0,2],[.14,0,1],[-.14,0,1],[0,.14,1],[0,-.14,1]];
  const isFloor=(collider:RAPIER.Collider)=>supports.has(collider.handle);
  const canStep=(px:number,pz:number)=>px>=.5&&pz>=.5&&px<=WIDTH-.5&&pz<=DEPTH-.5&&ground(px,pz)>=GATE;
  return {
    position,
    sample() {
      const current=position(),blend=backlog/STEP;
      return {x:previous.x+(current.x-previous.x)*blend,y:previous.y+(current.y-previous.y)*blend,
        z:previous.z+(current.z-previous.z)*blend};
    },
    motion(){return {speed,heading};},
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
    step(dt:number, direction:Point) {
      backlog=Math.min(backlog+dt,.12);
      let travelled=0, netX=0, netZ=0, steps=0;
      const magnitude=Math.hypot(...direction);
      const target=Math.min(1,magnitude)*WALK_SPEED;
      while(backlog>=STEP) {
        backlog-=STEP;
        const p=body.translation();
        previous={x:p.x,y:p.y-CENTER,z:p.z};
        stride=target===0?0:stride+Math.max(-32*STEP,Math.min(24*STEP,target-stride));
        const scale=magnitude?stride*STEP/magnitude:0;
        let x=direction[0]*scale,z=direction[1]*scale;
        if((x||z)&&!canStep(p.x+x,p.z+z)) {
          // Slide smoothly along the wet-sand contour instead of hard-halting.
          if(x&&canStep(p.x+x,p.z))z=0;
          else if(z&&canStep(p.x,p.z+z))x=0;
          else {x=0;z=0;}
        }
        fall=Math.max(-8,fall-9.81*STEP);
        controller.computeColliderMovement(avatar,{x,y:fall*STEP-.024,z});
        const m=controller.computedMovement();
        if(controller.computedGrounded())fall=0;
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
      const hit=world.castShape(subject,rotation,direction,cameraProbe,.06,length,false,undefined,undefined,avatar,body);
      return hit ? Math.max(.12,(hit.time_of_impact-.08)/length) : 1;
    },
    release(){world.removeCharacterController(controller);world.free();},
  };
}
