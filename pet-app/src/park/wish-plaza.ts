import Phaser from 'phaser';
import { PLAZA_ART, inPlazaArt, type ParkObject } from '../../lib/park-world.mjs';
import manifest from './wish-plaza-assets.json';

type ArtKey = keyof typeof manifest.assets;
const prefix = 'park:plaza:';
const specs: Partial<Record<string, { asset: ArtKey; width: number; originY: number }>> = {
  bear: { asset: 'bear', width: 104, originY: .98 },
  board: { asset: 'board', width: 217, originY: .98 },
  fountain: { asset: 'fountain', width: 422, originY: .74 },
  bench: { asset: 'bench', width: 260, originY: .92 },
  chime: { asset: 'chime', width: 186, originY: .98 },
  drum: { asset: 'drum', width: 126, originY: .95 },
  bell: { asset: 'bell', width: 178, originY: .98 },
  sign: { asset: 'board', width: 134, originY: .98 },
};

export function preloadWishPlaza(scene: Phaser.Scene) {
  for (const [name, asset] of Object.entries(manifest.assets)) {
    const key = prefix + name;
    if (!scene.textures.exists(key)) scene.load.image(key, `/pet/assets/art/park/wish-plaza-v1/${asset.file}`);
  }
}
export function drawWishPlaza(scene: Phaser.Scene) {
  const key = prefix + 'ground-blended';
  if (!scene.textures.exists(key)) {
    const source = scene.textures.get(prefix + 'ground').getSourceImage() as HTMLImageElement;
    const canvas = scene.textures.createCanvas(key, source.width, source.height)!;
    const context = canvas.context;
    context.drawImage(source, 0, 0);
    // Blend the perimeter in the renderer. The selected source artwork stays
    // untouched; its edge follows irregular meadow contours instead of a box.
    const pixels = context.getImageData(0, 0, source.width, source.height);
    for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
      const left = x - 9 - 8 * Math.sin(y / 43) - 5 * Math.sin(y / 17);
      const right = source.width - x - 9 - 8 * Math.sin(y / 57);
      const top = y - 7 - 6 * Math.sin(x / 39);
      const edge = Math.max(0, Math.min(1, Math.min(left, right, top) / 82));
      pixels.data[(y * source.width + x) * 4 + 3] = Math.round(255 * edge * edge * (3 - 2 * edge));
    }
    context.putImageData(pixels, 0, 0); canvas.refresh();
  }
  scene.add.image(PLAZA_ART.x, PLAZA_ART.y, key).setOrigin(0)
    .setDisplaySize(PLAZA_ART.width, PLAZA_ART.height).setDepth(-9);
}
export function drawPlazaTree(scene: Phaser.Scene, tree: { x: number; y: number; scale: number }) {
  const image = scene.add.image(tree.x, tree.y, prefix + 'tree').setOrigin(.5, .95);
  image.setScale(510 * tree.scale / image.width).setDepth(tree.y);
  return image;
}
export function drawPlazaObject(scene: Phaser.Scene, object: ParkObject) {
  if (!inPlazaArt(object)) return;
  const spec = specs[object.id === 'bear' ? 'bear' : object.kind];
  if (!spec) return;
  const image = scene.add.sprite(object.x, object.y, prefix + spec.asset).setOrigin(.5, spec.originY);
  image.setScale(spec.width / image.width).setDepth(object.y);
  // Subtle contact shadows sit below independent sprites and moving pets.
  if (object.kind !== 'fountain') scene.add.ellipse(object.x + 7, object.y - 2, spec.width * .72, object.kind === 'npc' ? 17 : 22, 0x3a422b, .13).setDepth(-3);
  return image;
}
export function addPlazaAmbience(scene: Phaser.Scene, reducedMotion: boolean) {
  if (reducedMotion) return;
  // Small independent glints keep the baked water lively without moving stone.
  for (let i = 0; i < 9; i++) {
    const x = 3480 + (i * 43) % 240, y = 2747 + Math.sin(i * 2.3) * 18;
    const glint = scene.add.star(x, y, 4, .8, 4, 0xfff6cf, 0).setDepth(2781);
    scene.tweens.add({ targets: glint, alpha: .85, scale: 1.4, duration: 800 + i * 80, delay: i * 370, yoyo: true, repeat: -1, hold: 90, repeatDelay: 1200 });
  }
}
