import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { beginCrumbleFall, CrumblePlatformState } from '../game-app/public/js/v2/CrumblePlatform.js';

const require=createRequire(import.meta.url);
const Engine=require('../node_modules/phaser/src/physics/matter-js/lib/core/Engine');
const Bodies=require('../node_modules/phaser/src/physics/matter-js/lib/factory/Bodies');
const Body=require('../node_modules/phaser/src/physics/matter-js/lib/body/Body');
const Composite=require('../node_modules/phaser/src/physics/matter-js/lib/body/Composite');
const Sleeping=require('../node_modules/phaser/src/physics/matter-js/lib/core/Sleeping');
const Matter={Body,Sleeping};

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

{
  const engine=Engine.create({enableSleeping:true});
  const body=Bodies.rectangle(0,0,120,20);
  Body.setStatic(body,true);
  Composite.add(engine.world,body);
  Sleeping.set(body,true);
  const startY=body.position.y;
  beginCrumbleFall(Matter,body,.015);
  assert.equal(body.isStatic,false,'triggered platform must become dynamic');
  assert.equal(body.isSleeping,false,'triggered platform must wake even after the player has left');
  for(let i=0;i<12;i++) Engine.update(engine,1000/60);
  assert.ok(body.position.y>startY+1,'triggered platform must visibly fall without player contact');
}

console.log('Crumble platform passed: full warning/fall/hidden cycle and sleeping platforms fall after the player leaves.');
