import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MAP_ZONES} from '../src/data/world.mjs';
import {REGIONAL_ATLAS_CROPS,NAVIGATION_ART,surveyAsset} from '../src/data/navigationArt.mjs';
import {PREMIUM_CROSSING_MAP} from '../src/data/worldPremiumPrototype.mjs';
import {insideTerrainRegion} from '../src/data/worldArtLayouts.mjs';

test('every playable region has installed illustrated navigation and modular ground',()=>{
  const urls=[...Object.values(NAVIGATION_ART)];
  for(const map of Object.values(MAP_ZONES)){
    assert.equal(map.modularTerrain,true,map.id);assert.deepEqual(map.groundPaintings,[],map.id);
    assert.ok((map.terrainRegions||[]).every(r=>!r.floorPatch),`${map.id}: no rectangular floor patch`);
    const crop=map.atlasCrop||REGIONAL_ATLAS_CROPS[map.id];assert.ok(crop,`${map.id}: regional art has a calibrated content rectangle`);
    assert.ok(crop.every(v=>v>=0&&v<=1));assert.ok(crop[2]>0&&crop[3]>0);assert.ok(crop[0]+crop[2]<=1);assert.ok(crop[1]+crop[3]<=1);
    urls.push(surveyAsset(map.atlasArt||`atlas-${map.id}-v2`));
  }
  for(const url of urls)assert.ok(fs.existsSync(new URL('../public'+url.replace('/pokemon-rpg',''),import.meta.url)),url);
});
test('brook continues through the entire camera overscan beyond its former rectangular end cap',()=>{
  const river=PREMIUM_CROSSING_MAP.terrainRegions[0];
  for(const z of [-40,-18,18,24,40])assert.equal(insideTerrainRegion(1.5,z,river),true,`River remains continuous at z=${z}`);
  const b=PREMIUM_CROSSING_MAP.bounds;
  assert.ok(Math.min(...river.outline.map(p=>p.z))<b.minZ-20);assert.ok(Math.max(...river.outline.map(p=>p.z))>b.maxZ+20);
});
