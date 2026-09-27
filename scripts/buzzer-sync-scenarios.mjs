import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function verifySynchronizedClass({ browser, teacher, host, baseURL, artifacts }) {
  const clients = await Promise.all(Array.from({ length: 30 }, (_, i) => browser.newContext({ baseURL, viewport: { width: 390, height: 844 } })));
  const pages = await Promise.all(clients.map(context => context.newPage()));
  const errors = [];
  for (let i = 0; i < clients.length; i++) {
    await clients[i].request.post('/api/auth/login', { data: { studentId: `SYNC${String(i + 1).padStart(2, '0')}`, password: 'student123' } });
    const lag = [0, 40, 120][i % 3];
    await clients[i].route('**/api/buzzer/time', async route => {
      await delay(lag);
      const response = await route.fetch();
      await delay(lag);
      await route.fulfill({ response });
    });
    await pages[i].addInitScript(({ skew, delivery }) => {
      const actualDateNow = Date.now;
      Date.now = () => actualDateNow() + skew;
      const Native = EventSource;
      window.EventSource = class extends Native {
        set onmessage(callback) { super.onmessage = event => setTimeout(() => callback(event), delivery); }
        get onmessage() { return super.onmessage; }
      };
      window.__buzzTransitions = [];
      let last = '';
      document.addEventListener('DOMContentLoaded', () => {
        new MutationObserver(() => {
          const root = document.querySelector('#app');
          if (!root) return;
          const kind = root.dataset.phase === 'countdown' ? `countdown${root.querySelector('.countdown')?.textContent}` : root.dataset.phase;
          if (kind && kind !== last) {
            last = kind;
            window.__buzzTransitions.push({ kind, round: Number(root.dataset.round), time: performance.timeOrigin + performance.now() });
          }
        }).observe(document.body, { subtree: true, childList: true, attributes: true });
      });
    }, { skew: (i - 15) * 3600000, delivery: [0, 80, 200][i % 3] });
    pages[i].on('pageerror', error => errors.push(error.message));
  }
  const session = (await (await teacher.request.post('/api/buzzer/sessions', { data: { className: '6A', points: 10 } })).json()).session;
  const id = session.id;
  const action = data => teacher.request.post(`/api/buzzer/sessions/${id}/actions`, { data });
  const get = async () => (await (await teacher.request.get(`/api/buzzer/sessions/${id}`)).json()).session;
  await host.goto(`/buzzer?session=${id}`);
  await Promise.all(pages.map(page => page.goto(`/buzzer?session=${id}`)));
  await Promise.all(pages.map(page => page.getByRole('heading', { name: '等待問題' }).waitFor()));
  await host.waitForFunction(() => document.querySelectorAll('.participant').length === 30);

  // The last student withholds readiness: nobody may begin their own countdown.
  let withheld;
  const withheldRequest = new Promise(resolve => { withheld = resolve; });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await clients.at(-1).route('**/api/buzzer/sessions/*/actions', async route => {
    if (route.request().postDataJSON()?.action === 'ready') { withheld(); await held; }
    await route.continue();
  });
  await host.locator('[data-action="start"]:enabled').click();
  await withheldRequest;
  await delay(200);
  assert.equal((await get()).phase, 'preparing');
  assert.equal((await get()).readyCount, 29);
  assert.deepEqual(await Promise.all(pages.map(page => page.locator('.countdown, [data-action="buzz"]').count())), Array(30).fill(0));
  release();
  await Promise.all(pages.map(page => page.locator('[data-action="buzz"]:enabled').waitFor()));
  const state = await get();
  const transitions = await Promise.all(pages.map(page => page.evaluate(() => window.__buzzTransitions)));
  const stages = ['countdown3', 'countdown2', 'countdown1', 'open'];
  const timings = Object.fromEntries(stages.map(kind => {
    const times = transitions.map(rows => rows.find(row => row.round === 1 && row.kind === kind)?.time);
    assert.ok(times.every(Number.isFinite), `${kind} appeared on all 30 student devices`);
    const spread = Math.max(...times) - Math.min(...times);
    assert.ok(spread < 100, `${kind}: ${spread.toFixed(1)}ms spread exceeds 100ms local test budget`);
    return [kind, { spreadMs: Math.round(spread * 10) / 10, earliest: Math.min(...times), latest: Math.max(...times) }];
  }));
  assert.ok(Math.abs(timings.open.earliest - state.opensAt) < 100);
  await pages[0].screenshot({ path: path.join(artifacts, '06-synchronized-student.png') });

  // Receiving preparation is insufficient: every device must also confirm the final deadline.
  await action({ action: 'cancel', round: 1 });
  let withheldArm;
  const armRequest = new Promise(resolve => { withheldArm = resolve; });
  let releaseArm;
  const armHeld = new Promise(resolve => { releaseArm = resolve; });
  const armRoute = async route => {
    if (route.request().postDataJSON()?.action === 'armed') { withheldArm(); await armHeld; }
    await route.continue();
  };
  await clients.at(-1).route('**/api/buzzer/sessions/*/actions', armRoute);
  await host.locator('[data-action="start"]:enabled').click();
  await armRequest;
  await host.getByRole('heading', { name: '準備下一題' }).waitFor();
  assert.equal((await get()).phase, 'waiting');
  assert.deepEqual(await Promise.all(pages.map(page => page.locator('[data-action="buzz"]').count())), Array(30).fill(0));
  releaseArm();
  await clients.at(-1).unroute('**/api/buzzer/sessions/*/actions', armRoute);
  await delay(300);

  // A disconnection before the deadline cancels the question for everyone.
  await host.locator('[data-action="start"]:enabled').click();
  await host.locator('.countdown').waitFor();
  await clients[0].setOffline(true);
  // Closing the document terminates its existing SSE transport as well as blocking new requests.
  await pages[0].goto('about:blank');
  await host.getByRole('heading', { name: '準備下一題' }).waitFor();
  assert.equal((await get()).phase, 'waiting');
  await delay(3300);
  assert.deepEqual(await Promise.all(pages.slice(1).map(page => page.locator('[data-action="buzz"]').count())), Array(29).fill(0));
  await clients[0].setOffline(false);
  await pages[0].goto(`/buzzer?session=${id}`);
  await pages[0].getByRole('heading', { name: '等待問題' }).waitFor();

  // Switching a device to the background also cancels the synchronized round.
  await host.locator('[data-action="start"]:enabled').click();
  await host.locator('.countdown').waitFor();
  await pages[1].evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await host.getByRole('heading', { name: '準備下一題' }).waitFor();
  assert.equal((await get()).phase, 'waiting');
  await action({ action: 'end' });
  assert.deepEqual(errors, []);
  const report = { students: 30, simulatedClockSkewHours: [-15, 14], simulatedClockProbeRTTMs: [0, 80, 240],
    simulatedStateDeliveryDelayMs: [0, 80, 200], timings, readinessBarrier: 'passed', missedDeadline: 'passed', disconnection: 'passed', backgroundTab: 'passed' };
  await fs.writeFile(path.join(artifacts, 'sync-report.json'), JSON.stringify(report, null, 2));
  await Promise.all(clients.map(context => context.close()));
  console.log(`✓ 30-device sync: open spread ${timings.open.spreadMs}ms; all 3 countdown ticks synchronized; delayed-message and clock-skew simulation; wait-for-all; offline/background cancellation`);
}
