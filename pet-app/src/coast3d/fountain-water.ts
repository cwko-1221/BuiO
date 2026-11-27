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

function tileableVoronoi(u: number, v: number, cells: number, seed: number) {
  const fx = u * cells, fy = v * cells;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  let f1 = 9, f2 = 9;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = ix + ox, cy = iy + oy;
      const rx = cx + 0.15 + 0.70 * hash2(cx, cy, cells, seed);
      const ry = cy + 0.15 + 0.70 * hash2(cx, cy, cells, seed + 19.3);
      const dx = rx - fx, dy = ry - fy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < f1) { f2 = f1; f1 = dist; }
      else if (dist < f2) { f2 = dist; }
    }
  }
  // Sharp optical caustic filament along Voronoi cell ridges (where F2 - F1 approaches 0).
  const ridge = Math.max(0, 1 - (f2 - f1) * 2.8);
  const cellGlow = Math.pow(Math.min(1, f1 * 1.15), 2.4);
  return Math.min(1, ridge * ridge * 0.85 + cellGlow * 0.45);
}

/** Generate seamless tileable tangent-space water normal+height map and Voronoi optical caustic map once. */
function createWaterTextures(size = 256) {
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // 4-octave periodic fBm wave height field (zero seams, zero directional plaid).
      const h =
        tileableValueNoise(u, v, 6, 1.1) * 0.48 +
        tileableValueNoise(u, v, 12, 3.7) * 0.28 +
        tileableValueNoise(u, v, 24, 7.3) * 0.15 +
        tileableValueNoise(u, v, 48, 13.9) * 0.09;
      heights[y * size + x] = h;
    }
  }

  const normalData = new Uint8Array(size * size * 4);
  const causticData = new Uint8Array(size * size * 4);
  const strength = 5.2;

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

      const c1 = tileableVoronoi(u, v, 7, 5.2);
      const c2 = tileableVoronoi(u, v, 11, 21.4);
      const foam =
        tileableValueNoise(u, v, 10, 31.1) * 0.52 +
        tileableValueNoise(u, v, 22, 47.3) * 0.32 +
        tileableValueNoise(u, v, 44, 63.7) * 0.16;
      causticData[idx] = Math.round(Math.min(1, c1) * 255);
      causticData[idx + 1] = Math.round(Math.min(1, c2) * 255);
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
  const resolution=phone?224:256;
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

          // Dual counter-flowing seamless fBm normal maps (zero directional sine-plaid artifacts).
          vec2 uvA=p*.17-radialDir*(clock*.026)+vec2(clock*.018,-clock*.014);
          vec2 rotP=vec2(p.x*.80-p.y*.60,p.x*.60+p.y*.80);
          vec2 uvB=rotP*.33+vec2(-clock*.024,clock*.029);
          vec4 sA=texture2D(tNormal,uvA);
          vec4 sB=texture2D(tNormal,uvB);
          vec2 nA=(sA.xy*2.-1.);
          vec2 nB=(sB.xy*2.-1.);
          vec2 slope=nA*.16+nB*.11;

          // Subtle analytic concentric ripples & organic aeration foam around each of the 8 jet landings.
          float foamNoise=texture2D(tCaustic,p*.46-radialDir*(clock*.08)).b;
          float foam=0.;
          if(abs(pr-impact)<2.15){
            const vec2 J0=vec2(1.,0.),J1=vec2(.70710678,.70710678),J2=vec2(0.,1.),J3=vec2(-.70710678,.70710678);
            for(int i=0;i<8;i++){
              vec2 dir=i==0?J0:i==1?J1:i==2?J2:i==3?J3:i==4?-J0:i==5?-J1:i==6?-J2:-J3;
              if(dot(p,dir)<=0.)continue;
              vec2 offset=p-impact*dir;
              float d2=dot(offset,offset);
              if(d2<3.8){
                float d=sqrt(d2);
                // Smooth cubic envelope prevents any visible hard circle cutoff.
                float env=smoothstep(1.92,.14,d)*smoothstep(.02,.16,d);
                float ripple=cos(d*15.5-clock*8.8)*env;
                slope+=(offset/(d+.06))*ripple*.095;
                // Organic aerated bubble cloud breaking up with multi-octave noise.
                float core=smoothstep(.42,.05,d);
                float cloud=smoothstep(.88,.18,d)*smoothstep(.36,.74,foamNoise);
                float ring=max(0.,sin(d*15.5-clock*8.8))*smoothstep(1.25,.24,d)*smoothstep(.42,.78,foamNoise)*.22;
                foam+=core*.62+cloud*.48+ring;
              }
            }
          }

          vec3 eye=normalize(cameraPosition-worldPoint);
          vec3 normal=normalize(vec3(slope.x,1.,-slope.y));

          // Physical Schlick Fresnel (F0 = 0.02 for pure water).
          float ndv=clamp(dot(eye,normal),0.,1.);
          float fresnel=.02+.98*pow(1.-ndv,4.6);
          float reflWeight=clamp(.12+.84*pow(1.-ndv,2.5),.12,.94);

          // Live reflection gently rippled by organic tangent-space normals.
          vec2 reflUv=reflection.xy/reflection.w+slope*.048;
          vec3 mirror=texture2D(tDiffuse,clamp(reflUv,.002,.998)).rgb;

          // Realistic depth absorption across the stone fountain trough.
          float outerShallow=1.-smoothstep(radius*.72,radius,pr);
          float innerShallow=smoothstep(radius*.26,radius*.48,pr);
          float depth=clamp(outerShallow*innerShallow,0.,1.);

          // Real Voronoi optical caustics refracted onto the sunlit shallow basin floor.
          vec2 cUv1=p*.24+slope*.34+vec2(clock*.024,-clock*.018);
          vec2 cUv2=rotP*.30-slope*.26+vec2(-clock*.021,clock*.026);
          float caust1=texture2D(tCaustic,cUv1).r;
          float caust2=texture2D(tCaustic,cUv2).g;
          float caustics=pow(clamp(caust1*.68+caust2*.68,0.,1.),2.0)*(1.-fresnel*.65)*(.55+.45*outerShallow);

          // Clean, luminous Mediterranean fountain water palette (clear shallow glass -> cool mineral turquoise-blue).
          vec3 shallowWater=vec3(.30,.72,.76);
          vec3 deepWater=vec3(.055,.39,.52);
          vec3 waterBody=mix(shallowWater,deepWater,.20+.64*depth);
          waterBody+=vec3(.66,.90,.86)*caustics*.52;

          // Multi-lobe sunlight specular: sharp liquid sun-diamonds + soft sky sheen.
          vec3 sun=normalize(vec3(-.45,.78,.43));
          vec3 halfVec=normalize(eye+sun);
          float ndh=max(0.,dot(normal,halfVec));
          float sparkle=pow(ndh,140.)*1.45;
          float sheen=pow(ndh,22.)*.20;

          // Delicate water meniscus catching light where water kisses the stone rim.
          float rimLine=smoothstep(radius*.962,radius*.998,pr)*(.18+.16*foamNoise);

          vec3 col=mix(waterBody,mirror*vec3(.95,.99,1.),reflWeight);
          col+=vec3(1.,.97,.88)*(sparkle+sheen);

          float foamAmt=clamp(foam+rimLine,0.,1.);
          vec3 foamCol=vec3(.95,.99,1.);
          col=mix(col,foamCol,clamp(foamAmt*.80,0.,.88));

          // Physical translucency: crystal-clear looking down into shallows, reflective at grazing angles.
          float depthAlpha=mix(.40,.68,depth);
          float alpha=clamp(mix(depthAlpha,.95,reflWeight)+foamAmt*.45+sparkle*.30,.36,.97);
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

        // Perturb surface normal organically for real liquid shimmer.
        vec2 pert=(nSample.xy*2.-1.)*.32;
        vec3 N=normalize(baseN+vec3(pert.x,pert.y*.5,-pert.x*.5));

        float ndv=clamp(abs(dot(N,V)),0.,1.);
        float fresnel=pow(1.-ndv,2.0);

        // Organic frothy filaments & air-entrainment increasing smoothly toward plunge.
        float filaments=smoothstep(.46,.82,bubble1*.60+bubble2*.55);
        float aeration=smoothstep(.38,1.,t);
        float foam=clamp(filaments*.72+aeration*(.24+.48*bubble2),0.,1.);

        vec3 H=normalize(V+L);
        float spec=pow(max(0.,dot(N,H)),64.)*1.2;
        float skyTint=.5+.5*N.y;

        vec3 glassAqua=mix(vec3(.26,.68,.76),vec3(.74,.93,.98),skyTint*.65);
        vec3 whiteSpray=vec3(.96,.99,1.);
        vec3 col=mix(glassAqua,whiteSpray,clamp(fresnel*.52+foam*.78,0.,1.));
        col+=vec3(1.,.98,.92)*spec;

        float ends=smoothstep(0.,.04,t)*(1.-smoothstep(.94,1.,t)*.35);
        float alpha=clamp((.22+fresnel*.46+foam*.48+spec*.45)*ends,.14,.92);
        gl_FragColor=vec4(col,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  // Soft volumetric sunlit mist plumes rising where each stream strikes the basin (1 merged draw call).
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
        vec2 c=vUv-vec2(.5,.18);
        float horiz=1.-smoothstep(.08,.50,abs(c.x));
        float vert=smoothstep(0.,.22,vUv.y)*(1.-smoothstep(.35,1.,vUv.y));
        float radial=1.-smoothstep(.15,.62,length(vec2(c.x*1.15,c.y*.85)));
        float mask=horiz*vert*radial;
        if(mask<.01)discard;
        float n1=texture2D(tCaustic,vec2(vUv.x*1.5+vSeed,vUv.y*1.4-clock*1.9)).b;
        float n2=texture2D(tCaustic,vec2(vUv.x*2.8-vSeed*.7,vUv.y*2.4-clock*2.9)).b;
        float spray=smoothstep(.34,.78,n1*.58+n2*.56)*mask;
        vec3 col=mix(vec3(.82,.95,.98),vec3(.99,1.,1.),.45+.55*n2);
        float alpha=clamp(spray*.82,0.,.72);
        if(alpha<.015)discard;
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
