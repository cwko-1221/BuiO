'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer } = require('vite');
const test = require('node:test');

test('the compact backboard pusher keeps coins supported through its short stroke', async (t) => {
  const vite = await createServer({
    root: path.resolve(__dirname, '..'),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
    // Vite must bundle Rapier's browser ESM entry so its .wasm import is handled by the
    // same transform used by the production build rather than Node's package resolver.
    ssr: { noExternal: ['@dimforge/rapier3d'] },
  });
  t.after(() => vite.close());
  const { CoinPusherModel, PAYOUT_TRAY_CONFIRM_FRAMES } = await vite.ssrLoadModule('/src/game/CoinPusherModel.ts');
  const dimensions = await vite.ssrLoadModule('/src/game/CoinPusherDimensions.ts');
  const { FIXED_DECK_TOP_Y } = await vite.ssrLoadModule('/src/game/CoinPusherLayout.ts');
  const { advanceCoinPusherCascade, coinPusherCascadeLabel } = await vite.ssrLoadModule('/src/game/CoinPusherFeedback.ts');
  const extendedPusherFront = dimensions.PUSHER_FORWARD_Z + dimensions.PUSHER_LIP_LOCAL_Z;
  const deckDepth = dimensions.MAIN_DECK_FRONT_Z - dimensions.MAIN_DECK_BACK_Z;
  const plateShareOfTable = dimensions.PUSHER_LENGTH / deckDepth;
  const hiddenPlateTail = dimensions.PUSHER_HOME_Z - dimensions.PUSHER_HALF_DEPTH;
  const visiblePlateFront = dimensions.PUSHER_HOME_Z + dimensions.PUSHER_HALF_DEPTH;
  const forwardPlateRear = dimensions.PUSHER_FORWARD_Z - dimensions.PUSHER_HALF_DEPTH;
  const rearCaseClearance = hiddenPlateTail - dimensions.REAR_CASE_BACK_Z;
  assert.ok(deckDepth >= 2.8 && deckDepth <= 3.0, `the compact playfield should be about 2.89m (${deckDepth.toFixed(2)}m)`);
  assert.ok(dimensions.PAYOUT_TRAY_FLOOR_CENTER_Y <= -.64,
    'the collection well should sit clearly below the tabletop so coins visibly fall into it');
  assert.ok(dimensions.PAYOUT_TRAY_FLOOR_HALF_DEPTH >= .35 && dimensions.PAYOUT_TRAY_FLOOR_HALF_DEPTH <= .42,
    'the visible collection well should be compact rather than extending far beyond the cabinet');
  assert.ok(plateShareOfTable >= .57 && plateShareOfTable <= .60, 'the pusher slab should stay substantial on the shorter table');
  assert.ok(rearCaseClearance >= .26 && rearCaseClearance <= .34, 'the thick rear housing should conceal the retracted plate without excess dead depth');
  assert.ok(Math.abs(dimensions.PUSHER_HOME_Z - dimensions.REAR_CASE_FRONT_Z) < .001,
    'the resting plate center should line up with the fascia so exactly half is recessed');
  assert.ok(Math.abs(visiblePlateFront - dimensions.REAR_CASE_FRONT_Z - dimensions.PUSHER_HALF_DEPTH) < .001,
    'the resting plate should show only its front half beyond the backboard');
  assert.ok(Math.abs(forwardPlateRear - dimensions.REAR_CASE_FRONT_Z - dimensions.PUSHER_FORWARD_CLEARANCE) < .001,
    'the forward stroke should stop once the entire plate is visible, without extending over the table');
  assert.ok(Math.abs(dimensions.PUSHER_FORWARD_Z - dimensions.PUSHER_HOME_Z
    - dimensions.PUSHER_HALF_DEPTH - dimensions.PUSHER_FORWARD_CLEARANCE) < .001,
  'the pusher travel should equal half its depth plus the small full-clearance margin');
  const payoutFloorStart = dimensions.PAYOUT_TRAY_CENTER_Z - dimensions.PAYOUT_TRAY_FLOOR_HALF_DEPTH
    - dimensions.PAYOUT_TRAY_CATCHER_MARGIN;
  assert.ok(payoutFloorStart > dimensions.MAIN_DECK_FRONT_Z
    && payoutFloorStart - dimensions.MAIN_DECK_FRONT_Z >= .25
    && payoutFloorStart - dimensions.MAIN_DECK_FRONT_Z <= .31,
  'the lowered payout well should leave a visible coin-width drop slot beyond the shorter deck edge');
  assert.ok(dimensions.PAYOUT_TRAY_FRONT_WALL_CENTER_Z + dimensions.PAYOUT_TRAY_WALL_HALF_DEPTH
    >= dimensions.PAYOUT_TRAY_CENTER_Z + dimensions.PAYOUT_TRAY_FLOOR_HALF_DEPTH + dimensions.PAYOUT_TRAY_CATCHER_MARGIN - .001,
  'the front wall should close the physical catch pit without leaving an escape seam');
  assert.ok(extendedPusherFront < dimensions.MAIN_DECK_FRONT_Z - 1.0,
    'even fully exposed, the pusher should remain near the backboard instead of reaching over the shortened table');
  const cycleModel = new CoinPusherModel();
  try {
  const halfTurnRoot = Math.SQRT1_2;
  const xTiltedNormal = cycleModel.coinUpNormal({ x: halfTurnRoot, y: 0, z: 0, w: halfTurnRoot });
  const zTiltedNormal = cycleModel.coinUpNormal({ x: 0, y: 0, z: halfTurnRoot, w: halfTurnRoot });
  assert.ok(xTiltedNormal.z > .999 && Math.abs(xTiltedNormal.y) < .001,
    'the anti-wedge correction must read the coin face normal in the world frame for an X tilt');
  assert.ok(zTiltedNormal.x < -.999 && Math.abs(zTiltedNormal.y) < .001,
    'the anti-wedge correction must read the coin face normal in the world frame for a Z tilt');
  for (let frame = 0; frame < 120; frame += 1) cycleModel.update(1000 / 60);
  assert.equal(cycleModel.pusherZ, dimensions.PUSHER_HOME_Z,
    'the pusher must stay at home until the first wallet-authorized coin is dropped');
  assert.equal(cycleModel.getPredictedDropBeat(), 'home-pause',
    'a stationary pre-play pusher must not advertise a forward-stroke timing window');
  const idleEvents = cycleModel.drainEvents();
  assert.equal(idleEvents.some((event) => event.type === 'pusher-stroke'), false,
    'an idle machine must not emit a stroke or move unowned coins toward the payout tray');
  assert.equal(idleEvents.some((event) => event.type === 'coins-collected'), false,
    'an idle machine must never produce a payout without a paid play');
  const firstDropId = cycleModel.dropCoin(0);
  assert.notEqual(firstDropId, undefined, 'the first paid drop must start the pusher mechanism');
  const expectedBackboardLandingZ = dimensions.PUSHER_HOME_Z + .5;
  const expectedDropSpawnZ = cycleModel.getDropTargetZ();
  assert.ok(expectedBackboardLandingZ + .18 < dimensions.PUSHER_HOME_Z + dimensions.PUSHER_HALF_DEPTH
    && expectedBackboardLandingZ - .18 > dimensions.PUSHER_FORWARD_Z - dimensions.PUSHER_HALF_DEPTH,
  'the near-backboard landing point should stay fully supported by the plate through the whole stroke');
  assert.ok(expectedDropSpawnZ < expectedBackboardLandingZ
    && expectedDropSpawnZ > expectedBackboardLandingZ - .06,
  'the coin spawn point must compensate for forward drift so impact remains near the backboard');
  let homeDwellFrames = 0;
  let frontDwellFrames = 0;
  let largestStrokeStep = 0;
  const predictedDropBeats = new Set();
  const pusherStrokes = [];
  const pusherStrokeEvents = [];
  const pusherContactEvents = [];
  let firstDropLanding;
  for (let frame = 0; frame < 630; frame += 1) {
    predictedDropBeats.add(cycleModel.getPredictedDropBeat());
    const previousZ = cycleModel.pusherZ;
      cycleModel.update(1000 / 60);
      const frameEvents = cycleModel.drainEvents();
      firstDropLanding ??= frameEvents.find((event) => event.type === 'coin-landed' && event.coinId === firstDropId);
      const frameStrokeEvents = frameEvents.filter((event) => event.type === 'pusher-stroke');
      assert.equal(cycleModel.pusherBody.numColliders(), 1,
        'the moving board must stay one flat slab, without a folding blade or hidden front wall');
      pusherContactEvents.push(...frameEvents.filter((event) => event.type === 'pusher-contact'));
      pusherStrokeEvents.push(...frameStrokeEvents);
      pusherStrokes.push(...frameStrokeEvents.map((event) => event.direction));
      homeDwellFrames += Number(Math.abs(cycleModel.pusherZ - dimensions.PUSHER_HOME_Z) < 1e-9);
      frontDwellFrames += Number(Math.abs(cycleModel.pusherZ - dimensions.PUSHER_FORWARD_Z) < 1e-9);
      largestStrokeStep = Math.max(largestStrokeStep, Math.abs(cycleModel.pusherZ - previousZ));
      assert.ok(cycleModel.pusherZ >= dimensions.PUSHER_HOME_Z - 1e-6
        && cycleModel.pusherZ <= dimensions.PUSHER_FORWARD_Z + 1e-6,
      'the pusher must never protrude farther than its fully visible position');
      assert.ok(Math.abs(cycleModel.getDropTargetZ() - expectedDropSpawnZ) < .001,
        'the coin landing point must stay fixed near the backboard through every pusher phase');
    }
    assert.ok(firstDropLanding, 'Rapier must report the first drop after it physically contacts the plate');
    assert.ok(Math.abs(firstDropLanding.position.z - expectedBackboardLandingZ) < .12,
      `the first coin must physically land close to the backboard (${firstDropLanding.position.z.toFixed(3)}m)`);
    assert.ok(firstDropLanding.position.z > dimensions.REAR_CASE_FRONT_Z + .24,
      'the coin must land near the backboard without its tilted rim touching the rear fascia');
    assert.ok(homeDwellFrames >= 20, `the pusher should visibly pause at home (${homeDwellFrames} frames)`);
  assert.ok(frontDwellFrames >= 28, `the pusher should visibly pause at full extension (${frontDwellFrames} frames)`);
  assert.ok(largestStrokeStep < .03, `the new beat must not introduce a faster step (${largestStrokeStep.toFixed(4)}m)`);
  assert.deepEqual([...predictedDropBeats].sort(), ['forward', 'front-pause', 'home-pause', 'return'],
    'the pusher phase prediction must remain valid through both strokes and end pauses');
  assert.deepEqual(pusherStrokes.slice(0, 4), ['forward', 'return', 'forward', 'return'],
    'the audio cue must fire exactly when each alternating pusher stroke starts');
  assert.ok(pusherStrokeEvents.slice(0, 4).every((event, index) =>
    Math.abs(event.durationSeconds - (index % 2 === 0 ? 3.5 * .438 : 3.5 * .431)) < 1 / 60),
  'stroke events should expose the matching real forward and return durations to the audio layer');
  assert.ok(pusherContactEvents.length > 0, 'the flat slab should report a real front-face coin contact during the crowded cycle');
  assert.ok(pusherContactEvents.length <= pusherStrokes.filter((direction) => direction === 'forward').length,
    'a pile contact cue must fire no more than once during each forward stroke');
  assert.ok(pusherContactEvents.every((event) => event.count > 0
    && Object.values(event.position).every(Number.isFinite)),
  'contact feedback must be anchored to at least one finite, physically touching coin');
  } finally {
    cycleModel.destroy();
  }
  const reducedMotionModel = new CoinPusherModel();
  try {
    reducedMotionModel.setReducedMotion(true);
    assert.notEqual(reducedMotionModel.dropCoin(0), undefined);
    let reducedMotionStroke;
    for (let frame = 0; frame < 90 && !reducedMotionStroke; frame += 1) {
      reducedMotionModel.update(1000 / 60);
      reducedMotionStroke = reducedMotionModel.drainEvents()
        .find((event) => event.type === 'pusher-stroke');
    }
    assert.ok(reducedMotionStroke, 'reduced motion should still emit the first physical pusher stroke');
    assert.ok(Math.abs(reducedMotionStroke.durationSeconds - (3.5 * .438 / .6)) < 1 / 60,
      'the stroke duration sent to audio should include the reduced-motion time scale');
  } finally {
    reducedMotionModel.destroy();
  }
  const rapidDropModel = new CoinPusherModel();
  try {
    const rapidDropIds = Array.from({ length: 40 }, (_, index) => rapidDropModel.dropCoin((index % 9 - 4) * .42));
    assert.ok(rapidDropIds.every((id) => id !== undefined), 'the board must accept more than the old 36-coin gameplay cap');
    assert.equal(new Set(rapidDropIds).size, 40, 'each rapid drop must create its own physical coin');
    assert.equal(rapidDropModel.canDropCoin(), true, 'new drops must not wait for airborne coins to land or enter the tray');
    assert.equal(rapidDropModel.coins.filter((coin) => coin.dropped && !coin.impactReported).length, 40,
      'all rapid drops should be allowed to remain in flight together');
    assert.notEqual(rapidDropModel.dropCoin(1.8), undefined,
      'a further drop must remain available before any of the burst coins settles');
  } finally {
    rapidDropModel.destroy();
  }
  const snapshot = (model) => model.coins.map((coin) => {
    const position = coin.body.translation();
    const rotation = coin.body.rotation();
    return [coin.id, position.x, position.y, position.z, rotation.x, rotation.y, rotation.z, rotation.w]
      .map((value) => Number(value.toFixed(6)));
  });
  const replaySnapshot = (model) => model.coins.map((coin) => {
    const position = coin.body.translation();
    const rotation = coin.body.rotation();
    const linear = coin.body.linvel();
    const angular = coin.body.angvel();
    return [
      coin.id, coin.falling, coin.collected, coin.ridingPusher,
      position.x, position.y, position.z,
      rotation.x, rotation.y, rotation.z, rotation.w,
      linear.x, linear.y, linear.z, angular.x, angular.y, angular.z,
    ].map((value) => typeof value === 'number' ? Number(value.toFixed(6)) : value);
  });
  const repeatA = new CoinPusherModel();
  const repeatB = new CoinPusherModel();
  try {
    assert.deepEqual(snapshot(repeatA), snapshot(repeatB), 'the same starter seed should reproduce every coin transform');
    const upperLayerBoundary = FIXED_DECK_TOP_Y + .08;
    const basePositions = repeatA.coins
      .filter((coin) => !coin.dropped && coin.body.translation().y < upperLayerBoundary)
      .map((coin) => coin.body.translation());
    const stackCount = repeatA.coins.filter((coin) => !coin.dropped && coin.body.translation().y >= upperLayerBoundary).length;
    assert.equal(basePositions.length, 50, 'the compact table should start with a five-row coin bed');
    assert.ok(stackCount >= 3 && stackCount <= 7, 'the single upper layer should stay sparse and irregular');
    const rearRowZ = Math.min(...basePositions.map((position) => position.z));
    const frontRowZ = Math.max(...basePositions.map((position) => position.z));
    const retractedLipZ = dimensions.PUSHER_HOME_Z + dimensions.PUSHER_LIP_LOCAL_Z;
    const extendedLipZ = dimensions.PUSHER_FORWARD_Z + dimensions.PUSHER_LIP_LOCAL_Z;
    assert.ok(rearRowZ - retractedLipZ >= .45 && rearRowZ - retractedLipZ <= .55,
      'the rear coin row should remain ahead of the retracted lip with enough room for the plate to sweep under it');
    assert.ok(extendedLipZ - rearRowZ >= .32 && extendedLipZ - rearRowZ <= .42,
      'the forward plate stroke should pass beneath the rear coin row instead of missing the starter bed');
    assert.ok(frontRowZ - rearRowZ <= .352 * Math.sqrt(3) / 2 * 4 + .04,
      'the compact pile should occupy only five rows near the backboard');
    assert.ok(frontRowZ < dimensions.MAIN_DECK_FRONT_Z - .35,
      'the five-row starter pile should leave one coin-width runway before the closer payout edge');
    let minimumCenterDistance = Infinity;
    for (let first = 0; first < basePositions.length; first += 1) {
      for (let second = first + 1; second < basePositions.length; second += 1) {
        minimumCenterDistance = Math.min(minimumCenterDistance, Math.hypot(
          basePositions[first].x - basePositions[second].x,
          basePositions[first].z - basePositions[second].z,
        ));
      }
    }
    assert.ok(minimumCenterDistance >= .339, `base coin spacing should avoid starting overlap (${minimumCenterDistance.toFixed(3)}m)`);

    const rowStep = .352 * Math.sqrt(3) / 2;
    const lowestZ = Math.min(...basePositions.map((position) => position.z));
    const rowCounts = Array.from({ length: 8 }, () => 0);
    const rowZs = Array.from({ length: 8 }, () => []);
    for (const position of basePositions) {
      const row = Math.round((position.z - lowestZ) / rowStep);
      if (row >= 0 && row < rowCounts.length) {
        rowCounts[row] += 1;
        rowZs[row].push(position.z);
      }
    }
    assert.ok(new Set(rowCounts).size > 1, 'the bed should have a broken, non-rectangular edge silhouette');
    assert.ok(rowZs.some((zs) => zs.length > 0 && Math.max(...zs) - Math.min(...zs) > .012), 'coins should not lie on ruler-straight rows');

    for (let frame = 0; frame < 120; frame += 1) {
      repeatA.update(1000 / 60);
      repeatB.update(1000 / 60);
    }
    assert.deepEqual(snapshot(repeatA), snapshot(repeatB), 'the seeded starter bed should settle reproducibly');
  } finally {
    repeatA.destroy();
    repeatB.destroy();
  }

  const replay = (frameMs, frameCount, dropEvery) => {
    const model = new CoinPusherModel();
    try {
      for (let frame = 0; frame < frameCount; frame += 1) {
        if (frame % dropEvery === 0) model.dropCoin((frame / dropEvery % 5 - 2) * .72);
        model.update(frameMs);
      }
      return {
        pusherZ: Number(model.pusherZ.toFixed(6)),
        coins: snapshot(model),
      };
    } finally {
      model.destroy();
    }
  };
  assert.deepEqual(
    replay(1000 / 60, 360, 30),
    replay(1000 / 30, 180, 15),
    'the same drop inputs must replay identically at 60Hz and 30Hz update chunking',
  );

  const snapshotSource = new CoinPusherModel();
  let snapshotResume;
  try {
    assert.notEqual(snapshotSource.dropCoin(.72), undefined);
    for (let frame = 0; frame < 78; frame += 1) {
      snapshotSource.update(1000 / 60);
      snapshotSource.drainEvents();
    }
    const serialized = JSON.parse(JSON.stringify(snapshotSource.createSnapshot()));
    snapshotResume = CoinPusherModel.restoreSnapshot(serialized);
    assert.equal(snapshotResume.pusherZ, snapshotSource.pusherZ,
      'a restored model must resume the exact moving-plate phase');
    assert.deepEqual(replaySnapshot(snapshotResume), replaySnapshot(snapshotSource),
      'a restored model must retain every coin pose, velocity, and rider/fall state');
    assert.notEqual(snapshotSource.dropCoin(-.72), undefined);
    assert.notEqual(snapshotResume.dropCoin(-.72), undefined,
      'the next restored drop must keep the same coin id and simulation state');
    for (let frame = 0; frame < 180; frame += 1) {
      snapshotSource.update(1000 / 60);
      snapshotResume.update(1000 / 60);
      assert.equal(snapshotResume.pusherZ, snapshotSource.pusherZ,
        `restored pusher phase should remain identical at frame ${frame}`);
      assert.deepEqual(replaySnapshot(snapshotResume), replaySnapshot(snapshotSource),
        `restored coin physics should continue identically at frame ${frame}`);
      assert.deepEqual(snapshotResume.drainEvents(), snapshotSource.drainEvents(),
        `restored payout/impact events should not duplicate or disappear at frame ${frame}`);
    }
  } finally {
    snapshotSource.destroy();
    snapshotResume?.destroy();
  }

  // Neighbour contacts must not detach plate riders. Any actual release must restore the regular
  // deck collision mask or the coin can fall through the plate onto the tabletop.
  const blockedRiderModel = new CoinPusherModel();
  try {
    for (const coin of blockedRiderModel.coins.splice(0)) blockedRiderModel.world.removeRigidBody(coin.body);
    const blockedRiderZ = dimensions.REAR_CASE_FRONT_Z + .24;
    blockedRiderModel.pusherZ = dimensions.PUSHER_HOME_Z;
    blockedRiderModel.pusherBody.setTranslation({ x: 0, y: .02, z: blockedRiderModel.pusherZ }, true);
    const blockedRider = blockedRiderModel.createCoin(0, .067, blockedRiderZ, false);
    const neighbouringCoin = blockedRiderModel.createCoin(.32, .067, blockedRiderZ, false);
    const ordinaryCollisionGroups = blockedRider.collider.collisionGroups();
    blockedRiderModel.attachPusherRider(blockedRider);
    blockedRiderModel.world.step();
    blockedRiderModel.enforcePusherRiders(0);
    let lateralContactCount = 0;
    blockedRiderModel.world.contactPair(blockedRider.collider, neighbouringCoin.collider,
      (manifold) => { lateralContactCount = manifold.numContacts(); });
    assert.ok(lateralContactCount > 0, 'the release fixture must establish lateral coin contact');
    assert.equal(blockedRider.ridingPusher, true, 'ordinary coin contact must not detach a plate rider');
    assert.notEqual(blockedRider.collider.collisionGroups(), ordinaryCollisionGroups,
      'an attached rider should ignore only the overlapping deck floor');
    const contactPosition = blockedRider.body.translation();
    const contactDisplacement = .01;
    blockedRider.body.setTranslation({
      x: contactPosition.x + contactDisplacement,
      y: contactPosition.y,
      z: contactPosition.z,
    }, true);
    blockedRiderModel.enforcePusherRiders(0);
    assert.ok(Math.abs(blockedRider.pusherLocalX - (contactPosition.x + contactDisplacement)) < 1e-6,
      'a supported coin-to-coin displacement must update the rider anchor instead of snapping back');
    assert.ok(Math.abs(blockedRider.body.translation().x - (contactPosition.x + contactDisplacement)) < 1e-6,
      'a supported rider must keep its physically resolved coin-to-coin displacement');
    const riderPosition = blockedRider.body.translation();
    blockedRider.body.setTranslation({ x: riderPosition.x, y: riderPosition.y + .5, z: riderPosition.z }, true);
    blockedRiderModel.update(1000 / 60);
    assert.equal(blockedRider.ridingPusher, false, 'a coin lifted off the plate must release');
    assert.equal(blockedRider.collider.collisionGroups(), ordinaryCollisionGroups,
      'a released rider must restore its deck collisions to prevent falling through the board');
  } finally {
    blockedRiderModel.destroy();
  }

  const edgeRiderModel = new CoinPusherModel();
  try {
    for (const coin of edgeRiderModel.coins.splice(0)) edgeRiderModel.world.removeRigidBody(coin.body);
    const edgeZ = dimensions.PUSHER_HOME_Z + dimensions.PUSHER_HALF_DEPTH + .02;
    const edgeRider = edgeRiderModel.createCoin(0, .067, edgeZ, false);
    const ordinaryCollisionGroups = edgeRider.collider.collisionGroups();
    edgeRiderModel.attachPusherRider(edgeRider);
    assert.equal(edgeRider.ridingPusher, true);
    edgeRiderModel.update(1000 / 60);
    assert.equal(edgeRider.ridingPusher, false, 'a coin beyond the plate support edge must release');
    assert.equal(edgeRider.collider.collisionGroups(), ordinaryCollisionGroups,
      'an edge-released coin must regain tabletop collisions');
  } finally {
    edgeRiderModel.destroy();
  }

  const penetrationModel = new CoinPusherModel();
  try {
    for (const coin of penetrationModel.coins.splice(0)) penetrationModel.world.removeRigidBody(coin.body);
    const underPlate = penetrationModel.createCoin(0, -.2, penetrationModel.pusherZ, false);
    underPlate.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    penetrationModel.correctPusherPenetration();
    assert.ok(underPlate.body.translation().y < 0,
      'a coin that is already below the moving slab must not be teleported back onto it');

    const shallowOverlap = penetrationModel.createCoin(0, .05, penetrationModel.pusherZ + .3, false);
    shallowOverlap.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    penetrationModel.correctPusherPenetration();
    assert.ok(shallowOverlap.body.translation().y >= .068,
      'the one-step shallow slab overlap should still be repaired without a visible pop');
  } finally {
    penetrationModel.destroy();
  }

  const rider = new CoinPusherModel();
  try {
    const riderId = rider.dropCoin(0);
    const segmentDrifts = [];
    let segmentStart;
    let segmentDrift = 0;
    let wasRiding = false;
    let riderFrames = 0;
    for (let frame = 0; frame < 300; frame += 1) {
      rider.update(1000 / 60);
      const coin = rider.coins.find((entry) => entry.id === riderId);
      if (!coin) break;
      const nearBackboard = coin.body.translation().z <= dimensions.REAR_CASE_FRONT_Z + .168 + .04;
      if (coin.ridingPusher && !coin.falling && !nearBackboard) {
        const position = coin.body.translation();
        const relative = position.z - rider.pusherZ;
        if (!wasRiding) {
          segmentStart = relative;
          segmentDrift = 0;
        }
        segmentDrift = Math.max(segmentDrift, Math.abs(relative - segmentStart));
        riderFrames += 1;
        wasRiding = true;
      } else if (wasRiding) {
        segmentDrifts.push(segmentDrift);
        wasRiding = false;
      }
    }
    if (wasRiding) segmentDrifts.push(segmentDrift);
    assert.ok(riderFrames >= 30, 'a dropped coin should become a rider on the pusher plate');
    assert.ok(segmentDrifts.length >= 1, 'the rider should have a continuous attached interval');
    assert.ok(Math.max(...segmentDrifts) < .005,
      `a free plate rider must preserve its local Z anchor until backboard contact (max drift ${Math.max(...segmentDrifts).toFixed(4)}m)`);
  } finally {
    rider.destroy();
  }

  const release = new CoinPusherModel();
  try {
    const releaseId = release.dropCoin(0);
    let rider;
    for (let frame = 0; frame < 300 && !rider; frame += 1) {
      release.update(1000 / 60);
      rider = release.coins.find((coin) => coin.id === releaseId && coin.ridingPusher);
    }
    assert.ok(rider, 'the release fixture should first establish a real plate rider');
    const position = rider.body.translation();
    rider.body.setTranslation({ x: position.x, y: position.y + .5, z: position.z }, true);
    release.update(1000 / 60);
    assert.equal(rider.ridingPusher, false, 'a coin lifted off the plate must stop being carried');

    const edgePosition = rider.body.translation();
    rider.body.setTranslation({
      x: edgePosition.x,
      y: edgePosition.y,
      z: release.pusherZ + dimensions.PUSHER_HALF_DEPTH,
    }, true);
    release.update(1000 / 60);
    assert.equal(rider.ridingPusher, false, 'a coin crossing the plate boundary must be released');
  } finally {
    release.destroy();
  }

  // The exact same drop must replay identically at common browser frame rates, including body
  // velocities and state flags rather than only the rendered transform.
  const replayDurations = [
    Array(360).fill(1000 / 60),
    Array(180).fill(1000 / 30),
    Array(720).fill(1000 / 120),
  ];
  const replayStates = [];
  for (const frameDurations of replayDurations) {
    const model = new CoinPusherModel();
    try {
      model.dropCoin(2.1);
      for (const deltaMs of frameDurations) model.update(deltaMs);
      replayStates.push(replaySnapshot(model));
    } finally {
      model.destroy();
    }
  }
  assert.deepEqual(replayStates[0], replayStates[1], '60 and 30 Hz chunks must replay the same fixed-step state');
  assert.deepEqual(replayStates[0], replayStates[2], '60 and 120 Hz chunks must replay the same fixed-step state');

  // A coin is collected once after occupying the tray for 0.3s, even if it keeps spinning, and
  // remains visible long enough for the renderer to show +1 before its physical body is cleared.
  const collectionModel = new CoinPusherModel();
  try {
    for (const coin of collectionModel.coins.splice(0)) collectionModel.world.removeRigidBody(coin.body);
    const trayCoins = [-.75, .75].map((x, index) => collectionModel.createCoin(
      x,
      dimensions.PAYOUT_TRAY_FLOOR_CENTER_Y + dimensions.PAYOUT_TRAY_FLOOR_HALF_HEIGHT + .032,
      dimensions.PAYOUT_TRAY_CENTER_Z + (index ? .08 : -.08),
      true,
    ));
    for (const trayCoin of trayCoins) {
      trayCoin.tumbling = false;
      trayCoin.falling = true;
      trayCoin.fallAge = 4;
      trayCoin.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      trayCoin.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      trayCoin.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    for (let frame = 0; frame < 10; frame += 1) {
      trayCoins[0].body.setAngvel({ x: 0, y: 1.2, z: 0 }, true);
      collectionModel.update(1000 / 60);
    }
    assert.equal(collectionModel.drainEvents().some((event) => event.type === 'coins-collected'), false,
      'a coin must remain visible in the tray before its reward is confirmed');
    assert.equal(PAYOUT_TRAY_CONFIRM_FRAMES, 18,
      'a coin must dwell in the tray for 0.3 seconds before starting the wallet animation');
    for (let frame = 0; frame < 20; frame += 1) {
      trayCoins[0].body.setAngvel({ x: 0, y: 1.2, z: 0 }, true);
      collectionModel.update(1000 / 60);
    }
    const payoutEvents = collectionModel.drainEvents();
    assert.equal(payoutEvents.filter((event) => event.type === 'coins-collected')
      .reduce((count, event) => count + event.count, 0), 2,
      'each caught tray coin must emit one collection event, including coins still in motion');
    const payoutEvent = payoutEvents.find((event) => event.type === 'coins-collected');
    assert.ok(payoutEvent, 'settled tray coins must emit a payout event');
    assert.equal(coinPusherCascadeLabel(payoutEvent.count, 'zh-HK'), '連環推出 ×2',
      'a real two-coin payout should get a cosmetic cascade label');
    assert.equal(coinPusherCascadeLabel(payoutEvent.count, 'en'), 'CASCADE ×2',
      'the cascade label should follow the active language');
    assert.equal(coinPusherCascadeLabel(1, 'zh-HK'), undefined,
      'a single payout must keep the regular +1 presentation without a combo callout');
    const firstConfirmedCoin = advanceCoinPusherCascade({ count: 0, lastAt: 0 }, 1, 1000);
    const secondConfirmedCoin = advanceCoinPusherCascade(firstConfirmedCoin, 1, 3400);
    assert.equal(secondConfirmedCoin.count, 2,
      'two separately confirmed coins inside the 2.5-second combo window should form a chain');
    assert.equal(coinPusherCascadeLabel(secondConfirmedCoin.count, 'zh-HK'), '連環推出 ×2');
    assert.equal(advanceCoinPusherCascade(secondConfirmedCoin, 1, 5900).count, 3,
      'a payout exactly at the combo-window boundary should keep the chain alive');
    assert.equal(advanceCoinPusherCascade(secondConfirmedCoin, 1, 5901).count, 1,
      'a payout just after the combo window should start a fresh chain');
    assert.equal(payoutEvent.positions.length, 2,
      'the payout event must include each actual settled coin position for its wallet flight');
    assert.ok(payoutEvent.positions.every((position) => Object.values(position).every(Number.isFinite)),
      'the payout flight origin must contain finite world coordinates');
    assert.ok(payoutEvent.positions.every((position) => position.y <= -.2
      && position.z >= dimensions.PAYOUT_TRAY_CENTER_Z - dimensions.PAYOUT_TRAY_FLOOR_HALF_DEPTH - dimensions.PAYOUT_TRAY_CATCHER_MARGIN
      && position.z <= dimensions.PAYOUT_TRAY_CENTER_Z + dimensions.PAYOUT_TRAY_FLOOR_HALF_DEPTH + dimensions.PAYOUT_TRAY_CATCHER_MARGIN),
    'a payout must originate from coins that physically fell into the recessed tray');
    assert.ok(Math.abs(payoutEvent.positions[0].x - payoutEvent.positions[1].x) > 1,
      'separate collected coins must keep their own distinct origins instead of collapsing to tray center');
    assert.ok(trayCoins.every((coin) => coin.collected), 'both tray coins must enter the collected state');
    assert.ok(trayCoins.every((coin) => collectionModel.coins.includes(coin)),
      'a tray coin must remain visible after the collection event so its +1 can animate from the pit');
    for (let frame = 0; frame < 20; frame += 1) collectionModel.update(1000 / 60);
    assert.equal(collectionModel.drainEvents().length, 0, 'a collected coin must never emit twice');
    assert.notEqual(collectionModel.dropCoin(0), undefined,
      'a collected tray coin must not consume an active drop slot');
    for (let frame = 0; frame < 110 && collectionModel.coins.includes(trayCoins[0]); frame += 1) {
      collectionModel.update(1000 / 60);
    }
    assert.equal(trayCoins.some((coin) => collectionModel.coins.includes(coin)), false,
      'physical coins should clear from the well shortly after the confirmed +1 presentation');
  } finally {
    collectionModel.destroy();
  }

  // A face-up starter coin has its tipping axes locked for a stable bed. Once a real shove moves
  // its centre past the table lip, it must regain those axes and land in the lowered catcher
  // rather than balancing on the deck edge or slipping through the entry seam.
  const deckLipModel = new CoinPusherModel();
  try {
    for (const coin of deckLipModel.coins.splice(0)) deckLipModel.world.removeRigidBody(coin.body);
    const edgeShovedCoin = deckLipModel.createCoin(
      0,
      .067,
      dimensions.MAIN_DECK_FRONT_Z - .12,
      false,
    );
    edgeShovedCoin.body.setLinvel({ x: 0, y: 0, z: 1.2 }, true);
    let crossedDeckLip = false;
    let edgePayoutCount = 0;
    let edgePayoutOrigin;
    for (let frame = 0; frame < 180 && edgePayoutCount === 0; frame += 1) {
      deckLipModel.update(1000 / 60);
      crossedDeckLip ||= edgeShovedCoin.falling;
      for (const event of deckLipModel.drainEvents()) {
        if (event.type !== 'coins-collected') continue;
        edgePayoutCount += event.count;
        edgePayoutOrigin = event.positions[0];
      }
    }
    assert.equal(crossedDeckLip, true,
      'a pushed face-up coin should enter its physical tipping fall when its centre crosses the deck lip');
    assert.equal(edgeShovedCoin.collected, true,
      'a coin that tips off the deck edge should settle inside the catcher instead of disappearing');
    assert.equal(edgePayoutCount, 1,
      'the edge coin should emit exactly one confirmed physical collection');
    assert.ok(edgePayoutOrigin && edgePayoutOrigin.y <= -.2
      && edgePayoutOrigin.z >= dimensions.PAYOUT_TRAY_CENTER_Z - dimensions.PAYOUT_TRAY_FLOOR_HALF_DEPTH
        - dimensions.PAYOUT_TRAY_CATCHER_MARGIN - dimensions.PAYOUT_TRAY_ENTRY_CATCH_OVERLAP,
    'the edge payout must originate from the recessed catcher beneath the deck lip');
  } finally {
    deckLipModel.destroy();
  }

  const extendedTrayModel = new CoinPusherModel();
  try {
    for (const coin of extendedTrayModel.coins.splice(0)) extendedTrayModel.world.removeRigidBody(coin.body);
    const trayEdgeCoin = extendedTrayModel.createCoin(
      0,
      dimensions.PAYOUT_TRAY_FLOOR_TOP_Y + .032,
      dimensions.PAYOUT_TRAY_CENTER_Z + dimensions.PAYOUT_TRAY_FLOOR_HALF_DEPTH - .05,
      true,
    );
    trayEdgeCoin.tumbling = false;
    trayEdgeCoin.falling = true;
    trayEdgeCoin.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    trayEdgeCoin.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    trayEdgeCoin.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (let frame = 0; frame < 36; frame += 1) extendedTrayModel.update(1000 / 60);
    assert.ok(extendedTrayModel.coins.includes(trayEdgeCoin),
    'a coin near the front of the collection well must not be culled by a stale cabinet bound');
    assert.equal(trayEdgeCoin.collected, true,
      'a coin that settles at the far end of the pit should still trigger one confirmed payout');
    assert.equal(extendedTrayModel.drainEvents().filter((event) => event.type === 'coins-collected')
      .reduce((count, event) => count + event.count, 0), 1,
    'the compact pit must confirm its caught coin exactly once');
  } finally {
    extendedTrayModel.destroy();
  }

  const trayEntryModel = new CoinPusherModel();
  try {
    for (const coin of trayEntryModel.coins.splice(0)) trayEntryModel.world.removeRigidBody(coin.body);
    const entryCoin = trayEntryModel.createCoin(
      0,
      dimensions.PAYOUT_TRAY_FLOOR_TOP_Y + .032,
      dimensions.PAYOUT_TRAY_CENTER_Z - dimensions.PAYOUT_TRAY_FLOOR_HALF_DEPTH
        - dimensions.PAYOUT_TRAY_CATCHER_MARGIN - .08,
      true,
    );
    entryCoin.tumbling = false;
    entryCoin.falling = true;
    entryCoin.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    entryCoin.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    entryCoin.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (let frame = 0; frame < 36; frame += 1) trayEntryModel.update(1000 / 60);
    assert.ok(trayEntryModel.coins.includes(entryCoin),
      'a coin physically overlapping the catcher at the entry lip must remain visible');
    assert.equal(entryCoin.collected, true,
      'a settled coin straddling the pit entrance must count as caught even while its center remains outside the floor edge');
    const entryPayouts = trayEntryModel.drainEvents().filter((event) => event.type === 'coins-collected');
    assert.equal(entryPayouts.reduce((count, event) => count + event.count, 0), 1,
      'the entry-lip catch must produce one confirmed wallet payout instead of disappearing');
  } finally {
    trayEntryModel.destroy();
  }

  // Bidirectional support and actual backboard-driven shelf stripping are covered in
  // coin-pusher-carrier.test.js. Reversing by itself must never release a shelf coin.

  const runs = [
    { period: 25, offset: 2, lanes: [-1.44, -.72, 0, .72, 1.44] },
    { period: 31, offset: 17, lanes: [-.96, -.32, .32, .96] },
    { period: 37, offset: 5, lanes: [-2, -1, 0, 1, 2] },
    // Exercise an unrestricted burst before letting the same long run stress dense pile
    // contacts, plate riders, rail guards and the payout catcher.
    { period: 6, offset: 0, lanes: [-2.3, 2.3, -1.8, 1.8, 0], burstCadence: true },
  ];
  let collectionEventCount = 0;
  let collectedTotal = 0;

  for (const [runIndex, run] of runs.entries()) {
    const model = new CoinPusherModel();
    let requestedDrops = 0;
    let worstBoardPenetration = 0;
    let worstBoardDetails = '';
    let worstDeckPenetration = 0;
    let worstSideEscape = 0;
    let worstRearRiderPenetration = 0;
    let minimumFasciaClearance = Infinity;
    let worstFasciaDetails = '';
    let maxUpwardSpeed = 0;
    let maxUpwardSpeedDetails = '';
    let maxRiderSupportGap = 0;
    let unsupportedPusherContacts = 0;
    let firstUnsupportedPusherContact = '';
    const plateContactFramesByCoin = new Map();
    const droppedAtFrame = new Map();
    const acceptedDropFrames = [];
    const impactEventIds = new Set();
    let forwardBeatLandings = 0;
    let maxDropTumble = 0;
    let runCollectedTotal = 0;
    try {
      assert.equal(model.world.numInternalPgsIterations, 3, 'dense coin contacts use extra low-cost stability passes');
      for (let frame = 0; frame < 1800; frame += 1) {
        const dropIndex = Math.floor((frame - run.offset) / run.period);
        const dropWindow = frame >= run.offset && (frame - run.offset) % run.period === 0;
        const shouldDrop = run.burstCadence
          ? dropWindow && requestedDrops < 42 && model.canDropCoin()
          : dropWindow && dropIndex < 36;
        if (shouldDrop) {
          const laneIndex = run.burstCadence ? requestedDrops : dropIndex;
      const dropId = model.dropCoin(run.lanes[laneIndex % run.lanes.length]);
          assert.notEqual(dropId, undefined);
          droppedAtFrame.set(dropId, frame);
          acceptedDropFrames.push(frame);
          requestedDrops += 1;
        }
        model.update(1000 / 60);
        for (const event of model.drainEvents()) {
          if (event.type === 'coin-landed') {
            assert.ok(droppedAtFrame.has(event.coinId), 'a landing sound must belong to an actual dropped coin');
            assert.ok(Object.values(event.position).every(Number.isFinite), 'landing effects need a finite physical impact point');
            assert.ok(event.position.y > 0, 'first coin impacts should happen on the playfield, not under the table');
            assert.ok(['home-pause', 'forward', 'front-pause', 'return'].includes(event.pusherBeat),
              'each real landing should report the pusher beat at the physical impact frame');
            if (event.pusherBeat === 'forward') forwardBeatLandings += 1;
            assert.equal(impactEventIds.has(event.coinId), false, 'each drop should emit only one first-impact cue');
            impactEventIds.add(event.coinId);
            continue;
          }
          if (event.type === 'pusher-stroke') continue;
          if (event.type === 'pusher-contact') {
            assert.ok(event.count > 0 && Object.values(event.position).every(Number.isFinite),
              'pusher clatter feedback must be anchored to real coin contact without affecting payout totals');
            continue;
          }
          assert.equal(event.type, 'coins-collected');
          assert.ok(event.count > 0, 'a collection event must contain at least one settled coin');
          assert.equal(event.positions.length, event.count,
            'every confirmed tray coin must have its own physical payout origin');
          assert.ok(event.positions.every((position) => Object.values(position).every(Number.isFinite)),
            'payout origins must remain finite through a crowded run');
          collectionEventCount += 1;
          collectedTotal += event.count;
          runCollectedTotal += event.count;
        }

        for (const coin of model.coins) {
          if (coin.falling || coin.transferringToDeck) continue;
          const position = coin.body.translation();
          const rotation = coin.body.rotation();
          const velocity = coin.body.linvel();
          const axisY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);
          const halfHeight = .168 * Math.sqrt(Math.max(0, 1 - axisY * axisY)) + .032 * Math.abs(axisY);
          const axisZ = 2 * (rotation.y * rotation.z + rotation.w * rotation.x);
          const halfDepthZ = .168 * Math.sqrt(Math.max(0, 1 - axisZ * axisZ)) + .032 * Math.abs(axisZ);
          const overlapsUpperFascia = position.y + halfHeight > dimensions.PUSHER_SLOT_TOP_Y
            && position.y - halfHeight < dimensions.REAR_CASE_TOP_Y;
          const overlapsLowerFascia = position.y - halfHeight < dimensions.PUSHER_SLOT_BOTTOM_Y
            && position.y + halfHeight > dimensions.REAR_CASE_BOTTOM_Y;
          if (Math.abs(position.x) < 2.88 + .168
            && (overlapsUpperFascia || overlapsLowerFascia)) {
            // The actual front face is the case's nominal face plus 4mm, from the modeled
            // fascia center (-86mm) and half-depth (90mm). Check detached coins too: they
            // are exactly where a hidden rear-wall jam can otherwise escape this test.
            const clearance = position.z - (dimensions.REAR_CASE_FRONT_Z + .004 + halfDepthZ);
            if (clearance < minimumFasciaClearance) {
              minimumFasciaClearance = clearance;
              worstFasciaDetails = `frame=${frame}, id=${coin.id}, pos=${JSON.stringify(position)}, rot=${JSON.stringify(rotation)}, riding=${coin.ridingPusher}`;
            }
          }
          if (velocity.y > maxUpwardSpeed) {
            maxUpwardSpeed = velocity.y;
            maxUpwardSpeedDetails = `frame=${frame}, id=${coin.id}, pos=${JSON.stringify(position)}, tumbling=${coin.tumbling}, riding=${coin.ridingPusher}, nudges=${coin.restNudges}`;
          }
          if (position.z >= dimensions.MAIN_DECK_BACK_Z && position.z <= dimensions.MAIN_DECK_FRONT_Z) {
            worstSideEscape = Math.max(worstSideEscape, Math.abs(position.x) - 2.69);
          }
          if (coin.ridingPusher) {
            worstRearRiderPenetration = Math.max(
              worstRearRiderPenetration,
              dimensions.REAR_CASE_FRONT_Z + .004 + halfDepthZ + .006 - position.z,
            );
          }
          const dropFrame = droppedAtFrame.get(coin.id);
          if (dropFrame !== undefined && frame - dropFrame <= 24) {
            // X/Z quaternion energy is off-axis tumble; Y-only spin leaves both components zero.
            maxDropTumble = Math.max(maxDropTumble, Math.hypot(rotation.x, rotation.z));
          }
          const bottom = position.y - halfHeight;
          if (coin.ridingPusher) {
            maxRiderSupportGap = Math.max(maxRiderSupportGap, Math.abs(bottom - .035));
            if (bottom - .035 > .012) assert.equal(model.hasVerticalPusherContact(coin), true,
              'support hysteresis is only valid while Rapier still reports a real plate contact');
          }
          if (coin.dropped && !coin.ridingPusher && !coin.transferringToDeck
            && Math.abs(position.x) < dimensions.PUSHER_WIDTH / 2 - .25
            && position.z > dimensions.REAR_CASE_FRONT_Z + .168 + .012 + .04
            && model.hasVerticalPusherContact(coin)
            && model.isCoinSupportedOnPusher(coin, position.x, position.z)) {
            unsupportedPusherContacts += 1;
            firstUnsupportedPusherContact ||= `frame=${frame}, id=${coin.id}, pos=${JSON.stringify(position)}`;
          }
          const overPlate = Math.abs(position.x) < dimensions.PUSHER_WIDTH / 2 - .18
            && Math.abs(position.z - model.pusherZ) < dimensions.PUSHER_HALF_DEPTH - .18;

          const onRaisedPlate = overPlate && bottom > FIXED_DECK_TOP_Y + .07;
          if (onRaisedPlate) {
            const penetration = .041 - bottom;
            if (penetration > worstBoardPenetration) {
              worstBoardPenetration = penetration;
              worstBoardDetails = `frame=${frame}, id=${coin.id}, pos=${JSON.stringify(position)}, rot=${JSON.stringify(rotation)}, plateZ=${model.pusherZ.toFixed(3)}`;
            }
            if (coin.dropped && Math.abs(bottom - .041) < .03) {
              plateContactFramesByCoin.set(coin.id, (plateContactFramesByCoin.get(coin.id) ?? 0) + 1);
            }
          } else if (
            position.z >= dimensions.MAIN_DECK_BACK_Z
            && position.z <= dimensions.MAIN_DECK_FRONT_Z
            && Math.abs(position.x) < 2.7
          ) {
            worstDeckPenetration = Math.max(worstDeckPenetration, FIXED_DECK_TOP_Y - bottom);
          }
        }
      }
      assert.equal(requestedDrops, run.burstCadence ? 42 : 36,
        `run ${runIndex + 1} should accept every scheduled drop without a crowded-board cap`);
      if (run.burstCadence) {
        assert.ok(acceptedDropFrames[1] - acceptedDropFrames[0] <= 6
          && acceptedDropFrames[2] - acceptedDropFrames[1] <= 6,
        'the burst fixture must accept fast consecutive drops without waiting for a landing');
        assert.ok(runCollectedTotal > 0,
          'even an unrestricted burst must produce real tray catches and wallet payout events');
      }
      assert.ok(impactEventIds.size > 0, `run ${runIndex + 1} should report real first coin impacts`);
      assert.ok(forwardBeatLandings > 0,
        `run ${runIndex + 1} should exercise the non-monetary forward-timing feedback`);
      assert.ok(maxDropTumble > .3, `run ${runIndex + 1}: a dropped coin should visibly tumble off-axis before landing`);
      assert.ok(!model.coins.some((coin) => !coin.dropped && coin.ridingPusher && coin.body.translation().y < .04),
        `run ${runIndex + 1}: a lower-deck starter coin must not be teleported into the shelf carrier`);
      assert.ok(maxUpwardSpeed <= .381,
        `run ${runIndex + 1}: playfield rebound must stay at or below the 0.38m/s anti-pop cap (${maxUpwardSpeed.toFixed(2)}m/s; ${maxUpwardSpeedDetails})`);
      assert.ok(maxRiderSupportGap < .025,
        `run ${runIndex + 1}: every carried coin must remain supported by the plate (${maxRiderSupportGap.toFixed(3)}m)`);
      assert.equal(unsupportedPusherContacts, 0,
        `run ${runIndex + 1}: a coin resting on the moving plate must stay attached (${firstUnsupportedPusherContact})`);
      const longestPlateRide = Math.max(0, ...plateContactFramesByCoin.values());
      assert.ok(longestPlateRide >= 30, `run ${runIndex + 1}: a dropped coin should ride on the plate for at least 0.5s`);
      assert.ok(worstBoardPenetration < .012, `run ${runIndex + 1}: coin embedded ${worstBoardPenetration.toFixed(3)}m into the pusher (${worstBoardDetails})`);
      assert.ok(worstDeckPenetration < .012, `run ${runIndex + 1}: coin embedded ${worstDeckPenetration.toFixed(3)}m into the deck`);
      assert.ok(worstSideEscape < .012, `run ${runIndex + 1}: coin crossed the side-wall inner face by ${worstSideEscape.toFixed(3)}m`);
      assert.ok(worstRearRiderPenetration < .012,
        `run ${runIndex + 1}: rider crossed the rear fascia by ${worstRearRiderPenetration.toFixed(3)}m`);
      assert.ok(minimumFasciaClearance >= .005,
        `run ${runIndex + 1}: coin lost its rear-fascia clearance (${minimumFasciaClearance.toFixed(3)}m; ${worstFasciaDetails})`);
      const stalledEdgeCoins = model.coins.filter((coin) => coin.falling && coin.fallAge > 1
        && coin.body.translation().z > dimensions.MAIN_DECK_SUPPORT_FRONT_Z
        && coin.body.translation().y > FIXED_DECK_TOP_Y - .015);
      assert.equal(stalledEdgeCoins.length, 0,
        `run ${runIndex + 1}: coins over the front edge must tip into the tray instead of resting indefinitely (${stalledEdgeCoins.map((coin) => coin.id).join(', ')})`);
    } finally {
      model.destroy();
    }
  }
  assert.ok(collectionEventCount > 0 && collectedTotal > 0,
    'a full pusher run must emit a real settled payout event');
});
