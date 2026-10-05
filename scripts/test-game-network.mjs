import assert from 'node:assert/strict';
import { PlayerStateThrottle } from '../game-app/public/js/v2/PlayerStateThrottle.js';

const state = { x:100, y:200, animation:'idle', facing:1, checkpoint:{id:'checkpoint-0'} };
const throttle = new PlayerStateThrottle();
assert.equal(throttle.shouldSend(state,0),true,'a new round sends its first pose');
assert.equal(throttle.shouldSend(state,100),false,'idle updates do not flood the teacher');
assert.equal(throttle.shouldSend(state,250),true,'idle progress stays current');

state.animation='run';
state.x=110;
assert.equal(throttle.shouldSend(state,260),true,'starting to move is sent immediately');
state.x=120;
assert.equal(throttle.shouldSend(state,300),false,'continuous movement is limited to 10Hz');
assert.equal(throttle.shouldSend(state,360),true);

state.animation='jump';
assert.equal(throttle.shouldSend(state,361),true,'jump transitions bypass the movement throttle');
state.facing=-1;
assert.equal(throttle.shouldSend(state,362),true,'direction changes are sent immediately');
state.checkpoint={id:'checkpoint-1'};
assert.equal(throttle.shouldSend(state,363),true,'checkpoint unlocks are saved immediately');
state.x+=500;
assert.equal(throttle.shouldSend(state,364),true,'checkpoint resets do not wait for the next tick');
assert.equal(throttle.shouldSend(state,365),false,'an unchanged jump does not produce repeated events');
assert.equal(new PlayerStateThrottle().shouldSend(state,365),true,'restarting the scene clears the previous round throttle');

const moving = new PlayerStateThrottle();
let sent=0;
for(let time=0;time<1000;time+=10) {
  if(moving.shouldSend({x:time,y:0,animation:'run',facing:1},time))sent++;
}
assert.equal(sent,10,'steady running sends ten updates per second');
console.log('Player state throttling passed: 10Hz movement, 4Hz idle, immediate jumps, turns, checkpoint saves and resets.');
