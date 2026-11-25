import Phaser from 'phaser';
import { PARK_WORLD, PARK_PATHS, PARK_COURTS, RIVER_CENTER, RIVER_HALF_WIDTH, ribbon, PARK_BRIDGES, GARDEN_PLOTS, LANDSCAPE_BEDS, type Point } from '../../lib/park-layout-v4.mjs';
import materials from './modular-art-assets.json';
import community from './community-art-assets.json';
export const communityKey=(id:string)=>'park:community:'+id;

const key = 'park:material:';
const CHUNK = 512;
type Context = CanvasRenderingContext2D;
const noise = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function line(c: Context, points: Point[]) { c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); }
function polygon(c: Context, points: Point[]) { line(c, points); c.closePath(); }
function ellipse(c: Context, x: number, y: number, rx: number, ry: number) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
function rounded(c: Context, x: number, y: number, w: number, h: number, r: number) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function pattern(c: Context, source: CanvasImageSource, worldSize: number) {
  const image = source as HTMLImageElement, value = c.createPattern(source, 'repeat')!;
  value.setTransform(new DOMMatrix().scale(worldSize / image.width)); return value;
}
function curb(c: Context, x: number, y: number, angle: number, seed: number, size = 1) {
  c.save(); c.translate(x, y); c.rotate(angle);
  const w = (27 + noise(seed) * 11) * size, h = (11 + noise(seed + 7) * 4) * size;
  c.fillStyle = '#5b60443a'; rounded(c, -w / 2, -h / 2 + 3, w, h, 4); c.fill();
  const gradient = c.createLinearGradient(0, -h / 2, 0, h / 2);
  gradient.addColorStop(0, '#eee2bf'); gradient.addColorStop(.4, '#d7c7a2'); gradient.addColorStop(1, '#a99c7e');
  c.fillStyle = gradient; c.strokeStyle = '#9d92754d'; c.lineWidth = 1; rounded(c, -w / 2, -h / 2, w, h, 4); c.fill(); c.stroke();
  c.restore();
}
function edgeStones(c: Context, points: Point[], halfWidth: number) {
  let carried = 0, number = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (!length) continue;
    for (let distance = carried; distance < length; distance += 39) {
      const x = a.x + dx * distance / length, y = a.y + dy * distance / length, angle = Math.atan2(dy, dx);
      for (const side of [-1, 1]) {
        const px = x - dy / length * halfWidth * side, py = y + dx / length * halfWidth * side;
        if (PARK_COURTS.some(t => ((px - t.x) / t.rx) ** 2 + ((py - t.y) / t.ry) ** 2 < .96)) continue;
        if (PARK_BRIDGES.some(t => px > t.x - 30 && px < t.x + t.width + 30 && py > t.y - 25 && py < t.y + t.height + 25)) continue;
        curb(c, px, py, angle + (noise(number) - .5) * .09, number++);
      }
    }
    carried = (carried - length) % 39; if (carried < 0) carried += 39;
  }
}
function courtPoints(court: typeof PARK_COURTS[number]) {
  return Array.from({ length: 121 }, (_, i) => { const a = i / 120 * Math.PI * 2, wobble = 1 + .008 * Math.sin(a * 7) + .009 * Math.cos(a * 3); return { x: court.x + Math.cos(a) * court.rx * wobble, y: court.y + Math.sin(a) * court.ry * wobble }; });
}

export function preloadTerrain(scene: Phaser.Scene) {
  for(const [id,asset]of Object.entries(community.assets))if(!scene.textures.exists(communityKey(id)))scene.load.image(communityKey(id),'/pet/assets/art/park/community-v1/'+asset.file);
  for (const [id, asset] of Object.entries(materials.assets)) if (!scene.textures.exists(key + id)) scene.load.image(key + id, `/pet/assets/art/park/modular-v4/${asset.file}`);
}
function drawGround(c: Context, scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
  const source = (id: string) => scene.textures.get(key + id).getSourceImage() as HTMLImageElement;
  const grass = pattern(c, source('grass'), 920), stone = pattern(c, source('stone'), 360), soil = pattern(c, source('soil'), 800);
  c.lineCap = c.lineJoin = 'round';
  c.fillStyle = grass; c.fillRect(x, y, width, height);
  c.fillStyle = '#cbd4ab'; c.globalAlpha = .12; c.fillRect(x, y, width, height); c.globalAlpha = 1;
  // An organic woodland floor fades into meadow; it is a material layer, never an enlarged illustration.
  if (x < 2900 && y < 2050) {
    const layer = document.createElement('canvas'); layer.width = width; layer.height = height;
    const s = layer.getContext('2d')!; s.translate(-x, -y); s.fillStyle = pattern(s, source('soil'), 800); s.fillRect(x, y, width, height);
    s.globalCompositeOperation = 'destination-in'; s.save(); s.translate(1420, 800); s.scale(1, .76);
    const fade = s.createRadialGradient(0, 0, 600, 0, 0, 1450); fade.addColorStop(0, '#000e'); fade.addColorStop(.5, '#000a'); fade.addColorStop(1, '#0000');
    s.fillStyle = fade; s.fillRect(-1800, -1800, 3600, 3600); s.restore();
    c.drawImage(layer, x, y);
  }
  // Dirt clearings lie below the stone walks so intersections never become
  // squared-off stubs when an oval clearing is painted over a path.
  for (const court of PARK_COURTS.filter(t => t.material === 'soil')) { polygon(c, courtPoints(court)); c.fillStyle = soil; c.fill(); }
  // A fine dirt shoulder plus hand-set edging, without thick graphic road outlines.
  for (const path of PARK_PATHS) {
    line(c, path.points); c.strokeStyle = '#829062'; c.globalAlpha = .45; c.lineWidth = path.width + 16; c.stroke(); c.globalAlpha = 1;
    line(c, path.points); c.strokeStyle = stone; c.lineWidth = path.width; c.stroke();
  }
  for (const court of PARK_COURTS.filter(t => t.material !== 'soil')) {
    polygon(c, courtPoints(court)); c.fillStyle = court.material === 'soil' ? soil : stone; c.fill();
  }
  for (const path of PARK_PATHS) edgeStones(c, path.points, path.width / 2 + 1);
  for (const court of PARK_COURTS.filter(t => t.material !== 'soil')) {
    const points = courtPoints(court);
    for (let i = 0; i < 120; i += 2) {
      const a = points[i], b = points[i + 1];
      if (PARK_PATHS.some(path => path.points.some(p => Math.hypot(p.x - a.x, p.y - a.y) < path.width * .6))) continue;
      curb(c, a.x, a.y, Math.atan2(b.y - a.y, b.x - a.x), i + 800);
    }
  }
  // Planting borders must remain visible over court paving, exactly where feet are blocked.
  for (const bed of LANDSCAPE_BEDS) {
    ellipse(c, bed.x + 5, bed.y + 7, bed.rx + 8, bed.ry + 8); c.fillStyle = '#53634038'; c.fill();
    ellipse(c, bed.x, bed.y, bed.rx, bed.ry); c.fillStyle = soil; c.fill();
    const count=Math.max(22,Math.ceil(Math.PI*(bed.rx+bed.ry)/36));
    for(let i=0;i<count;i++){const a=i/count*Math.PI*2;curb(c,bed.x+Math.cos(a)*bed.rx,bed.y+Math.sin(a)*bed.ry,Math.atan2(Math.cos(a)*bed.ry,-Math.sin(a)*bed.rx),i+990);}
  }
  // River material and banks are generated from the exact collision ribbon.
  polygon(c, ribbon(RIVER_CENTER, RIVER_HALF_WIDTH + 36)); c.fillStyle = '#798966'; c.fill();
  polygon(c, ribbon(RIVER_CENTER, RIVER_HALF_WIDTH + 17)); c.fillStyle = '#b8ba90'; c.fill();
  polygon(c, ribbon(RIVER_CENTER, RIVER_HALF_WIDTH + 4)); c.fillStyle = '#466f72'; c.fill();
  polygon(c, ribbon(RIVER_CENTER, RIVER_HALF_WIDTH));
  const water = c.createLinearGradient(2320, 0, 2690, 0); water.addColorStop(0, '#68a9aa'); water.addColorStop(.5, '#7dc2c0'); water.addColorStop(1, '#559b9f'); c.fillStyle = water; c.fill();
  polygon(c, ribbon(RIVER_CENTER,RIVER_HALF_WIDTH));c.globalAlpha=.66;c.fillStyle=pattern(c,source('water'),800);c.fill();c.globalAlpha=1;
  c.save(); polygon(c, ribbon(RIVER_CENTER, RIVER_HALF_WIDTH - 10)); c.clip();
  for (let i = 0; i < 70; i++) {
    const row = RIVER_CENTER[Math.floor(noise(i + 490) * RIVER_CENTER.length)], px = row.x + (noise(i + 750) - .5) * 225, py = noise(i + 610) * PARK_WORLD.height;
    c.strokeStyle = i % 3 ? '#e6efcf47' : '#2c7f8955'; c.lineWidth = i % 4 ? 1.3 : 2.5; c.beginPath(); c.ellipse(px, py, 12 + noise(i + 1) * 24, 2 + noise(i + 2) * 4, -.12, .15, Math.PI * 1.25); c.stroke();
  }
  c.restore();
  // The complete painted soil-and-frame sprite follows the existing solid footprint.
  const bedImage=scene.textures.get(communityKey('garden-bed')).getSourceImage() as HTMLImageElement;
  for(const bed of GARDEN_PLOTS)c.drawImage(bedImage,bed.x-7,bed.y-9,bed.width+14,bed.height+19);
}

// ImageGen floor and rail sprites are independent layers. Feet still collide
// against the exact authored rail strips; the near rail occludes passing pets.
function bridgeFloor(scene: Phaser.Scene,bridge:typeof PARK_BRIDGES[number]){
  scene.add.image(bridge.x,bridge.y,communityKey(bridge.material+'-deck')).setOrigin(0).setDisplaySize(bridge.width,bridge.height).setDepth(-10).setData('nativeBridge',bridge.id);
}
function bridgeRail(scene: Phaser.Scene,bridge:typeof PARK_BRIDGES[number],front:boolean){
  const base=front?bridge.y+bridge.height:bridge.y+28;
  scene.add.image(bridge.x-18,base+5,communityKey(bridge.material+'-rail')).setOrigin(0,1).setDisplaySize(bridge.width+36,110).setDepth(front?bridge.y+bridge.height+2:bridge.y+30).setData('nativeRail',front?'front':'back');
}

export function drawModularTerrain(scene: Phaser.Scene) {
  for (let y = 0; y < PARK_WORLD.height; y += CHUNK) for (let x = 0; x < PARK_WORLD.width; x += CHUNK) {
    const id = `park:ground:v4:${x}:${y}`, w = Math.min(CHUNK, PARK_WORLD.width - x), h = Math.min(CHUNK, PARK_WORLD.height - y);
    if (!scene.textures.exists(id)) {
      // A two-world-pixel gutter gives the GPU real neighbor pixels at every
      // fractional camera edge. Adjacent chunks overlap; no transparent seams.
      const canvas = scene.textures.createCanvas(id, w + 4, h + 4)!, c = canvas.context; c.translate(2 - x, 2 - y); drawGround(c, scene, x - 2, y - 2, w + 4, h + 4); canvas.refresh();
    }
    scene.add.image(x - 2, y - 2, id).setOrigin(0).setDepth(-30);
  }
  for (const bridge of PARK_BRIDGES) { bridgeFloor(scene, bridge); bridgeRail(scene, bridge, false); bridgeRail(scene, bridge, true); }
}
export function drawModularMiniMap(c: Context, width: number, height: number) {
  c.save(); c.scale(width / PARK_WORLD.width, height / PARK_WORLD.height);
  c.fillStyle = '#a7bc83'; c.fillRect(0, 0, PARK_WORLD.width, PARK_WORLD.height);
  c.fillStyle = '#83916d'; ellipse(c, 1400, 900, 1250, 950); c.fill();
  for (const path of PARK_PATHS) { line(c, path.points); c.strokeStyle = '#e5d5af'; c.lineWidth = path.width; c.lineCap = 'round'; c.stroke(); }
  for (const court of PARK_COURTS) { polygon(c, courtPoints(court)); c.fillStyle = court.material === 'soil' ? '#b2a17d' : '#e5d5af'; c.fill(); }
  polygon(c, ribbon(RIVER_CENTER, RIVER_HALF_WIDTH + 20)); c.fillStyle = '#bac29c'; c.fill();
  polygon(c, ribbon(RIVER_CENTER, RIVER_HALF_WIDTH)); c.fillStyle = '#69b2b4'; c.fill();
  for (const bridge of PARK_BRIDGES) { c.fillStyle = bridge.material === 'wood' ? '#c7a76f' : '#d1c39f'; c.fillRect(bridge.x, bridge.y, bridge.width, bridge.height); }
  for (const bed of GARDEN_PLOTS) { c.fillStyle = '#8e7755'; c.fillRect(bed.x, bed.y, bed.width, bed.height); }
  c.restore();
}
