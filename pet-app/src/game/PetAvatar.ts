import Phaser from 'phaser';
import type { PetDefinition, PetInstance } from '../types';

export class PetAvatar extends Phaser.GameObjects.Container {
  private bodyArt: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Ellipse;
  private reducedMotion: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, definition: PetDefinition, pet: PetInstance, textureKey?: string, scale = 1) {
    super(scene, x, y);
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || localStorage.getItem('pet-reduced-motion') === '1';
    this.shadow = scene.add.ellipse(0, 30, 112, 30, 0x263547, .18);
    this.bodyArt = textureKey && scene.textures.exists(textureKey)
      ? scene.add.image(0, 0, textureKey).setOrigin(.5, .82)
      : this.fallbackBody(definition, pet.stage);
    if (this.bodyArt instanceof Phaser.GameObjects.Image) {
      const max = Math.max(this.bodyArt.width, this.bodyArt.height);
      this.bodyArt.setScale((210 / Math.max(1, max)) * (1 + (pet.stage - 1) * .08));
    }
    this.add([this.shadow, this.bodyArt]);
    this.setScale(scale);
    this.addWearables(pet.equippedWearables);
    scene.add.existing(this);
    this.idle();
  }

  private fallbackBody(definition: PetDefinition, stage: number) {
    const container = this.scene.add.container(0, 0);
    const color = Phaser.Display.Color.HexStringToColor(definition.color).color;
    const body = this.scene.add.ellipse(0, 0, 122 + stage * 9, 94 + stage * 7, color);
    const head = this.scene.add.circle(0, -57, 54 + stage * 3, Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(color), Phaser.Display.Color.ValueToColor(0xffffff), 100, 12).color);
    const eyeA = this.scene.add.ellipse(-19, -62, 10, 15, 0x223047); const eyeB = this.scene.add.ellipse(19, -62, 10, 15, 0x223047);
    const shineA = this.scene.add.circle(-17, -66, 3, 0xffffff); const shineB = this.scene.add.circle(21, -66, 3, 0xffffff);
    const mouth = this.scene.add.arc(0, -43, 11, 15, 165, false, 0x563745).setStrokeStyle(3, 0x563745);
    container.add([body, head, eyeA, eyeB, shineA, shineB, mouth]);
    if (['cat','fox','dog','rabbit','bat'].includes(definition.body)) {
      const ears = definition.body === 'rabbit' ? [[-25,-112,18,56],[25,-112,18,56]] : [[-33,-99,30,36],[33,-99,30,36]];
      for (const [x,y,w,h] of ears) container.add(this.scene.add.triangle(x,y,-w/2,h/2,0,-h/2,w/2,h/2,color));
    }
    if (stage >= 2) container.add(this.scene.add.star(0, -5, 6, 8 + stage * 2, 17 + stage * 3, 0xffdc71).setAlpha(.9));
    if (stage >= 3) container.add(this.scene.add.arc(0, -45, 70, 195, 345, false, 0xffe7a3).setStrokeStyle(6, 0xffe7a3));
    if (stage >= 4) container.add(this.scene.add.circle(0, -30, 90, 0xfff4b5, .12).setStrokeStyle(3, 0xffdf72, .6));
    return container;
  }

  private addWearables(ids: string[]) {
    ids.forEach((id, index) => {
      const hue = Math.abs([...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 7919) % 0xffffff;
      if (id.startsWith('head')) this.add(this.scene.add.star(0, -130, 5, 16, 28, hue).setAngle(index * 8));
      else if (id.startsWith('face')) this.add(this.scene.add.rectangle(0, -62, 78, 25, hue, .25).setStrokeStyle(4, hue));
      else if (id.startsWith('neck')) this.add(this.scene.add.ellipse(0, -18, 100, 21, hue).setStrokeStyle(3, 0xffffff, .5));
      else if (id.startsWith('back')) this.addAt(this.scene.add.ellipse(0, -12, 150, 92, hue, .75), 1);
      else if (id.startsWith('aura')) this.addAt(this.scene.add.circle(0, -22, 90, hue, .08).setStrokeStyle(5, hue, .65), 1);
    });
  }

  idle() {
    if (this.reducedMotion) return;
    this.scene.tweens.add({ targets: this.bodyArt, y: -7, scaleY: this.bodyArt.scaleY * 1.025, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.scene.tweens.add({ targets: this.shadow, scaleX: .88, alpha: .12, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
  emote(type: 'happy' | 'eat' | 'attack' | 'hurt' | 'sleep' | 'evolve') {
    this.scene.tweens.killTweensOf(this);
    const configs: Record<string, Phaser.Types.Tweens.TweenBuilderConfig> = {
      happy: { targets: this, y: this.y - 45, angle: 7, duration: 180, yoyo: true, repeat: 2, ease: 'Back.out' },
      eat: { targets: this, scaleX: this.scaleX * 1.08, scaleY: this.scaleY * .92, duration: 160, yoyo: true, repeat: 2 },
      attack: { targets: this, x: this.x + 42, angle: 8, duration: 110, yoyo: true, ease: 'Quad.out' },
      hurt: { targets: this, x: this.x - 18, angle: -12, alpha: .45, duration: 90, yoyo: true, repeat: 2 },
      sleep: { targets: this, angle: -8, scaleY: this.scaleY * .92, duration: 500, yoyo: true },
      evolve: { targets: this, scaleX: this.scaleX * 1.32, scaleY: this.scaleY * 1.32, angle: 360, duration: 900, yoyo: true, ease: 'Cubic.inOut' },
    };
    this.scene.tweens.add({ ...configs[type], onComplete: () => { this.setAngle(0).setAlpha(1); } });
  }
}
