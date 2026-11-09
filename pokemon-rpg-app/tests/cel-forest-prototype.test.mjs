import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCelForestPrototype,CEL_FOREST_PROFILE} from '../src/data/worldCelPrototype.mjs';

// The new scene is opt-in and must leave the normal world registry untouched.
globalThis.location={hostname:'127.0.0.1',pathname:'/pokemon-rpg/preview',search:'?world-trial=cel-forest-v1'};
const {getMap,MAP_ZONES,isPositionWalkable}=await import('../src/data/world.mjs');
delete globalThis.location;

test('prototype only replaces the explicit localhost preview scene',()=>{
  const maps={mosswood:{id:'unchanged'},meadow:{portals:[]}};
  for(const location of [undefined,{hostname:'example.com',pathname:'/pokemon-rpg/preview',search:'?world-trial=cel-forest-v1'},
    {hostname:'localhost',pathname:'/pokemon-rpg',search:'?world-trial=cel-forest-v1'}]){
    assert.equal(applyCelForestPrototype(maps,location),null);
    assert.equal(maps.mosswood.id,'unchanged');
  }
  assert.equal(getMap('mosswood').renderProfile,CEL_FOREST_PROFILE);
  assert.equal(Object.keys(MAP_ZONES).length,6,'Prototype replaces local forest; it is not a seventh region');
});

test('rendered bridge opens the same river geometry used by collision',()=>{
  for(const z of [3.3,4,4.7])for(let x=-2;x<=5;x+=.1)
    assert.ok(isPositionWalkable(x,z,'mosswood'),`Crossing corridor clear at${x},${z}`);
  for(const z of [2,6])assert.equal(isPositionWalkable(1.8,z,'mosswood'),false,'River outside crossing blocks movement');
  assert.equal(isPositionWalkable(-8.8,4.05,'mosswood'),false,'Solid root footprint blocks movement');
  assert.equal(isPositionWalkable(-8.8,2,'mosswood'),true,'Canopy above root can be walked behind');
});

test('authored destinations remain reachable from the local scene spawn',()=>{
  const map=getMap('mosswood'),step=.25,start=[-2,5.5],key=([x,z])=>`${x},${z}`;
  const queue=[start],seen=new Set([key(start)]);
  for(let i=0;i<queue.length;i++){
    const [x,z]=queue[i];
    for(const [dx,dz]of [[step,0],[-step,0],[0,step],[0,-step]]){
      const next=[x+dx,z+dz],k=key(next);
      if(!seen.has(k)&&isPositionWalkable(...next,'mosswood')){seen.add(k);queue.push(next);}
    }
  }
  for(const target of map.districts)assert.ok(queue.some(([x,z])=>Math.hypot(x-target.x,z-target.z)<.5),target.nameZh+' reachable');
});
