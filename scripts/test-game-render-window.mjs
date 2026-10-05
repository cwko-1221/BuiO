import assert from 'node:assert/strict';
import { WorldRenderWindow } from '../game-app/public/js/v2/WorldRenderWindow.js';

let boundsReads=0;
const object=(x,y,visible=true,cameraFilter=0)=>({
  scrollFactorX:1,scrollFactorY:1,visible,cameraFilter,
  getBounds(){boundsReads++;return{x,y,width:20,height:20};}
});
const near=object(40,40),far=object(500,500),hidden=object(50,50,false),otherCamera=object(500,500,true,4);
const sky={...object(0,0),scrollFactorX:0,scrollFactorY:0};
const window=new WorldRenderWindow([near,far,hidden,otherCamera,sky]);
const camera={id:1,worldView:{x:0,y:0,width:100,height:100}};
window.update(camera,0);
assert.equal(near.cameraFilter,0);
assert.equal(far.cameraFilter,1,'distant art is excluded from the main camera');
assert.equal(hidden.visible,false,'culling must not reveal a hidden trap');
assert.equal(otherCamera.cameraFilter,5,'other camera exclusions are preserved');
assert.equal(sky.cameraFilter,0,'screen-fixed sky is never culled');
assert.equal(boundsReads,4,'static bounds are measured only once');

camera.worldView={x:500,y:500,width:100,height:100};
window.update(camera,16);
assert.equal(far.cameraFilter,0,'large camera moves refresh before the timed interval');
assert.equal(near.cameraFilter,1);
assert.equal(otherCamera.cameraFilter,4);
camera.worldView={x:0,y:0,width:1000,height:1000};
window.update(camera,17);
assert.equal(near.cameraFilter,0,'resizing immediately refreshes the visible region');
assert.equal(far.cameraFilter,0);
assert.equal(boundsReads,4,'camera movement and resize do not recompute static geometry');

const buffered=object(330,100);
const marginWindow=new WorldRenderWindow([buffered]);
camera.worldView={x:0,y:0,width:100,height:100};
marginWindow.update(camera,0);
assert.equal(buffered.cameraFilter,0,'a preload margin prevents objects popping in at the viewport edge');
console.log('Render window passed: offscreen culling, buffered edges, camera movement, resize and hidden trap preservation.');
