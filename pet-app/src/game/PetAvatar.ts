import Phaser from 'phaser';
import type { AnimationLayout, PetAction, PetAnchors, PetDefinition, PetFacing, PetInstance, WearableDefinition } from '../types';

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
    options: { layout?: AnimationLayout | null; fallbackTexture?: string; scale?: number; wearables?: WearableDefinition[] } = {},
  ) {
    super(scene, x, y);
    const { layout, fallbackTexture, scale = 1, wearables } = options;
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
      if (range) this.sprite.setFrame(row * this.layout.framesPerDirection + range.start + Math.floor(range.length / 2));
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
  private static readonly SLOT_LAYOUT: Record<string, {
    line: 'skull' | 'eye' | 'chin' | 'body' | 'feet'; anchor: number;
    against: 'head' | 'face' | 'width'; width: number; tallest: number; behind?: boolean;
  }> = {
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

    // Landmarks are fractions of the atlas cell; convert them once into container-local pixels.
    const anchors = definition.anchors?.[stage - 1] ?? PetAvatar.UNMEASURED;
    const cellWidth = this.sprite && this.layout ? this.layout.frameWidth : this.staticArtSize().width;
    const cellHeight = this.sprite && this.layout ? this.layout.frameHeight : this.staticArtSize().height;
    const scale = this.sprite ? this.sprite.scaleY : this.staticArtScale();
    const origin = this.sprite ? FOOT_ORIGIN : 0.82;
    const toLocalY = (fraction: number) => (fraction * cellHeight - origin * cellHeight) * scale;
    const centreX = (anchors.centre - 0.5) * cellWidth * scale;

    for (const id of equipped) {
      const item = wearables?.find((entry) => entry.id === id);
      const slot = PetAvatar.SLOT_LAYOUT[item?.slot ?? id.split('-')[0]];
      if (!slot) continue;

      // The head is the unit of measure for anything worn on it: a chin sits about two thirds of
      // a head below the eyes whatever the creature's overall proportions are.
      const head = anchors.eye - anchors.top;
      const line = slot.line === 'skull' ? anchors.top
        : slot.line === 'eye' ? anchors.eye
          : slot.line === 'chin' ? anchors.eye + 0.62 * head
            : slot.line === 'feet' ? anchors.bottom
              : anchors.eye + 0.42 * (anchors.bottom - anchors.eye);
      const target = anchors[slot.against] * cellWidth * scale * slot.width;

      const image = this.scene.add.image(centreX, toLocalY(line), id);
      // Scale and anchor on the drawn object, not the canvas: the art does not fill its frame.
      const box = item?.content ?? { x: 0, y: 0, width: 1, height: 1 };
      // Width alone is not enough. A monocle trails a long chain and a wizard hat is mostly
      // point, so fitting either to the head's width makes it taller than the whole creature;
      // the cap keeps a lanky piece in proportion by falling back to a height fit.
      const ceiling = slot.tallest * head * cellHeight * scale;
      image.setScale(Math.min(
        target / Math.max(1, box.width * image.width),
        ceiling / Math.max(1, box.height * image.height),
      ));
      image.setOrigin(box.x + box.width / 2, box.y + slot.anchor * box.height);
      if (slot.behind) this.addAt(image, 1); else this.add(image);
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
