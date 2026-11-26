import * as T from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export function createFountainWater(x:number,y:number,z:number,width:number,height:number) {
  const clock={value:0}, waterline=height*.345, impact=width*.218;
  const group=new T.Group();
  group.position.set(x,y,z);
  const compact=matchMedia('(pointer: coarse)').matches;
  const resolution=compact?128:256;
  const basin=new Reflector(new T.CircleGeometry(width*.446,48),{
    textureWidth:resolution,textureHeight:resolution,multisample:0,clipBias:.002,
    shader:{
      name:'Crescent Square fountain',
      uniforms:{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null},clock:{value:0},impact:{value:impact}},
      vertexShader:`
        uniform mat4 textureMatrix;
        varying vec2 poolPoint;
        varying vec4 reflection;
        varying vec3 worldPoint;
        void main(){
          poolPoint=position.xy;
          reflection=textureMatrix*vec4(position,1.);
          worldPoint=(modelMatrix*vec4(position,1.)).xyz;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        }`,
      fragmentShader:`
        uniform sampler2D tDiffuse;
        uniform float clock,impact;
        varying vec2 poolPoint;
        varying vec4 reflection;
        varying vec3 worldPoint;
        void main(){
          vec2 p=poolPoint;
          vec2 wave=vec2(sin(dot(p,vec2(3.5,1.8))-clock*2.7),cos(dot(p,vec2(-1.7,3.1))+clock*2.2));
          wave+=.55*vec2(cos(dot(p,vec2(7.2,-3.7))+clock*4.2),sin(dot(p,vec2(2.4,6.5))-clock*3.4));
          float splash=0.;
          float pr=length(p);
          if(abs(pr-impact)<1.26){
            const vec2 J0=vec2(1.,0.),J1=vec2(.70710678,.70710678),J2=vec2(0.,1.),J3=vec2(-.70710678,.70710678);
            for(int i=0;i<8;i++){
              vec2 dir=i==0?J0:i==1?J1:i==2?J2:i==3?J3:i==4?-J0:i==5?-J1:i==6?-J2:-J3;
              if(dot(p,dir)<=0.)continue;
              vec2 offset=p-impact*dir;
              float d2=dot(offset,offset);
              if(d2<1.5625){
                float d=sqrt(d2);
                float pulse=sin(d*18.-clock*11.);
                float nearJet=1.-smoothstep(.07,1.25,d);
                float sp=max(0.,pulse);
                float sp2=sp*sp, sp4=sp2*sp2;
                wave+=offset/(d+.04)*pulse*nearJet*1.15;
                splash+=nearJet*(.23*sp4*sp4+.22*(1.-smoothstep(.08,.20,d)));
              }
            }
          }
          vec3 eye=normalize(cameraPosition-worldPoint);
          vec3 normal=normalize(vec3(wave.x*.038,1.,-wave.y*.038));
          float fresnel=pow(1.-clamp(dot(eye,normal),0.,1.),2.5);
          vec2 uv=reflection.xy/reflection.w+wave*.005;
          vec3 mirror=texture2D(tDiffuse,clamp(uv,.002,.998)).rgb;
          float waves=.5+.5*sin(dot(p,vec2(2.4,1.5))-clock*1.35);
          vec3 tint=mix(vec3(.018,.36,.39),vec3(.041,.59,.58),.26+waves*.20);
          vec3 sun=normalize(vec3(-.45,.78,.43));
          float g1=max(0.,dot(normal,normalize(eye+sun)));
          float g2=g1*g1,g4=g2*g2,g8=g4*g4,g16=g8*g8,g32=g16*g16;
          float glint=g32*g32*g16*g8*g4;
          vec3 water=mix(tint,mirror*vec3(.78,.96,1.),.30+.58*fresnel);
          water+=vec3(.88,.79,.58)*glint*.61+splash*vec3(.46,.69,.70);
          gl_FragColor=vec4(water,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    },
  });
  if(compact)basin.getRenderTarget().texture.type=T.UnsignedByteType;
  basin.rotation.x=-Math.PI/2;basin.position.y=waterline;
  const surfaceMaterial=basin.material as T.ShaderMaterial;
  surfaceMaterial.uniforms.clock=clock;
  const reflect=basin.onBeforeRender.bind(basin);
  basin.onBeforeRender=()=>{};
  let previousCamera:T.Camera|undefined,lastReflection=-Infinity;
  const lastCamPos=new T.Vector3(Infinity,0,0), lastForward=new T.Vector3(), camForward=new T.Vector3();
  const update=(renderer:T.WebGLRenderer,scene:T.Scene,camera:T.Camera,force=false)=>{
    if(!force){
      const dx=x-camera.position.x, dz=z-camera.position.z, distSq=dx*dx+dz*dz;
      if(distSq>(compact?784:1444) && previousCamera!==undefined)return;
      camera.getWorldDirection(camForward);
      if(distSq>25 && dx*camForward.x+dz*camForward.z<-Math.sqrt(distSq)*.25 && previousCamera!==undefined)return;
      const moved=camera!==previousCamera
        || camera.position.distanceToSquared(lastCamPos)>(compact?.01:.0025)
        || camForward.distanceToSquared(lastForward)>(compact?.004:.0006);
      if(!moved)return;
      const now=performance.now();
      if(camera===previousCamera && now-lastReflection<(compact?280:80))return;
      lastReflection=now;
    } else {
      camera.getWorldDirection(camForward);
      lastReflection=performance.now();
    }
    previousCamera=camera;
    lastCamPos.copy(camera.position);lastForward.copy(camForward);
    const prevTarget=renderer.getRenderTarget();
    const prevClear=renderer.autoClear;
    const prevShadowNeeds=renderer.shadowMap.needsUpdate;
    renderer.autoClear=true;
    renderer.shadowMap.needsUpdate=false;
    reflect(renderer,scene,camera,basin.geometry,surfaceMaterial,null!);
    renderer.shadowMap.needsUpdate=prevShadowNeeds;
    renderer.autoClear=prevClear;
    renderer.setRenderTarget(prevTarget);
  };
  group.add(basin);

  const warm=(renderer:T.WebGLRenderer,scene:T.Scene)=>{
    const prevTarget=renderer.getRenderTarget();
    const prevShadow=renderer.shadowMap.autoUpdate;
    const prevVisible=basin.visible;
    const prevClear=renderer.autoClear;
    const warmCam=new T.PerspectiveCamera(155,1,.2,450);
    basin.visible=false;
    renderer.shadowMap.autoUpdate=false;
    renderer.autoClear=true;
    renderer.setRenderTarget(basin.getRenderTarget());
    for(const lookZ of [z-20,z+20]){
      warmCam.position.set(x,y+12,z);
      warmCam.lookAt(x,y+6,lookZ);
      warmCam.updateMatrixWorld();
      renderer.render(scene,warmCam);
    }
    basin.visible=prevVisible;
    renderer.shadowMap.autoUpdate=prevShadow;
    renderer.autoClear=prevClear;
    renderer.setRenderTarget(prevTarget);
  };

  const runningWater=new T.ShaderMaterial({uniforms:{clock},
    vertexShader:`varying vec2 flow; void main(){flow=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float clock;varying vec2 flow;
      void main(){
        float r1=max(0.,sin(flow.x*48.-clock*12.+sin(flow.y*18.)*.55));
        float r2=r1*r1;
        float ribbon=r2*r2*r1;
        float s1=max(0.,cos(flow.y*6.283+.4));
        float s2=s1*s1,s4=s2*s2;
        float shine=s4*s4;
        vec3 aqua=mix(vec3(.065,.46,.50),vec3(.60,.85,.93),ribbon*.63+shine*.31);
        gl_FragColor=vec4(aqua,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  for(let i=0;i<8;i++){
    const direction=i*Math.PI/4,dx=Math.cos(direction),dz=Math.sin(direction);
    const controls=[[width*.131,height*.895],[width*.166,height*.898],[width*.197,height*.65],[impact,waterline-.023]];
    const flow=new T.CatmullRomCurve3(controls.map(([r,y])=>new T.Vector3(dx*r,y,dz*r)));
    group.add(new T.Mesh(new T.TubeGeometry(flow,16,.047,6),runningWater));
  }
  return {group,clock,warm,update,release:()=>basin.getRenderTarget().dispose()};
}
