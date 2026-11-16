import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MATERIALS, materialById } from './data.js';
import { buildStation } from './equipment.js';
import { buildCharcoalVisual } from './charcoal.js';
import { pickSample } from './sample-picking.js';
import { SurfaceMotion, deformSurface, liquidMeshData } from './surface-motion.js';

const stations = { heat: [-3.35, .72, -1.7], cool: [0, 1.04, -1.7], freeze: [3.35, .46, -1.7] };
const homes = Object.fromEntries(MATERIALS.map((d, i) => [d.id, [(i % 3 - 1) * 3.1, .13, i < 3 ? .4 : 2.7]]));
const material = (color, options = {}) => new (options.clearcoat != null ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial)({ color, roughness: .48, ...options });
function mesh(geometry, mat) {
  const m = new THREE.Mesh(geometry, mat); m.castShadow = true; m.receiveShadow = true; return m;
}
function box(w, h, d, color, radius = .08, options = {}) {
  return mesh(new RoundedBoxGeometry(w, h, d, 3, radius), material(color, options));
}
function disc(radius, height, color, options = {}) {
  return mesh(new THREE.CylinderGeometry(radius, radius, height, 48), material(color, options));
}
function sphere(radius, color, options = {}) {
  return mesh(new THREE.SphereGeometry(radius, 28, 18), material(color, options));
}
function ring(radius, tube, color) {
  const m = mesh(new THREE.TorusGeometry(radius, tube, 10, 64), material(color));
  m.rotation.x = Math.PI / 2; return m;
}
function breadShape() {
  const s = new THREE.Shape();
  s.moveTo(-.45, -.45); s.lineTo(.45, -.45); s.quadraticCurveTo(.55, -.45, .55, -.32);
  s.lineTo(.55, .12); s.bezierCurveTo(.8, .65, -.8, .65, -.55, .12);
  s.lineTo(-.55, -.32); s.quadraticCurveTo(-.55, -.45, -.45, -.45);
  return s;
}
function crumbTexture() {
  // Authored procedural material texture, with seeded pores and toasted flecks.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff2ce'; ctx.fillRect(0, 0, 256, 256);
  let seed = 1294; const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 1050; i++) {
    const x = random() * 256, y = random() * 256, r = .5 + random() * 3.1;
    ctx.fillStyle = `rgba(108,67,32,${.04 + random() * .3})`;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * .65, random() * 3, 0, Math.PI * 2); ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function surfaceTexture(seed = 1937, striations = false) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#c6c6c6'; ctx.fillRect(0, 0, 256, 256);
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 1800; i++) {
    const shade = 130 + Math.floor(random() * 110); ctx.fillStyle = `rgba(${shade},${shade},${shade},.35)`;
    ctx.fillRect(random() * 256, random() * 256, .5 + random() * 1.7, .5 + random() * 1.7);
  }
  if (striations) for (let i = 0; i < 23; i++) {
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = .5 + random(); ctx.beginPath();
    const y = random() * 256; ctx.moveTo(0, y); ctx.bezierCurveTo(60, y - 4, 170, y + 5, 256, y + 3); ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}
function makeSample(d) {
  const group = new THREE.Group(); group.userData.materialId = d.id;
  // One continuous glass vessel, including its bottom. There is no second
  // saucer, coloured base ring or selection ring underneath it.
  const bread=d.id==='bread';
  const profile = (bread ? [[0,.08],[.71,.08],[.78,.11],[.78,.13],[.75,.14],[.7,.115],[0,.115]] : [[0,.08],[.52,.08],[.58,.105],[.62,.17],[.68,.49],[.678,.52],[.661,.52],[.654,.48],[.59,.18],[.52,.13],[0,.13]]).map(([x,y]) => new THREE.Vector2(x,y));
  const cup = mesh(new THREE.LatheGeometry(profile, 64), new THREE.MeshPhysicalMaterial({
    color: '#f4fbff', roughness: .045, metalness: 0, transparent: true, opacity: .85,
    transmission: .58, thickness: .055, ior: 1.47, attenuationColor:new THREE.Color('#eff7fb'), attenuationDistance:3,
    clearcoat: 1, envMapIntensity:.65, side: THREE.DoubleSide, depthWrite: false,
  })); cup.castShadow = false; group.add(cup);
  if(d.id==='charcoal'){cup.material.color.set('#e7e1d0');cup.material.transmission=0;cup.material.opacity=1;cup.material.transparent=false;cup.material.depthWrite=true;cup.material.roughness=.38;cup.material.clearcoat=.15;}
  const lip = ring(bread?.77:.669,.008,'#b8c7cd'); lip.position.y=bread?.133:.519; lip.material.transparent=true;lip.material.opacity=.8;group.add(lip);
  for(const rotation of [.3,3.6]) {
    const shine=mesh(new THREE.TorusGeometry(bread?.773:.672,.005,8,28,.6),material('#ffffff',{transparent:true,opacity:.8}));
    shine.rotation.set(Math.PI/2,0,rotation);shine.position.y=bread?.14:.524;shine.castShadow=false;group.add(shine);
  }
  const pick=mesh(new THREE.CylinderGeometry(bread?.78:.69,bread?.75:.6,bread?.15:.53,32),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false}));
  pick.position.y=bread?.1:.28;pick.castShadow=false;pick.receiveShadow=false;pick.name='glass-pick-volume';group.add(pick);
  const solids = new THREE.Group(); group.add(solids);
  const liquidColor = d.id === 'ice' ? '#579ebd' : d.id === 'egg' ? '#d4c48d' : d.color;
  const depth = d.id === 'ice' ? .26 : d.id === 'egg' ? .15 : .15;
  const pool = disc(.51, depth, liquidColor, { roughness: d.id === 'egg' ? .2 : .16, clearcoat: .85, clearcoatRoughness: .12,
    transparent: d.id === 'ice' || d.id === 'egg', opacity: d.id === 'ice' ? .65 : .6 });
  const liquidData=liquidMeshData(d.id==='ice'?.625:.61,.53,depth);
  pool.geometry.dispose();pool.geometry=new THREE.BufferGeometry();
  pool.geometry.setAttribute('position',new THREE.Float32BufferAttribute(liquidData.positions,3));pool.geometry.setIndex(liquidData.indices);
  pool.geometry.userData.topCount=liquidData.topCount;pool.geometry.computeVertexNormals();
  pool.position.y = .14 + depth / 2; pool.visible = false; group.add(pool);
  // Subtle broken reflections sit ON the deforming surface. Together with
  // changing normals they make a clear liquid readable against a white bench.
  const reflections=[];
  for(let j=0;j<3;j++) {
    const points=Array.from({length:28},(_,i)=>new THREE.Vector3((i/27-.5)*(.46-j*.08),depth/2+.006,-.27+j*.22));
    const shine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#ffffff',transparent:true,opacity:.38,depthWrite:false}));
    shine.userData.points=points;pool.add(shine);reflections.push(shine);
  }
  if(d.id==='egg'){pool.material.roughness=.065;pool.material.transmission=.18;pool.material.thickness=.15;pool.material.ior=1.36;}
  let gel, refrozen, combustion;
  if (d.id === 'ice') {
    [[-.22, -.16, -.24], [.21, .1, .1], [-.18, .27, .22]].forEach(([x, rot, z]) => {
      const cube = box(.44, .42, .43, '#c9f0f8', .07, { roughness: .12, metalness: .04, transparent: true, opacity: .8 });
      cube.position.set(x, .32, z); cube.rotation.y = rot; solids.add(cube);
      const glint = box(.21, .018, .2, '#ffffff', .02, { transparent: true, opacity: .6 }); glint.position.set(-.04, .215, -.04); cube.add(glint);
      const crack = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.14,.14,.218),new THREE.Vector3(-.03,.04,.222),new THREE.Vector3(.09,-.11,.218)]), new THREE.LineBasicMaterial({color:'#efffff',transparent:true,opacity:.65})); cube.add(crack);
    });
    refrozen=new THREE.Group();refrozen.position.y=.14;group.add(refrozen);refrozen.visible=false;
    const profile=[[0,0],[.53,0],[.58,.025],[.64,.22],[.61,.27],[0,.27]].map(([x,y])=>new THREE.Vector2(x,y));
    const body=mesh(new THREE.LatheGeometry(profile,40),new THREE.MeshPhysicalMaterial({color:'#4c8caf',roughness:.26,metalness:0,clearcoat:.4,transparent:true,opacity:.99,transmission:.04,thickness:.27,ior:1.31,envMapIntensity:.3}));refrozen.add(body);
    const frost=disc(.59,.008,'#effaff',{transparent:true,opacity:.28,roughness:.8,bumpMap:surfaceTexture(7781),bumpScale:.015});frost.position.y=.272;refrozen.add(frost);
    for(let i=0;i<6;i++) {
      const angle=i*Math.PI/3, r=.36;
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.sin(angle)*.08,.279,Math.cos(angle)*.08),new THREE.Vector3(Math.sin(angle+.18)*r*.7,.28,Math.cos(angle+.18)*r*.7),new THREE.Vector3(Math.sin(angle)*r,.279,Math.cos(angle)*r)]),new THREE.LineBasicMaterial({color:'#f4ffff',transparent:true,opacity:.8}));refrozen.add(line);
    }
    for(let i=0;i<4;i++){const cloud=sphere(.1,'#f5ffff',{transparent:true,opacity:.4,roughness:.9});cloud.scale.set(1,.35,.8);cloud.position.set(Math.sin(i*2)*.26,.12+ i*.015,Math.cos(i*2)*.25);refrozen.add(cloud);}
  } else if (d.id === 'charcoal') {
    combustion=buildCharcoalVisual();solids.add(combustion.group);
  } else if (d.id === 'chocolate') {
    const base = box(.88, .15, .65, '#321d18', .045, { roughness: .31 }); base.position.y = .2; solids.add(base);
    for (let i = 0; i < 6; i++) {
      const piece = box(.265, .11, .28, '#42271f', .04, { roughness: .26 });
      piece.position.set((i % 3 - 1) * .285, .31, i < 3 ? -.16 : .16); solids.add(piece);
      const relief = box(.18,.012,.19,'#4a2c23',.025,{roughness:.35}); relief.position.set(0,.06,0); piece.add(relief);
    }
  } else if (d.id === 'butter') {
    const block = box(.8, .31, .51, '#f3d462', .065, { roughness: .35, clearcoat: .25 }); block.position.set(0, .3, 0); block.rotation.y = -.12; solids.add(block);
    const curl = box(.58, .025, .4, '#ffe48a', .015); curl.position.set(-.02, .46, -.01); solids.add(curl);
  } else if (d.id === 'egg') {
    solids.visible = false; pool.visible = true; pool.scale.set(1, 1.3, 1);pool.position.y=.14+depth*1.3/2;
    for (let i=0;i<5;i++) { const bubble = sphere(.02 + i*.003,'#edf4df',{roughness:.08,transparent:true,opacity:.6}); bubble.position.set(Math.sin(i*3)*.28,.085,Math.cos(i*3)*.28); pool.add(bubble); }
    gel = sphere(.52, '#fffef1', { roughness: .6 }); gel.scale.set(1, .32, 1); gel.position.y = .23; group.add(gel); gel.visible = false;
    for (let i = 0; i < 8; i++) {
      const ripple = sphere(.07, '#fffdf2', { roughness: .45 });
      ripple.position.set(Math.sin(i * 2.5) * .36, .49 + (i % 3) * .035, Math.cos(i * 2.5) * .35); ripple.scale.y = .45; gel.add(ripple);
    }
  } else {
    const geometry = new THREE.ExtrudeGeometry(breadShape(), { depth: .16, bevelEnabled: true, bevelThickness: .035, bevelSize: .035, bevelSegments: 3, steps: 1 });
    geometry.center(); geometry.rotateX(-Math.PI / 2);
    const crust = mesh(geometry, material('#c58b53', { roughness: .9 })); crust.position.y = .26; crust.rotation.y = -.15; solids.add(crust);
    const crumb = mesh(geometry, material('#fff0c9', { map: crumbTexture(), roughness: .92 }));
    crumb.material.bumpMap = crumb.material.map; crumb.material.bumpScale=.018;
    const uv = crumb.geometry.getAttribute('uv'), pos = crumb.geometry.getAttribute('position');
    for(let i=0;i<uv.count;i++) uv.setXY(i,(pos.getX(i)+.8)/1.6,(pos.getZ(i)+.65)/1.3); uv.needsUpdate=true;
    crumb.scale.set(.88, .3, .86); crumb.position.y = .365; crumb.rotation.y = -.15; solids.add(crumb);
    gel = crumb;
  }
  const focus = new THREE.Group(); group.add(focus);
  if (['chocolate','butter'].includes(d.id)) {
    const texture = surfaceTexture(913+MATERIALS.indexOf(d)*71,d.id==='butter');
    solids.traverse(o=>{if(o.isMesh){o.material.roughnessMap=texture;o.material.bumpMap=texture;o.material.bumpScale=d.id==='chocolate'?.006:.01;}});
  }
  return { group, pick, solids, pool, gel, refrozen, combustion, focus, cup, reflections, slosh:new SurfaceMotion(), previousPosition:group.position.clone(), originalSurface:pool.geometry.getAttribute('position').array.slice(), depth, surfaceRange:0, original: new THREE.Color(d.color) };
}

export class ChangeScene {
  constructor(canvas, { simulation, onSelect, onMove, onIssue,palette }) {
    this.canvas = canvas; this.simulation = simulation; this.onSelect = onSelect; this.onMove = onMove;
    this.selected = 'ice'; this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .82;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(palette?.background??'#8fa7bb');
    this.scene.fog = new THREE.Fog(palette?.background??'#8fa7bb', 24, 55);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), .04); this.scene.environment = this.environment.texture; pmrem.dispose();
    this.camera = new THREE.PerspectiveCamera(38, 1, .1, 80);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.enablePan = false;
    this.controls.minPolarAngle = .55; this.controls.maxPolarAngle = 1.08;
    this.controls.minAzimuthAngle = -.42; this.controls.maxAzimuthAngle = .42;
    this.controls.minDistance = 8; this.controls.maxDistance = 24;
    this.scene.add(new THREE.HemisphereLight('#f4faff', '#8497a5', 1.5));
    const sun = new THREE.DirectionalLight('#fff2d9', 2.5); sun.position.set(-5, 12, 6); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -9; sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8; sun.shadow.normalBias = .035; this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#d0eaff', 1.3); fill.position.set(6, 5, -4); this.scene.add(fill);
    const bench = box(11.6, .35, 7.6, '#f7f5ee', .18, { roughness: .72 }); bench.position.set(0, -.2, .25); this.scene.add(bench);
    const edge = box(11.5, .075, .09, '#4b697c', .025); edge.position.set(0, -.03, 3.97); this.scene.add(edge);
    const apron = box(11.1, .3, 7.1, '#5b798c', .1, { roughness: .45 }); apron.position.set(0, -.5, .25); this.scene.add(apron);
    for (const x of [-5.1, 5.1]) for (const z of [-2.8, 3.2]) {
      const leg = box(.27, 2.8, .27, '#b1c3cc', .045, { metalness: .65, roughness: .3 }); leg.position.set(x, -1.85, z); this.scene.add(leg);
      const foot = box(.39, .1, .4, '#344e5d', .04); foot.position.set(x, -3.25, z); this.scene.add(foot);
    }
    const floor = mesh(new THREE.PlaneGeometry(160, 160), material(palette?.floor??'#708ca3', { roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -3.32; this.scene.add(floor);
    if(palette){const wall=new THREE.Mesh(new THREE.PlaneGeometry(160,25),new THREE.MeshBasicMaterial({color:'#0b5662',toneMapped:false}));wall.position.set(0,9,-5.4);this.scene.add(wall);}
    this.stationObjects = {};
    for (const [id, position] of Object.entries(stations)) {
      const g = buildStation(id, { box, disc, ring, sphere, mesh, material });
      g.position.set(position[0], 0, position[2]);
      this.scene.add(g); this.stationObjects[id] = g;
    }
    this.models = Object.fromEntries(MATERIALS.map(d => { const model = makeSample(d); model.group.position.fromArray(homes[d.id]); this.scene.add(model.group); return [d.id, model]; }));
    this.ray = new THREE.Raycaster(); this.pointer = new THREE.Vector2(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.9);
    this.point = new THREE.Vector3(); this.drag = null; this.contextLost = false; this.elapsed=0;
    for(const model of Object.values(this.models)) model.previousPosition.copy(model.group.position);
    this.bind();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas.parentElement);
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.contextLost = true; onIssue('contextLost'); });
    canvas.addEventListener('webglcontextrestored', () => { this.contextLost = false; this.resize(); onIssue(null); });
    this.resize();
  }
  setSelected(id) { this.selected = id; }
  setQuality(quality){this.quality=['auto','high','low'].includes(quality)?quality:'auto';this.renderer.shadowMap.enabled=this.quality!=='low';this.resize();}
  resetCamera() {
    if (this.portrait) {
      const distance = Math.max(10.2, 8.5 / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect));
      this.controls.maxDistance = Math.max(26, distance * 1.2);
      this.controls.target.set(0, -.05, .35);
      this.camera.position.set(0, distance * .66, .35 + distance * .75);
    } else {
      this.controls.maxDistance = 24;
      this.camera.position.set(0, 9.2, 10.5); this.controls.target.set(0, -.15, .35);
    }
    this.controls.update();
  }
  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const compact = rect.height < 280;
    const portrait = rect.width / rect.height < 1 || compact;
    const changed = portrait !== this.portrait || compact !== this.compact; this.portrait = portrait; this.compact = compact;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality==='low'?1:this.quality==='high'?2:1.8));
    this.renderer.setSize(rect.width, rect.height, false); this.camera.aspect = rect.width / rect.height;
    // Portrait isolates the selected tray without losing the independent state
    // of hidden samples. The material strip remains the keyboard/touch selector.
    this.camera.fov = compact ? 28 : portrait ? 44 : 38; this.camera.updateProjectionMatrix();
    if (changed || !this.camera.position.length()) this.resetCamera();
  }
  cast(event) {
    this.camera.updateMatrixWorld(true);this.scene.updateMatrixWorld(true);
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set((event.clientX - r.left) / r.width * 2 - 1, -(event.clientY - r.top) / r.height * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
  }
  bind() {
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !this.controls.enabled) return;
      this.cast(e);
      const hit=pickSample(this.ray,this.models);
      if (!hit) return;
      e.stopImmediatePropagation();
      if(this.onSelect(hit.id)===false) return;
      this.canvas.setPointerCapture(e.pointerId);
      const model=this.models[hit.id];
      this.simulation.hold(hit.id,true);model.slosh.liftImpulse();
      this.drag = { id: hit.id, x: e.clientX, y: e.clientY, moved: false, target:model.group.position.clone().add(new THREE.Vector3(0,.32,0)) };
      this.controls.enabled = false;
    }, true);
    this.canvas.addEventListener('pointermove', e => {
      if (!this.drag) return;
      if (Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) > 7) this.drag.moved = true;
      if (!this.drag.moved) return;
      this.cast(e); this.ray.ray.intersectPlane(this.plane, this.point);
      this.drag.target.set(THREE.MathUtils.clamp(this.point.x, -5, 5), 1.45, THREE.MathUtils.clamp(this.point.z, -2.7, 3.5));
      for(const [id, object] of Object.entries(this.stationObjects)) object.userData.dropTarget.visible = Math.hypot(this.point.x-object.position.x,this.point.z-object.position.z)<1.65;
    });
    const release = e => {
      if (!this.drag) return;
      const { id, moved } = this.drag;
      if (moved) {
        const p = this.drag.target; let nearest = 'bench', distance = 2;
        for (const [station, object] of Object.entries(this.stationObjects)) {
          const { x, z } = object.position;
          const d = Math.hypot(p.x - x, p.z - z); if (d < distance) { nearest = station; distance = d; }
        }
        if (e.type !== 'pointercancel') this.onMove(id, nearest);
      }
      this.simulation.hold(id,false);
      this.drag = null; this.controls.enabled = true;
      for(const object of Object.values(this.stationObjects)) object.userData.dropTarget.visible = false;
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    };
    this.canvas.addEventListener('pointerup', release); this.canvas.addEventListener('pointercancel', release);
    this.canvas.addEventListener('lostpointercapture', e => { if (this.drag) release({ ...e, type: 'pointercancel' }); });
  }
  project(position) {
    const p = position.clone().project(this.camera), r = this.canvas.getBoundingClientRect();
    return { x: (p.x + 1) / 2 * r.width, y: (1 - p.y) / 2 * r.height, visible: p.z < 1 };
  }
  anchor(id) { const p = this.models[id].group.position.clone(); p.z += .78 * this.models[id].group.scale.x; p.y += .04; return this.project(p); }
  stationAnchor(id) { const object = this.stationObjects[id]; return this.project(new THREE.Vector3(object.position.x, (id==='heat'?2.05:id==='freeze'?2.9:1.3)*(this.portrait ? .85 : 1), object.position.z - .75)); }
  pointFor(id) {
    const sample = id in this.models;
    const p = sample ? this.models[id].group.position : this.stationObjects[id].position;
    return this.project(p.clone().add(new THREE.Vector3(0, sample ? .3 : 1.1, 0)));
  }
  visualState(id) {
    const m=this.models[id];
    return {surfaceRange:m.surfaceRange,surfaceEnergy:m.slosh.energy,surfaceTiltX:m.slosh.x,surfaceTiltZ:m.slosh.z,surfaceRadial:m.slosh.radial,held:this.simulation.samples[id].held,surfaceVertices:m.pool.geometry.userData.topCount,refrozenIceVisible:Boolean(m.refrozen?.visible),glassTransmission:m.cup.material.transmission,ashVisible:Boolean(m.combustion?.ash.visible),fuelVisible:Boolean(m.combustion?.fuel.visible),fuelScale:m.combustion?.fuel.scale.x??null,furnaceVisible:this.stationObjects.heat.userData.furnace.visible,
      mistParticles:this.stationObjects.freeze.userData.mist?.sprites.filter(s=>s.visible&&s.material.opacity>.03).length??0};
  }
  update(dt) {
    this.elapsed+=dt;
    for (const d of MATERIALS) {
      const m = this.models[d.id], s = this.simulation.samples[d.id];
      m.group.visible = !this.portrait || d.id === this.selected;
      m.focus.visible = d.id === this.selected;
      const scale = this.portrait ? (s.location === 'bench' ? 1.8 : 1.3) : (d.id === this.selected ? 1.28 : 1.12);
      m.group.scale.setScalar(scale);
      if(this.drag?.id===d.id) {
        // Smooth the carried vessel at render frequency; pointer events only
        // update its target, so acceleration is stable across input devices.
        m.group.position.lerp(this.drag.target,this.reduced?1:1-Math.exp(-dt*18));
      } else {
        const dest = s.location === 'bench' ? (this.portrait ? [0, .13, 1.8] : homes[d.id]) : stations[s.location];
        const position = new THREE.Vector3(...dest);
        if(s.id==='bread' && s.location==='heat') position.y += .1;
        if(this.portrait && s.location!=='bench'){position.x=stations[s.location][0]*.82;position.y*=.85;}
        m.group.position.lerp(position, this.reduced ? 1 : 1 - Math.exp(-dt * 10));
      }
      if(d.kind==='burn') {
        const b=s.burned,visual=m.combustion;m.pool.visible=false;
        visual.fuel.visible=b<.999;visual.fuel.scale.setScalar(Math.max(.001,Math.cbrt(1-b)));
        // Carbon leaves as gas: fuel shrinks, while a much smaller ash pile
        // accumulates. It never becomes an equal-volume grey liquid or block.
        visual.ash.visible=b>.005;visual.ash.scale.setScalar(Math.max(.01,Math.cbrt(b)));
        const glowing=s.temperature>380 && b>.001 && b<.999;
        const shimmer=this.reduced?1:.9+.1*Math.sin(this.elapsed*8);
        visual.materials.forEach(mat=>{mat.emissiveIntensity=glowing?(.09+.12*Math.sin(b*Math.PI))*shimmer:0;});
        visual.cracks.forEach(mat=>mat.color.set(glowing?'#ff9d42':'#070a0c'));
        visual.glow.intensity=glowing?.35*shimmer:0;
      } else if (d.kind === 'melt') {
        const l = s.liquid;
        // Refrozen ice and resolidified chocolate form a puck, never regain
        // their original manufactured cubes, block or chocolate segmentation.
        const reformed = s.transformedOnce;
        m.solids.visible = !reformed && l < .998;
        // A melting solid sags vertically before it disappears. The puddle
        // spreads across the dish rather than simply fading into a tall puck.
        const remaining = Math.max(.001, 1 - l);
        if (d.id === 'ice') m.solids.scale.setScalar(Math.cbrt(remaining));
        else m.solids.scale.set(Math.pow(remaining, .18), Math.pow(remaining, 1.15), Math.pow(remaining, .18));
        m.pool.visible = d.id==='ice' ? l>.002 : l > .002 || reformed;
        // Start with a broad, thin meniscus around the solid. A tiny central
        // cylinder would stay hidden beneath the chocolate until it vanished.
        const spread = reformed ? 1 : Math.min(1, .65 + .35 * Math.sqrt(l));
        const liquidHeight = d.id==='ice' && reformed ? l : reformed ? 1 : Math.max(.025, l / (spread * spread));
        m.pool.scale.set(spread, liquidHeight, spread);
        m.pool.position.y = .14 + m.depth * liquidHeight / 2;
        if(m.refrozen){m.refrozen.visible=reformed&&l<.998;m.refrozen.scale.y=Math.max(.005,1-l);m.refrozen.position.y=.14+m.depth*l;}
        const solid = new THREE.Color(d.id === 'ice' ? '#91c9dc' : d.color);
        const liquid = new THREE.Color(d.id === 'ice' ? '#579ebd' : d.color).multiplyScalar(d.id === 'ice' ? 1 : .82);
        m.pool.material.color.copy(solid).lerp(liquid, l);
        m.pool.material.roughness = .045 + (1 - l) * .4;
        m.pool.material.clearcoat = .08 + l * .85;
        m.pool.material.envMapIntensity = d.id === 'chocolate' ? .3 : .8;
        m.pool.material.opacity = d.id === 'ice' ? .82 - l * .16 : 1;
      } else if (d.kind === 'cook') {
        m.gel.visible = s.cooked > .001; m.pool.visible = s.cooked < .999;
        m.gel.scale.y = .12 + s.cooked * .2; m.gel.material.transparent = true; m.gel.material.opacity = s.cooked;
        m.pool.material.opacity = (.72 + s.frozen*.28) * (1 - s.cooked);
        m.pool.material.color.set('#d4c48d').lerp(new THREE.Color('#c5dcd9'),s.frozen);
        m.pool.material.roughness=.065+s.frozen*.45;m.pool.material.transmission=.12*(1-s.frozen);
        m.gel.material.color.set('#f5f3e9').lerp(new THREE.Color('#d8e9ec'),s.frozen*.45);
        m.gel.scale.x = m.gel.scale.z = 1 - Math.min(.1, Math.max(0, s.elapsed - 1300) / 20000 * s.cooked);
      } else {
        m.gel.material.color.set('#fff0cc').lerp(new THREE.Color('#a85b25'), s.cooked * .8);
      }
      const fluid=d.kind==='melt'?s.liquid:d.kind==='cook'?(1-s.cooked)*(1-s.frozen):0;
      const velocityX=dt?(m.group.position.x-m.previousPosition.x)/dt:0;
      const velocityZ=dt?(m.group.position.z-m.previousPosition.z)/dt:0;
      const velocityY=dt?(m.group.position.y-m.previousPosition.y)/dt:0;
      m.slosh.step(dt,velocityX,velocityZ,fluid,['egg','chocolate'].includes(d.id),this.reduced,velocityY);
      m.previousPosition.copy(m.group.position);
      if(m.pool.visible || m.surfaceRange>.00001) m.surfaceRange=deformSurface(m.pool.geometry,m.originalSurface,m.depth,m.slosh,this.elapsed,fluid);
      for(const shine of m.reflections) {
        shine.visible=fluid>.01;
        const attribute=shine.geometry.getAttribute('position');
        shine.userData.points.forEach((point,i)=>attribute.setXYZ(i,point.x,m.depth/2+.006+m.slosh.height(point.x,point.z,this.elapsed)*fluid,point.z));
        attribute.needsUpdate=true;shine.material.opacity=d.id==='chocolate'?.16:d.id==='egg'?.48:.5;
      }
    }
    for (const [id, object] of Object.entries(this.stationObjects)) {
      // Keep the complete station arrangement visible on phones.
      object.scale.setScalar(this.portrait ? .85 : 1);
      object.position.x = this.portrait ? stations[id][0] * .82 : stations[id][0];
      if (id === 'heat') {
        const toasting = this.simulation.samples.bread.location === 'heat';
        const charcoal=this.simulation.samples.charcoal,combusting=charcoal.location==='heat';
        object.userData.bath.visible = !toasting&&!combusting; object.userData.toaster.visible = toasting;object.userData.furnace.visible=combusting;
        object.userData.flames.forEach((flame,i)=>{flame.visible=combusting&&!charcoal.held&&charcoal.burned<.999;flame.scale.y=this.reduced?1:1+.12*Math.sin(this.elapsed*11+i);});
      }
      if (object.userData.fan && !this.reduced && Object.values(this.simulation.samples).some(s=>s.location==='cool')) object.userData.fan.rotation.y += dt*10;
      if(object.userData.mist) object.userData.mist.update(this.elapsed,this.reduced,Object.values(this.simulation.samples).some(s=>s.location==='freeze'));
    }
    this.controls.update(); if (!this.contextLost) this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.observer.disconnect(); this.controls.dispose(); this.environment.dispose();
    this.scene.traverse(o => { o.geometry?.dispose(); const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const m of mats) { m?.map?.dispose(); m?.dispose(); } });
    this.renderer.dispose();
  }
}
