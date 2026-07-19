import assert from 'node:assert/strict';
import { buildCourse } from '../game-app/public/js/v2/course.js';
import { timedHazardActive, timedHazardState } from '../game-app/public/js/v2/timed-hazards.js';

const course=buildCourse('timed-laser-test');
assert.equal(course.hazards.length,5,'the fixed route must contain five laser passages');

for (const [index,hazard] of course.hazards.entries()) {
  assert.equal(hazard.type,'timed-laser');
  assert.ok(hazard.altitude>700,`${hazard.id} appears below 700m`);
  assert.equal(hazard.cycleMs,4000);
  assert.equal(hazard.activeMs,2000);
  const origin=-hazard.phaseMs;
  assert.equal(timedHazardActive(hazard,origin),true,`${hazard.id} should begin active`);
  assert.equal(timedHazardActive(hazard,origin+1999),true,`${hazard.id} switched off too early`);
  assert.equal(timedHazardActive(hazard,origin+2000),false,`${hazard.id} did not open after 2 seconds`);
  assert.equal(timedHazardActive(hazard,origin+3999),false,`${hazard.id} closed too early`);
  assert.equal(timedHazardActive(hazard,origin+4000),true,`${hazard.id} did not restart its cycle`);
  const safe=timedHazardState(hazard,origin+2500);
  assert.deepEqual({active:safe.active,remainingMs:safe.remainingMs},{active:false,remainingMs:1500});
  assert.equal(hazard.phaseMs,index*800,`${hazard.id} phase spacing changed`);
}

console.log('Timed laser logic passed: 5 passages alternate 2 seconds blocked / 2 seconds open above 700m.');
