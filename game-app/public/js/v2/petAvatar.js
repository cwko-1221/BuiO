// Climbers wear their own pet.
//
// A pet's artwork is the same five-by-four sheet the pet room draws from: twenty poses at 160px,
// with anything the creature is wearing supplied as separate sheets cut to the same grid. So a
// climber is not one sprite but a small stack of them — the creature, then each worn piece — all
// showing the same frame, in the same place, facing the same way.
//
// The mountain asks for movements a pet sheet was never drawn for. There is no climbing pose and no
// falling one, so the sheet's own vocabulary is borrowed: it walks in profile while running, throws
// its paws up for a jump, and wears the startled face on the way down.

/** Which of the pet's twenty cells each of the game's movements plays, and how fast. */
const POSES = Object.freeze({
  idle: { frames: [0, 0, 4], rate: 4, repeat: -1 },
  run: { frames: [6, 7, 8, 7], rate: 12, repeat: -1 },
  jump: { frames: [16], rate: 10, repeat: 0 },
  doubleJump: { frames: [16, 1], rate: 12, repeat: 0 },
  fall: { frames: [19], rate: 5, repeat: -1 },
  land: { frames: [18, 0], rate: 12, repeat: 0 },
  celebrate: { frames: [16, 0], rate: 6, repeat: -1 },
});

export const PET_FRAME = 160;

export function petOf(avatar) {
  const pet = avatar?.pet;
  return pet?.atlas ? pet : null;
}

/**
 * A texture name for one of a pet's sheets.
 *
 * Taken from the file's own path, which already carries a content stamp, so two climbers wearing
 * the same creature share one texture and a change of outfit cannot be served a stale one.
 */
function keyFor(url) {
  return `pet:${String(url).split('/').pop().split('?')[0]}`;
}

export function petKeys(pet) {
  return { atlas: keyFor(pet.atlas), layers: (pet.layers || []).map(keyFor) };
}

/**
 * Queue every sheet this pet needs, and say how many were actually asked for.
 *
 * Two climbers on the same mountain often wear the same creature and the same collar, so the same
 * sheet is offered repeatedly; a texture already loaded is skipped, and a caller told that nothing
 * was queued knows not to wait for a load that will never fire.
 */
export function queuePet(scene, pet) {
  const keys = petKeys(pet);
  const sheets = [[keys.atlas, pet.atlas], ...keys.layers.map((key, i) => [key, pet.layers[i]])];
  let queued = 0;
  for (const [key, url] of sheets) {
    if (scene.textures.exists(key)) continue;
    // Loaded whole and cut up afterwards. The loader's own sprite-sheet path wants a file
    // description this version does not build from these arguments, and every other picture in the
    // game arrives as a plain image, so these do too.
    scene.load.image(key, url);
    queued += 1;
  }
  return queued;
}

/**
 * Cut a loaded sheet into the pet's twenty cells.
 *
 * Done once per texture, when it is first wanted rather than when it arrives, because a sheet may
 * be shared by several climbers and only the first of them needs to do the work.
 */
export function sliceCells(scene, key) {
  const texture = scene.textures.get(key);
  if (!texture || texture.has('0')) return texture;
  for (let cell = 0; cell < 20; cell += 1) {
    texture.add(cell, 0, (cell % 5) * PET_FRAME, Math.floor(cell / 5) * PET_FRAME, PET_FRAME, PET_FRAME);
  }
  return texture;
}

/**
 * Give one pet texture the game's movements.
 *
 * Named per texture rather than globally: two climbers on the same mountain may be a cat and a pig,
 * and "run" has to mean a different set of pictures for each.
 */
export function definePetAnims(scene, atlasKey) {
  sliceCells(scene, atlasKey);
  for (const [name, pose] of Object.entries(POSES)) {
    const key = petAnim(atlasKey, name);
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: pose.frames.map((frame) => ({ key: atlasKey, frame })),
      frameRate: pose.rate,
      repeat: pose.repeat,
    });
  }
}

export const petAnim = (atlasKey, name) => `${atlasKey}:${name}`;

/**
 * The worn pieces, as sprites that shadow the creature.
 *
 * They are not animated in their own right. Every sheet is cut to the same grid, so a piece is
 * always showing whatever cell the creature is showing, and following the frame is both simpler
 * than keeping several animations in step and impossible to fall out of step with.
 */
export function makeLayers(scene, pet, depth) {
  return petKeys(pet).layers
    .filter((key) => scene.textures.exists(key))
    .map((key, index) => {
      sliceCells(scene, key);
      return scene.add.sprite(0, 0, key, 0).setDepth(depth + 1 + index);
    });
}

/** Put the worn pieces exactly where the creature is, showing what it is showing. */
export function syncLayers(layers, host) {
  if (!layers?.length) return;
  const frame = host.frame?.name ?? 0;
  for (const layer of layers) {
    layer.setPosition(host.x, host.y);
    layer.setFrame(frame);
    layer.setFlipX(host.flipX);
    layer.setAlpha(host.alpha);
    layer.setDisplaySize(host.displayWidth, host.displayHeight);
    layer.setVisible(host.visible);
  }
}

export function destroyLayers(layers) {
  for (const layer of layers || []) layer.destroy();
}
