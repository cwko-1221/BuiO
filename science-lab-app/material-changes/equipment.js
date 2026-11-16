import * as THREE from 'three';

// Detailed apparatus stays in the view layer. Heating/cooling rules are owned
// by simulation.js, not by these meshes or the ornamental instrument displays.
export function buildStation(id, p) {
  const { box, disc, ring, sphere, mesh, material } = p;
  const g = new THREE.Group();
  const metal = '#b4c4cb', navy = '#294b60', white = '#edf1ef';
  const add = (object, x, y, z, parent = g) => { object.position.set(x, y, z); parent.add(object); return object; };
  const screw = (x, y, z, parent = g) => {
    const s = add(disc(.035, .015, '#637d8b', { metalness: .7, roughness: .2 }), x, y, z, parent);
    return s;
  };
  for (const x of [-1, 1]) for (const z of [-.65, .65]) add(disc(.12, .09, '#3a4b52'), x, .04, z);
  if (id === 'heat') {
    // A rounded stainless tank with a visible water reservoir and an immersion
    // probe. The separate toaster module replaces it only for the bread trial.
    const bath = new THREE.Group(); g.add(bath); g.userData.bath = bath;
    add(box(2.65, .55, 1.95, metal, .16, { metalness: .65, roughness: .27 }), 0, .35, 0, bath);
    add(box(2.45, .13, 1.73, '#435e6b', .12, { metalness: .5, roughness: .3 }), 0, .68, 0, bath);
    add(box(2.22, .07, 1.45, '#73b4c9', .12, { roughness: .12, transparent: true, opacity: .78 }), 0, .77, 0, bath);
    for (const x of [-1.2, 1.2]) add(box(.13, .34, 1.78, '#d8e2e5', .045, { metalness: .65, roughness: .22 }), x, .79, 0, bath);
    for (const z of [-.85, .85]) add(box(2.45, .34, .13, '#d8e2e5', .045, { metalness: .65, roughness: .22 }), 0, .79, z, bath);
    // The front inspection window makes the water level and lower dish visible.
    add(box(1.62, .23, .027, '#95d0e1', .025, { transparent: true, opacity: .48, roughness: .08, metalness: .05 }), 0, .77, .928, bath);
    for (const x of [-1.42, 1.42]) {
      add(box(.18, .11, .68, navy, .06, { roughness: .45 }), x, .76, 0, bath);
      add(box(.19, .07, .48, '#d8e3e7', .03, { metalness: .6 }), x, .84, 0, bath);
    }
    add(box(.62, 1.25, .48, navy, .09, { roughness: .39 }), .95, 1.24, -.82, bath);
    add(box(.49, .29, .025, '#162f3b', .025, { roughness: .18 }), .95, 1.5, -.563, bath);
    // Instrument light bars are purely ornamental; precise readings are HTML.
    for (let i = 0; i < 3; i++) add(box(.08, .12, .014, '#a8dfd2', .01, { emissive: '#a8dfd2', emissiveIntensity: .4 }), .81 + i * .13, 1.5, -.542, bath);
    const knob = add(disc(.12, .08, '#d3e0e5', { metalness: .6, roughness: .2 }), .95, 1.12, -.55, bath); knob.rotation.x = Math.PI / 2;
    add(box(.7, .07, .07, '#94acb6', .025, { metalness: .75 }), .31, 1.48, -.82, bath);
    add(disc(.033, .78, '#d8e1e5', { metalness: .8, roughness: .18 }), -.02, 1.09, -.82, bath);
    for (const x of [-.97, .97]) screw(x, .98, .85, bath);
    const toaster = new THREE.Group(); g.add(toaster); g.userData.toaster = toaster; toaster.visible = false;
    add(box(2.65, .55, 1.95, '#778d99', .16, { metalness: .55, roughness: .25 }), 0, .35, 0, toaster);
    add(box(2.42, .12, 1.68, '#283e4c', .08), 0, .7, 0, toaster);
    add(box(2.47, 1.0, .17, '#b5c6ce', .07, { metalness: .7, roughness: .23 }), 0, 1.15, -.82, toaster);
    add(box(2.1, .7, .03, '#20323f', .04), 0, 1.15, -.715, toaster);
    for (let i = 0; i < 9; i++) add(box(2.1, .025, .025, '#a7b7bc', .008, { metalness: .8, roughness: .2 }), 0, .8, -.6 + i * .15, toaster);
    for (let i = 0; i < 3; i++) add(box(1.85, .025, .04, '#d68d52', .01, { emissive: '#dc7033', emissiveIntensity: .7 }), 0, .88 + i * .22, -.68, toaster);
    add(box(.58, .32, .07, navy, .04), .92, .36, .99, toaster);
    const dial = add(disc(.1, .06, '#d8e4e8', { metalness: .65 }), .92, .36, 1.045, toaster); dial.rotation.x = Math.PI / 2;
    // A dedicated ventilated combustion furnace, with refractory lining and
    // burner below the ceramic crucible. It never burns charcoal in water.
    const furnace=new THREE.Group();g.add(furnace);g.userData.furnace=furnace;furnace.visible=false;
    add(box(2.65,.48,1.95,navy,.14,{metalness:.45,roughness:.35}),0,.3,0,furnace);
    add(box(2.35,.15,1.65,'#b3aca0',.06,{roughness:.95}),0,.6,0,furnace);
    add(box(2.35,.9,.16,'#c3bbac',.05,{roughness:.95}),0,1.1,-.76,furnace);
    for(const x of [-1.1,1.1])add(box(.16,.88,1.6,'#c3bbac',.05,{roughness:.95}),x,1.08,0,furnace);
    for(let i=0;i<7;i++)add(box(.055,.055,1.3,'#454b50',.01,{metalness:.7,roughness:.6}),-.67+i*.22,.78,0,furnace);
    add(box(2.4,.16,.44,navy,.06,{metalness:.45}),0,1.68,-.69,furnace);
    add(box(.7,.55,.38,'#465968',.06,{metalness:.55}),0,1.98,-.74,furnace);
    for(let i=0;i<5;i++)add(box(.09,.025,.024,'#182d39',.004),-.24+i*.12,1.99,-.537,furnace);
    add(box(.62,.24,.04,'#142f3c',.03),.65,.3,.994,furnace);
    for(let i=0;i<3;i++)add(box(.07,.08,.015,'#e5ad6c',.005,{emissive:'#e5ad6c',emissiveIntensity:.4}),.5+i*.13,.3,1.025,furnace);
    const flames=[];
    for(let i=0;i<6;i++){
      const flame=add(mesh(new THREE.ConeGeometry(.055,.23,12),new THREE.MeshBasicMaterial({color:'#83cff7',transparent:true,opacity:.75,depthWrite:false})),Math.cos(i*Math.PI/3)*.42,.64,Math.sin(i*Math.PI/3)*.42,furnace);
      flames.push(flame);
    }
    g.userData.flames=flames;
  } else if (id === 'cool') {
    // Finned aluminium heat sink and a real, caged axial fan, rather than a
    // coloured rectangle that could be mistaken for a second heater.
    add(box(2.55, .46, 1.9, navy, .15, { roughness: .38 }), 0, .31, 0);
    add(box(2.46, .085, 1.82, '#c6d5dc', .1, { metalness: .7, roughness: .25 }), 0, .59, 0);
    for (let i = 0; i < 12; i++) add(box(.055, .25, 1.45, '#a7bec9', .012, { metalness: .7, roughness: .24 }), -1.05 + i * .19, .75, -.05);
    add(disc(.98, .1, '#c0d3dc', { metalness: .65, roughness: .22 }), 0, .92, -.06);
    add(disc(.88, .035, '#e5eef0', { metalness: .3, roughness: .32 }), 0, .986, -.06);
    const blue = add(ring(.91, .025, '#6fa2bd'), 0, 1.01, -.06); blue.material.emissive.set('#567d98'); blue.material.emissiveIntensity = .2;
    const cage = new THREE.Group(); cage.position.set(0, .34, .99); cage.rotation.x = Math.PI / 2; g.add(cage);
    add(disc(.28, .08, '#152d3b'), 0, 0, 0, cage);
    const blades = new THREE.Group(); cage.add(blades); g.userData.fan = blades;
    for (let i = 0; i < 5; i++) {
      const blade = box(.11, .016, .25, '#6d8c9e', .045, { metalness: .4 });
      blade.position.set(Math.sin(i * Math.PI * 2 / 5) * .11, .052, Math.cos(i * Math.PI * 2 / 5) * .11); blade.rotation.y = i * Math.PI * 2 / 5 + .45; blades.add(blade);
    }
    for (let i = 0; i < 4; i++) add(ring(.09 + i * .06, .008, '#afc5d0'), 0, .085, 0, cage);
    for (let i = 0; i < 4; i++) { const bar = box(.013, .012, .55, '#b8cbd4', .004); bar.position.y = .092; bar.rotation.y = i * Math.PI / 4; cage.add(bar); }
    add(sphere(.035, '#89d1b0', { emissive: '#89d1b0', emissiveIntensity: .5 }), .93, .34, 1.002);
    for (const x of [-1.08, 1.08]) screw(x, .64, .7);
  } else {
    // Insulated open-top freezer: deep liner, thick walls, glazing and a lid
    // raised on a hinge. The sample sits inside the cavity, not on a blue tile.
    add(box(2.72, .28, 2.02, navy, .12, { roughness: .4, metalness: .08 }), 0, .2, 0);
    add(box(2.28, .06, 1.62, '#d8edf2', .065, { roughness: .2 }), 0, .38, 0);
    for (const x of [-1.25, 1.25]) {
      add(box(.2, .92, 2.0, navy, .07, { roughness: .4 }), x, .82, 0);
      add(box(.07, .79, 1.62, '#e1f1f3', .025), x * .89, .86, 0);
    }
    add(box(2.4, .92, .18, navy, .07), 0, .82, -.93);
    add(box(2.2, .78, .06, '#e1f1f3', .025), 0, .87, -.8);
    add(box(2.45, .23, .16, navy, .06), 0, .43, .93);
    for (const x of [-1.13, 1.13]) add(box(.28, .68, .18, navy, .04), x, .89, .93);
    for (const z of [-.93, .93]) add(box(2.7, .12, .18, '#d9edf1', .06), 0, 1.28, z);
    for (const x of [-1.25, 1.25]) add(box(.2, .12, 1.86, '#d9edf1', .06), x, 1.28, 0);
    // Window and soft internal blue illumination give the dish a clear frame.
    add(box(1.95, .57, .035, '#a4d4e2', .055, { transparent: true, opacity: .3, roughness: .08, metalness: .1 }), 0, .85, 1.035);
    add(box(1.97, .035, .045, '#a7c4d0', .015, { metalness: .5 }), 0, 1.05, 1.06);
    const lidPivot = new THREE.Group(); lidPivot.position.set(0, 1.28, -.88); lidPivot.rotation.x = -1.12; g.add(lidPivot);
    add(box(2.72, .17, 1.94, '#cedee5', .13, { metalness: .25, roughness: .3 }), 0, 0, .87, lidPivot);
    add(box(2.36, .035, 1.62, '#718997', .07), 0, .105, .87, lidPivot);
    add(box(2.15, .035, 1.42, '#eaf2f2', .06), 0, .135, .87, lidPivot);
    add(box(.75, .12, .17, '#c3d8e1', .05, { metalness: .45 }), 0, -.1, 1.67, lidPivot);
    for (let i = 0; i < 9; i++) {
      const frost = box(.1 + (i % 3) * .03, .065, .09, '#ecfbff', .025, { roughness: .2, transparent: true, opacity: .85 });
      add(frost, -.88 + i * .22, 1.35, -.62); frost.rotation.y = i * .7;
    }
    for (const x of [-1.14, 1.14]) add(box(.25, .14, .18, '#819aa8', .04, { metalness: .6 }), x, 1.28, -.89);
    add(sphere(.04, '#8ed5e7', { emissive: '#8ed5e7', emissiveIntensity: .8 }), .95, .38, 1.033);
    g.userData.liner = true;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
    const ctx=canvas.getContext('2d'), gradient=ctx.createRadialGradient(32,32,0,32,32,32);
    gradient.addColorStop(0,'rgba(245,253,255,.95)');gradient.addColorStop(.4,'rgba(235,249,255,.45)');gradient.addColorStop(1,'rgba(230,247,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
    const texture=new THREE.CanvasTexture(canvas);const sprites=[];
    for(let i=0;i<16;i++){
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,color:'#c5dfef',transparent:true,opacity:0,depthWrite:false}));sprite.userData.phase=i/16;g.add(sprite);sprites.push(sprite);
    }
    g.userData.mist={sprites,update(time,reduced,active){
      for(let i=0;i<sprites.length;i++){
        const sprite=sprites[i], life=(time*.24+sprite.userData.phase)%1;
        sprite.visible=!reduced;
        sprite.position.set((i%2?1:-1)*(.66+life*.42)+Math.sin(i*2.37)*.12,1.27-life*.7,.72+life*1.15);
        const size=.4+life*1.05;sprite.scale.set(size,size*.54,1);
        sprite.material.opacity=Math.sin(life*Math.PI)*(active ? .4 : .25);
      }
    }};
  }
  const target = add(ring(1.03, .027, '#e9c078'), 0, id === 'freeze' ? 1.39 : id === 'cool' ? 1.04 : .97, 0);
  target.material.emissive.set('#e9c078'); target.material.emissiveIntensity = .45; target.visible = false; g.userData.dropTarget = target;
  return g;
}
