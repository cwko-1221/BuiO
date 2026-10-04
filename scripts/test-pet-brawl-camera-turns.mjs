import assert from 'node:assert/strict';
import {battleCameraScroll,smoothCameraLookAhead} from '../pet-app/src/brawl/panorama-layout.mjs';
const advance=(state,target,delta)=>smoothCameraLookAhead(state.offset,state.velocity,target,delta);
const first=advance({offset:90,velocity:0},-90,1000/60);
assert.ok(90-first.offset<1,'Turning starts below one world pixel per 60fps frame');
const settled=[];
for(const fps of [30,60,120]){
 let state={offset:90,velocity:0},previous=90;
 for(let n=0;n<fps*1.2;n++){
  state=advance(state,-90,1000/fps);
  assert.ok(state.offset<=previous&&state.offset>=-90,'No overshoot');
  assert.ok(Math.abs(state.offset-previous)<=320/fps,'Smooth bounded pan speed');
  previous=state.offset;
 }
 assert.ok(Math.abs(state.offset+90)<5,'Turn settles in 1.2 seconds');settled.push(state.offset);
}
assert.ok(Math.max(...settled)-Math.min(...settled)<1e-9,'Identical turn timing at different frame rates');
let state={offset:90,velocity:0};
for(let n=0;n<300;n++){
 const target=Math.floor(n/3)%2?-90:90,previous=state;
 state=advance(state,target,1000/60);
 assert.ok(Math.abs(state.offset)<=90&&Math.abs(state.offset-previous.offset)<6,'Rapid reversals remain continuous');
 assert.deepEqual(advance(state,target,0),state,'Zero elapsed time cannot move the view');
 for(const width of [960,1031,1280,1558,1920]){
  const scroll=battleCameraScroll(2600,width,5120,state.offset),moved=battleCameraScroll(2780,width,5120,state.offset);
  assert.ok(Math.abs(moved-scroll-180)<1e-9,'Movement tracks immediately while directional offset eases');
  for(const x of [0,5120])assert.ok(battleCameraScroll(x,width,5120,state.offset)>=0&&battleCameraScroll(x,width,5120,state.offset)<=5120-width);
 }
}
console.log('✓ Turns start gently, settle smoothly at 30/60/120fps and handle rapid reversals; movement and world boundaries stay immediate');
