'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer } = require('vite');
const test = require('node:test');

test('reset restores exactly three flat rows and preserves confirmed payout events', async (t) => {
  const vite = await createServer({
    root: path.resolve(__dirname, '..'),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
    ssr: { noExternal: ['@dimforge/rapier3d'] },
  });
  t.after(() => vite.close());

  const { CoinPusherModel } = await vite.ssrLoadModule('/src/game/CoinPusherModel.ts');
  const { COIN_HALF_THICKNESS, COIN_SPACING, FIXED_DECK_TOP_Y, createCoinPusherStarterLayout } =
    await vite.ssrLoadModule('/src/game/CoinPusherLayout.ts');
  const { PUSHER_HOME_Z } = await vite.ssrLoadModule('/src/game/CoinPusherDimensions.ts');
  const expectedCoins = createCoinPusherStarterLayout({ rows: 3, upperLayerChance: 0 });
  const model = new CoinPusherModel();
  try {
    const removedIds = new Set(model.coins.map((coin) => coin.id));
    const droppedId = model.dropCoin(0);
    assert.ok(droppedId, 'fixture must include a dropped coin for the reset to remove');
    removedIds.add(droppedId);

    model.events.push(
      { type: 'coins-collected', count: 1, positions: [{ x: .2, y: -.65, z: 3.8 }] },
      { type: 'coin-landed', coinId: droppedId, position: { x: 0, y: .2, z: 1 }, pusherBeat: 'home-pause' },
    );
    assert.equal(model.resetBoardToThreeRows(), true);
    assert.equal(model.coins.length, expectedCoins.length);
    assert.ok(model.coins.every((coin) => !coin.dropped && !coin.falling && !coin.collected),
      'reset coins must be harmless starter coins, never payout-eligible paid drops');
    assert.ok(model.coins.every((coin) => !removedIds.has(coin.id)),
      'reset must remove every old physical coin before respawning the clean board');
    assert.ok(model.coins.every((coin) => Math.abs(coin.body.translation().y
      - (FIXED_DECK_TOP_Y + COIN_HALF_THICKNESS)) < 1e-6),
    'the reset board must contain only one flat layer, not hidden stacked coins');

    const rowStep = COIN_SPACING * Math.sqrt(3) / 2;
    const layoutRows = new Set(expectedCoins.map((coin) => Math.round((coin.z - expectedCoins[0].z) / rowStep)));
    assert.equal(layoutRows.size, 3, 'the clean board must have exactly three rows');
    assert.equal(model.pusherZ, PUSHER_HOME_Z, 'the pusher should return to its ready position');
    assert.equal(model.getPredictedDropBeat(), 'home-pause', 'the reset machine should await a new paid drop');

    const events = model.drainEvents();
    assert.equal(events.length, 1, 'stale impacts are removed while real earned payout events survive');
    assert.equal(events[0].type, 'coins-collected');
    assert.equal(events[0].count, 1);

    for (let frame = 0; frame < 60; frame += 1) model.update(1000 / 60);
    assert.equal(model.drainEvents().some((event) => event.type === 'coins-collected'), false,
      'three fresh starter rows must never award coins on their own');
    const restored = CoinPusherModel.restoreSnapshot(model.createSnapshot());
    try {
      assert.equal(restored.coins.length, expectedCoins.length, 'the reset rows must persist in a restored session');
      assert.ok(restored.coins.every((coin) => !coin.dropped), 'restored starter rows must stay non-paying coins');
    } finally {
      restored.destroy();
    }
  } finally {
    model.destroy();
  }
});

test('a coin in the tray entry overlap falls instead of being snapped back to deck height', async (t) => {
  const vite = await createServer({
    root: path.resolve(__dirname, '..'),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
    ssr: { noExternal: ['@dimforge/rapier3d'] },
  });
  t.after(() => vite.close());

  const { CoinPusherModel } = await vite.ssrLoadModule('/src/game/CoinPusherModel.ts');
  const { COIN_HALF_THICKNESS } = await vite.ssrLoadModule('/src/game/CoinPusherLayout.ts');
  const dimensions = await vite.ssrLoadModule('/src/game/CoinPusherDimensions.ts');
  const model = new CoinPusherModel();
  try {
    const coinId = model.dropCoin(0);
    const coin = model.coins.find((candidate) => candidate.id === coinId);
    assert.ok(coin, 'fixture must create a paid physical coin');
    const entryZ = dimensions.MAIN_DECK_FRONT_Z - .015;
    coin.body.setTranslation({
      x: 0,
      y: dimensions.PAYOUT_TRAY_FLOOR_TOP_Y + COIN_HALF_THICKNESS + .012,
      z: entryZ,
    }, true);
    coin.body.setLinvel({ x: 0, y: 0, z: 0 }, true);

    let collected = 0;
    for (let frame = 0; frame < 36; frame += 1) {
      model.update(1000 / 60);
      collected += model.drainEvents()
        .filter((event) => event.type === 'coins-collected')
        .reduce((sum, event) => sum + event.count, 0);
    }

    const caughtCoin = model.coins.find((candidate) => candidate.id === coinId);
    assert.ok(caughtCoin?.falling, 'a coin that drops below the tabletop in the tray overlap must enter payout fall state');
    assert.ok(caughtCoin.body.translation().y < -.2,
      'the coin must remain down in the collection well instead of teleporting to the tabletop');
    assert.equal(collected, 1, 'the real tray catch must produce exactly one earned payout');
  } finally {
    model.destroy();
  }
});

test('an old saved cabinet cannot keep coins supported across the visible payout well', async (t) => {
  const vite = await createServer({
    root: path.resolve(__dirname, '..'), server: { middlewareMode: true, hmr: false },
    appType: 'custom', logLevel: 'error', ssr: { noExternal: ['@dimforge/rapier3d'] },
  });
  t.after(() => vite.close());
  const { CoinPusherModel } = await vite.ssrLoadModule('/src/game/CoinPusherModel.ts');
  const { default: RAPIER } = await vite.ssrLoadModule('@dimforge/rapier3d');
  const dimensions = await vite.ssrLoadModule('/src/game/CoinPusherDimensions.ts');
  const old = new CoinPusherModel();
  let restored;
  try {
    for (const coin of old.coins.splice(0)) old.world.removeRigidBody(coin.body);
    // Reproduce a persisted older full-length tabletop beneath the currently visible trough.
    const oldDeck = old.deckColliders[2];
    oldDeck.setHalfExtents({ x: 2.52, y: .08, z: 2 });
    oldDeck.parent().setTranslation({ x: 0, y: -.045, z: 0 }, true);
    const coins = [dimensions.MAIN_DECK_FRONT_Z + .015, 1.15, 1.8].map((z, index) =>
      old.createCoin((index - 1) * .6, .067, z, false));
    const legacyBlade = old.world.createCollider(
      RAPIER.ColliderDesc.cuboid(2.48, .0925, .04).setTranslation(0, -.0025, dimensions.PUSHER_LIP_LOCAL_Z),
      old.pusherBody,
    );
    assert.equal(old.pusherBody.numColliders(), 2, 'the legacy fixture must really contain the removed front blade');
    const saved = old.createSnapshot();
    saved.pusherLipColliderHandle = legacyBlade.handle;
    delete saved.geometryRevision;
    restored = CoinPusherModel.restoreSnapshot(saved);
    assert.equal(restored.pusherBody.numColliders(), 1,
      'restoring an old board must remove the obsolete blade, not leave an invisible collision wall');
    assert.equal(restored.createSnapshot().pusherLipColliderHandle, undefined,
      'subsequent saves must not bring the blade back');
    assert.deepEqual(restored.coins.map((coin) => coin.id), coins.map((coin) => coin.id),
      'migration must preserve the existing coins rather than reset the student board');
    assert.ok(restored.createSnapshot().geometryRevision > 0,
      'the repaired cabinet must persist its geometry revision for subsequent reloads');
    let collected = 0;
    for (let frame = 0; frame < 90; frame += 1) {
      restored.update(1000 / 60);
      collected += restored.drainEvents().filter((event) => event.type === 'coins-collected')
        .reduce((sum, event) => sum + event.count, 0);
    }
    assert.equal(collected, coins.length, 'every coin in the visible trough must fall and confirm one +1');
    assert.ok(restored.coins.every((coin) => coin.collected && coin.body.translation().y < -.2),
      'coins at the entry, centre and front rail must all descend into the well');
    assert.ok(restored.coins.every((coin) => coin.body.translation().z > dimensions.MAIN_DECK_FRONT_Z + .24
      && coin.body.translation().z < dimensions.PAYOUT_TRAY_FRONT_WALL_CENTER_Z - .24),
    'the entire disc must clear both visible rims instead of leaving a sliced half-coin');
    const collectedReload = CoinPusherModel.restoreSnapshot(restored.createSnapshot());
    try {
      assert.equal(collectedReload.coins.length, 0,
        'a reload must not replay meshes whose +1 catch already happened');
      collectedReload.update(1000 / 60);
      assert.equal(collectedReload.drainEvents().some((event) => event.type === 'coins-collected'), false,
        'restoring collected coins must not create another payout event');
    } finally {
      collectedReload.destroy();
    }
    for (let frame = 0; frame < 150; frame += 1) restored.update(1000 / 60);
    assert.equal(restored.coins.length, 0, 'the collected trough must clear after its reward animation');
    assert.equal(restored.drainEvents().some((event) => event.type === 'coins-collected'), false,
      'clearing a collected coin must never produce a second +1');
  } finally {
    restored?.destroy();
    old.destroy();
  }
});
