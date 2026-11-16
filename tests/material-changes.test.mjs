import test from 'node:test';
import assert from 'node:assert/strict';
import { ChangeSimulation, stateKey } from '../science-lab-app/material-changes/simulation.js';
import { MATERIALS, RECORD_CHOICES, recordChoiceText } from '../science-lab-app/material-changes/data.js';
import { SurfaceMotion, liquidMeshData, deformSurface } from '../science-lab-app/material-changes/surface-motion.js';
import { charcoalGeometry,ashMoundGeometry,ashPoint } from '../science-lab-app/material-changes/charcoal-geometry.js';
import { pickSample } from '../science-lab-app/material-changes/sample-picking.js';
import { createRequire } from 'node:module';
const THREE=createRequire(new URL('../science-lab-app/material-changes/scene.js',import.meta.url))('three');

test('Water does not refreeze at room temperature; freezing requires time below 0°C', () => {
  const sim = new ChangeSimulation(); sim.move('ice', 'heat'); sim.tick(1800);
  assert.equal(sim.samples.ice.liquid, 1); assert.equal(sim.samples.ice.heated, true);
  sim.move('ice', 'cool'); sim.tick(1800);
  assert.equal(sim.samples.ice.liquid, 1); assert.equal(sim.canRecord('ice'), false);
  sim.move('ice', 'freeze'); sim.tick(1);
  assert.equal(sim.canRecord('ice'), false, 'Moving to a freezer is not instant freezing');
  sim.tick(2400); assert.equal(sim.samples.ice.liquid, 0); assert.equal(sim.canRecord('ice'), true);
});
test('Cold cooked egg remains cooked, including after a freezer and return to 20°C', () => {
  const sim = new ChangeSimulation(); sim.move('egg', 'heat'); sim.tick(2400);
  sim.move('egg', 'freeze'); sim.tick(1800); assert.equal(sim.samples.egg.cooked, 1);
  assert.equal(sim.canRecord('egg'), true, 'Freezing is now a valid observed cooling route');
  assert.equal(stateKey(sim.samples.egg),'frozenCookedEgg');
  assert.equal(sim.samples.egg.cold.location,'freeze');
  assert.ok(sim.samples.egg.cold.temperature <= -10.5);
  sim.move('egg', 'cool'); sim.tick(1800);
  assert.equal(stateKey(sim.samples.egg), 'cookedEgg'); assert.equal(sim.canRecord('egg'), true);
});
test('Raw egg white freezes and thaws without inventing heat coagulation',()=>{
  const sim=new ChangeSimulation();sim.move('egg','freeze');sim.tick(2400);
  assert.equal(sim.samples.egg.frozen,1);assert.equal(stateKey(sim.samples.egg),'frozenRawEgg');
  assert.equal(sim.samples.egg.cooked,0);assert.equal(sim.canRecord('egg'),false);
  sim.move('egg','cool');sim.tick(2400);
  assert.equal(sim.samples.egg.frozen,0);assert.equal(stateKey(sim.samples.egg),'rawEgg');
  sim.move('egg','heat');sim.tick(2400);assert.equal(sim.samples.egg.cooked,1);
});
test('Every material accepts freezing and records the actual route, not an invented 20°C',()=>{
  const sim=new ChangeSimulation();
  for(const d of MATERIALS){
    sim.move(d.id,'heat');sim.tick(2400);sim.move(d.id,'freeze');sim.tick(3000);
    assert.equal(sim.canRecord(d.id),true,d.id);assert.equal(sim.samples[d.id].cold.location,'freeze');
    assert.ok(sim.samples[d.id].cold.temperature <= -10.5,d.id);
    assert.equal(sim.record(d.id,sim.expected(d.id)).ok,true,d.id);
  }
});
test('Each record answer is assessed separately and checking does not save or unlock',()=>{
  const sim=new ChangeSimulation();sim.move('ice','heat');sim.tick(2400);sim.move('ice','freeze');sim.tick(2400);
  const result=sim.assess('ice',{hot:'liquidChoice',cold:'staysLiquid',verdict:'irreversible'});
  assert.deepEqual(result.fields,{hot:true,cold:false,verdict:false});assert.equal(result.ok,false);
  assert.equal(sim.samples.ice.record,null);assert.equal(sim.activeId,'ice');
  assert.equal(sim.assess('ice',sim.expected('ice')).ok,true);assert.equal(sim.activeId,'ice');
});
test('Liquid mesh contains interior waves, conserves mean surface height and leaves its base fixed',()=>{
  const data=liquidMeshData(.625,.53,.26),original=Float32Array.from(data.positions),current=original.slice();
  assert.ok(data.topCount>1000);
  const geometry={userData:{topCount:data.topCount},getAttribute:()=>({count:current.length/3,setY:(i,y)=>{current[i*3+1]=y;}}),computeVertexNormals(){}};
  const motion=new SurfaceMotion();motion.impulse(1,.7);motion.step(.12,2,-1,1);
  assert.ok(deformSurface(geometry,original,.26,motion,.3,1)>.04);
  let weighted=0,total=0,interiorWave=false;
  for(let i=0;i<data.topCount;i++){
    const x=original[i*3],z=original[i*3+2],weight=Math.max(.001,Math.hypot(x,z));
    weighted+=(current[i*3+1]-.13)*weight;total+=weight;
    if(Math.hypot(x,z)<.4 && Math.abs(current[i*3+1]-.13)>.002)interiorWave=true;
  }
  assert.ok(interiorWave);assert.ok(Math.abs(weighted/total)<.00001);
  for(let i=data.topCount;i<current.length/3;i++)if(original[i*3+1]<0)assert.equal(current[i*3+1],original[i*3+1]);
});
test('Browning never decreases when toast cools', () => {
  const sim = new ChangeSimulation(); sim.move('bread', 'heat'); sim.tick(2000);
  const browned = sim.samples.bread.cooked;
  sim.move('bread', 'cool'); sim.tick(2400);
  assert.equal(browned, 1); assert.equal(sim.samples.bread.cooked, browned);
  assert.equal(stateKey(sim.samples.bread), 'toasted');
});
test('A freely chosen material locks the next material until its record is complete', () => {
  const sim = new ChangeSimulation(); sim.move('bread', 'heat'); sim.tick(800);
  const browned = sim.samples.bread.cooked;
  assert.equal(sim.activeId,'bread');assert.equal(sim.isSelectable('charcoal'),false);
  assert.throws(()=>sim.move('chocolate','heat'),/record first/);
  assert.equal(sim.samples.bread.location, 'heat'); assert.equal(sim.samples.bread.cooked, browned);
  assert.equal(sim.samples.charcoal.visits, 0); assert.equal(sim.samples.charcoal.temperature, 20);
  sim.move('bread','cool');sim.tick(2400);
  assert.equal(sim.isSelectable('charcoal'),false,'Finishing cooling alone must not unlock the next material');
  assert.equal(sim.record('bread',sim.expected('bread')).ok,true);
  assert.equal(sim.activeId,null);assert.equal(sim.isSelectable('charcoal'),true);
  sim.move('charcoal','heat');assert.equal(sim.activeId,'charcoal');
});
test('An early interrupted change does not produce completed evidence', () => {
  const sim = new ChangeSimulation(); sim.move('charcoal', 'heat'); sim.tick(15);
  sim.move('charcoal', 'cool'); sim.tick(1800); assert.equal(sim.canRecord('charcoal'), false);
  assert.equal(sim.record('charcoal', sim.expected('charcoal')).ok, false);
});
test('Latent heat produces a genuine melting plateau rather than an instant swap', () => {
  const sim = new ChangeSimulation(); sim.move('ice', 'heat');
  let partial;
  for (let i = 0; i < 1000; i++) { sim.tick(1); if (sim.samples.ice.liquid > .1 && sim.samples.ice.liquid < .9) { partial = { ...sim.samples.ice }; break; } }
  assert.ok(partial); assert.equal(partial.temperature, 0); assert.equal(partial.heated, false);
});
for (const id of ['chocolate', 'butter']) test(`${id}: melting can be reversed and repeated without new material`, () => {
  const sim = new ChangeSimulation(); sim.move(id, 'heat'); sim.tick(2400);
  assert.equal(sim.samples[id].liquid, 1);
  sim.move(id, 'cool'); sim.tick(2400); assert.equal(sim.samples[id].liquid, 0);
  assert.equal(sim.canRecord(id), true); assert.equal(sim.record(id, sim.expected(id)).ok, true);
  sim.move(id, 'heat'); sim.tick(2400); assert.equal(sim.samples[id].liquid, 1);
  assert.equal(sim.samples[id].cycles, 1);
  assert.equal(sim.samples[id].transformedOnce,true,'Repeating heating must not recreate the original manufactured shape');
});
test('A conclusion needs both reversible and irreversible evidence, not three similar samples', () => {
  const sim = new ChangeSimulation();
  for (const id of ['ice', 'butter', 'chocolate']) {
    sim.move(id, 'heat'); sim.tick(2400); sim.move(id, id==='ice'?'freeze':'cool'); sim.tick(2400); sim.record(id, sim.expected(id));
  }
  assert.equal(sim.canAnalyse(), false);
  sim.move('egg', 'heat'); sim.tick(2400); sim.move('egg', 'cool'); sim.tick(2400); sim.record('egg', sim.expected('egg'));
  assert.equal(sim.canAnalyse(), true);
});
test('Incorrect claims cannot become evidence; fresh samples clear only their own records', () => {
  const sim = new ChangeSimulation();
  sim.move('egg', 'heat');sim.tick(2400);sim.move('egg','cool');sim.tick(2400);
  assert.equal(sim.record('egg', { hot: 'setChoice', cold: 'rawChoice', verdict: 'reversible' }).ok, false);
  assert.equal(sim.activeId,'egg');assert.equal(sim.record('egg', sim.expected('egg')).ok, true);
  sim.move('charcoal','heat');sim.tick(2400);sim.move('charcoal','cool');sim.tick(2400);assert.equal(sim.record('charcoal',sim.expected('charcoal')).ok,true);
  sim.reset('egg'); assert.equal(sim.samples.egg.record, null); assert.ok(sim.samples.charcoal.record);
});
test('Integration is independent of animation-frame chunks', () => {
  const a = new ChangeSimulation(), b = new ChangeSimulation(); a.move('egg', 'heat'); b.move('egg', 'heat');
  a.tick(900); for (let i = 0; i < 900; i++) b.tick(1);
  assert.equal(a.samples.egg.temperature, b.samples.egg.temperature); assert.equal(a.samples.egg.cooked, b.samples.egg.cooked);
});
test('Every declared material can complete its intended experiment', () => {
  const sim = new ChangeSimulation();
  for (const d of MATERIALS) {
    sim.move(d.id, 'heat'); sim.tick(2400); sim.move(d.id, d.id === 'ice' ? 'freeze' : 'cool'); sim.tick(2400);
    assert.equal(sim.canRecord(d.id), true, d.id); assert.equal(sim.record(d.id, sim.expected(d.id)).ok, true, d.id);
  }
  assert.equal(sim.records().length, 6);
});
test('Ice melts progressively for about two visible seconds at the default time scale',()=>{
  const sim=new ChangeSimulation();sim.move('ice','heat');
  while(sim.samples.ice.liquid===0)sim.tick(1);
  let duration=0;while(sim.samples.ice.liquid<1){sim.tick(1);duration++;}
  assert.ok(Math.abs(duration/90-2)<.03);
});
test('Raw liquids slosh after a motion impulse, settle, and solids do not slosh',()=>{
  const motion=new SurfaceMotion();motion.impulse(.5,.25);
  for(let i=0;i<20;i++)motion.step(1/60,0,0,1,true,false);
  assert.ok(motion.energy>.001);assert.ok(Math.abs(motion.height(.4,.3,.5))>.001);
  for(let i=0;i<1000;i++)motion.step(1/60,0,0,1,true,false);
  assert.ok(motion.energy<.00001);
  motion.impulse();motion.step(1/60,0,0,0,false,false);assert.equal(motion.energy,0);
  motion.impulse();motion.step(1/60,0,0,1,false,true);assert.equal(motion.energy,0);
});
test('Every sample has relevant bilingual record options and keeps valid answer values',()=>{
  const sim=new ChangeSimulation();
  for(const d of MATERIALS){
    const choices=RECORD_CHOICES[d.id];
    for(const group of ['hot','cold']){
      assert.equal(choices[group].length,3);
      assert.equal(new Set(choices[group].map(c=>c.value)).size,3);
      const answer=sim.expected(d.id)[group];assert.ok(choices[group].some(c=>c.value===answer));
      for(const option of choices[group]){
        assert.ok(option.label[0]&&option.label[1]);
        if(d.id!=='egg')for(const label of option.label)assert.doesNotMatch(label,/蛋白|egg white/i);
        if(d.id!=='bread')for(const label of option.label)assert.doesNotMatch(label,/麵包|多士|bread|toast/i);
      }
      for(const lang of ['zh','en'])assert.ok(recordChoiceText(d.id,answer,lang).length>3);
    }
  }
  assert.equal(recordChoiceText('ice','solidChoice','zh'),'水重新凝固成冰');
});
test('Picking up or taking a sample off any station holds its exact thermal state',()=>{
  for(const id of ['ice','egg','chocolate'])for(const station of ['heat','cool','freeze']){
    const sim=new ChangeSimulation();sim.move(id,'heat');sim.tick(200);
    sim.move(id,station);sim.tick(30);sim.hold(id,true);
    const held=structuredClone(sim.samples[id]);sim.tick(1200);
    assert.deepEqual(sim.samples[id],held,`${id}: holding above ${station}`);
    sim.move(id,'bench');const bench=structuredClone(sim.samples[id]);sim.tick(1800);
    assert.deepEqual(sim.samples[id],bench,`${id}: on bench`);
    sim.move(id,station);sim.tick(1200);assert.notEqual(sim.samples[id].elapsed,bench.elapsed);
  }
});
test('Automatic questions follow observed changes and keep the next material locked until the verdict',()=>{
  const sim=new ChangeSimulation();assert.equal(sim.questionStage('ice'),null);
  assert.equal(sim.observe('ice','hot','liquidChoice').ok,false);
  sim.move('ice','heat');sim.tick(2400);assert.equal(sim.questionStage('ice'),'hot');
  assert.equal(sim.observe('ice','hot','unchanged').ok,false);assert.equal(sim.samples.ice.observations.hot,null);
  assert.equal(sim.observe('ice','hot','liquidChoice').ok,true);assert.equal(sim.questionStage('ice'),null);
  assert.equal(sim.activeId,'ice');sim.move('ice','freeze');sim.tick(2400);
  assert.equal(sim.questionStage('ice'),'cold');assert.equal(sim.observe('ice','cold','solidChoice').ok,true);
  assert.equal(sim.questionStage('ice'),'verdict');assert.equal(sim.activeId,'ice');
  assert.equal(sim.record('ice',{...sim.samples.ice.observations,verdict:'irreversible'}).ok,false);
  assert.equal(sim.record('ice',{...sim.samples.ice.observations,verdict:'reversible'}).ok,true);
  assert.equal(sim.questionStage('ice'),null);assert.equal(sim.activeId,null);
  sim.move('ice','freeze');assert.equal(sim.activeId,null,'Re-inspecting a recorded sample must not lock the next material');
  sim.move('ice','heat');assert.deepEqual(sim.samples.ice.observations,{hot:null,cold:null});
});
test('Surface motion responds to lift and directional acceleration, then settles while held still',()=>{
  const motion=new SurfaceMotion();motion.liftImpulse();motion.step(.1,0,0,1,false,false,1.8);
  assert.ok(Math.abs(motion.radial)>.001);
  const right=new SurfaceMotion();right.step(.1,2,0,1);assert.ok(right.x<0,'Liquid lags behind a rightward acceleration');
  const left=new SurfaceMotion();left.step(.1,-2,0,1);assert.ok(left.x>0);
  motion.step(.1,3,1,1,false,false,0);assert.ok(motion.energy>.001);
  for(let i=0;i<900;i++)motion.step(1/60,0,0,1);assert.ok(motion.energy<.000001);
});
test('Charcoal burns progressively in the supplied-air furnace and never melts',()=>{
  const sim=new ChangeSimulation();sim.move('charcoal','heat');sim.tick(50);
  assert.equal(sim.samples.charcoal.burned,0);assert.equal(sim.samples.charcoal.heated,false);
  sim.tick(150);const partial=sim.samples.charcoal.burned;
  assert.ok(partial>0 && partial<1);assert.equal(stateKey(sim.samples.charcoal),'charcoalBurning');
  assert.equal(sim.samples.charcoal.liquid,0);assert.equal(sim.samples.charcoal.cooked,0);
  sim.hold('charcoal',true);sim.tick(1000);assert.equal(sim.samples.charcoal.burned,partial);
  sim.move('charcoal','heat');sim.tick(1800);assert.equal(sim.samples.charcoal.burned,1);
  assert.equal(stateKey(sim.samples.charcoal),'charcoalAsh');assert.equal(sim.questionStage('charcoal'),'hot');
});
test('Ash stays ash after cooling, freezing and reheating; fresh sample alone restores charcoal',()=>{
  const sim=new ChangeSimulation();sim.move('charcoal','heat');sim.tick(2400);
  for(const station of ['cool','freeze','heat']){sim.move('charcoal',station);sim.tick(2400);assert.equal(sim.samples.charcoal.burned,1);assert.equal(sim.samples.charcoal.liquid,0);assert.equal(stateKey(sim.samples.charcoal),'charcoalAsh');}
  sim.move('charcoal','cool');sim.tick(2400);
  assert.deepEqual(sim.expected('charcoal'),{hot:'ashChoice',cold:'ashRemains',verdict:'irreversible'});
  assert.equal(sim.record('charcoal',{hot:'ashChoice',cold:'charcoalReturns',verdict:'reversible'}).ok,false);
  assert.equal(sim.record('charcoal',sim.expected('charcoal')).ok,true);
  const record=structuredClone(sim.samples.charcoal.record);sim.move('charcoal','heat');sim.tick(1000);
  assert.equal(sim.samples.charcoal.burned,1);assert.deepEqual(sim.samples.charcoal.record,record);assert.equal(sim.activeId,null);
  sim.reset('charcoal');assert.equal(sim.samples.charcoal.burned,0);assert.equal(stateKey(sim.samples.charcoal),'charcoalSolid');
});
test('Charcoal is an irreversible comparison for the three-material analysis',()=>{
  const sim=new ChangeSimulation();
  for(const id of ['butter','chocolate','charcoal']){sim.move(id,'heat');sim.tick(2400);sim.move(id,'cool');sim.tick(2400);sim.record(id,sim.expected(id));}
  assert.equal(sim.canAnalyse(),true);
  assert.equal(MATERIALS.some(d=>d.id==='wax'),false);
  assert.match(recordChoiceText('charcoal','ashChoice','zh'),/灰/);
  assert.doesNotMatch(recordChoiceText('charcoal','ashChoice','zh'),/蠟/);
});
function assertClosedSolid(geometry) {
  assert.ok(geometry.index,'A welded indexed surface is required');
  const p=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),edges=new Map();let volume=0;
  const positions=new Set();
  for(let i=0;i<p.count;i++) {
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(6)).join(',');
    assert.equal(positions.has(key),false,'Shared geometric corners must be welded');positions.add(key);
    for(const value of [p.getX(i),p.getY(i),p.getZ(i),normal.getX(i),normal.getY(i),normal.getZ(i)])assert.ok(Number.isFinite(value));
  }
  const indices=geometry.index.array;
  for(let i=0;i<indices.length;i+=3){
    const [a,b,c]=indices.slice(i,i+3);
    for(const [u,v] of [[a,b],[b,c],[c,a]]){
      const key=u<v?`${u},${v}`:`${v},${u}`,entry=edges.get(key)??{count:0,direction:0};entry.count++;entry.direction+=u<v?1:-1;edges.set(key,entry);
    }
    volume+=(p.getX(a)*(p.getY(b)*p.getZ(c)-p.getZ(b)*p.getY(c))+p.getY(a)*(p.getZ(b)*p.getX(c)-p.getX(b)*p.getZ(c))+p.getZ(a)*(p.getX(b)*p.getY(c)-p.getY(b)*p.getX(c)))/6;
  }
  for(const edge of edges.values()){assert.equal(edge.count,2,'Every edge must have two neighbouring faces, with no holes');assert.equal(edge.direction,0,'Neighbouring faces must have consistent outward winding');}
  assert.ok(volume>.0001,'A solid must enclose positive volume');
}
test('All charcoal chunks are closed solids, without separated triangle seams',()=>{
  for(let i=0;i<3;i++){const geometry=charcoalGeometry(.25,i);assertClosedSolid(geometry);geometry.dispose();}
});
test('Ash is a closed irregular powder mound, not a flat circular wafer',()=>{
  const geometry=ashMoundGeometry();assertClosedSolid(geometry);
  const outline=Array.from({length:40},(_,i)=>ashPoint(1,i/40*Math.PI*2));
  const radii=outline.map(p=>Math.hypot(p.x,p.z));assert.ok(Math.max(...radii)-Math.min(...radii)>.08);
  assert.ok(ashPoint(0,0).y>.06);assert.ok(outline.every(p=>p.y<.005));geometry.dispose();
});
test('Picking a rear sample ignores a front reflection line even within Three.js default line tolerance',()=>{
  const rear=new THREE.Group(),front=new THREE.Group();
  const solid=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());solid.position.z=-2;rear.add(solid);
  const reflection=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(.7,-.4,0),new THREE.Vector3(.7,.4,0)]),new THREE.LineBasicMaterial());front.add(reflection);
  rear.updateMatrixWorld(true);front.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,0,5),new THREE.Vector3(0,0,-1));
  assert.equal(ray.intersectObjects([front,rear],true)[0].object,reflection,'Reproduces the previous wrong foreground selection');
  assert.equal(pickSample(ray,{egg:{group:front},charcoal:{group:rear}}).id,'charcoal');
});
test('Picking skips hidden ancestors and invisible helper meshes, but keeps the explicit vessel grab volume',()=>{
  const front=new THREE.Group(),rear=new THREE.Group(),hidden=new THREE.Group();hidden.visible=false;front.add(hidden);
  const invisible=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());hidden.add(invisible);
  const helper=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({transparent:true,opacity:0,colorWrite:false}));front.add(helper);
  const pick=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({transparent:true,opacity:0,colorWrite:false}));pick.position.z=-2;rear.add(pick);
  front.updateMatrixWorld(true);rear.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,0,5),new THREE.Vector3(0,0,-1));
  assert.equal(pickSample(ray,{bread:{group:front},chocolate:{group:rear,pick}}).id,'chocolate');
  hidden.visible=true;assert.equal(pickSample(ray,{bread:{group:front},chocolate:{group:rear,pick}}).id,'bread','A genuinely visible foreground solid still wins');
  front.visible=false;assert.equal(pickSample(ray,{bread:{group:front},chocolate:{group:rear,pick}}).id,'chocolate');
  rear.visible=false;assert.equal(pickSample(ray,{bread:{group:front},chocolate:{group:rear,pick}}),null);
});
test('Platform checkpoints restore an interrupted material, its observations and the active-material lock',()=>{
  const sim=new ChangeSimulation();sim.move('ice','heat');sim.tick(2400);sim.observe('ice','hot','liquidChoice');
  sim.move('ice','freeze');sim.tick(150);const saved=sim.serialize(),restored=new ChangeSimulation();
  assert.equal(restored.restore(saved),true);assert.deepEqual(restored.serialize(),saved);
  assert.equal(restored.activeId,'ice');assert.equal(restored.samples.ice.observations.hot,'liquidChoice');
  assert.equal(restored.isSelectable('charcoal'),false);
  restored.tick(2400);assert.equal(restored.questionStage('ice'),'cold');
});
test('A platform checkpoint never resumes a dangling pointer grab or recreates fuel from ash',()=>{
  const sim=new ChangeSimulation();sim.move('charcoal','heat');sim.tick(2400);sim.hold('charcoal',true);
  const restored=new ChangeSimulation();restored.restore(sim.serialize());
  assert.equal(restored.samples.charcoal.held,false);assert.equal(restored.samples.charcoal.location,'bench');assert.equal(restored.samples.charcoal.burned,1);
  restored.tick(2400);assert.equal(restored.samples.charcoal.burned,1);
  const invalid=new ChangeSimulation();assert.equal(invalid.restore({version:999}),false);assert.equal(invalid.activeId,null);
});
test('Completed platform evidence survives a reload with the same analysis eligibility',()=>{
  const sim=new ChangeSimulation();
  for(const id of ['charcoal','butter','chocolate']){sim.move(id,'heat');sim.tick(2400);sim.move(id,'cool');sim.tick(2400);sim.record(id,sim.expected(id));}
  const restored=new ChangeSimulation();restored.restore(JSON.parse(JSON.stringify(sim.serialize())));
  assert.equal(restored.canAnalyse(),true);assert.deepEqual(restored.records(),sim.records());
});
