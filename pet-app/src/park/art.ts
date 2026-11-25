import Phaser from 'phaser';
const CREAM = '#fff3d8', INK = '#314a49', WOOD = '#a97852';
type Draw = (ctx: CanvasRenderingContext2D, size: number) => void;
function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
}
function rect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  c.fillStyle = color; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
}
function line(c: CanvasRenderingContext2D, points: number[][], width: number, color: string) {
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
}
function texture(scene: Phaser.Scene, key: string, draw: Draw, size = 256) {
  if (scene.textures.exists(key)) return;
  const canvas = scene.textures.createCanvas(key, size, size)!; draw(canvas.context, size); canvas.refresh();
}
function shadow(c: CanvasRenderingContext2D, x = 128, y = 216, w = 80, h = 20) { ellipse(c, x, y, w, h, '#274f4225'); }
function flower(c: CanvasRenderingContext2D, x: number, y: number, color: string, size = 8) {
  line(c, [[x, y + 16], [x, y]], 3, '#679561');
  for (let i = 0; i < 5; i++) ellipse(c, x + Math.cos(i * 1.256) * size * .8, y + Math.sin(i * 1.256) * size * .8, size * .65, size * .65, color);
  ellipse(c, x, y, size * .4, size * .4, '#efc95e');
}
function tree(c: CanvasRenderingContext2D, variant: number, hollow = false) {
  shadow(c, 128, 232, 83, 22);
  rect(c, 113, 115, 31, 119, 13, '#996e53'); rect(c, 116, 115, 10, 119, 5, '#b68760');
  line(c, [[129, 178], [86, 145]], 12, '#996e53'); line(c, [[131, 160], [164, 126]], 10, '#996e53');
  if (hollow) { ellipse(c, 130, 202, 21, 29, '#6d503d'); ellipse(c, 133, 207, 14, 22, '#473e36'); }
  const greens = [['#477e68', '#66977b', '#85ad87'], ['#7f9d66', '#9bb276', '#b4c58a'], ['#518e82', '#76a395', '#96bba5']][variant % 3];
  ellipse(c, 128, 112, 95, 77, greens[0]); ellipse(c, 83, 104, 57, 54, greens[1]);
  ellipse(c, 150, 70, 63, 54, greens[1]); ellipse(c, 167, 115, 66, 57, greens[1]);
  ellipse(c, 99, 76, 54, 47, greens[2]); ellipse(c, 151, 51, 36, 27, greens[2]);
  if (variant === 1) for (const [x, y] of [[75, 103], [146, 74], [169, 129], [111, 137]]) { ellipse(c, x, y, 11, 12, '#cb7763'); ellipse(c, x - 3, y - 4, 4, 4, '#eda58a'); }
}
function npc(c: CanvasRenderingContext2D, species: string, frame: number) {
  const phase = frame / 12 * Math.PI * 2, breath = Math.sin(phase), lag = Math.sin(phase - .5);
  const body = species === 'bear' ? '#bd9272' : species === 'deer' ? '#d4ab7c' : species === 'rabbit' ? '#e6d3b3' : '#bf8863';
  const light = species === 'bear' ? '#d3ac87' : species === 'deer' ? '#e6c697' : species === 'rabbit' ? '#f5e7cf' : '#d7a37a';
  shadow(c, 128, 226, 55, 12);
  if (species === 'squirrel') { ellipse(c, 180, 166 + lag * 2, 37, 61, '#ac785c'); ellipse(c, 187, 157 + lag * 2, 25, 46, '#d6a27b'); }
  ellipse(c, 105, 217, 19, 11, '#997456'); ellipse(c, 148, 217, 19, 11, '#997456');
  ellipse(c, 128, 170 - breath * 1.8, 49 + breath, 50 + breath * 1.3, body);
  ellipse(c, 122, 166 - breath * 1.8, 39, 44, light);
  rect(c, 91, 155 - breath * 2, 72, 48, 17, species === 'rabbit' ? '#658c9d' : species === 'deer' ? '#779b76' : species === 'bear' ? '#759687' : '#c5ab72');
  rect(c, 111, 171 - breath * 2, 32, 22, 6, '#f4dfb0');
  ellipse(c, 77, 168 + lag * 2, 14, 23, body); ellipse(c, 176, 167 - lag * 2, 14, 23, body);
  const hy = 108 - lag * 2;
  if (species === 'rabbit') {
    ellipse(c, 101, 48 + lag * 2, 18, 45, body); ellipse(c, 150, 43 - lag * 2, 17, 44, light);
    ellipse(c, 101, 48 + lag * 2, 8, 31, '#d5a59b'); ellipse(c, 150, 43 - lag * 2, 7, 30, '#d5a59b');
  } else {
    ellipse(c, 86, hy - 38, species === 'deer' ? 22 : 23, 25, body); ellipse(c, 166, hy - 38, 23, 25, body);
    ellipse(c, 87, hy - 37, 12, 14, '#c68e80'); ellipse(c, 166, hy - 37, 12, 14, '#c68e80');
    if (species === 'deer') { line(c, [[104, 79], [93, 39], [80, 28]], 9, '#9c815f'); line(c, [[94, 53], [111, 37]], 7, '#9c815f'); line(c, [[151, 78], [161, 38], [176, 27]], 9, '#9c815f'); line(c, [[160, 53], [146, 36]], 7, '#9c815f'); }
  }
  ellipse(c, 128, hy, 57, 51, body); ellipse(c, 119, hy - 9, 47, 38, light);
  ellipse(c, 128, hy + 21, 30, 21, '#f1dbb9');
  const blink = frame === 9;
  if (blink) { line(c, [[101, hy + 4], [111, hy + 4]], 4, INK); line(c, [[145, hy + 4], [155, hy + 4]], 4, INK); }
  else { ellipse(c, 106, hy + 2, 4.2, 6, INK); ellipse(c, 150, hy + 2, 4.2, 6, INK); ellipse(c, 105, hy, 1.3, 1.6, CREAM); ellipse(c, 149, hy, 1.3, 1.6, CREAM); }
  ellipse(c, 128, hy + 17, 6, 4, '#70594d'); line(c, [[128, hy + 22], [128, hy + 27], [134, hy + 29]], 2.5, '#84675a');
  ellipse(c, 93, hy + 18, 10, 6, '#d4928555'); ellipse(c, 163, hy + 18, 10, 6, '#d4928555');
  if (species === 'rabbit') { rect(c, 83, hy - 45, 85, 15, 7, '#688a9a'); rect(c, 98, hy - 59, 57, 24, 9, '#82a7b2'); rect(c, 163, 175, 30, 36, 5, '#ad835f'); }
  if (species === 'bear') { rect(c, 105, hy - 49, 48, 15, 5, '#759687'); ellipse(c, 128, hy - 47, 31, 7, '#91ae94'); }
}
export function createParkArt(scene: Phaser.Scene) {
  for (let variant = 0; variant < 3; variant++) texture(scene, `park:tree:${variant}`, c => tree(c, variant));
  texture(scene, 'park:hollow', c => tree(c, 0, true));
  texture(scene, 'park:apple', c => tree(c, 1));
  texture(scene, 'park:bush', c => { shadow(c, 128, 224, 77, 14); ellipse(c, 128, 194, 77, 38, '#76a17a'); ellipse(c, 92, 184, 41, 32, '#97b88c'); ellipse(c, 152, 177, 43, 34, '#a6c294'); for (const [x, y] of [[80, 185], [125, 170], [164, 196]]) flower(c, x, y, '#e9c7aa', 5); });
  texture(scene, 'park:house', c => {
    shadow(c, 128, 228, 114, 20); rect(c, 38, 94, 180, 130, 15, '#d8c8a7'); rect(c, 42, 94, 172, 116, 13, '#f0e1bd');
    rect(c, 177, 37, 19, 45, 4, '#ac8b72'); c.fillStyle = '#8caa92'; c.beginPath(); c.moveTo(17, 109); c.lineTo(124, 27); c.lineTo(239, 109); c.closePath(); c.fill();
    c.fillStyle = '#adc5a4'; c.beginPath(); c.moveTo(17, 102); c.lineTo(124, 22); c.lineTo(207, 82); c.lineTo(112, 70); c.closePath(); c.fill();
    rect(c, 102, 147, 47, 78, 23, '#a78360'); rect(c, 107, 151, 37, 71, 18, '#c19c72'); ellipse(c, 135, 190, 3, 3, '#f8dc96');
    for (const x of [57, 168]) { rect(c, x, 133, 32, 37, 7, '#8daea9'); line(c, [[x + 16, 136], [x + 16, 166]], 3, CREAM); line(c, [[x + 3, 151], [x + 29, 151]], 3, CREAM); rect(c, x - 5, 172, 43, 11, 4, '#ba9a76'); flower(c, x + 8, 171, '#d79e9b', 5); flower(c, x + 25, 168, '#efd390', 5); }
    rect(c, 86, 222, 80, 10, 3, '#c1b496');
  });
  texture(scene, 'park:bench', c => { shadow(c, 128, 225, 86, 14); for (const x of [65, 181]) { rect(c, x, 163, 10, 62, 4, '#6e8370'); } for (let i = 0; i < 3; i++) rect(c, 41, 126 + i * 15, 174, 11, 4, i % 2 ? '#c29b72' : '#d3ad80'); rect(c, 42, 181, 172, 17, 5, '#c39b70'); rect(c, 37, 168, 12, 27, 5, '#738573'); rect(c, 207, 168, 12, 27, 5, '#738573'); });
  texture(scene, 'park:mailbox', c => { shadow(c, 128, 225, 48, 12); rect(c, 120, 143, 17, 81, 5, WOOD); rect(c, 78, 83, 99, 81, 31, '#b56d60'); rect(c, 82, 83, 90, 66, 29, '#d78e78'); rect(c, 96, 120, 61, 7, 3, '#76544c'); rect(c, 111, 140, 30, 9, 3, '#f6dcb1'); line(c, [[178, 102], [178, 72], [200, 72]], 8, '#8b7760'); });
  for (const kind of ['sign', 'board']) texture(scene, `park:${kind}`, c => { shadow(c, 128, 228, 72, 13); rect(c, 118, 135, 18, 91, 5, WOOD); rect(c, kind === 'board' ? 42 : 55, 76, kind === 'board' ? 172 : 146, kind === 'board' ? 118 : 76, 12, '#ad875e'); rect(c, kind === 'board' ? 50 : 61, 83, kind === 'board' ? 156 : 134, kind === 'board' ? 102 : 62, 8, kind === 'board' ? '#efdfb7' : '#e2c69b'); if (kind === 'board') { for (const [x, y] of [[64, 96], [118, 106], [164, 94]]) { rect(c, x, y, 34, 47, 3, '#fff3d9'); ellipse(c, x + 17, y + 4, 3, 3, '#af8971'); line(c, [[x + 7, y + 20], [x + 26, y + 20]], 2, '#b4b294'); } } else { line(c, [[86, 113], [166, 113], [151, 100]], 6, '#7b896b'); line(c, [[166, 113], [151, 127]], 6, '#7b896b'); } });
  texture(scene, 'park:fountain', c => {
    shadow(c, 128, 207, 115, 26); ellipse(c, 128, 181, 113, 48, '#b4b8a0'); ellipse(c, 128, 174, 113, 44, '#e7dec2'); ellipse(c, 128, 171, 99, 34, '#8eafa5'); ellipse(c, 124, 166, 87, 26, '#b3d5c8');
    rect(c, 114, 91, 29, 87, 12, '#c3c7ac'); ellipse(c, 128, 112, 52, 21, '#e8e3c6'); ellipse(c, 128, 106, 44, 14, '#96c5b7');
    line(c, [[128, 98], [128, 51]], 7, '#d7ede0'); ellipse(c, 128, 51, 10, 11, '#eef4db');
    for (const offset of [-34, 34]) { c.strokeStyle = '#d6ead9'; c.lineWidth = 4; c.beginPath(); c.moveTo(128, 75); c.quadraticCurveTo(128 + offset, 41, 128 + offset * 1.8, 144); c.stroke(); }
  });
  texture(scene, 'park:flowers', c => { shadow(c, 128, 219, 103, 16); ellipse(c, 128, 199, 110, 31, '#a5b28a'); ellipse(c, 128, 192, 104, 30, '#c7bc91'); for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) flower(c, 45 + i * 32 + row % 2 * 8, 160 + row * 17, ['#e9bc90', '#d39a99', '#f5e5b2'][(i + row) % 3], 7); });
  texture(scene, 'park:pond', c => { shadow(c, 128, 218, 116, 17); ellipse(c, 128, 169, 115, 63, '#a4b68f'); ellipse(c, 128, 167, 106, 56, '#7fae9f'); ellipse(c, 125, 162, 94, 47, '#9bc8b5'); for (const [x, y] of [[70, 154], [162, 181], [187, 149]]) { ellipse(c, x, y, 18, 10, '#70a17e'); flower(c, x - 3, y - 6, '#ebd7c2', 7); } line(c, [[89, 182], [119, 185]], 2, '#d6e3c2'); });
  texture(scene, 'park:acorn', c => { shadow(c, 128, 220, 35, 9); ellipse(c, 128, 192, 25, 30, '#cda272'); ellipse(c, 121, 187, 16, 25, '#e0bc83'); ellipse(c, 128, 171, 29, 13, '#95775b'); line(c, [[130, 166], [138, 151]], 6, '#8b7757'); });
  texture(scene, 'park:litter', c => { shadow(c, 128, 222, 32, 8); c.save(); c.translate(126, 194); c.rotate(-.12); rect(c, -23, -20, 46, 44, 6, '#e6d4ad'); line(c, [[-15, -12], [8, 12], [17, -9]], 3, '#b7b093'); c.restore(); });
  texture(scene, 'park:mushrooms', c => { shadow(c, 128, 226, 61, 10); for (const [x, y, s] of [[95, 216, 1], [159, 220, .8], [129, 202, .65]]) { rect(c, x - 9 * s, y - 37 * s, 18 * s, 38 * s, 6, '#f0e0b7'); ellipse(c, x, y - 38 * s, 36 * s, 19 * s, '#a9bfa1'); ellipse(c, x - 9 * s, y - 42 * s, 17 * s, 8 * s, '#dce1ba'); } });
  texture(scene, 'park:chime', c => { shadow(c, 128, 222, 62, 10); line(c, [[65, 220], [65, 95], [191, 95], [191, 220]], 10, WOOD); for (let i = 0; i < 5; i++) { line(c, [[87 + i * 20, 100], [87 + i * 20, 137]], 2, '#c6b48e'); rect(c, 81 + i * 20, 134, 12, 41 + i * 6, 5, ['#98b8a0', '#d7ba79', '#b3c4b2'][i % 3]); } });
  texture(scene, 'park:drum', c => { shadow(c, 128, 224, 61, 13); rect(c, 75, 145, 106, 66, 14, '#c58e74'); ellipse(c, 128, 144, 53, 22, '#f0d9aa'); ellipse(c, 128, 140, 45, 16, '#fff0ce'); line(c, [[80, 162], [99, 201], [120, 164], [141, 201], [164, 164], [175, 196]], 4, '#e4c792'); line(c, [[86, 125], [134, 106]], 5, '#9c7e5e'); });
  texture(scene, 'park:bell', c => { shadow(c, 128, 224, 62, 10); line(c, [[67, 220], [67, 81], [190, 81], [190, 220]], 10, '#9b8765'); line(c, [[128, 84], [128, 119]], 5, '#9b8765'); c.fillStyle = '#d9bc72'; c.beginPath(); c.moveTo(92, 180); c.quadraticCurveTo(105, 168, 103, 140); c.quadraticCurveTo(128, 110, 153, 140); c.quadraticCurveTo(151, 168, 166, 180); c.closePath(); c.fill(); ellipse(c, 129, 181, 39, 10, '#e8ce8e'); ellipse(c, 129, 187, 8, 9, '#ad9565'); });
  const grassColors = ['#c6d8a9', '#d9dfb5', '#c6d9b4', '#aac8ad'];
  grassColors.forEach((color, index) => texture(scene, `park:grass:${index}`, (c, size) => {
    c.fillStyle = color; c.fillRect(0, 0, size, size); let seed = index + 190;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 95; i++) { const x = random() * size, y = random() * size; ellipse(c, x, y, 2 + random() * 4, 1.2, i % 3 ? '#ffffff13' : '#496d4d13'); if (i % 9 === 0) { line(c, [[x - 3, y - 2], [x, y + 2], [x + 3, y - 3]], 1.5, '#6b90602b'); } }
  }, 512));
  for (const species of ['rabbit', 'bear', 'deer', 'squirrel']) {
    const key = `park:npc:${species}`;
    if (!scene.textures.exists(key)) {
      const canvas = scene.textures.createCanvas(key, 256 * 12, 256)!;
      for (let frame = 0; frame < 12; frame++) { canvas.context.save(); canvas.context.translate(frame * 256, 0); npc(canvas.context, species, frame); canvas.context.restore(); canvas.add(frame, 0, frame * 256, 0, 256, 256); }
      canvas.refresh();
    }
    if (!scene.anims.exists(key)) scene.anims.create({ key, frames: Array.from({ length: 12 }, (_, frame) => ({ key, frame, duration: frame % 6 === 0 ? 180 : 100 })), repeat: -1 });
  }
}
