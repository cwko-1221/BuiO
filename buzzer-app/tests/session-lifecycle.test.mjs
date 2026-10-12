import assert from 'node:assert/strict';
import { test } from 'node:test';
import { watchTeacherSessionExit } from '../public/session-lifecycle.mjs';

function fixture(beacon = true) {
  const browser = new EventTarget(), requests = [];
  browser.navigator = { sendBeacon(url, body) { requests.push({ kind: 'beacon', url, body }); return beacon; } };
  browser.fetch = async (url, options) => { requests.push({ kind: 'fetch', url, options }); return {}; };
  return { browser, requests };
}

test('the teacher sends one close request on page exit, never on tab hiding', async () => {
  const { browser, requests } = fixture();
  let session = { id: 'room-1', phase: 'waiting' };
  const stop = watchTeacherSessionExit(() => ({ role: 'teacher' }), () => session, browser);
  browser.dispatchEvent(new Event('visibilitychange'));
  assert.equal(requests.length, 0);
  browser.dispatchEvent(new Event('beforeunload'));
  browser.dispatchEvent(new Event('pagehide'));
  assert.equal(requests.length, 1, 'deduplicate both unload events');
  assert.equal(requests[0].url, '/api/buzzer/sessions/room-1/actions');
  assert.equal(requests[0].body.type, 'application/json');
  assert.deepEqual(JSON.parse(await requests[0].body.text()), { action: 'end' });
  session = { id: 'room-2', phase: 'waiting' };
  browser.dispatchEvent(new Event('pagehide'));
  assert.equal(requests.length, 2, 'a newly opened class has its own exit');
  stop();browser.dispatchEvent(new Event('beforeunload'));
  assert.equal(requests.length, 2);
});

test('students, setup pages and already-ended classrooms cannot queue a close', () => {
  for (const [user, session] of [
    [{ role: 'student' }, { id: 'room', phase: 'waiting' }],
    [undefined, { id: 'room', phase: 'waiting' }],
    [{ role: 'teacher' }, undefined],
    [{ role: 'teacher' }, { id: 'room', phase: 'ended' }],
  ]) {
    const { browser, requests } = fixture();
    watchTeacherSessionExit(() => user, () => session, browser);
    browser.dispatchEvent(new Event('pagehide'));
    assert.equal(requests.length, 0);
  }
});

test('unavailable or refused beacons use authenticated keepalive fetch once', () => {
  for (const mode of ['refused', 'missing', 'throwing']) {
    const { browser, requests } = fixture(false);
    if (mode === 'missing') delete browser.navigator.sendBeacon;
    if (mode === 'throwing') browser.navigator.sendBeacon = () => { throw new Error('unavailable'); };
    watchTeacherSessionExit(() => ({ role: 'teacher' }), () => ({ id: 'room', phase: 'waiting' }), browser);
    browser.dispatchEvent(new Event('beforeunload'));browser.dispatchEvent(new Event('pagehide'));
    const fetches = requests.filter(r => r.kind === 'fetch');
    assert.equal(fetches.length, 1);
    assert.equal(fetches[0].options.keepalive, true);
    assert.equal(fetches[0].options.credentials, 'include');
    assert.deepEqual(JSON.parse(fetches[0].options.body), { action: 'end' });
  }
});
