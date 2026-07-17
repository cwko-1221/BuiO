import assert from 'node:assert/strict';
import { RapidFallTracker, RAPID_FALL_METRES, RAPID_FALL_WINDOW_MS } from '../game-app/public/js/v2/recovery.js';
import { buildCourse } from '../game-app/public/js/v2/course.js';
import { AUDIO_LEVELS } from '../game-app/public/js/v2/GameAudio.js';
import { checkpointPayload, resolveCheckpoint } from '../game-app/public/js/v2/checkpoint-state.js';

const tracker=new RapidFallTracker();
tracker.reset(0,420);
assert.equal(tracker.update(900,360),false,'ordinary 60m fall must not reset');
assert.equal(tracker.update(1800,321),false,'99m fall must not reset');
assert.equal(tracker.update(1900,320),true,'100m fall inside the window must reset');

tracker.reset(2000,500);
assert.equal(tracker.update(2000+RAPID_FALL_WINDOW_MS+1,399),false,'old peak outside the window must expire');
assert.equal(RAPID_FALL_METRES,100);
assert.equal(RAPID_FALL_WINDOW_MS,2400);
assert.ok(AUDIO_LEVELS.master>=.9,'master volume should be clearly audible');
assert.ok(AUDIO_LEVELS.music>=.65,'background music should use the louder mix');
assert.ok(AUDIO_LEVELS.effects>=1,'movement and jump effects should use the louder mix');

const course=buildCourse(1);
let previousProgress=-Infinity;
for (const checkpoint of course.checkpoints) {
  const closest=course.sensors.slice().sort((a,b)=>Math.abs(a.altitude-checkpoint.altitude)-Math.abs(b.altitude-checkpoint.altitude))[0];
  assert.equal(checkpoint.progress,closest.progress,`${checkpoint.id} must unlock at its nearest route sensor`);
  assert.ok(checkpoint.progress>=previousProgress,'checkpoint progress must stay monotonic');
  previousProgress=checkpoint.progress;
}
const marketCheckpoint=course.checkpoints.find(checkpoint=>checkpoint.altitude===274);
assert.equal(resolveCheckpoint(course.checkpoints,{altitude:276}).id,marketCheckpoint.id,'crossing a checkpoint altitude must unlock it even if the Matter sensor misses one frame');
assert.equal(resolveCheckpoint(course.checkpoints,{progress:marketCheckpoint.progress}).id,marketCheckpoint.id,'route progress must restore the latest checkpoint');
assert.equal(resolveCheckpoint(course.checkpoints,{checkpoint:checkpointPayload(marketCheckpoint)}).id,marketCheckpoint.id,'server checkpoint payload must survive reconnect');
console.log('Rapid-fall recovery test passed: 100m / 2.4s rolling window.');
