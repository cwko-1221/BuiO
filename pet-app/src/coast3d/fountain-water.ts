import * as T from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { detectDeviceTier } from './device';

function taperedJetGeometry(curve: T.CatmullRomCurve3, tubularSegments: number, radialSegments: number) {
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const p = new T.Vector3();
  const n = new T.Vector3();
  const v = new T.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, p);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    // Real gravity-accelerated fountain stream: full at spout, graceful mid-arc, wide aerated plunge at impact.
    const pinch = Math.sin(t * Math.PI);
    const flare = Math.pow(Math.max(0, (t - 0.54) / 0.46), 1.65) * 0.064;
    const radius = 0.062 - pinch * 0.008 + flare;

    for (let j = 0; j <= radialSegments; j++) {
      const s = j / radialSegments;
      const theta = s * Math.PI * 2;
      const sin = Math.sin(theta), cos = -Math.cos(theta);
      n.set(
        cos * N.x + sin * B.x,
        cos * N.y + sin * B.y,
        cos * N.z + sin * B.z,
      ).normalize();
      v.copy(p).addScaledVector(n, radius);
      positions.push(v.x, v.y, v.z);
      normals.push(n.x, n.y, n.z);
      uvs.push(t, s);
    }
  }

  const stride = radialSegments + 1;
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + j + 1;
      const d = i * stride + j + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function splashCrownGeometry(cx: number, cy: number, cz: number, phase: number) {
  const radial = 14, rings = 5;
  const positions: number[] = [];
  const uvs: number[] = [];
  const seeds: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    // Cup-shaped rising splash plume flaring outward as droplets lift off the pool surface.
    const radius = 0.095 + Math.pow(v, 0.76) * 0.38;
    const height = Math.sin(v * Math.PI * 0.86) * 0.34 - (v > 0.75 ? (v - 0.75) * 0.22 : 0);
    for (let j = 0; j <= radial; j++) {
      const u = j / radial;
      const a = u * Math.PI * 2;
      positions.push(cx + Math.cos(a) * radius, cy + Math.max(0.004, height), cz + Math.sin(a) * radius);
      uvs.push(u, v);
      seeds.push(phase);
    }
  }

  const stride = radial + 1;
  for (let r = 0; r < rings; r++) {
    for (let j = 0; j < radial; j++) {
      const a = r * stride + j;
      const b = (r + 1) * stride + j;
      const c = (r + 1) * stride + j + 1;
      const d = r * stride + j + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aSeed', new T.Float32BufferAttribute(seeds, 1));
  geometry.setIndex(indices);
  return geometry;
}

export function createFountainWater(x:number,y:number,z:number,width:number,height:number) {
  const clock={value:0}, waterline=height*.345, impact=width*.242, basinRadius=width*.446;
  const group=new T.Group();
  group.position.set(x,y,z);
  const tier=detectDeviceTier();
  const compact=tier!=='desktop', phone=tier==='phone';
  const resolution=phone?224:256;
  const basin=new Reflector(new T.CircleGeometry(basinRadius,48),{
    textureWidth:resolution,textureHeight:resolution,multisample:0,clipBias:.002,
    shader:{
      name:'Crescent Square fountain',
      uniforms:{
        color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null},
        clock:{value:0},impact:{value:impact},radius:{value:basinRadius},
      },
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
        uniform float clock,impact,radius;
        varying vec2 poolPoint;
        varying vec4 reflection;
        varying vec3 worldPoint;
        void main(){
          vec2 p=poolPoint;
          float pr=length(p);
          // Multi-layered capillary & gravity surface ripples.
          vec2 wave=vec2(
            sin(dot(p,vec2(3.1,1.7))-clock*2.4)+.45*sin(dot(p,vec2(-5.4,4.2))+clock*3.3),
            cos(dot(p,vec2(-1.9,3.3))+clock*2.1)+.45*cos(dot(p,vec2(4.8,5.1))-clock*3.1)
          );
          wave+=.32*vec2(cos(dot(p,vec2(9.2,-6.1))+clock*4.6),sin(dot(p,vec2(6.3,8.7))-clock*4.1));

          float splash=0., foam=0.;
          if(abs(pr-impact)<1.68){
            const vec2 J0=vec2(1.,0.),J1=vec2(.70710678,.70710678),J2=vec2(0.,1.),J3=vec2(-.70710678,.70710678);
            for(int i=0;i<8;i++){
              vec2 dir=i==0?J0:i==1?J1:i==2?J2:i==3?J3:i==4?-J0:i==5?-J1:i==6?-J2:-J3;
              if(dot(p,dir)<=0.)continue;
              vec2 offset=p-impact*dir;
              float d2=dot(offset,offset);
              if(d2<2.45){
                float d=sqrt(d2);
                float ang=atan(offset.y,offset.x);
                float breakup=.72+.28*sin(ang*7.+clock*4.5+float(i)*1.7)*cos(ang*11.-clock*3.2);
                float pulse=sin(d*19.-clock*12.5);
                float nearJet=1.-smoothstep(.08,1.56,d);
                float sp=max(0.,pulse);
                float sp2=sp*sp, sp4=sp2*sp2;
                wave+=offset/(d+.05)*pulse*nearJet*1.48;
                // Organic lacy bubble collar right around the splash + expanding white ripple arcs.
                float core=1.-smoothstep(.08,.36,d);
                float collar=(1.-smoothstep(.20,.78,d))*smoothstep(.06,.20,d)*breakup;
                foam+=core*(.76+.22*sin(clock*15.+float(i)*2.3))+collar*.46;
                splash+=nearJet*(.25*sp4*sp4*breakup);
              }
            }
          }

          vec3 eye=normalize(cameraPosition-worldPoint);
          vec3 normal=normalize(vec3(wave.x*.046,1.,-wave.y*.046));
          // Physical Schlick Fresnel for clear water (F0 = 0.02): transparent looking down, crisp mirror at grazing angles.
          float ndv=clamp(dot(eye,normal),0.,1.);
          float fresnel=.02+.98*pow(1.-ndv,4.2);
          float reflMix=clamp(.16+.78*pow(1.-ndv,2.35),.16,.94);

          // Depth profile across the circular trough: shallow near outer stone rim & central column, deeper mid-basin.
          float outerShallow=1.-smoothstep(radius*.78,radius,pr);
          float innerShallow=smoothstep(radius*.26,radius*.46,pr);
          float depth=clamp(outerShallow*innerShallow,0.,1.);

          // Live reflection distorted cleanly by surface wave normals.
          vec2 uv=reflection.xy/reflection.w+wave*.0065;
          vec3 mirror=texture2D(tDiffuse,clamp(uv,.002,.998)).rgb;

          // Refracted sunlight caustic web shimmering across the sunlit stone basin floor.
          vec2 cp=p*2.65+wave*.18;
          float c1=sin(cp.x*2.1+sin(cp.y*1.9+clock*1.4)-clock*1.7);
          float c2=cos(cp.y*2.3-sin(cp.x*2.0-clock*1.3)+clock*1.5);
          float c3=sin((cp.x-cp.y)*1.8+clock*1.9);
          float web=1.-clamp(abs(c1+c2*.85+c3*.45)*.58,0.,1.);
          float caustic=pow(web,3.2)*(1.-fresnel*.75)*(.55+.45*outerShallow);

          // Natural crystal-clear mineral water tint (warm-clear shallows -> cool aqua-azure deeper center).
          vec3 shallowTint=vec3(.24,.66,.68);
          vec3 deepTint=vec3(.045,.34,.44);
          vec3 bodyColor=mix(shallowTint,deepTint,.22+.62*depth);
          bodyColor+=vec3(.52,.78,.74)*caustic*.42;

          // Crisp sunlight specular sparkle + broad sky sheen.
          vec3 sun=normalize(vec3(-.45,.78,.43));
          vec3 halfVec=normalize(eye+sun);
          float ndh=max(0.,dot(normal,halfVec));
          float g2=ndh*ndh, g4=g2*g2, g8=g4*g4, g16=g8*g8, g32=g16*g16, g64=g32*g32;
          float glint=g64*g32*g16;
          float sheen=g16*g8*.16;

          // Subtle edge meniscus kiss where water meets the outer stone rim.
          float rimKiss=smoothstep(radius*.955,radius*.998,pr)*.22;

          vec3 water=mix(bodyColor,mirror*vec3(.92,.98,1.),reflMix);
          water+=vec3(1.,.96,.84)*(glint*.95+sheen);
          vec3 whiteFoam=vec3(.92,.98,1.);
          float foamAmt=clamp(foam+splash+rimKiss,0.,1.);
          water=mix(water,whiteFoam,clamp(foamAmt*.82,0.,.88));

          // Physically grounded translucency: clear at steep angles & shallows, more opaque at grazing reflections & foam.
          float baseAlpha=mix(.44,.70,depth);
          float alpha=clamp(mix(baseAlpha,.95,reflMix)+foamAmt*.42+glint*.35,.38,.97);
          gl_FragColor=vec4(water,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    },
  });
  basin.rotation.x=-Math.PI/2;basin.position.y=waterline;basin.renderOrder=1;
  const surfaceMaterial=basin.material as T.ShaderMaterial;
  surfaceMaterial.transparent=true;
  surfaceMaterial.depthWrite=false;
  surfaceMaterial.uniforms.clock=clock;
  const reflect=basin.onBeforeRender.bind(basin);
  basin.onBeforeRender=()=>{};
  let previousCamera:T.Camera|undefined,lastReflection=-Infinity;
  const lastCamPos=new T.Vector3(Infinity,0,0), lastForward=new T.Vector3(), camForward=new T.Vector3();
  const update=(renderer:T.WebGLRenderer,scene:T.Scene,camera:T.Camera,force=false)=>{
    if(!force){
      const dx=x-camera.position.x, dz=z-camera.position.z, distSq=dx*dx+dz*dz;
      if(distSq>(compact?900:1444) && previousCamera!==undefined)return;
      camera.getWorldDirection(camForward);
      if(distSq>25 && dx*camForward.x+dz*camForward.z<-Math.sqrt(distSq)*.25 && previousCamera!==undefined)return;
      const moved=camera!==previousCamera
        || camera.position.distanceToSquared(lastCamPos)>(compact?.006:.0025)
        || camForward.distanceToSquared(lastForward)>(compact?.0008:.0006);
      if(!moved)return;
      const now=performance.now();
      if(camera===previousCamera && now-lastReflection<(phone?64:compact?56:48))return;
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

  // Translucent, Fresnel-refracted, gravity-accelerated pouring water arcs (merged into 1 draw call).
  const runningWater=new T.ShaderMaterial({
    uniforms:{clock},
    transparent:true,
    depthWrite:false,
    side:T.DoubleSide,
    vertexShader:`
      uniform float clock;
      varying vec2 flow;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main(){
        flow=uv;
        // Organic high-speed stream ripple stronger toward the aerated plunge.
        float wobble=(sin(uv.x*26.-clock*19.+uv.y*12.566)*.5+.5*cos(uv.x*41.-clock*26.-uv.y*18.85))*.0095*(.25+.75*uv.x);
        vec3 displaced=position+normal*wobble;
        vec4 worldPos=modelMatrix*vec4(displaced,1.);
        vWorld=worldPos.xyz;
        vNormal=normalize(mat3(modelMatrix)*normal);
        gl_Position=projectionMatrix*viewMatrix*worldPos;
      }`,
    fragmentShader:`
      uniform float clock;
      varying vec2 flow;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main(){
        vec3 N=normalize(gl_FrontFacing?vNormal:-vNormal);
        vec3 V=normalize(cameraPosition-vWorld);
        vec3 L=normalize(vec3(-.45,.78,.43));
        float ndv=clamp(abs(dot(N,V)),0.,1.);
        // Real water cylinder: clear glass-like center, luminous refracted rim.
        float fresnel=pow(1.-ndv,1.9);

        // Gravity-accelerated multi-frequency aerated water filaments & sparkling droplets.
        float t=flow.x;
        float accel=t*(1.+.45*t);
        float f1=max(0.,sin(accel*34.-clock*15.5+sin(flow.y*18.85+t*8.)*.7));
        float f2=max(0.,sin(accel*62.-clock*22.0-flow.y*25.13+cos(t*15.)*.6));
        float streak=pow(f1,3.2)*.65+pow(f2,4.0)*.50;
        // Stream entrains more white micro-bubbles as it falls toward the basin.
        float aeration=smoothstep(.42,1.,t);
        float mist=aeration*(.30+.45*f1);

        // Crisp sunlight specular dancing along the curved arc.
        vec3 H=normalize(V+L);
        float spec=pow(max(0.,dot(N,H)),42.);
        float skyBounce=.5+.5*N.y;

        vec3 clearCore=mix(vec3(.20,.64,.70),vec3(.68,.92,.97),skyBounce*.65);
        vec3 foamWhite=vec3(.93,.98,1.);
        vec3 col=mix(clearCore,foamWhite,clamp(fresnel*.58+streak*.65+mist*.55,0.,1.));
        col+=vec3(1.,.98,.90)*spec*1.05;

        // Soft entry from spout & feathered blend into splash crown at bottom.
        float ends=smoothstep(0.,.04,t)*(1.-smoothstep(.95,1.,t)*.30);
        float alpha=clamp((.24+fresnel*.50+streak*.40+mist*.36+spec*.55)*ends,.14,.93);
        gl_FragColor=vec4(col,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  // Translucent animated splash crowns & fine mist rising where each jet strikes the water (merged into 1 draw call).
  const splashMaterial=new T.ShaderMaterial({
    uniforms:{clock},
    transparent:true,
    depthWrite:false,
    side:T.DoubleSide,
    vertexShader:`
      attribute float aSeed;
      uniform float clock;
      varying vec2 vUv;
      varying float vSeed;
      void main(){
        vUv=uv;
        vSeed=aSeed;
        float burst=sin(uv.x*25.13+aSeed*3.1+clock*13.)*.028*uv.y;
        vec3 pos=position+vec3(0.,burst,0.);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.);
      }`,
    fragmentShader:`
      uniform float clock;
      varying vec2 vUv;
      varying float vSeed;
      void main(){
        float a=vUv.x*6.2831853;
        float h=vUv.y;
        // Rising spray wisps & sparkling droplets breaking apart toward the top of the splash crown.
        float w1=max(0.,sin(a*6.+vSeed*2.1+sin(h*10.-clock*14.)*1.2));
        float w2=max(0.,cos(a*11.-vSeed*1.7+h*14.-clock*19.));
        float drops=pow(w1*.55+w2*.55,2.2);
        float shape=smoothstep(0.,.18,h)*(1.-smoothstep(.45,1.,h));
        float mist=drops*shape;
        vec3 col=mix(vec3(.74,.93,.97),vec3(.97,.99,1.),.45+.55*drops);
        float alpha=clamp(mist*.88,0.,.86);
        if(alpha<.02)discard;
        gl_FragColor=vec4(col,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  const jetGeos: T.BufferGeometry[] = [];
  const splashGeos: T.BufferGeometry[] = [];
  for(let i=0;i<8;i++){
    const direction=i*Math.PI/4,dx=Math.cos(direction),dz=Math.sin(direction);
    const controls=[[width*.131,height*.895],[width*.176,height*.945],[width*.218,height*.72],[impact,waterline-.015]];
    const flow=new T.CatmullRomCurve3(controls.map(([r,y])=>new T.Vector3(dx*r,y,dz*r)));
    jetGeos.push(taperedJetGeometry(flow,22,10));
    splashGeos.push(splashCrownGeometry(dx*impact,waterline+.004,dz*impact,i));
  }
  const mergedJets=mergeGeometries(jetGeos,false);
  jetGeos.forEach(g=>g.dispose());
  if(mergedJets){
    const jets=new T.Mesh(mergedJets,runningWater);
    jets.renderOrder=2;
    group.add(jets);
  }
  const mergedSplashes=mergeGeometries(splashGeos,false);
  splashGeos.forEach(g=>g.dispose());
  if(mergedSplashes){
    const splashes=new T.Mesh(mergedSplashes,splashMaterial);
    splashes.renderOrder=3;
    group.add(splashes);
  }

  return {group,clock,warm,update,release:()=>basin.getRenderTarget().dispose()};
}
