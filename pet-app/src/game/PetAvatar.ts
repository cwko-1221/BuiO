import Phaser from 'phaser';
import type { AnimationLayout, PetAction, PetDefinition, PetFacing, PetInstance } from '../types';

/**
 * The pet as an animated sprite.
 *
 * The build pipeline emits one atlas per species per evolution stage: a grid whose columns are
 * animation frames and whose four rows are the facings (front / right / back / left). The frame
 * ranges for each action arrive from the server inside `catalog.animation`, because the client
 * is not allowed to fetch the sprite manifest directly — /pet/assets only serves hashed
 * .js/.css/.webp files.
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

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    definition: PetDefinition,
    pet: PetInstance,
    options: { layout?: AnimationLayout | null; fallbackTexture?: string; scale?: number } = {},
  ) {
    super(scene, x, y);
    const { layout, fallbackTexture, scale = 1 } = options;
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
    this.addWearables(pet.equippedWearables);
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
        const base = row * layout.columns;
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
      if (range) this.sprite.setFrame(row * this.layout.columns + range.start + Math.floor(range.length / 2));
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

  private addWearables(ids: string[]) {
    ids.forEach((id, index) => {
      const hue = Math.abs([...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 7919) % 0xffffff;
      if (id.startsWith('head')) this.add(this.scene.add.star(0, -130, 5, 16, 28, hue).setAngle(index * 8));
      else if (id.startsWith('face')) this.add(this.scene.add.rectangle(0, -62, 78, 25, hue, 0.25).setStrokeStyle(4, hue));
      else if (id.startsWith('neck')) this.add(this.scene.add.ellipse(0, -18, 100, 21, hue).setStrokeStyle(3, 0xffffff, 0.5));
      else if (id.startsWith('back')) this.addAt(this.scene.add.ellipse(0, -12, 150, 92, hue, 0.75), 1);
      else if (id.startsWith('aura')) this.addAt(this.scene.add.circle(0, -22, 90, hue, 0.08).setStrokeStyle(5, hue, 0.65), 1);
    });
  }
}
