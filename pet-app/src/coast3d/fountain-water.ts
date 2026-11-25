import * as T from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export function createFountainWater(x:number,y:number,z:number,width:number,height:number) {
  const clock={value:0}, waterline=height*.345, impact=width*.218;
  const group=new T.Group();
  group.position.set(x,y,z);
  const compact=matchMedia('(pointer: coarse)').matches;
  const resolution=compact?320:512;
  const basin=new Reflector(new T.CircleGeometry(width*.446,80),{
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
          for(int i=0;i<8;i++){
            float a=float(i)*.78539816;
            vec2 offset=p-impact*vec2(cos(a),sin(a));
            float d=length(offset);
            float pulse=sin(d*18.-clock*11.);
            float nearJet=1.-smoothstep(.07,1.25,d);
            wave+=offset/(d+.04)*pulse*nearJet*1.15;
            splash+=nearJet*(.23*pow(max(0.,pulse),8.)+.22*(1.-smoothstep(.08,.20,d)));
          }
          vec3 eye=normalize(cameraPosition-worldPoint);
          vec3 normal=normalize(vec3(wave.x*.038,1.,-wave.y*.038));
          float fresnel=pow(1.-clamp(dot(eye,normal),0.,1.),2.5);
          vec2 uv=reflection.xy/reflection.w+wave*.005;
          vec3 mirror=texture2D(tDiffuse,clamp(uv,.002,.998)).rgb;
          float waves=.5+.5*sin(dot(p,vec2(2.4,1.5))-clock*1.35);
          vec3 tint=mix(vec3(.018,.36,.39),vec3(.041,.59,.58),.26+waves*.20);
          vec3 sun=normalize(vec3(-.45,.78,.43));
          float glint=pow(max(0.,dot(normal,normalize(eye+sun))),92.);
          vec3 water=mix(tint,mirror*vec3(.78,.96,1.),.30+.58*fresnel);
          water+=vec3(.88,.79,.58)*glint*.61+splash*vec3(.46,.69,.70);
          gl_FragColor=vec4(water,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    },
  });
  basin.rotation.x=-Math.PI/2;basin.position.y=waterline;
  const surfaceMaterial=basin.material as T.ShaderMaterial;
  surfaceMaterial.uniforms.clock=clock;
  const reflect=basin.onBeforeRender.bind(basin);
  let previousCamera:T.Camera|undefined,lastReflection=-Infinity;
  basin.onBeforeRender=(...args)=>{
    const now=performance.now(), camera=args[2];
    if(camera===previousCamera&&now-lastReflection<(compact?62:35))return;
    previousCamera=camera;lastReflection=now;reflect(...args);
  };
  group.add(basin);

  const runningWater=new T.ShaderMaterial({uniforms:{clock},
    vertexShader:`varying vec2 flow; void main(){flow=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float clock;varying vec2 flow;
      void main(){
        float ribbon=pow(max(0.,sin(flow.x*48.-clock*12.+sin(flow.y*18.)*.55)),5.);
        float shine=pow(max(0.,cos(flow.y*6.283+.4)),8.);
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
    group.add(new T.Mesh(new T.TubeGeometry(flow,26,.047,7),runningWater));
  }
  return {group,clock,release:()=>basin.getRenderTarget().dispose()};
}
