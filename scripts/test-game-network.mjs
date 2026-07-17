import assert from 'node:assert/strict';
import { RemoteGhostState } from '../game-app/public/js/v2/RemoteGhostState.js';

const moving=new RemoteGhostState({x:100,y:200,seq:1,animation:'run'},1000);
assert.equal(moving.push({x:126,y:190,seq:2,animation:'jump'},1020),true);
const first=moving.sample(1036,16);
assert.ok(first.x>100&&first.x<126&&first.y<200&&first.y>190,'normal updates should interpolate without overshooting');
assert.equal(first.targetX,126);
assert.equal(first.targetY,190);
assert.equal(moving.push({x:90,y:210,seq:2},1050),false,'stale snapshot must be ignored');

const reset=new RemoteGhostState({x:0,y:0,vx:0,vy:0,ageMs:0,seq:1},0);
reset.push({x:500,y:600,seq:2},20);
assert.deepEqual(reset.sample(20,16),{x:500,y:600,targetX:500,targetY:600},'checkpoint reset should snap immediately');

const landing=new RemoteGhostState({x:0,y:80,seq:1,animation:'fall'},0);
landing.push({x:0,y:100,seq:2,animation:'idle'},20);
for(let i=0;i<8;i++) assert.ok(landing.sample(20+i*16,16).y<=100,'a landing must never be predicted below the real ground position');

console.log('Remote ghost network state passed: no extrapolation, smooth snapshots, stale-packet rejection, teleport snap and ground-safe landing.');
