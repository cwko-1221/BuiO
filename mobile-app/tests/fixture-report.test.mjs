import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { readFixtureReport } from '../ci/fixture-report.mjs';

test('aborted native reports do not stop the fixture or replace valid measurements', { timeout: 5000 }, async () => {
  const results = [];
  let announce;
  const accepted = new Promise(resolve => { announce = resolve; });
  let finishAbort;
  const aborted = new Promise(resolve => { finishAbort = resolve; });
  const server = createServer(async (request, response) => {
    announce();
    const result = await readFixtureReport(request);
    results.push(result);
    if (!result.status) { finishAbort(); return; }
    response.writeHead(result.status).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const port = server.address().port;
    const socket = createConnection(port, '127.0.0.1');
    await once(socket, 'connect');
    socket.write('POST /report HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1000\r\n\r\n{"path":');
    await accepted;
    socket.destroy();
    await aborted;
    assert.deepEqual(results, [{ status: 0 }]);
    const response = await fetch('http://127.0.0.1:' + port + '/report', {
      method: 'POST', body: JSON.stringify({ path: '/export-probe', width: 402 })
    });
    assert.equal(response.status, 204);
    assert.deepEqual(results[1], { status: 204, report: { path: '/export-probe', width: 402 } });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('malformed, excessive and unexpected fixture report failures remain detectable', async () => {
  assert.deepEqual(await readFixtureReport(Readable.from(['{'])), { status: 400 });
  assert.deepEqual(await readFixtureReport(Readable.from(['null'])), { status: 400 });
  assert.deepEqual(await readFixtureReport(Readable.from(['x'.repeat(10001)])), { status: 413 });
  const broken = Readable.from((async function* () { throw new Error('Unexpected failure'); })());
  await assert.rejects(readFixtureReport(broken), /Unexpected failure/);
});
