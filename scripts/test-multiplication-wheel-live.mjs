import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

// Start a fresh start-multiplication-fixture.mjs process first. Scoring uses only its temporary database.
const base = `http://127.0.0.1:${Number(process.env.MULTIPLICATION_FIXTURE_PORT || 3197)}`;
const directory = path.resolve('artifacts', 'multiplication-quality');
await mkdir(directory, { recursive: true });
const browser = process.env.MULTIPLICATION_CDP_URL
  ? await chromium.connectOverCDP(process.env.MULTIPLICATION_CDP_URL)
  : await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`); });
page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
const report = [];

async function chooseScope(grade, group) {
  await page.locator('#gradeSelect:not([disabled])').selectOption(grade);
  await page.waitForFunction(() => !document.querySelector('#groupSelect').disabled);
  await page.locator('#groupSelect').selectOption(group);
  await page.waitForFunction(() => !document.querySelector('#groupSelect').disabled);
}

async function screenshot(name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.spin-toolbar').evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + scrollY - 16));
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(directory, `${name}.png`) });
  // The sticky toolbar would otherwise cover the upper wheel in an element screenshot.
  const captureStyle = await page.addStyleTag({ content: '.spin-toolbar { position: static !important; }' });
  try {
    await page.locator('.wheel-pairs').screenshot({ path: path.join(directory, `${name}-wheels.png`) });
  } finally {
    await captureStyle.evaluate(element => element.remove());
  }
}

async function assertNoOverflow() {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page must not overflow horizontally');
}

async function assertLabelBounds() {
  const failures = await page.evaluate(() => {
    const failures = [];
    for (const disc of document.querySelectorAll('.roulette-disc[data-wheel-type]')) {
      const segments = JSON.parse(disc.dataset.weightedSegments);
      const rotor = disc.querySelector('.roulette-rotor');
      const inverse = rotor.getScreenCTM().inverse();
      disc.querySelectorAll('.roulette-svg-label').forEach((label, index) => {
        const segment = segments[index];
        if (segment.end - segment.start < 8) return; // Tiny sectors have a full-name key outside the wheel.
        label.querySelectorAll('tspan').forEach(line => {
          const box = line.getBBox();
          const matrix = line.getScreenCTM();
          for (const [x, y] of [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]) {
            const point = new DOMPoint(x, y).matrixTransform(matrix).matrixTransform(inverse);
            const radius = Math.hypot(point.x - 120, point.y - 120);
            const angle = (Math.atan2(point.x - 120, 120 - point.y) * 180 / Math.PI + 360) % 360;
            const offset = (angle - segment.start + 360) % 360;
            if (radius < 33 || radius > 110 || offset > segment.end - segment.start + .4) failures.push({ type: disc.dataset.wheelType, name: segment.label, radius, angle, segment });
          }
        });
      });
    }
    return failures;
  });
  assert.deepEqual(failures, [], 'labels must stay in their own sector, outside the center and inside the rim');
}

async function wheelState() {
  return page.locator('.roulette-disc[data-wheel-type]').evaluateAll(discs => discs.map(disc => {
    const segments = JSON.parse(disc.dataset.weightedSegments);
    const angle = parseFloat(disc.style.getPropertyValue('--spin-angle')) || 0;
    const pointer = ((-angle % 360) + 360) % 360;
    const pointed = segments.find(segment => pointer >= segment.start && pointer < segment.end);
    return { type: disc.dataset.wheelType, index: disc.dataset.wheelIndex, segments, selected: disc.querySelector('.selected-sector')?.dataset.segmentKey, pointed: pointed?.key, name: disc.closest('.wheel-card').querySelector('.wheel-selection-value').textContent, pointedName: pointed?.label };
  }));
}

async function assertPointerResults() {
  const wheels = await wheelState();
  for (const wheel of wheels) {
    assert.equal(wheel.pointed, wheel.selected, `${wheel.type} ${wheel.index}: pointer matches the selected sector`);
    assert.equal(wheel.name, wheel.pointedName, `${wheel.type} ${wheel.index}: complete result name matches the pointer`);
  }
  assert.ok(await page.locator('.roulette-svg-label text').evaluateAll(labels => labels.every(label => {
    const matrix = label.getScreenCTM();
    const angle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    return Math.abs(angle) <= 90.1;
  })), 'all stopped name and table labels remain upright after rotation');
  return wheels;
}

async function drawRound(count) {
  await page.locator('#spinCount').selectOption(String(count));
  await page.locator('#spinStudentsButton').click();
  assert.ok(await page.locator('#gradeSelect').isDisabled(), 'filters stay locked during animation');
  // Toggle sound during the spin: it must not replace the animated wheel DOM.
  const disc = await page.locator('.roulette-disc').first().elementHandle();
  await page.locator('#soundToggle').click();
  assert.ok(await disc.evaluate(element => element.isConnected));
  await page.locator('#spinTablesButton:not([disabled])').waitFor({ timeout: 15000 });
  const elapsed = await page.evaluate(() => performance.now());
  await page.locator('#spinTablesButton').click();
  await page.locator('[data-result="success"]:not([disabled])').first().waitFor({ timeout: 15000 });
  assert.ok(await page.evaluate(started => performance.now() - started, elapsed) >= 4000, 'table wheel retains its suspense animation');
  return assertPointerResults();
}

try {
  const login = await context.request.post(`${base}/api/auth/login`, { data: { studentId: 'T9000', password: '123456' } });
  assert.equal(login.status(), 200, 'isolated fixture teacher signs in');
  await page.goto(`${base}/multiplication-checklist`, { waitUntil: 'networkidle' });
  await page.locator('#groupSelect:not([disabled])').waitFor();
  assert.equal(await page.locator('#app').getAttribute('class'), '', 'loading layout is removed after startup');
  await chooseScope('P5', '中英12');
  await page.locator('#spinCount').selectOption('2');
  assert.equal(await page.locator('.roulette-disc').count(), 4, 'two students show four wheels');
  await assertLabelBounds();
  await assertNoOverflow();
  await screenshot('desktop-two-students-ready');
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow();
  await assertLabelBounds();
  await screenshot('desktop-1280-two-students-ready');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const boxes = await page.locator('.wheel-pair').evaluateAll(cards => cards.map(card => { const box = card.getBoundingClientRect(); return { x: box.x, y: box.y }; }));
  assert.equal(boxes[0].y, boxes[1].y, 'desktop pairs fit alongside one another');
  const before = await drawRound(2);
  assert.notEqual(before[0].selected, before[2].selected, 'students are drawn without repetition');
  await screenshot('desktop-two-students-result');
  await page.locator('[data-index="0"][data-result="success"]').click();
  await page.locator('#groupSelect:not([disabled])').waitFor();
  await page.locator('.recorded-badge').first().waitFor();
  assert.deepEqual((await assertPointerResults()).map(wheel => wheel.segments), before.map(wheel => wheel.segments), 'scoring must not shift a landed wheel');
  await page.locator('[data-index="1"][data-result="failure"]').click();
  await page.locator('#spinStudentsButton:not([disabled])').waitFor();
  await assertPointerResults();
  const overview = await context.request.get(`${base}/api/multiplication-checklist/?grade=P5&group=${encodeURIComponent('中英12')}`).then(response => response.json());
  assert.equal(overview.students.length, 12);
  assert.equal(overview.students.find(student => student.id === before[0].selected).counts[before[1].selected], 1, 'success saves +1');
  assert.equal(overview.students.find(student => student.id === before[2].selected).counts[before[3].selected], -1, 'failure saves a negative score');
  await page.locator('[data-page="records"]').click();
  assert.equal(await page.locator('tbody tr').count(), 12);
  assert.equal(await page.locator('.count-cell.negative').count(), 1);
  await page.locator('[data-page="spin"]').click();
  await page.locator('#clearDraw').click();
  assert.notDeepEqual((await wheelState())[0].segments, before[0].segments, 'the next round uses the updated inverse weights');
  report.push('Two-student draw, live pointer results, sound toggle, immutable landed sectors, +1 / -1 persistence and filtered records passed.');

  await chooseScope('P4', '大組30');
  await page.locator('#spinCount').selectOption('5');
  assert.equal(await page.locator('.roulette-disc').count(), 10, 'five students render ten wheels');
  assert.ok(await page.locator('svg clipPath').evaluateAll(clips => new Set(clips.map(clip => clip.id)).size === clips.length), 'each wheel has unique text-clipping IDs');
  await assertLabelBounds();
  await page.locator('#spinCount').selectOption('1');
  await assertLabelBounds();
  for (const [name, width, height] of [['desktop-30-students', 1440, 1000], ['tablet-landscape-30-students', 1024, 768], ['tablet-30-students', 820, 1180], ['phone-30-students', 390, 844], ['small-phone-30-students', 320, 740]]) {
    await page.setViewportSize({ width, height });
    await assertNoOverflow();
    await assertLabelBounds();
    await screenshot(name);
  }
  const normalDiameter = await page.locator('.student-wheel .roulette-wrap').first().evaluate(element => element.getBoundingClientRect().width);
  await page.locator('[data-inspect-wheel="student"]').first().click();
  assert.equal(await page.locator('#wheelDialog .wheel-roster-list li').count(), 30, 'all complete names remain available on a phone');
  assert.ok(await page.locator('#wheelDialog .roulette-wrap').evaluate(element => element.getBoundingClientRect().width) > normalDiameter, 'the enlarged phone wheel is larger than the normal wheel');
  await assertNoOverflow();
  await page.screenshot({ path: path.join(directory, 'phone-full-name-dialog.png') });
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('[data-inspect-wheel="student"]').first().evaluate(element => element === document.activeElement), 'closing the dialog restores keyboard focus');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const toolbar = await page.locator('.spin-toolbar').boundingBox();
  assert.ok(toolbar.y >= 0 && toolbar.y + toolbar.height <= 740, 'controls remain visible while scrolling');
  report.push('30 students, contained radial labels, complete-name dialog, keyboard focus, sticky controls and 1440 / 820 / 390 / 320px layouts passed.');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await chooseScope('P3', '不均4');
  assert.equal(await page.locator('.narrow-sector-key').count(), 1, 'very narrow student sectors show full names outside the rim');
  await page.evaluate(() => { Math.random = () => .99999; });
  await drawRound(1);
  await assertLabelBounds();
  await screenshot('weighted-narrow-sector-result');
  await page.locator('#clearDraw').click();
  await chooseScope('P1', '單人');
  assert.equal(await page.locator('.student-wheel .roulette-sector').count(), 1, 'one student renders a complete circular sector');
  await drawRound(1);
  await screenshot('single-student-result');
  await page.locator('#clearDraw').click();
  await page.goto(`${base}/multiplication-checklist?lang=en-US`, { waitUntil: 'networkidle' });
  await chooseScope('P5', '中英12');
  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoOverflow();
  await screenshot('english-phone');
  await page.setViewportSize({ width: 320, height: 740 });
  await assertNoOverflow();
  await screenshot('english-small-phone');
  assert.equal(errors.length, 0, `browser errors: ${errors.join('\n')}`);
  report.push('Extreme inverse weights, tiny-sector name key, single-student circle, English phone UI and zero console/page errors passed.');
  await writeFile(path.join(directory, 'report.json'), JSON.stringify({ passed: true, checks: report, screenshots: directory }, null, 2));
  console.log(report.join('\n'));
} finally {
  await context.close();
  await browser.close();
}
