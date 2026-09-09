/**
 * Ask a running server what it is actually serving.
 *
 * Every bandwidth change in this repo is invisible from the outside until it is deployed, and a
 * deploy can miss half of it: the static files reach the CDN while the Node service keeps running
 * the old build, or a new dependency never gets installed. Rather than trust that, this asks the
 * server directly — is the text compressed on the way out, is the socket compressed, and is the
 * client code being served the one that carries the slim protocol.
 *
 *   node scripts/check-deployed-bandwidth.mjs                        # localhost:3000
 *   node scripts/check-deployed-bandwidth.mjs https://your-app.example.com
 *
 * Exit code is 0 only when everything passes, so it can also be run from CI or a deploy hook.
 */
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';

const target = new URL(process.argv[2] || 'http://localhost:3000');
const client = target.protocol === 'https:' ? https : http;
const port = target.port || (target.protocol === 'https:' ? 443 : 80);

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
};

/** Fetch a path, counting the bytes that actually crossed the wire rather than the decoded size. */
function fetchRaw(path, acceptEncoding) {
  return new Promise((resolve, reject) => {
    const request = client.get({
      host: target.hostname,
      port,
      path,
      headers: { 'accept-encoding': acceptEncoding, 'user-agent': 'buio-bandwidth-check' },
    }, (response) => {
      let bytes = 0;
      const chunks = [];
      response.on('data', (chunk) => { bytes += chunk.length; chunks.push(chunk); });
      response.on('end', () => resolve({
        status: response.statusCode,
        encoding: response.headers['content-encoding'] || null,
        bytes,
        body: Buffer.concat(chunks),
      }));
    });
    request.on('error', reject);
    request.setTimeout(20000, () => request.destroy(new Error('timed out')));
  });
}

/** The compressed body has to be inflated before it can be searched for a marker. */
async function textOf(path) {
  const response = await fetchRaw(path, 'identity');
  return response.status === 200 ? response.body.toString('utf8') : '';
}

/** Does the server agree to compress the socket? Answered by the handshake, before any traffic. */
function socketHandshake() {
  return new Promise((resolve) => {
    const request = client.request({
      host: target.hostname,
      port,
      path: '/socket.io/?EIO=4&transport=websocket',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
        'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits',
      },
    });
    request.on('upgrade', (response, socket) => {
      socket.destroy();
      resolve({
        extensions: response.headers['sec-websocket-extensions'] || '',
        via: response.headers['server'] || null,
      });
    });
    request.on('response', () => resolve({ extensions: null, via: null }));
    request.on('error', () => resolve({ extensions: null, via: null }));
    request.setTimeout(20000, () => { request.destroy(); resolve({ extensions: null, via: null }); });
    request.end();
  });
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

console.log(`Checking ${target.origin}\n`);

// ---- the two wires -------------------------------------------------------------------------
const script = '/game/js/v2/asset-geometry.js';
const plain = await fetchRaw(script, 'identity');
if (plain.status !== 200) {
  record('HTTP compression', false, `${script} answered ${plain.status} — is this the right host?`);
} else {
  const squeezed = await fetchRaw(script, 'br, gzip');
  const ratio = squeezed.bytes / plain.bytes;
  record('HTTP compression',
    squeezed.encoding !== null && ratio < 0.5,
    `${script}: ${kb(plain.bytes)} uncompressed, ${kb(squeezed.bytes)} as sent`
    + ` [${squeezed.encoding || 'no content-encoding'}] — ${(100 - ratio * 100).toFixed(0)}% saved`);
}

const image = '/game/images/v2/atlases/reference-0.webp';
const webp = await fetchRaw(image, 'br, gzip');
record('artwork left alone',
  webp.status === 200 && !webp.encoding,
  webp.status === 200
    ? `${kb(webp.bytes)} of webp, ${webp.encoding ? `re-compressed as ${webp.encoding} (wasted CPU)` : 'sent as-is'}`
    : `${image} answered ${webp.status}`);

// Worth knowing who answered: a CDN in front of the app can strip this extension on its way
// through, and then no amount of configuring the Node service will bring it back.
const { extensions, via } = await socketHandshake();
record('WebSocket compression',
  !!extensions && extensions.includes('permessage-deflate'),
  extensions === null
    ? 'the socket handshake did not complete'
    : `handshake replied: ${extensions || '(no extensions — permessage-deflate is off)'}`
      + (via ? ` — answered by ${via}` : ''));

// ---- which client the browsers are being handed --------------------------------------------
const main = await textOf('/game/js/v2/main.js');
const ghost = await textOf('/game/js/v2/RemoteGhostState.js');
const css = await textOf('/game/css/game.css');

const markers = [
  ['slim position protocol', main, "game:looks",
    'names and pets travel on their own channel instead of on every frame'],
  ['30Hz client send rate', main, 'active?33:100',
    'the browser sends at the rate the room is relayed, not twice it'],
  ['matching dead reckoning', ghost, 'BASE_LEAD_MS = 32',
    'the ghost lead matches the 33ms cadence'],
  ['double-tap guard', main, 'lastTap',
    'a second tap in the same spot cannot zoom the page'],
  ['play surface does not pan', css, 'overscroll-behavior: none',
    'no rubber band, so no pinch can start from one'],
];
for (const [name, source, marker, why] of markers) {
  record(name, source.includes(marker), source ? why : 'could not read the file to check');
}

// ---- verdict --------------------------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log('Still to deploy: ' + failed.map((r) => r.name).join(', '));
  console.log('If HTTP compression passes but the WebSocket one does not, the Node service is');
  console.log('configured correctly and something in front of it — a CDN terminating the socket —');
  console.log('is dropping the extension; that cannot be fixed from here, so the payload itself has');
  console.log('to be made smaller. If HTTP compression fails too, the dependency was never installed:');
  console.log('rebuild and restart the Node service. A missing marker means the browsers are still');
  console.log('being handed the previous client.');
}
process.exit(failed.length ? 1 : 0);
