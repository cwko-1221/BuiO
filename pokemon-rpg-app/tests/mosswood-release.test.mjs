import test from 'node:test';
import assert from 'node:assert/strict';
import {MAP_ZONES,isPositionWalkable,getTallGrassAt,findNearestWalkablePosition,rollWildEncounter} from '../src/data/world.mjs';
import {PREMIUM_BRIDGE} from '../src/data/worldPremiumPrototype.mjs';

test('the bridge forest is a normal persistent region with arrivals, encounters and illustrated survey',()=>{
  const m=MAP_ZONES.mosswood;
  assert.equal(m.nameZh,'苔影森林');assert.equal(m.levelRange,'Lv. 6–12');
  assert.equal(m.renderProfile,'premium-crossing-v1');assert.equal(m.atlasArt,'atlas-mosswood-v3');
  assert.ok(m.portals.some(p=>p.targetZone==='meadow'));assert.ok(m.encounters.length>=6);
  assert.ok(m.tallGrass.length>=5);assert.ok(m.districts.length>=6);assert.ok(m.props.length>=50);
  assert.ok(!/試作|施工/.test(m.subtitleZh));assert.deepEqual(m.incompleteArt,[]);
  assert.ok(rollWildEncounter('mosswood',()=>.5));
  for(const p of PREMIUM_BRIDGE.centerline)assert.equal(isPositionWalkable(p.x,p.z,'mosswood'),true);
});

test('the main walking route stays encounter-free and old forest saves recover onto safe land',()=>{
  for(const road of MAP_ZONES.mosswood.roads)for(const p of road.points)assert.equal(getTallGrassAt(p.x,p.z,'mosswood'),null);
  for(const [x,z]of [[-40,-46],[-31,0],[31,16],[4,34],[20,-31],[0,0],[1,20]]){
    const safe=findNearestWalkablePosition(x,z,'mosswood');assert.ok(isPositionWalkable(safe.x,safe.z,'mosswood'),`${x},${z} recovers safely`);
  }
});

test('natural exit furniture has side-mounted collision and a continuous walking centre',()=>{
  for(const map of Object.values(MAP_ZONES))for(const exit of map.portals){
    assert.equal(exit.appearance,'trail');assert.equal(exit.artSrc,undefined);
    assert.equal(isPositionWalkable(exit.sign.x,exit.sign.z,map.id),false,`${exit.id}: timber post is solid`);
    assert.equal(isPositionWalkable(exit.x,exit.z,map.id),true,`${exit.id}: walking centre is open`);
    assert.ok(map.roads.some(r=>r.id===exit.id+'-continuation'),`${exit.id}: road continues through exit`);
  }
});
