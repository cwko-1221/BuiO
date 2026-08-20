/**
 * Ask where a generated room's floor actually is.
 *
 * Image generators do not hit a measurement — two runs of the same brief come back different, and
 * the game's grid is the same in every room. So rather than asking the art to land on the grid,
 * the floor's four corners are pointed at once, and the importer moves the room onto the grid.
 *
 *   npm run room:corners -- art-inbox/room-sunny-oak.png
 *
 * Four clicks: the floor's two back corners, then a point further down each side edge. The front
 * corners are worked out from those, which is what lets them fall outside the picture - the usual
 * case, and exactly the one that needs correcting.
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findFloor } from './room-floor-fit.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: npm run room:corners -- art-inbox/room-<id>.png');
  process.exit(1);
}
const roomId = path.basename(file).replace(/\.[^.]+$/, '').replace(/^room-/, '');
const target = 'scripts/room-floors.json';
const fitted = (await findFloor(file)).quad;
const page = (await fs.readFile('tools/room-corners.html', 'utf8'))
  .replace('__ROOM__', roomId)
  .replace('__FITTED__', JSON.stringify(fitted));
const image = await fs.readFile(file);
const type = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' }[path.extname(file).toLowerCase()] || 'image/png';

const server = http.createServer(async (request, response) => {
  if (request.url === '/image') {
    response.writeHead(200, { 'content-type': type }).end(image);
    return;
  }
  if (request.method === 'POST' && request.url === '/corners') {
    const body = await new Promise((resolve) => {
      let text = '';
      request.on('data', (chunk) => { text += chunk; });
      request.on('end', () => resolve(text));
    });
    const { quad } = JSON.parse(body);
    let floors = {};
    try { floors = JSON.parse(await fs.readFile(target, 'utf8')); } catch {}
    await fs.writeFile(target, JSON.stringify({ ...floors, [roomId]: quad }, null, 2));
    response.writeHead(200).end('ok');
    const say = (corner) => corner.map((n) => (n * 100).toFixed(1)).join(',');
    console.log(`\n  ${target}`);
    console.log(`  back ${say(quad[0])} ${say(quad[1])}   front ${say(quad[3])} ${say(quad[2])}`);
    console.log(`\n  next: npm run import:art -- ${file}`);
    console.log('        npm run build:pet\n');
    console.log('  (still listening - nudge a corner and save again, or press Ctrl-C when done)');
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
});

server.listen(0, () => {
  const url = `http://localhost:${server.address().port}/`;
  console.log(`\n  ${roomId} — click the floor's four corners at ${url}\n`);
  spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
});
