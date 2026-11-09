import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_ZONES, isPositionWalkable, findNearestWalkablePosition } from '../src/data/world.mjs';
import { NPCS } from '../src/data/trainers.mjs';
import { insideTerrainRegion } from '../src/data/worldArtLayouts.mjs';

test('region graph extends beyond town spokes and all crossings arrive on safe land',()=>{
  assert.ok(MAP_ZONES.mosswood,'A sixth authored exploration region exists');
  assert.ok(MAP_ZONES.meadow.portals.some(p=>p.targetZone==='mosswood'),'The forest extends the route beyond meadow');
  for(const map of Object.values(MAP_ZONES))for(const portal of map.portals) {
    assert.ok(MAP_ZONES[portal.targetZone],`${portal.id}: destination exists`);
    assert.equal(isPositionWalkable(portal.targetSpawn.x,portal.targetSpawn.z,portal.targetZone),true,`${portal.id}: landing is safe`);
  }
});

test('painted coast keeps dry sand open and blocks the visible turquoise shallows', () => {
  const shore=MAP_ZONES.coast.terrainRegions.find(r=>r.id==='tidal-bay');
  for(const [x,z] of [[0,13],[16,8],[-8,16]]) {
    assert.equal(insideTerrainRegion(x,z,shore),false,`Dry painted beach ${x},${z} is land`);
    assert.equal(isPositionWalkable(x,z,'coast'),true);
  }
  for(const [x,z] of [[0,20],[12,19],[23,4]]) {
    assert.equal(insideTerrainRegion(x,z,shore),true,`Visible painted sea ${x},${z} blocks walking`);
    assert.equal(isPositionWalkable(x,z,'coast'),false);
  }
});

test('painted water, lava and reflecting pools are solid; main land approaches stay open', () => {
  for (const [zone,x,z] of [['meadow',-18,13],['coast',23,10],['canyon',-4,-19],['twilight',22,0]]) {
    assert.equal(isPositionWalkable(x,z,zone),false,`${zone}: hazardous material cannot be walked across`);
  }
  for (const [zone,x,z] of [['meadow',-20,0],['coast',0,-10],['canyon',20,0],['twilight',0,16]]) {
    assert.equal(isPositionWalkable(x,z,zone),true,`${zone}: land approach remains open`);
  }
});

test('every NPC, portal and new exploration district is reachable across the expanded world', () => {
  const starts={dawnleaf:[0,6],meadow:[-21.5,0],coast:[0,-21.5],canyon:[21.5,0],twilight:[0,21.5]};
  const step=.5;
  for (const [id,map] of Object.entries(MAP_ZONES)) {
    const b=map.bounds,cols=Math.round((b.maxX-b.minX)/step)+1,rows=Math.round((b.maxZ-b.minZ)/step)+1;
    const allowed=new Uint8Array(cols*rows),seen=new Uint8Array(cols*rows);
    for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
      allowed[row*cols+col]=Number(isPositionWalkable(b.minX+col*step,b.minZ+row*step,id));
    }
    const index=(x,z)=>Math.round((z-b.minZ)/step)*cols+Math.round((x-b.minX)/step);
    const start=index(...(starts[id] || [map.arrival.x,map.arrival.z]));
    assert.equal(allowed[start],1,`${id}: arrival is on safe land`);
    const queue=[start];seen[start]=1;
    for(let head=0;head<queue.length;head++) {
      const cell=queue[head],col=cell%cols,row=Math.floor(cell/cols);
      for(const next of [col>0?cell-1:-1,col<cols-1?cell+1:-1,row>0?cell-cols:-1,row<rows-1?cell+cols:-1]) {
        if(next<0 || !allowed[next] || seen[next]) continue;
        seen[next]=1;queue.push(next);
      }
    }
    for(const point of [...NPCS.filter(n=>n.zone===id),...map.portals,...(map.districts || [])]) {
      assert.equal(seen[index(point.x,point.z)],1,`${id}: ${point.id || point.nameZh} must remain reachable from the arrival route`);
    }
  }
});

test('saves standing inside a newly painted pond recover to nearby safe land', () => {
  const safe=findNearestWalkablePosition(-18,13,'meadow');
  assert.equal(isPositionWalkable(safe.x,safe.z,'meadow'),true);
  assert.ok(Math.hypot(safe.x+18,safe.z-13)<8,'Recovery stays near the existing location');
  assert.deepEqual(findNearestWalkablePosition(0,6,'dawnleaf'),{x:0,z:6},'Safe saves do not move');
});
