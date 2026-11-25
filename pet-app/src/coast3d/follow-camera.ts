import * as T from 'three';
import type { Point } from './island';

const radians=Math.PI/180;
const wrap=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));
export const CAMERA = {
  pitch:36*radians, verticalFov:37, distance:8.8, compactDistance:9.3,
  minPitch:16*radians, maxPitch:65*radians,
  followSeconds:.17, heightSeconds:.21, orbitSeconds:.055,
  turnDelay:.52, maxYawSpeed:30*radians, yawDeadZone:6*radians, manualPause:3,
} as const;
const damp=(dt:number,seconds:number)=>1-Math.exp(-dt/seconds);

export class FollowCamera {
  readonly camera=new T.PerspectiveCamera(CAMERA.verticalFov,1,.12,620);
  private angle=0;
  private requestedAngle=0;
  private elevation:number=CAMERA.pitch;
  private requestedElevation:number=CAMERA.pitch;
  private travel=0;
  private lastHeading?:number;
  private autoPause=0;
  private dragging=false;
  private distance:number=CAMERA.distance;
  private readonly focus=new T.Vector3();
  private readonly look=new T.Vector3();
  private readonly boom=new T.Vector3();
  private readonly intended=new T.Vector3();
  private readonly landmark=new T.Vector3();
  private initialized=false;

  get yaw(){return wrap(this.angle);}
  get pitch(){return this.elevation;}
  private pauseAuto(){this.autoPause=CAMERA.manualPause;this.travel=0;this.lastHeading=undefined;}
  rotate(yaw:number,pitch=0){
    this.requestedAngle+=yaw;
    this.requestedElevation=T.MathUtils.clamp(this.requestedElevation+pitch,CAMERA.minPitch,CAMERA.maxPitch);
    this.pauseAuto();
  }
  beginManual(){this.dragging=true;this.pauseAuto();}
  endManual(){this.dragging=false;this.pauseAuto();}
  reset(){this.requestedAngle=this.angle-wrap(this.angle);this.requestedElevation=CAMERA.pitch;this.pauseAuto();}
  resize(aspect:number) {this.camera.aspect=aspect;this.camera.updateProjectionMatrix();}

  turn(dt:number,direction:Point,followRoute:boolean,reduced:boolean) {
    if(!this.dragging)this.autoPause=Math.max(0,this.autoPause-dt);
    const response=reduced?1:damp(dt,CAMERA.orbitSeconds);
    const elevationError=this.requestedElevation-this.elevation;
    this.elevation=Math.abs(elevationError)>.0005?this.elevation+elevationError*response:this.requestedElevation;
    const pending=this.requestedAngle-this.angle;
    if(Math.abs(pending)>.0005){
      this.angle+=pending*response;
      return;
    }
    this.angle=this.requestedAngle;
    if(!followRoute||(!direction[0]&&!direction[1])||this.autoPause||this.dragging||reduced){
      this.travel=0;this.lastHeading=undefined;return;
    }
    const behind=Math.atan2(-direction[0],-direction[1]);
    if(this.lastHeading===undefined||Math.abs(wrap(this.lastHeading-behind))>.40){
      this.lastHeading=behind;this.travel=0;
    }
    this.travel+=dt;
    if(this.travel<=CAMERA.turnDelay)return;
    const delta=wrap(behind-this.angle),remaining=Math.max(0,Math.abs(delta)-CAMERA.yawDeadZone);
    this.angle+=Math.sign(delta)*Math.min(remaining,dt*CAMERA.maxYawSpeed,remaining*damp(dt,.30));
    this.requestedAngle=this.angle;
  }

  // The pitch is ignored for locomotion; these axes are the rendered camera's
  // right and forward on the ground plane, including during an orbit.
  groundDirection([x,z]:Point):Point {
    const sin=Math.sin(this.angle),cos=Math.cos(this.angle);
    return [x*cos+z*sin,z*cos-x*sin];
  }

  follow(dt:number,position:{x:number;y:number;z:number},
    clear:(subject:T.Vector3,eye:T.Vector3)=>number, reduced:boolean,moon?:T.Box3) {
    const {x,y,z}=position;
    const immediate=reduced||!this.initialized;
    const horizontal=immediate?1:damp(dt,CAMERA.followSeconds);
    this.focus.x+=(x-this.focus.x)*horizontal;
    this.focus.y+=(y-this.focus.y)*(immediate?1:damp(dt,CAMERA.heightSeconds));
    this.focus.z+=(z-this.focus.z)*horizontal;
    const sin=Math.sin(this.angle),cos=Math.cos(this.angle),flat=Math.cos(this.elevation);
    this.look.copy(this.focus).add(this.intended.set(-sin*.32,.43,-cos*.32));
    this.boom.set(sin*flat,Math.sin(this.elevation),cos*flat);
    const desired=this.camera.aspect<1?CAMERA.compactDistance:CAMERA.distance;
    this.intended.copy(this.look).addScaledVector(this.boom,desired);
    const available=desired*clear(this.look,this.intended);
    this.distance=immediate||available<this.distance?available:this.distance+(available-this.distance)*damp(dt,.24);
    this.camera.position.copy(this.look).addScaledVector(this.boom,this.distance);
    let fov:number=CAMERA.verticalFov;
    const lowAngle=1-T.MathUtils.smoothstep(this.elevation,CAMERA.minPitch,26*radians);
    if(moon&&lowAngle>0){
      moon.getCenter(this.landmark);
      const nearby=1-T.MathUtils.smoothstep(Math.hypot(x-this.landmark.x,z-this.landmark.z),30,42);
      const eye=this.camera.position, dx=this.landmark.x-eye.x,dz=this.landmark.z-eye.z;
      const forwards=-dx*sin-dz*cos, sideways=dx*cos-dz*sin;
      if(nearby>0&&forwards>3&&Math.abs(sideways)<forwards*.67){
        const halfW=(moon.max.x-moon.min.x)*.5,halfD=(moon.max.z-moon.min.z)*.5;
        const near=Math.max(1,forwards-Math.abs(sin)*halfW-Math.abs(cos)*halfD);
        const crown=Math.atan2(moon.max.y-eye.y,near);
        const petFeet=Math.atan2(y-eye.y,Math.max(.15,-(x-eye.x)*sin-(z-eye.z)*cos));
        const horizontal=Math.atan((Math.abs(sideways)+Math.abs(cos)*halfW+Math.abs(sin)*halfD)/near/this.camera.aspect);
        const margin=2.4*radians;
        const required=Math.max(crown-petFeet+2*margin,2*(horizontal+1.4*radians))/radians;
        const fitFov=T.MathUtils.clamp(required,CAMERA.verticalFov,54);
        const influence=lowAngle*nearby*(1-T.MathUtils.smoothstep(Math.abs(sideways)/forwards,.35,.67));
        fov=T.MathUtils.lerp(CAMERA.verticalFov,fitFov,influence);
        const aim=T.MathUtils.lerp(-this.elevation,Math.max(-this.elevation,crown+margin-fitFov*radians*.5),influence);
        this.look.y=eye.y+this.distance*flat*Math.tan(aim);
      }
    }
    if(Math.abs(this.camera.fov-fov)>.01){this.camera.fov=fov;this.camera.updateProjectionMatrix();}
    this.camera.lookAt(this.look);this.camera.updateMatrixWorld();this.initialized=true;
  }
}
