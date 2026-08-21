import Phaser from 'phaser';
import type { AnimationLayout, ContentBox, PetAction, PetAnchors, PetDefinition, PetFacing, PetInstance, WearableDefinition } from '../types';
import { SLOT_LAYOUT, UNMEASURED, placeWearable, type SlotLayout } from './wearableLayout';

/** Unpack a base64 motion track into signed bytes. Four per atlas cell, or nothing if absent. */
function decodeMotion(encoded?: string | null) {
  if (!encoded) return undefined;
  try {
    const binary = atob(encoded);
    const bytes = new Int8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = (binary.charCodeAt(i) << 24) >> 24;
    return bytes;
  } catch {
    return undefined; // a malformed track must never stop the pet from rendering
  }
}

/**
 * The pet as an animated sprite.
 *
 * The build pipeline emits one atlas per species per evolution stage, laid out as a grid with
 * one action per row. Phaser indexes a spritesheet in reading order, so an action's frames run
 * contiguously from its published start index. The grid exists so the sheet stays inside the
 * 4096px texture limit that older tablets report — a single long strip could not be uploaded
 * on those devices at all, and the pet would fail to render rather than merely load slowly.
 *
 * The frame ranges arrive from the server inside `catalog.animation`, because the client cannot
 * fetch the sprite manifest directly — /pet/assets only serves hashed .js/.css/.webp files.
 *
 * If the atlas is missing (pipeline not yet run) this degrades to the single static form image,
 * so the room is never empty.
 */

/** Actions that loop until something else is requested. Everything else returns to idle. */
const LOOPING: ReadonlySet<PetAction> = new Set<PetAction>(['idle', 'walk', 'sleep']);

/** Legacy emote names used by the DOM layer and scenes, mapped onto real actions. */
const EMOTE_ACTION: Record<string, PetAction> = {
  happy: 'happy', eat: 'eat', attack: 'auto-attack', hurt: 'hit',
  sleep: 'sleep', evolve: 'evolve', play: 'play', hatch: 'hatch', skill: 'active-skill',
};

/** Vertical origin that plants the creature's feet on the floor rather than its centre. */
const FOOT_ORIGIN = 0.78;

export class PetAvatar extends Phaser.GameObjects.Container {
  private sprite?: Phaser.GameObjects.Sprite;
  private staticArt?: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Ellipse;
  private layout?: AnimationLayout | null;
  private textureKey = '';
  private animationPrefix = '';
  private facing: PetFacing = 'front';
  private current: PetAction = 'idle';
  private reducedMotion: boolean;
  private anchors?: PetAnchors;
  private facingAnchors?: Partial<Record<PetFacing, PetAnchors>>;
  private motion?: Int8Array;
  private ambient?: number;
  private worn: {
    image: Phaser.GameObjects.Image; shade?: Phaser.GameObjects.Image; slotKey: string;
    box: ContentBox; behind: boolean; views: Record<string, { key: string; box: ContentBox }>;
  }[] = [];

  /** Texture key for a species/stage atlas. Shared so preload and construction agree. */
  static atlasKey(definition: PetDefinition, stage: number) {
    return `atlas-${definition.id}-${stage}`;
  }

  /**
   * Queue the atlas for loading. Call from a scene's preload(). Returns false when there is no
   * atlas for this pet, so the caller knows to load the static form art instead.
   */
  static preload(scene: Phaser.Scene, definition: PetDefinition, stage: number, layout?: AnimationLayout | null) {
    // A creature whose sheet has not been imported yet is still on placeholder art, which the
    // manifest does not describe. Playing it would cut frames in the wrong places.
    if (!definition.animated) return false;
    const url = definition.atlas?.[stage - 1];
    if (!url || !layout) return false;
    const key = PetAvatar.atlasKey(definition, stage);
    if (!scene.textures.exists(key)) {
      scene.load.spritesheet(key, url, { frameWidth: layout.frameWidth, frameHeight: layout.frameHeight });
    }
    return true;
  }

  /** Queue the artwork for a pet's equipped items. Call from a scene's preload(). */
  static preloadWearables(scene: Phaser.Scene, ids: string[] | undefined, wearables: WearableDefinition[]) {
    for (const id of ids ?? []) {
      const definition = wearables.find((item) => item.id === id);
      if (definition?.art && !scene.textures.exists(id)) scene.load.image(id, definition.art);
      // The same piece drawn from the side and from behind. A creature that walks turns away, and
      // a front-facing crown seen from behind is the thing these are here to stop.
      for (const facing of ['right', 'back'] as const) {
        const url = definition?.views?.[facing];
        const key = `${id}:${facing}`;
        if (url && !scene.textures.exists(key)) scene.load.image(key, url);
      }
    }
  }

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    definition: PetDefinition,
    pet: PetInstance,
    options: { layout?: AnimationLayout | null; fallbackTexture?: string; scale?: number; wearables?: WearableDefinition[]; ambient?: number } = {},
  ) {
    super(scene, x, y);
    const { layout, fallbackTexture, scale = 1, wearables, ambient } = options;
    this.ambient = ambient;
    this.layout = layout;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
      || localStorage.getItem('pet-reduced-motion') === '1';

    this.shadow = scene.add.ellipse(0, 30, 112, 30, 0x263547, 0.18);
    this.add(this.shadow);

    const key = PetAvatar.atlasKey(definition, pet.stage);
    if (layout && scene.textures.exists(key)) {
      this.textureKey = key;
      this.animationPrefix = `${definition.id}-${pet.stage}`;
      this.registerAnimations(definition, pet.stage, layout);
      this.sprite = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, FOOT_ORIGIN);
      // Atlas cells are authored small so the sheets stay manageable; scale to stage presence.
      this.sprite.setScale((250 / layout.frameHeight) * (1 + (pet.stage - 1) * 0.06));
      if (ambient !== undefined) this.sprite.setTint(ambient);
      this.add(this.sprite);
    } else {
      this.staticArt = fallbackTexture && scene.textures.exists(fallbackTexture)
        ? scene.add.image(0, 0, fallbackTexture).setOrigin(0.5, 0.82)
        : this.fallbackBody(definition, pet.stage);
      if (this.staticArt instanceof Phaser.GameObjects.Image) {
        const max = Math.max(this.staticArt.width, this.staticArt.height);
        this.staticArt.setScale((230 / Math.max(1, max)) * (1 + (pet.stage - 1) * 0.08));
      }
      this.add(this.staticArt);
    }

    this.setScale(scale);
    this.addWearables(pet.equippedWearables, definition, pet.stage, wearables);
    scene.add.existing(this);
    this.play('idle');
  }

  /** Build one Phaser animation per action per facing from the server-supplied frame ranges. */
  private registerAnimations(definition: PetDefinition, stage: number, layout: AnimationLayout) {
    for (const action of layout.actions) {
      // A clip from the pose sheet already knows which way it faces and which cells it plays.
      // An action from the older sheet is a run within each direction row, so it is built once
      // per direction and offset into that row.
      const facings = action.facing ? [action.facing] : layout.directions;
      for (const facing of facings) {
        const animationKey = `${definition.id}-${stage}-${action.name}-${facing}`;
        if (this.scene.anims.exists(animationKey)) continue;
        const row = Math.max(0, layout.directions.indexOf(facing));
        const cells = action.frames
          ?? Array.from({ length: action.length }, (_, offset) => row * layout.framesPerDirection + action.start + offset);
        this.scene.anims.create({
          key: animationKey,
          frames: cells.map((frame) => ({ key: this.textureKey, frame })),
          frameRate: action.name === 'sleep' ? Math.round(layout.fps / 2.5) : layout.fps,
          repeat: LOOPING.has(action.name) ? -1 : 0,
        });
      }
    }
  }
  /** Play an action. One-shot actions fall back to idle when they finish. */
  play(action: PetAction, facing: PetFacing = this.facing) {
    this.facing = facing;
    this.current = action;
    if (!this.sprite || !this.layout) return this.tweenFallback(action);
    if (this.reducedMotion && !LOOPING.has(action)) {
      // Keep the state change legible without oscillation: hold the action's key pose.
      const range = this.layout.actions.find((entry) => entry.name === action && (!entry.facing || entry.facing === facing))
        ?? this.layout.actions.find((entry) => entry.name === action);
      const row = Math.max(0, this.layout.directions.indexOf(facing));
      if (range) {
        const cells = range.frames
          ?? Array.from({ length: range.length }, (_, offset) => row * this.layout!.framesPerDirection + range.start + offset);
        const cell = cells[Math.floor(cells.length / 2)];
        this.sprite.setFrame(cell);
        this.layoutWearables(cell);
      }
      this.scene.time.delayedCall(420, () => this.settle());
      return;
    }
    // Left is the right-hand set mirrored. Drawing it twice would double the sheet for a view
    // nobody can tell apart, and the creatures are close enough to symmetrical for it to hold.
    const drawn = facing === 'left' ? 'right' : facing;
    this.sprite.setFlipX(facing === 'left');

    // A sheet may not carry every facing — today's art has only the front — so fall back rather
    // than freezing on whatever was playing.
    let animationKey = `${this.animationPrefix}-${action}-${drawn}`;
    if (!this.scene.anims.exists(animationKey)) animationKey = `${this.animationPrefix}-${action}-front`;
    if (!this.scene.anims.exists(animationKey)) animationKey = `${this.animationPrefix}-idle-front`;
    if (!this.scene.anims.exists(animationKey)) return;
    this.sprite.play(animationKey, true);
    if (!LOOPING.has(action)) {
      this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.settle());
    }
  }

  private settle() {
    if (this.current !== 'sleep') this.play('idle', this.facing);
  }

  setFacing(facing: PetFacing) {
    if (facing === this.facing) return;
    this.play(this.current, facing);
  }

  /** What the creature is doing, so the room can tell walking apart from a one-shot reaction. */
  get action() { return this.current; }

  /** Legacy entry point used by the DOM layer's `pet:emote` event. */
  emote(type: string) {
    const action = EMOTE_ACTION[type] ?? 'happy';
    this.play(action);
    if (this.reducedMotion) return;
    // A short positional accent on top of the frame animation — the frames carry the squash and
    // stretch, so this only adds travel the atlas cannot express.
    if (action === 'happy') {
      this.scene.tweens.add({ targets: this, y: this.y - 26, duration: 190, yoyo: true, ease: 'Sine.out' });
    } else if (action === 'hit') {
      this.scene.tweens.add({ targets: this, x: this.x - 14, duration: 70, yoyo: true, repeat: 1, ease: 'Quad.out' });
    }
  }

  /** Idle breathing for the no-atlas fallback path only; atlas idle already breathes. */
  private tweenFallback(action: PetAction) {
    const target = this.staticArt;
    if (!target || this.reducedMotion) return;
    this.scene.tweens.killTweensOf(target);
    if (LOOPING.has(action)) {
      this.scene.tweens.add({ targets: target, y: -7, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.scene.tweens.add({ targets: this.shadow, scaleX: 0.88, alpha: 0.12, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
  }

  private fallbackBody(definition: PetDefinition, stage: number) {
    const container = this.scene.add.container(0, 0);
    const color = Phaser.Display.Color.HexStringToColor(definition.color).color;
    const body = this.scene.add.ellipse(0, 0, 122 + stage * 9, 94 + stage * 7, color);
    const head = this.scene.add.circle(0, -57, 54 + stage * 3, color);
    const eyeA = this.scene.add.ellipse(-19, -62, 10, 15, 0x223047);
    const eyeB = this.scene.add.ellipse(19, -62, 10, 15, 0x223047);
    container.add([body, head, eyeA, eyeB]);
    return container;
  }

  /**
   * Draw the equipped items using their own artwork.
   *
   * These were placeholder Phaser shapes — a star for a hat, a rectangle for glasses — left in
   * when the avatar was first wired up. The artwork existed all along; nothing ever loaded it,
   * so equipping a crown put a blue star over the pet's head.
   */
  private addWearables(
    ids: string[] | undefined,
    definition: PetDefinition,
    stage: number,
    wearables?: WearableDefinition[],
  ) {
    const equipped = (ids ?? []).filter((id) => this.scene.textures.exists(id));
    if (!equipped.length) return;

    this.anchors = definition.anchors?.[stage - 1] ?? UNMEASURED;
    this.facingAnchors = definition.facingAnchors?.[stage - 1] ?? undefined;
    this.motion = decodeMotion(definition.motion?.[stage - 1]);

    for (const id of equipped) {
      const item = wearables?.find((entry) => entry.id === id);
      const slotKey = item?.slot ?? id.split('-')[0];
      const slot = SLOT_LAYOUT[slotKey];
      if (!slot) continue;
      const box = item?.content ?? { x: 0, y: 0, width: 1, height: 1 };
      // What to draw, and the outline to fit it by, for each way the creature can face. A view
      // with no art of its own falls back to the front, which is what a set that has only ever
      // been drawn once looks like.
      const views: Record<string, { key: string; box: ContentBox }> = { front: { key: id, box } };
      for (const facing of ['right', 'back'] as const) {
        const key = `${id}:${facing}`;
        views[facing] = this.scene.textures.exists(key)
          ? { key, box: item?.viewContent?.[facing] ?? box }
          : { key: id, box };
      }

      const image = this.scene.add.image(0, 0, id);
      if (this.ambient !== undefined) image.setTint(this.ambient);

      // A worn thing darkens what it sits on. Without that contact the art reads as a decal
      // floating a few pixels off the fur, however well it is positioned. A dark copy of the
      // piece, offset down and flattened, sells the contact at this size — and it is only worth
      // drawing for the pieces that actually rest against the body.
      let shade: Phaser.GameObjects.Image | undefined;
      if (!slot.behind) {
        shade = this.scene.add.image(0, 0, id);
        shade.setTint(0x000000).setAlpha(0.22);
        this.add(shade);
      }
      if (slot.behind) this.addAt(image, 1); else this.add(image);
      this.worn.push({ image, shade, slotKey, box, behind: !!slot.behind, views });
    }

    this.layoutWearables();
    // Follow the pose. The head travels up to 45px on a 160px cell between frames of a single
    // action, so anything pinned to the resting pose slides out from under itself as soon as the
    // creature breathes — which is precisely what makes a worn item look stuck on.
    this.sprite?.on(Phaser.Animations.Events.ANIMATION_UPDATE, this.onFrame, this);
    this.sprite?.on(Phaser.Animations.Events.ANIMATION_START, this.onFrame, this);
  }

  private onFrame(_animation: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame) {
    const cell = Number(frame.textureFrame);
    this.layoutWearables(Number.isFinite(cell) ? cell : 0);
  }

  /** Place every worn item against the landmarks for one atlas cell. */
  private layoutWearables(cell = 0) {
    if (!this.worn.length) return;
    // A creature seen from the side does not carry its head where its front view does, so the
    // landmarks measured on that pose are used when it is turned. Left is the right-hand set
    // mirrored, exactly as the body is.
    const seen = this.facing === 'left' ? 'right' : this.facing;
    const anchors = this.facingAnchors?.[seen] ?? this.anchors ?? UNMEASURED;

    // What is worn on the back is behind the creature until the creature turns round. Wings
    // and a satchel belong in front of it from behind; an aura is a glow on the floor and
    // stays under it whichever way it faces.
    for (const piece of this.worn) {
      if (piece.slotKey !== 'back') continue;
      const wanted = this.facing !== 'back' && piece.behind;
      const at = this.getIndex(piece.image);
      if (wanted && at > 1) this.moveTo(piece.image, 1);
      if (!wanted && at <= 1) this.bringToTop(piece.image);
    }
    const cellWidth = this.sprite && this.layout ? this.layout.frameWidth : this.staticArtSize().width;
    const cellHeight = this.sprite && this.layout ? this.layout.frameHeight : this.staticArtSize().height;
    const scale = this.sprite ? this.sprite.scaleY : this.staticArtScale();
    const origin = this.sprite ? FOOT_ORIGIN : 0.82;

    // The track holds this frame's drift from the resting pose in cell pixels, plus how much the
    // body has stretched, so the landmarks move and breathe along with the creature.
    const track = this.motion;
    const offset = track && cell * 4 + 3 < track.length ? cell * 4 : -1;
    const eye = anchors.eye + (offset >= 0 ? track![offset + 1] / cellHeight : 0);
    const centre = anchors.centre + (offset >= 0 ? track![offset + 2] / cellWidth : 0);
    const stretch = offset >= 0 ? 1 + track![offset + 3] / 100 : 1;
    // The head keeps its resting shape and simply travels with the eyes. Reading the measured
    // skull line per frame instead let the two landmarks drift apart, which shrank and dropped a
    // hat onto the face on the frames where the silhouette happened to read differently — a real
    // head does not change size when it nods.
    const top = eye - (anchors.eye - anchors.top);

    const toLocalY = (fraction: number) => (fraction * cellHeight - origin * cellHeight) * scale;
    const centreX = (centre - 0.5) * cellWidth * scale;
    const head = Math.max(0.01, eye - top);

    for (const worn of this.worn) {
      // Left borrows the right-hand drawing and mirrors it, exactly as the body does.
      const view = worn.views[seen] ?? worn.views.front;
      if (worn.image.texture.key !== view.key) worn.image.setTexture(view.key);
      if (worn.shade && worn.shade.texture.key !== view.key) worn.shade.setTexture(view.key);
      const place = placeWearable({ ...anchors, top, eye, centre }, worn.slotKey, view.box, stretch, seen);
      if (!place) continue;
      const y = (place.y * cellHeight - origin * cellHeight) * scale;
      // Walking left is the right-hand art mirrored — the body already is. A worn thing that did
      // not mirror with it ended up facing the way the creature had come from, with a hat's brim
      // pointing backwards and a satchel's buckles on the wrong shoulder.
      const mirrored = this.facing === 'left';
      const x = (place.x - 0.5) * cellWidth * scale * (mirrored ? -1 : 1);
      worn.image.setOrigin(place.originX, place.originY);
      worn.image.setScale(place.size * cellWidth * scale / Math.max(1, worn.image.width));
      worn.image.setFlipX(mirrored);
      worn.image.setPosition(x, y);
      // The shadow lands slightly low and slightly flattened, as if cast onto the body below.
      worn.shade?.setFlipX(mirrored);
      worn.shade?.setOrigin(place.originX, place.originY)
        .setScale(Math.abs(worn.image.scaleX) * 0.97 * (mirrored ? -1 : 1), worn.image.scaleY * 0.9)
        .setPosition(x, y + Math.max(2, place.size * cellHeight * scale * 0.06));
    }
  }

  private staticArtSize() {
    const art = this.staticArt;
    return art instanceof Phaser.GameObjects.Image
      ? { width: art.width, height: art.height }
      : { width: 230, height: 230 };
  }

  private staticArtScale() {
    const art = this.staticArt;
    return art instanceof Phaser.GameObjects.Image ? art.scaleY : 1;
  }
}
