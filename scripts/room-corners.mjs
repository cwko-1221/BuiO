/**
 * Point at where each room's floor actually is.
 *
 * Image generators do not hit a measurement — two runs of the same brief come back different —
 * and every room in the game shares one grid. So the floor's four corners are pointed at once per
 * room, and everything downstream works from those: the importer checks the shared grid lands on
 * painted floor, and the grid itself is set from what the whole set of rooms has in common.
 *
 *   npm run room:corners -- art-inbox/room-*.png
 *
 * The corners are guessed first by fitting the three straight lines where wall meets floor, so
 * usually there is nothing to do but look and move on. Four clicks replace the guess: the floor's
 * two back corners, then a point further down each side edge. The front corners are worked out
 * from those, which is what lets them fall outside the picture — the usual case.
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findFloor } from './room-floor-fit.mjs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: npm run room:corners -- art-inbox/room-<id>.png ...');
  process.exit(1);
}
const FLOORS = 'scripts/room-floors.json';
const template = await fs.readFile('tools/room-corners.html', 'utf8');
const rooms = [];
for (const file of files) {
  rooms.push({
    file,
    id: path.basename(file).replace(/\.[^.]+$/, '').replace(/^room-/, ''),
    image: await fs.readFile(file),
    type: { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' }[path.extname(file).toLowerCase()] || 'image/png',
    fitted: (await findFloor(file)).quad,
  });
}

const read = async () => { try { return JSON.parse(await fs.readFile(FLOORS, 'utf8')); } catch { return {}; } };
const body = (request) => new Promise((resolve) => {
  let text = '';
  request.on('data', (chunk) => { text += chunk; });
  request.on('end', () => resolve(text));
});

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const at = Math.min(Math.max(Number(url.searchParams.get('at') || 0), 0), rooms.length - 1);
  const room = rooms[at];

  if (url.pathname === '/image') {
    response.writeHead(200, { 'content-type': room.type }).end(room.image);
    return;
  }
  if (request.method === 'POST' && url.pathname === '/corners') {
    const { quad } = JSON.parse(await body(request));
    await fs.writeFile(FLOORS, JSON.stringify({ ...await read(), [room.id]: quad }, null, 2));
    response.writeHead(200).end('ok');
    const say = (corner) => corner.map((n) => (n * 100).toFixed(1)).join(',');
    console.log(`  ${String(at + 1).padStart(2)}/${rooms.length}  ${room.id.padEnd(20)} ${quad.map(say).join('  ')}`);
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(template
    .replace('__ROOM__', `${room.id}　${at + 1}/${rooms.length}`)
    .replace('__FITTED__', JSON.stringify(room.fitted))
    .replace('__AT__', String(at))
    .replace('__LAST__', String(rooms.length - 1)));
});

server.listen(0, () => {
  const url = `http://localhost:${server.address().port}/`;
  console.log(`\n  ${rooms.length} room${rooms.length > 1 ? 's' : ''} to check at ${url}`);
  console.log('  Ctrl-C here when you are done.\n');
  spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
});
