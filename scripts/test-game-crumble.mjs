import assert from 'node:assert/strict';
import { CrumblePlatformState } from '../game-app/public/js/v2/CrumblePlatform.js';

const platform=new CrumblePlatformState();
assert.equal(platform.phase,'ready');
assert.equal(platform.trigger(1000),true);
assert.equal(platform.phase,'warning');
assert.equal(platform.trigger(1001),false,'active platform must ignore duplicate contacts');
assert.deepEqual(platform.update(1139),{phase:'warning',changed:false});
assert.deepEqual(platform.update(1140),{phase:'falling',changed:true});
assert.deepEqual(platform.update(1789),{phase:'falling',changed:false});
assert.deepEqual(platform.update(1790),{phase:'hidden',changed:true});
assert.deepEqual(platform.update(5789),{phase:'hidden',changed:false});
assert.deepEqual(platform.update(5790),{phase:'ready',changed:true});
assert.equal(platform.trigger(6000),true,'restored platform must be reusable');

const resumedAfterPause=new CrumblePlatformState();
resumedAfterPause.trigger(0);
assert.deepEqual(resumedAfterPause.update(5000),{phase:'ready',changed:true},'long UI pauses must not strand a platform');

console.log('Crumble platform state passed: warning 140ms, falling 650ms, hidden 4000ms, reusable after restore.');
