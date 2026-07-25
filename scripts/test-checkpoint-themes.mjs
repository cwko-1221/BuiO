import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ASSET_BY_ID } from '../game-app/public/js/v2/assets.js';
import { ASSET_GEOMETRY } from '../game-app/public/js/v2/asset-geometry.js';
import { fittedSize, visualSize } from '../game-app/public/js/v2/colliders.js';
import { buildCourse } from '../game-app/public/js/v2/course.js';
import {
  CHECKPOINT_BACKGROUNDS,
  CHECKPOINT_THEME_REPLACEMENTS,
  FIXED_MAP
} from '../game-app/public/js/v2/fixed-map.js';

const expectedTransforms={
  'fixed-054':{x:3206,y:8175,w:84,h:82,angle:0,role:'support'},
  'fixed-055':{x:3324,y:8145,w:84,h:68,angle:0,role:'support'},
  'fixed-056':{x:3442,y:8110,w:84,h:84,angle:0,role:'support'},
  'fixed-067':{x:3500,y:7625,w:84,h:72,angle:0,role:'support'},
  'fixed-070':{x:4743.46875,y:7515,w:84,h:84,angle:0,role:'support'},
  'fixed-078':{x:5134.21875,y:7155,w:84,h:84,angle:0,role:'support'},
  'fixed-080':{x:4825.71875,y:7025,w:84,h:84,angle:0,role:'support'},
  'fixed-092':{x:4755.390625,y:6350,w:84,h:80,angle:0.12,role:'support'},
  'fixed-095':{x:4269.890625,y:6190,w:84,h:84,angle:0,role:'support'},
  'fixed-103':{x:3924.078125,y:5680,w:84,h:84,angle:0,role:'support'},
  'fixed-105':{x:4322.078125,y:5522.721953125,w:84,h:78,angle:0,role:'support'},
  'fixed-107':{x:3799.078125,y:5350,w:84,h:84,angle:0,role:'support'},
  'fixed-117':{x:3181.359375,y:5060,w:84,h:80,angle:0,role:'support'},
  'fixed-118':{x:3049.359375,y:4970,w:84,h:80,angle:0,role:'support'},
  'fixed-120':{x:2593.359375,y:4810,w:84,h:84,angle:0,role:'support'},
  'fixed-137':{x:1204.359375,y:4460,w:84,h:84,angle:0,role:'support'},
  'fixed-145':{x:942.359375,y:4015,w:84,h:84,angle:0,role:'support'},
  'fixed-152':{x:2259.359375,y:3815,w:84,h:84,angle:0,role:'support'},
  'fixed-155':{x:2934.8746875,y:3670,w:84,h:84,angle:0,role:'support'},
  'fixed-158':{x:3110.2284375,y:3630,w:84,h:84,angle:0,role:'support'},
  'fixed-174':{x:5009.28125,y:3200,w:84,h:84,angle:0,role:'support'},
  'fixed-178':{x:5091.28125,y:3090,w:84,h:84,angle:0,role:'support'},
  'fixed-179':{x:4897.28125,y:3000,w:84,h:84,angle:0,role:'support'},
  'fixed-187':{x:3537.28125,y:2519.08834375,w:84,h:84,angle:0,role:'support'},
  'fixed-188':{x:3439.75,y:2366.3164375,w:84,h:84,angle:0,role:'support'},
  'fixed-189':{x:3259.75,y:2280,w:84,h:84,angle:0,role:'support'},
  'fixed-196':{x:1549,y:1790,w:84,h:84,angle:0,role:'support'},
  'fixed-197':{x:1340.25,y:1720,w:84,h:84,angle:0,role:'support'},
  'fixed-198':{x:1131.25,y:1650,w:84,h:80,angle:-0.1,role:'support'},
  'fixed-204':{x:225.53125,y:1200.526,w:84,h:84,angle:0,role:'support'},
  'fixed-205':{x:554.53125,y:1160,w:84,h:84,angle:0,role:'support'},
  'fixed-206':{x:758.53125,y:1090,w:84,h:84,angle:0,role:'support'}
};

const objectById=new Map(FIXED_MAP.objects.map(object=>[object.id,object]));
const nodeByObjectId=new Map(FIXED_MAP.nodes.map(node=>[node.objectId,node]));
const course=buildCourse('checkpoint-theme-test');
const checkpointByAltitude=new Map(course.checkpoints.map(item=>[item.altitude,item]));
const replacementIds=CHECKPOINT_THEME_REPLACEMENTS.flatMap(theme=>theme.objectIds);
assert.equal(checkpointByAltitude.get(0)?.x,340,'Start checkpoint group must sit far enough right to show its full background');

assert.equal(CHECKPOINT_THEME_REPLACEMENTS.length,12,'Expected one theme for every checkpoint');
assert.equal(CHECKPOINT_BACKGROUNDS.length,12,'Expected one background for every checkpoint');
assert.equal(new Set(CHECKPOINT_THEME_REPLACEMENTS.map(theme=>theme.altitude)).size,12,'Checkpoint altitudes must be unique');
assert.equal(new Set(CHECKPOINT_THEME_REPLACEMENTS.map(theme=>theme.assetId)).size,12,'Checkpoint art must be unique');
assert.equal(new Set(CHECKPOINT_BACKGROUNDS.map(background=>background.key)).size,12,'Checkpoint background keys must be unique');
assert.equal(new Set(CHECKPOINT_BACKGROUNDS.map(background=>background.file)).size,12,'Checkpoint background files must be unique');
assert.equal(replacementIds.length,32,'Expected 32 themed supports across all checkpoints');
assert.equal(new Set(replacementIds).size,32,'A support cannot belong to two checkpoint themes');
assert.deepEqual(new Set(replacementIds),new Set(Object.keys(expectedTransforms)),'Transform baseline must cover every themed support');

for (const theme of CHECKPOINT_THEME_REPLACEMENTS) {
  const checkpoint=checkpointByAltitude.get(theme.altitude);
  assert.ok(checkpoint,`Missing checkpoint at ${theme.altitude}m`);
  assert.equal(checkpoint.name,theme.name,`Theme name mismatch at ${theme.altitude}m`);
  const background=CHECKPOINT_BACKGROUNDS.find(item=>item.altitude===theme.altitude);
  assert.deepEqual(checkpoint.background,{...background,name:theme.name,collidable:false},`Checkpoint background mismatch at ${theme.altitude}m`);
  const backgroundFile=path.join(process.cwd(),'game-app','public',background.file.replace('/game/',''));
  assert.ok(fs.existsSync(backgroundFile),`Missing checkpoint background ${backgroundFile}`);
  const backgroundMeta=await sharp(backgroundFile).metadata();
  assert.equal(backgroundMeta.hasAlpha,true,`${background.file} must have transparent edges`);
  assert.ok(backgroundMeta.width>=900&&backgroundMeta.width/backgroundMeta.height>=1.4,`${background.file} must be a wide background`);

  const asset=ASSET_BY_ID.get(theme.assetId);
  assert.ok(asset,`Missing asset registry entry ${theme.assetId}`);
  assert.equal(asset.zone,'checkpoint',`${theme.assetId} must use the checkpoint zone`);
  assert.ok(ASSET_GEOMETRY[theme.assetId],`Missing alpha geometry for ${theme.assetId}`);

  const propFile=path.join(process.cwd(),'game-app','public','images','v2','props',`${theme.assetId}.webp`);
  const masterFile=path.join(process.cwd(),'game-app','public','images','v2','masters',`${theme.assetId}-master.png`);
  assert.ok(fs.existsSync(propFile),`Missing sprite ${propFile}`);
  assert.ok(fs.existsSync(masterFile),`Missing master ${masterFile}`);
  const metadata=await sharp(propFile).metadata();
  assert.deepEqual(
    {width:metadata.width,height:metadata.height,hasAlpha:metadata.hasAlpha},
    {width:512,height:512,hasAlpha:true},
    `${theme.assetId} must be a 512px transparent sprite`
  );

  for (const id of theme.objectIds) {
    const object=objectById.get(id);
    const node=nodeByObjectId.get(id);
    assert.ok(object,`Missing themed support ${id}`);
    assert.ok(node,`Missing route node for ${id}`);
    assert.equal(object.assetId,theme.assetId,`${id} has the wrong checkpoint art`);
    assert.deepEqual(
      {x:object.x,y:object.y,w:object.w,h:object.h,angle:object.angle,role:object.role},
      expectedTransforms[id],
      `${id} moved or changed size`
    );
    const sourceAsset=ASSET_BY_ID.get(object.themeSourceAssetId);
    assert.ok(sourceAsset,`${id} is missing its original asset identity`);
    const originalSize=fittedSize({
      ...object,
      assetId:object.themeSourceAssetId,
      asset:sourceAsset,
      renderSizeOverride:undefined
    });
    assert.deepEqual(object.renderSizeOverride,originalSize,`${id} changed its original render size`);
    assert.deepEqual(fittedSize({...object,asset}),originalSize,`${id} changed its collider size`);
    const themedVisualSize=visualSize({...object,asset});
    assert.ok(themedVisualSize.w<=object.w&&themedVisualSize.h<=object.h,`${id} exceeds its authored visual box`);
    assert.notEqual(node.route,'removed',`${id} must remain on an active route`);
    assert.ok(object.tags.includes('checkpoint-theme'),`${id} is missing the shared theme tag`);
    assert.ok(object.tags.includes(`checkpoint-theme-${theme.altitude}`),`${id} is missing its altitude tag`);
    const altitudeDelta=Math.abs(theme.altitude-node.altitude);
    assert.ok(altitudeDelta<=110,`${id} is ${altitudeDelta}m away from its checkpoint`);
  }
}

console.log('Checkpoint theme test passed: 12 unique non-colliding backgrounds, 32 transforms and collider sizes unchanged.');
