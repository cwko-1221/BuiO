import Phaser from 'phaser';
import { WORLD, OBJECTS, zoneAt, type ParkObject } from '../../lib/park-world.mjs';
import manifest from './world-art-assets.json';
import marketArt from './market-art-assets.json';
import adventure from './adventure-art-assets.json';
import plaza from './wish-plaza-assets.json';
import { preloadTerrain, drawModularTerrain, drawModularMiniMap } from './terrain';
import { LANDSCAPE_BEDS, PARK_PLANTINGS, PARK_RIVER_ROCKS } from '../../lib/park-layout-v4.mjs';

type ArtKey = keyof typeof manifest.assets;
type Spec = { key: string; width: number; originY: number; floor?: boolean };
const prefix = 'park:world:';
const old = 'park:plaza:';
const spec = (asset: ArtKey, width: number, originY = .96, floor = false): Spec => ({ key: prefix + asset, width, originY, floor });
const objects: Record<string, Spec> = {
  house: spec('house', 645, .94), mailbox: spec('mailbox', 106, .97),
  cottage: spec('house', 630, .94),
  arcade: { key: old + 'board', width: 220, originY: .98 },
  pump: { key: 'park:material:waterworks', width: 260, originY: .96 },
  sign: spec('sign', 138), apple: spec('apple', 375), hollow: spec('hollow', 390),
  pond: spec('pond', 485, .54, true), acorn: spec('acorn', 58, .88), litter: spec('litter', 64, .9),
  mushrooms: spec('mushrooms', 217, .93),
  board: { key: old + 'board', width: 217, originY: .98 },
  fountain: { key: old + 'fountain', width: 422, originY: .74 },
  bench: { key: old + 'bench', width: 260, originY: .92 },
  chime: { key: old + 'chime', width: 186, originY: .98 },
  drum: { key: old + 'drum', width: 126, originY: .95 },
  bell: { key: old + 'bell', width: 178, originY: .98 },
};
const flowerArt: Record<string, ArtKey> = { 'flowers-a': 'sunflowers', 'flowers-b': 'tulips', 'flowers-c': 'daisies' };
export function npcArtKey(species: string) { return ['merchant','eco'].includes(species)?'park:market:'+species:species === 'bear' ? old + 'bear' : prefix + species; }
export function preloadWorldArt(scene: Phaser.Scene) {
  for(const id of ['merchant','eco','trash-can','trash-bottle','trash-paper'] as const)scene.load.image('park:market:'+id,'/pet/assets/art/park/market-v1/'+marketArt.assets[id].file);
  for (const [key, asset] of Object.entries(plaza.assets)) {
    if (key !== 'ground' && !scene.textures.exists(old + key)) scene.load.image(old + key, `/pet/assets/art/park/wish-plaza-v1/${asset.file}`);
  }
  for (const [key, asset] of Object.entries(manifest.assets)) {
    if (['home-ground', 'garden-ground', 'forest-ground', 'grass', 'paving'].includes(key)) continue;
    if (!scene.textures.exists(prefix + key)) scene.load.image(prefix + key, `/pet/assets/art/park/full-park-v1/${asset.file}`);
  }
  for (const [key, asset] of Object.entries(adventure.assets)) if (!scene.textures.exists('park:adventure:' + key)) scene.load.image('park:adventure:' + key, `/pet/assets/art/park/adventure-v2/${asset.file}`);
  preloadTerrain(scene);
}
export function drawWorldTerrain(scene: Phaser.Scene) {
  drawModularTerrain(scene);
  for (const border of PARK_PLANTINGS) {
    scene.add.ellipse(border.x+3,border.y-10,border.width*.72,26,0x445936,.13).setDepth(-4);
    const image=scene.add.image(border.x,border.y,'park:material:'+border.asset).setOrigin(.5,.92).setFlipX(border.flip);
    image.setScale(border.width/image.width).setDepth(border.y);
  }
  for (const rock of PARK_RIVER_ROCKS) {
    const image=scene.add.image(rock.x,rock.y,'park:material:bank-rocks').setOrigin(.5,.88).setFlipX(rock.flip); image.setScale(rock.width/image.width).setDepth(rock.y);
  }
  for (const bed of LANDSCAPE_BEDS.filter(b => b.id !== 'garden-island')) {
    for (let i = 0; i < 5; i++) {
      const x = bed.x + (i - 2) * bed.rx * .34, y = bed.y + Math.sin(i * 2.1) * bed.ry * .35 + 45;
      const image = scene.add.image(x, y, prefix + 'bush').setOrigin(.5, .94); image.setScale((190 + i % 2 * 15) / image.width).setDepth(y);
    }
  }
}
export function drawWorldMiniMap(c: CanvasRenderingContext2D, scene: Phaser.Scene, width: number, height: number) {
  const sx = width / WORLD.width, sy = height / WORLD.height;
  drawModularMiniMap(c, width, height);
  for (const object of OBJECTS.filter(o => ['house', 'cottage', 'pond', 'fountain', 'arcade'].includes(o.kind))) {
    const key = object.game ? 'park:adventure:' + (object.game === 'banana' ? 'banana-stand' : 'sky-stand') : objects[object.kind].key;
    const source = scene.textures.get(key).getSourceImage() as HTMLImageElement;
    const size = (object.kind === 'house' || object.kind === 'cottage' ? 560 : object.game ? 320 : 360) * sx, height = size * source.height / source.width;
    c.drawImage(source, object.x * sx - size / 2, object.y * sy - height * .9, size, height);
  }
}
export function drawWorldScenery(scene: Phaser.Scene, decoration: { x: number; y: number; kind: string; scale: number; variant: number }) {
  const forest = zoneAt(decoration).id === 'forest';
  const key = decoration.kind === 'bush' ? prefix + 'bush' : forest && decoration.variant === 2 ? prefix + 'conifer' : old + 'tree';
  const width = (decoration.kind === 'bush' ? 225 : key.endsWith('conifer') ? 300 : forest ? 400 : 440) * decoration.scale;
  const image = scene.add.image(decoration.x, decoration.y, key).setOrigin(.5, .95);
  scene.add.ellipse(decoration.x + 8, decoration.y - 5, width * .5, width * .09, 0x405331, .13).setDepth(-4);
  image.setScale(width / image.width).setDepth(decoration.y); return image;
}
export function drawWorldObject(scene: Phaser.Scene, object: ParkObject) {
  let art: Spec = object.kind === 'npc' ? { key: npcArtKey(object.species!), width: object.species === 'merchant'?180:object.species === 'eco'?150:object.species === 'rabbit' ? 140 : object.species === 'squirrel' ? 146 : 115, originY: .98 } : objects[object.kind];
  if (object.id === 'log') art = spec('log', 254, .9);
  if (object.game) art = { key: 'park:adventure:' + (object.game === 'banana' ? 'banana-stand' : 'sky-stand'), width: object.game === 'banana' ? 330 : 232, originY: .98 };
  if (object.kind === 'flowers') art = spec(flowerArt[object.id], 324, .65);
  if (!art) throw Error(`Missing finished park art for ${object.id}`);
  const image = scene.add.sprite(object.x, object.y, art.key).setOrigin(.5, art.originY);
  image.setScale(art.width / image.width).setDepth(art.floor ? -3 : object.y);
  if (!art.floor && !['house', 'apple', 'hollow', 'flowers', 'fountain'].includes(object.kind)) {
    scene.add.ellipse(object.x + 5, object.y - 1, art.width * .7, object.kind === 'npc' ? 17 : 15, 0x353c29, .12).setDepth(-2);
  }
  return image;
}
export function addWorldAmbience(scene: Phaser.Scene, reducedMotion: boolean) {
  if (reducedMotion) return;
  const fountain = OBJECTS.find(o => o.id === 'fountain')!, pond = OBJECTS.find(o => o.id === 'pond')!;
  for (let i = 0; i < 9; i++) {
    const glint = scene.add.star(fountain.x - 115 + (i * 43) % 230, fountain.y - 33 + Math.sin(i * 2.3) * 18, 4, .8, 4, 0xfff6cf, 0).setDepth(fountain.y + 1);
    scene.tweens.add({ targets: glint, alpha: .8, scale: 1.4, duration: 800 + i * 80, delay: i * 370, yoyo: true, repeat: -1, hold: 90, repeatDelay: 1200 });
  }
  for (let i = 0; i < 14; i++) {
    const x = 1020 + (i * 137) % 1280, y = 630 + (i * 151) % 1040;
    const glow = scene.add.circle(x, y, i % 3 ? 1.8 : 2.5, 0xffe9aa, .1).setDepth(y + 8);
    scene.tweens.add({ targets: glow, alpha: .7, y: y - 21, duration: 1800 + i * 100, delay: i * 170, yoyo: true, repeat: -1 });
  }
  for (let i = 0; i < 5; i++) {
    const ring = scene.add.ellipse(pond.x - 80 + i * 35, pond.y - 16 + Math.sin(i) * 28, 22, 7).setStrokeStyle(1.2, 0xf5f4d4, .3).setDepth(-2);
    scene.tweens.add({ targets: ring, scale: 2, alpha: 0, duration: 2400 + i * 160, delay: i * 650, repeat: -1 });
  }
}
