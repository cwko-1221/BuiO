import assert from 'node:assert/strict';
import { RemoteGhostState } from '../game-app/public/js/v2/RemoteGhostState.js';

const moving=new RemoteGhostState({x:100,y:200,vx:5,vy:-2,ageMs:20,seq:1},1000);
const first=moving.sample(1040,16);
assert.ok(first.x>100&&first.y<200,'moving ghost should predict forward, not chase an old coordinate');
assert.ok(first.predictionMs>=90&&first.predictionMs<=100);
assert.equal(moving.push({x:90,y:210,vx:0,vy:0,ageMs:10,seq:1},1050),false,'stale snapshot must be ignored');
assert.equal(moving.push({x:126,y:190,vx:0,vy:0,ageMs:10,seq:2},1080),true);
const stopped=moving.sample(1120,16);
assert.ok(stopped.x<126,'a normal correction should remain smooth');

const reset=new RemoteGhostState({x:0,y:0,vx:0,vy:0,ageMs:0,seq:1},0);
reset.push({x:500,y:600,vx:0,vy:0,ageMs:0,seq:2},20);
assert.deepEqual(reset.sample(20,16),{x:500,y:600,targetX:500,targetY:600,predictionMs:35},'checkpoint reset should snap immediately');

const dropped=new RemoteGhostState({x:0,y:0,vx:6,vy:0,ageMs:160,seq:1},0);
assert.equal(dropped.sample(1000,16).predictionMs,180,'prediction must be capped after a dropped packet');

console.log('Remote ghost network state passed: forward prediction, smoothing, stale-packet rejection, teleport snap and 180ms cap.');
