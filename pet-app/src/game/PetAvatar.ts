import Phaser from 'phaser';
import type { AnimationLayout, ContentBox, PetAction, PetAnchors, PetDefinition, PetFacing, PetInstance, WearableDefinition } from '../types';

type SlotLayout = {
  line: 'skull' | 'eye' | 'chin' | 'body' | 'feet'; anchor: number;
  against: 'head' | 'face' | 'width'; width: number; tallest: number; behind?: boolean;
};

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
  private motion?: Int8Array;
  private ambient?: number;
  private worn: { image: Phaser.GameObjects.Image; shade?: Phaser.GameObjects.Image; slot: SlotLayout; box: ContentBox }[] = [];

  /** Texture key for a species/stage atlas. Shared so preload and construction agree. */
  static atlasKey(definition: PetDefinition, stage: number) {
    return `atlas-${definition.id}-${stage}`;
  }

  /**
   * Queue the atlas for loading. Call from a scene's preload(). Returns false when there is no
   * atlas for this pet, so the caller knows to load the static form art instead.
   */
  static preload(scene: Phaser.Scene, definition: PetDefinition, stage: number, layout?: AnimationLayout | null) {
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
    for (let row = 0; row < layout.directions.length; row += 1) {
      const facing = layout.directions[row];
      for (const action of layout.actions) {
        const animationKey = `${definition.id}-${stage}-${action.name}-${facing}`;
        if (this.scene.anims.exists(animationKey)) continue;
        const base = row * layout.framesPerDirection;
        this.scene.anims.create({
          key: animationKey,
          frames: Array.from({ length: action.length }, (_, offset) => ({
            key: this.textureKey,
            frame: base + action.start + offset,
          })),
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
      const range = this.layout.actions.find((entry) => entry.name === action);
      const row = Math.max(0, this.layout.directions.indexOf(facing));
      if (range) {
        const cell = row * this.layout.framesPerDirection + range.start + Math.floor(range.length / 2);
        this.sprite.setFrame(cell);
        this.layoutWearables(cell);
      }
      this.scene.time.delayedCall(420, () => this.settle());
      return;
    }
    const animationKey = `${this.animationPrefix}-${action}-${facing}`;
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
   * How each slot is placed against the creature's measured landmarks.
   *
   * `line` is where the slot sits: on the skull, on the eye line, or somewhere down the body
   * between the eyes and the feet. `anchor` is the point of the item's own artwork that lands
   * on that line — a hat hangs from near its brim, a collar sits on its middle. `width` scales
   * the item against the landmark it belongs to, so a wide-headed slime gets a wide hat and a
   * narrow rabbit a narrow one without either being hand-tuned.
   */
  private static readonly SLOT_LAYOUT: Record<string, SlotLayout> = {
    head: { line: 'skull', anchor: 0.86, against: 'head', width: 1.06, tallest: 1.5 },
    face: { line: 'eye', anchor: 0.50, against: 'face', width: 1.32, tallest: 0.9 },
    neck: { line: 'chin', anchor: 0.42, against: 'head', width: 0.70, tallest: 0.9 },
    back: { line: 'body', anchor: 0.50, against: 'width', width: 0.86, tallest: 2.2, behind: true },
    aura: { line: 'feet', anchor: 0.60, against: 'width', width: 1.25, tallest: 3.0, behind: true },
  };

  /** Whole-cell fallback for the static-art path, where no landmarks were measured. */
  private static readonly UNMEASURED: PetAnchors = {
    top: 0.14, eye: 0.34, bottom: 1, centre: 0.5, width: 0.86, head: 0.6, face: 0.42,
  };

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

    this.anchors = definition.anchors?.[stage - 1] ?? PetAvatar.UNMEASURED;
    this.motion = decodeMotion(definition.motion?.[stage - 1]);

    for (const id of equipped) {
      const item = wearables?.find((entry) => entry.id === id);
      const slot = PetAvatar.SLOT_LAYOUT[item?.slot ?? id.split('-')[0]];
      if (!slot) continue;
      const box = item?.content ?? { x: 0, y: 0, width: 1, height: 1 };

      const image = this.scene.add.image(0, 0, id);
      image.setOrigin(box.x + box.width / 2, box.y + slot.anchor * box.height);
      if (this.ambient !== undefined) image.setTint(this.ambient);

      // A worn thing darkens what it sits on. Without that contact the art reads as a decal
      // floating a few pixels off the fur, however well it is positioned. A dark copy of the
      // piece, offset down and flattened, sells the contact at this size — and it is only worth
      // drawing for the pieces that actually rest against the body.
      let shade: Phaser.GameObjects.Image | undefined;
      if (!slot.behind) {
        shade = this.scene.add.image(0, 0, id);
        shade.setOrigin(image.originX, image.originY).setTint(0x000000).setAlpha(0.22);
        this.add(shade);
      }
      if (slot.behind) this.addAt(image, 1); else this.add(image);
      this.worn.push({ image, shade, slot, box });
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
    const anchors = this.anchors ?? PetAvatar.UNMEASURED;
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
      const { slot, box, image, shade } = worn;
      // The head is the unit of measure for anything worn on it: a chin sits about two thirds of
      // a head below the eyes whatever the creature's overall proportions are.
      const line = slot.line === 'skull' ? top
        : slot.line === 'eye' ? eye
          : slot.line === 'chin' ? eye + 0.62 * head
            : slot.line === 'feet' ? anchors.bottom
              : eye + 0.42 * (anchors.bottom - eye);
      // Only what is measured against the body follows the body's squash: a cape stretches with
      // the torso, a crown does not get wider because the creature inhaled.
      const give = slot.against === 'width' ? stretch : 1;
      const target = anchors[slot.against] * cellWidth * scale * slot.width * give;

      // Width alone is not enough. A monocle trails a long chain and a wizard hat is mostly
      // point, so fitting either to the head's width makes it taller than the whole creature;
      // the cap keeps a lanky piece in proportion by falling back to a height fit.
      const ceiling = slot.tallest * head * cellHeight * scale;
      const fitted = Math.min(
        target / Math.max(1, box.width * image.width),
        ceiling / Math.max(1, box.height * image.height),
      );
      const y = toLocalY(line);
      image.setScale(fitted).setPosition(centreX, y);
      // The shadow lands slightly low and slightly flattened, as if cast onto the body below.
      shade?.setScale(fitted * 0.97, fitted * 0.9).setPosition(centreX, y + Math.max(2, ceiling * 0.06));
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
