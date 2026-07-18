import assert from 'node:assert/strict';
import { RemoteGhostState } from '../game-app/public/js/v2/RemoteGhostState.js';

const moving=new RemoteGhostState({x:100,y:200,seq:1,animation:'run'},1000);
assert.equal(moving.push({x:126,y:190,seq:2,animation:'jump'},1020),true);
const first=moving.sample(1036,16);
assert.ok(first.x>100&&first.x<126&&first.y<200&&first.y>190,'zero-velocity updates should interpolate without overshooting');
assert.equal(first.targetX,126);
assert.equal(first.targetY,190);
assert.equal(moving.push({x:90,y:210,seq:2},1050),false,'stale snapshot must be ignored');

const reset=new RemoteGhostState({x:0,y:0,vx:0,vy:0,seq:1},0);
reset.push({x:500,y:600,seq:2},20);
assert.deepEqual(reset.sample(20,16),{x:500,y:600,targetX:500,targetY:600},'checkpoint reset should snap immediately');

const landing=new RemoteGhostState({x:0,y:80,seq:1,animation:'fall'},0);
landing.push({x:0,y:100,seq:2,animation:'idle'},20);
for(let i=0;i<8;i++) assert.ok(landing.sample(20+i*16,16).y<=100,'a landing must never be predicted below the real ground position');

// Dead reckoning: a runner leads its snapshot horizontally so the ghost hides
// the send/broadcast/render pipeline delay.
const runner=new RemoteGhostState({x:100,y:200,seq:1,animation:'run',vx:5.6,vy:0},0);
const led=runner.sample(10,16);
assert.ok(led.targetX>110,'a moving runner must lead its snapshot');
assert.equal(led.targetY,200,'grounded motion must never lead vertically');

// The lead is capped: when packets stop, the ghost holds instead of flying on.
const stalled=runner.sample(5000,16);
assert.ok(stalled.targetX-100<=5.6*120/(1000/60)+1e-9,'extrapolation must cap at the maximum lead');

// Falling must never be projected downward, even with a large fall velocity.
const faller=new RemoteGhostState({x:0,y:80,seq:1,animation:'fall',vx:0,vy:11},0);
assert.equal(faller.sample(30,16).targetY,80,'a falling player must not be predicted below its snapshot');

// Rising players lead upward so remote jumps read immediately.
const jumper=new RemoteGhostState({x:0,y:300,seq:1,animation:'jump',vx:0,vy:-12},0);
assert.ok(jumper.sample(10,16).targetY<300,'a rising jump should lead upward');

console.log('Remote ghost network state passed: bounded lead, ground-safe landings, stale-packet rejection and teleport snap.');
