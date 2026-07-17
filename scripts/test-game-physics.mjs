import { createRequire } from 'node:module';
import { ASSET_BY_ID } from '../game-app/public/js/v2/assets.js';
import { ASSET_GEOMETRY } from '../game-app/public/js/v2/asset-geometry.js';
import { alphaBounds, createAlphaBody, fittedSize } from '../game-app/public/js/v2/colliders.js';
import { createPlayerCompound, wakePlayer } from '../game-app/public/js/v2/playerPhysics.js';
import { CAT_PLAYER, CAT_WORLD, collideWithPlayer } from '../game-app/public/js/v2/collisionFilters.js';

const require = createRequire(import.meta.url);
const Engine = require('../node_modules/phaser/src/physics/matter-js/lib/core/Engine');
const Bodies = require('../node_modules/phaser/src/physics/matter-js/lib/factory/Bodies');
const Body = require('../node_modules/phaser/src/physics/matter-js/lib/body/Body');
const Composite = require('../node_modules/phaser/src/physics/matter-js/lib/body/Composite');
const Events = require('../node_modules/phaser/src/physics/matter-js/lib/core/Events');
const Sleeping = require('../node_modules/phaser/src/physics/matter-js/lib/core/Sleeping');
const Matter = { Bodies, Body, Sleeping };

const failures = [];
const makeObject = (assetId, x=0, y=100, w=260, h=100) => ({
  assetId, asset:ASSET_BY_ID.get(assetId), x, y, w, h, angle:0, behavior:{type:'static'}
});

for (const assetId of ASSET_BY_ID.keys()) {
  const object = makeObject(assetId);
  const size = fittedSize(object);
  const body = createAlphaBody(Matter, object, size);
  const predictedBounds=alphaBounds(assetId,size);
  if (!Number.isFinite(body.position.x + body.position.y + body.area)) failures.push(`${assetId}: invalid body numbers`);
  if (body.parts.length < 2) failures.push(`${assetId}: missing compound parts`);
  // Bodies are aligned to IMAGE-CENTRE space: the image centre sits exactly
  // at (object.x, object.y), which is also where the sprite centre is drawn.
  if (Math.abs((body.bounds.minX ?? body.bounds.min.x)-(object.x+predictedBounds.minX))>.1 ||
      Math.abs((body.bounds.maxX ?? body.bounds.max.x)-(object.x+predictedBounds.maxX))>.1 ||
      Math.abs((body.bounds.minY ?? body.bounds.min.y)-(object.y+predictedBounds.minY))>.1 ||
      Math.abs((body.bounds.maxY ?? body.bounds.max.y)-(object.y+predictedBounds.maxY))>.1) {
    failures.push(`${assetId}: authored alpha bounds do not match Matter bounds`);
  }
  const geometryParts = ASSET_GEOMETRY[assetId]?.parts || [{ x:.5, y:.5, w:1, h:1 }];
  const visualLeft = object.x - size.w / 2;
  const visualTop = object.y - size.h / 2;
  body.parts.slice(1).forEach((part, index) => {
    const source = geometryParts[index];
    const expectedX = visualLeft + source.x * size.w;
    const expectedY = visualTop + source.y * size.h;
    if (Math.abs(part.position.x - expectedX) > .05 || Math.abs(part.position.y - expectedY) > .05) {
      failures.push(`${assetId}: collision part ${index} is detached from the sprite`);
    }
  });
  const tolerance = 2;
  if (body.bounds.min.x < visualLeft - tolerance || body.bounds.max.x > visualLeft + size.w + tolerance ||
      body.bounds.min.y < visualTop - tolerance || body.bounds.max.y > visualTop + size.h + tolerance) {
    failures.push(`${assetId}: collider exceeds visible sprite`);
  }
  if (!body.isStatic) failures.push(`${assetId}: course body should be created static`);
}

{
  const engine = Engine.create();
  const floor = Bodies.rectangle(0,100,420,30,{isStatic:true,friction:.2,frictionStatic:0,label:'test-floor'});
  const { body:player, parts } = createPlayerCompound(Matter);
  Body.setPosition(player,{x:0,y:0});
  let footContacts = 0;
  Events.on(engine,'collisionStart',event => {
    for (const pair of event.pairs) if (pair.bodyA === parts.foot || pair.bodyB === parts.foot) footContacts++;
  });
  Composite.add(engine.world,[floor,player]);
  for(let i=0;i<150;i++) Engine.update(engine,1000/60);
  if (!footContacts) failures.push('player foot sensor did not register landing');
  if (player.position.y < 55 || player.position.y > 75 || Math.abs(player.velocity.y) > .2) failures.push(`player landing unstable (${player.position.y.toFixed(2)}, vy ${player.velocity.y.toFixed(2)})`);
  for(let i=0;i<120;i++) { Body.setVelocity(player,{x:3.5,y:player.velocity.y}); Engine.update(engine,1000/60); }
  if (player.position.x < 100) failures.push(`player failed horizontal glide (${player.position.x.toFixed(2)})`);
}

{
  const engine = Engine.create({ enableSleeping:true });
  const floor = Bodies.rectangle(0,100,420,30,{isStatic:true});
  const { body:player } = createPlayerCompound(Matter);
  Body.setPosition(player,{x:0,y:0});
  Composite.add(engine.world,[floor,player]);
  for(let i=0;i<600;i++) Engine.update(engine,1000/60);
  if (player.isSleeping) failures.push('player fell asleep while question overlay was open');
  Sleeping.set(player,true); wakePlayer(Matter,player);
  if (player.isSleeping || player.sleepCounter !== 0) failures.push('resume control did not wake player');
}

{
  const engine=Engine.create();
  const trigger=collideWithPlayer(Bodies.rectangle(0,0,180,180,{isStatic:true,isSensor:true}));
  const { body:player }=createPlayerCompound(Matter);
  player.collisionFilter.category=CAT_PLAYER;
  player.collisionFilter.mask=CAT_WORLD;
  Body.setPosition(player,{x:0,y:0});
  let triggered=false;
  Events.on(engine,'collisionStart',event=>{
    triggered=event.pairs.some(pair=>pair.bodyA===trigger||pair.bodyB===trigger);
  });
  Composite.add(engine.world,[trigger,player]);
  Engine.update(engine,1000/60);
  if (!triggered) failures.push('checkpoint/progress sensor collision filter does not reach player');
}

if (failures.length) {
  console.error(`Game physics test failed (${failures.length})`);
  failures.slice(0,20).forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Game physics test passed: ${ASSET_BY_ID.size} sprite-aligned alpha compound bodies, foot sensor landing, horizontal glide, player sensors, and question-resume wake.`);
