import * as T from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { detectDeviceTier } from './device';

function hash2(ix: number, iy: number, period: number, seed: number) {
  const x = ((ix % period) + period) % period;
  const y = ((iy % period) + period) % period;
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function tileableValueNoise(u: number, v: number, period: number, seed: number) {
  const fx = u * period, fy = v * period;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, period, seed);
  const b = hash2(ix + 1, iy, period, seed);
  const c = hash2(ix, iy + 1, period, seed);
  const d = hash2(ix + 1, iy + 1, period, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Generate seamless multi-scale liquid wave normal map, soft organic light-ribbon map, and lacy foam noise. */
function createWaterTextures(size = 256) {
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Rich smooth swells + medium capillary ripples (no harsh polygonal net).
      const h =
        tileableValueNoise(u, v, 5, 1.1) * 0.48 +
        tileableValueNoise(u, v, 11, 3.7) * 0.30 +
        tileableValueNoise(u, v, 21, 7.3) * 0.15 +
        tileableValueNoise(u, v, 36, 13.9) * 0.07;
      heights[y * size + x] = h;
    }
  }

  const normalData = new Uint8Array(size * size * 4);
  const causticData = new Uint8Array(size * size * 4);
  const strength = 4.4;

  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size, yp = (y + 1) % size;
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size;
      const u = x / size;
      const h = heights[y * size + x];
      const dx = (heights[y * size + xp] - heights[y * size + xm]) * strength;
      const dy = (heights[yp * size + x] - heights[ym * size + x]) * strength;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const idx = (y * size + x) * 4;
      normalData[idx] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      normalData[idx + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      normalData[idx + 2] = Math.round((invLen * 0.5 + 0.5) * 255);
      normalData[idx + 3] = Math.round(Math.min(1, Math.max(0, h)) * 255);

      // Soft organic wave-ribbon light fields (flowing sunlit bands, zero Voronoi polygons/mesh).
      const warpU = u + (tileableValueNoise(u, v, 4, 9.1) - 0.5) * 0.14;
      const warpV = v + (tileableValueNoise(u, v, 4, 15.7) - 0.5) * 0.14;
      const ribbon1 = Math.sin((warpU * 2.0 + warpV * 1.0) * Math.PI * 2) * 0.5 + 0.5;
      const ribbon2 = Math.sin((warpU * -1.0 + warpV * 2.0) * Math.PI * 2) * 0.5 + 0.5;
      const softLight1 = Math.pow(ribbon1 * tileableValueNoise(u, v, 5, 5.2), 1.35);
      const softLight2 = Math.pow(ribbon2 * tileableValueNoise(u, v, 6, 21.4), 1.35);
      const foam =
        tileableValueNoise(u, v, 10, 31.1) * 0.46 +
        tileableValueNoise(u, v, 22, 47.3) * 0.34 +
        tileableValueNoise(u, v, 44, 63.7) * 0.20;
      causticData[idx] = Math.round(Math.min(1, softLight1 * 1.5) * 255);
      causticData[idx + 1] = Math.round(Math.min(1, softLight2 * 1.5) * 255);
      causticData[idx + 2] = Math.round(Math.min(1, foam) * 255);
      causticData[idx + 3] = 255;
    }
  }

  const makeTex = (data: Uint8Array) => {
    const tex = new T.DataTexture(data, size, size, T.RGBAFormat);
    tex.wrapS = T.RepeatWrapping;
    tex.wrapT = T.RepeatWrapping;
    tex.magFilter = T.LinearFilter;
    tex.minFilter = T.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  };
  return { normalMap: makeTex(normalData), causticMap: makeTex(causticData) };
}

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
    // Full parabolic fountain stream: clean full column from spout, graceful slight pinch mid-arch, aerated wider plunge.
    const pinch = Math.sin(t * Math.PI);
    const flare = Math.pow(Math.max(0, (t - 0.54) / 0.46), 1.65) * 0.062;
    const radius = 0.060 - pinch * 0.007 + flare;

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

/** Soft crossed mist-plume cards at each jet landing point (no hard cutout edges or spiky geometry). */
function splashPlumeGeometry(cx: number, cy: number, cz: number, phase: number) {
  const planes = 3;
  const halfW = 0.34, height = 0.40;
  const positions: number[] = [];
  const uvs: number[] = [];
  const seeds: number[] = [];
  const indices: number[] = [];

  for (let p = 0; p < planes; p++) {
    const angle = (p / planes) * Math.PI + phase * 0.43;
    const dx = Math.cos(angle) * halfW;
    const dz = Math.sin(angle) * halfW;
    const base = p * 4;
    positions.push(
      cx - dx, cy - 0.02, cz - dz,
      cx + dx, cy - 0.02, cz + dz,
      cx + dx, cy + height, cz + dz,
      cx - dx, cy + height, cz - dz,
    );
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    const s = phase * 1.7 + p * 0.83;
    seeds.push(s, s, s, s);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
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
  const resolution=phone?224:compact?256:384;
  const { normalMap, causticMap } = createWaterTextures(256);

  const basin=new Reflector(new T.CircleGeometry(basinRadius,48),{
    textureWidth:resolution,textureHeight:resolution,multisample:0,clipBias:.002,
    shader:{
      name:'Crescent Square fountain',
      uniforms:{
        color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null},
        tNormal:{value:normalMap},tCaustic:{value:causticMap},
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
        uniform sampler2D tNormal;
        uniform sampler2D tCaustic;
        uniform float clock,impact,radius;
        varying vec2 poolPoint;
        varying vec4 reflection;
        varying vec3 worldPoint;
        void main(){
          vec2 p=poolPoint;
          float pr=length(p);
          vec2 radialDir=p/(pr+.001);

          // 3-layer physical liquid wave normals:
          // (1) medium basin swells + (2) ambient cross-chop + (3) crisp capillary micro-ripples.
          vec2 uvA=p*.17-radialDir*(clock*.026)+vec2(clock*.016,-clock*.013);
          vec2 rotP=vec2(p.x*.80-p.y*.60,p.x*.60+p.y*.80);
          vec2 uvB=rotP*.36+vec2(-clock*.025,clock*.028);
          vec2 uvC=p*.82+vec2(clock*.042,clock*.034);
          vec4 sA=texture2D(tNormal,uvA);
          vec4 sB=texture2D(tNormal,uvB);
          vec4 sC=texture2D(tNormal,uvC);
          vec2 nA=(sA.xy*2.-1.);
          vec2 nB=(sB.xy*2.-1.);
          vec2 nC=(sC.xy*2.-1.);
          vec2 slope=nA*.22+nB*.20+nC*.14;

          // Organically warped 8-jet interfering wave heightfield (softly broken up by turbulence — ZERO compass bullseyes!).
          float foamN1=texture2D(tCaustic,p*.68-radialDir*(clock*.12)).b;
          float foamN2=texture2D(tCaustic,rotP*1.45+vec2(clock*.08,-clock*.10)).b;
          float crispBubble=foamN1*.54+foamN2*.60;
          float ringTurb=(sA.a-.5)*.44+(sB.a-.5)*.24;
          float ringMod=.56+.74*sB.a;
          float foam=0.;
          float waveDiv=0.;
          const vec2 J0=vec2(1.,0.),J1=vec2(.70710678,.70710678),J2=vec2(0.,1.),J3=vec2(-.70710678,.70710678);
          for(int i=0;i<8;i++){
            vec2 dir=i==0?J0:i==1?J1:i==2?J2:i==3?J3:i==4?-J0:i==5?-J1:i==6?-J2:-J3;
            vec2 offset=p-impact*dir;
            float d2=dot(offset,offset);
            if(d2<8.0){
              float d=sqrt(d2);
              float dWarp=d+ringTurb*smoothstep(.10,1.05,d);
              float atten=1./(1.+d*d*1.12)*smoothstep(2.75,.22,d)*smoothstep(.02,.10,d)*ringMod;
              float w1=cos(dWarp*11.4-clock*7.4);
              float w2=cos(dWarp*19.5-clock*10.8)*.36;
              float rip=(w1+w2)*atten;
              slope+=(offset/(d+.06))*rip*.095;
              waveDiv+=(-sin(dWarp*11.4-clock*7.4))*atten;
              if(d<.52){
                // Crisp, compact lacy bubble boil strictly at plunge core (<0.46m), zero outer halo rings.
                float core=smoothstep(.25,.03,d)*smoothstep(.18,.54,crispBubble);
                float lace=smoothstep(.46,.12,d)*smoothstep(.50,.80,crispBubble);
                foam+=core*1.18+lace*.78;
              }
            }
          }

          vec3 eye=normalize(cameraPosition-worldPoint);
          vec3 normal=normalize(vec3(slope.x,1.,-slope.y));
          // High-frequency capillary micro-normal solely for discrete pinprick sunlit diamond sparkles.
          vec3 microNormal=normalize(vec3(slope.x+nC.x*.28+nB.x*.10,1.,-(slope.y+nC.y*.28+nB.y*.10)));
          vec3 sun=normalize(vec3(-.45,.78,.43));
          vec3 skyKey=normalize(vec3(.24,.64,-.73));

          // True physical Schlick Fresnel (F0 = 0.02, power ~4.8): crystal-clear looking down, silky mirror at grazing angles.
          float ndv=clamp(dot(eye,normal),0.,1.);
          float fresnel=.02+.98*pow(1.-ndv,4.8);
          float reflWeight=clamp(.03+.84*pow(1.-ndv,4.2),.03,.85);

          // Silky organic live reflection warp (0.088) so moon, plinth, trees & banners shimmer naturally.
          vec2 reflUv=reflection.xy/reflection.w+slope*.088;
          vec3 mirror=texture2D(tDiffuse,clamp(reflUv,.002,.998)).rgb;

          // True Beer-Lambert optical depth & wet-stone AO (TRUE LINEAR RGB for ACES + sRGB output).
          float outerShallow=1.-smoothstep(radius*.60,radius,pr);
          float innerTrough=smoothstep(radius*.25,radius*.46,pr);
          float depth=clamp(outerShallow*innerTrough,0.,1.);
          float plinthAO=smoothstep(radius*.21,radius*.40,pr);
          float rimAO=1.-smoothstep(radius*.90,radius*.998,pr)*.36;
          float sunSide=clamp(.5+.5*dot(radialDir,normalize(vec2(-.45,.43))),0.,1.);

          // Silky continuous Mediterranean resort water (zero blotchy patches!):
          // pure Beer-Lambert depth absorption + smooth sunlight scatter + delicate wave-crest highlight.
          vec3 shallowLinear=vec3(.018,.39,.46);
          vec3 midLinear=vec3(.0045,.195,.32);
          vec3 deepLinear=vec3(.0018,.068,.165);
          vec3 waterBody=mix(shallowLinear,midLinear,smoothstep(0.,.54,depth));
          waterBody=mix(waterBody,deepLinear,smoothstep(.34,1.,depth)*(.46+.34*(1.-sunSide)));
          // Darken wet-stone shadow troughs around central plinth & rim cleanly without blotches.
          waterBody*=(.54+.46*plinthAO)*rimAO;

          // Subtle physical wave-facet light transmission (follows true wave normals continuously — zero spotted/patchy islands!).
          float sunFacet=clamp(dot(normal,sun),0.,1.);
          float crestGlow=clamp(waveDiv*.22,0.,1.)*plinthAO*(1.-fresnel*.85);
          waterBody*=mix(.92,1.08,sunFacet);
          waterBody+=vec3(.025,.16,.18)*crestGlow*.36;

          // Razor-sharp discrete sunlit diamond sparkles on capillary micro-facets (ZERO broad white chrome glare!).
          vec3 halfSun=normalize(eye+sun);
          vec3 halfSky=normalize(eye+skyKey);
          float ndhSunMicro=max(0.,dot(microNormal,halfSun));
          float ndhSkyMicro=max(0.,dot(microNormal,halfSky));
          float ndhSun=max(0.,dot(normal,halfSun));
          float sparkle=pow(ndhSunMicro,820.)*4.4+pow(ndhSkyMicro,1050.)*2.4;
          float glisten=pow(ndhSun,150.)*.10;

          // Crisp thin wet meniscus shimmer right where water meets the stone rim.
          float rimLine=smoothstep(radius*.976,radius*.998,pr)*(.15+.20*foamN1);

          // Blend crystal Mediterranean water with live distorted reflection + tight sunlit diamond sparkles.
          vec3 col=mix(waterBody,mirror*vec3(.92,.97,1.),reflWeight);
          col+=vec3(1.,.97,.88)*sparkle+vec3(.82,.96,1.)*glisten;

          float foamAmt=clamp(foam+rimLine,0.,1.);
          vec3 foamCol=vec3(.95,.99,1.);
          col=mix(col,foamCol,clamp(foamAmt*.90,0.,.94));

          // True optical clarity: crystal-clear looking steeply into sunlit sandstone floor, rich teal depth, mirror at grazing angles.
          float depthAlpha=mix(.38,.73,depth);
          float alpha=clamp(mix(depthAlpha,.95,reflWeight)+foamAmt*.52+min(.35,sparkle*.22),.36,.97);
          gl_FragColor=vec4(col,alpha);
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
  const maxDistSq = phone ? 3136 : compact ? 5625 : 7744;
  const moveIntervalMs = phone ? 64 : compact ? 56 : 48;
  const idleIntervalMs = phone ? 240 : compact ? 180 : 140;
  const update=(renderer:T.WebGLRenderer,scene:T.Scene,camera:T.Camera,force=false)=>{
    if(!force){
      const dx=x-camera.position.x, dz=z-camera.position.z, distSq=dx*dx+dz*dz;
      if(distSq>maxDistSq && previousCamera!==undefined)return;
      camera.getWorldDirection(camForward);
      if(distSq>25 && dx*camForward.x+dz*camForward.z<-Math.sqrt(distSq)*.25 && previousCamera!==undefined)return;
      const now=performance.now();
      const moved=camera!==previousCamera
        || camera.position.distanceToSquared(lastCamPos)>(compact?.006:.0025)
        || camForward.distanceToSquared(lastForward)>(compact?.0008:.0006);
      const minInterval=moved?moveIntervalMs:idleIntervalMs;
      if(camera===previousCamera && now-lastReflection<minInterval)return;
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

  // Realistic translucent liquid streams driven by scrolling seamless fBm normal + foam textures (1 merged draw call).
  const runningWater=new T.ShaderMaterial({
    uniforms:{clock,tNormal:{value:normalMap},tCaustic:{value:causticMap}},
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
        float wobble=sin(uv.x*19.-clock*16.+uv.y*12.566)*.0075*(.25+.75*uv.x);
        vec3 displaced=position+normal*wobble;
        vec4 worldPos=modelMatrix*vec4(displaced,1.);
        vWorld=worldPos.xyz;
        vNormal=normalize(mat3(modelMatrix)*normal);
        gl_Position=projectionMatrix*viewMatrix*worldPos;
      }`,
    fragmentShader:`
      uniform float clock;
      uniform sampler2D tNormal;
      uniform sampler2D tCaustic;
      varying vec2 flow;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main(){
        vec3 baseN=normalize(gl_FrontFacing?vNormal:-vNormal);
        vec3 V=normalize(cameraPosition-vWorld);
        vec3 L=normalize(vec3(-.45,.78,.43));

        // Scroll seamless fBm normal + aerated bubble noise rapidly along gravity-accelerated arc.
        float t=flow.x;
        float accel=t*(1.+.38*t);
        vec2 uv1=vec2(flow.y*1.4,accel*2.2-clock*2.3);
        vec2 uv2=vec2(flow.y*2.4+.37,accel*3.6-clock*3.4);
        vec4 nSample=texture2D(tNormal,uv1);
        float bubble1=texture2D(tCaustic,uv1).b;
        float bubble2=texture2D(tCaustic,uv2).b;

        // Perturb surface normal organically for real liquid glass shimmer.
        vec2 pert=(nSample.xy*2.-1.)*.38;
        vec3 N=normalize(baseN+vec3(pert.x,pert.y*.5,-pert.x*.5));

        float ndv=clamp(abs(dot(N,V)),0.,1.);
        float fresnel=pow(1.-ndv,2.3);

        // Crisp aerated filaments increasing smoothly toward plunge (clear glass mid-arc, frothy plunge).
        float filaments=smoothstep(.52,.84,bubble1*.58+bubble2*.58);
        float aeration=smoothstep(.48,1.,t);
        float foam=clamp(filaments*.65+aeration*(.22+.52*bubble2),0.,1.);

        vec3 H=normalize(V+L);
        float spec=pow(max(0.,dot(N,H)),130.)*2.6;
        float skyTint=.5+.5*N.y;

        // True linear crystal aqua-glass stream core + sparkling sunlit specular streaks.
        vec3 glassAqua=mix(vec3(.025,.24,.34),vec3(.24,.60,.72),skyTint*.75);
        vec3 whiteSpray=vec3(.92,.97,1.);
        vec3 col=mix(glassAqua,whiteSpray,clamp(fresnel*.58+foam*.72,0.,1.));
        col+=vec3(1.,.98,.90)*spec;

        float ends=smoothstep(0.,.04,t)*(1.-smoothstep(.94,1.,t)*.30);
        float alpha=clamp((.18+fresnel*.48+foam*.48+min(.45,spec*.35))*ends,.12,.92);
        gl_FragColor=vec4(col,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  // Crisp sparkling aerated spray droplets rising where each stream strikes the basin (1 merged draw call).
  const splashMaterial=new T.ShaderMaterial({
    uniforms:{clock,tCaustic:{value:causticMap}},
    transparent:true,
    depthWrite:false,
    side:T.DoubleSide,
    vertexShader:`
      attribute float aSeed;
      varying vec2 vUv;
      varying float vSeed;
      void main(){
        vUv=uv;
        vSeed=aSeed;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader:`
      uniform float clock;
      uniform sampler2D tCaustic;
      varying vec2 vUv;
      varying float vSeed;
      void main(){
        vec2 c=vUv-vec2(.5,.16);
        float horiz=1.-smoothstep(.06,.44,abs(c.x));
        float vert=smoothstep(0.,.18,vUv.y)*(1.-smoothstep(.32,1.,vUv.y));
        float radial=1.-smoothstep(.12,.54,length(vec2(c.x*1.25,c.y*.90)));
        float mask=horiz*vert*radial;
        if(mask<.01)discard;
        float n1=texture2D(tCaustic,vec2(vUv.x*2.2+vSeed,vUv.y*2.0-clock*2.4)).b;
        float n2=texture2D(tCaustic,vec2(vUv.x*4.6-vSeed*.7,vUv.y*4.0-clock*3.8)).b;
        float spray=smoothstep(.40,.78,n1*.54+n2*.66)*mask;
        vec3 col=mix(vec3(.65,.92,.98),vec3(1.,1.,1.),smoothstep(.35,.74,n2));
        float alpha=clamp(spray*1.05,0.,.86);
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
    jetGeos.push(taperedJetGeometry(flow,24,12));
    splashGeos.push(splashPlumeGeometry(dx*impact,waterline+.004,dz*impact,i));
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

  return {
    group, clock, warm, update,
    release:()=>{
      basin.getRenderTarget().dispose();
      normalMap.dispose();
      causticMap.dispose();
    },
  };
}
