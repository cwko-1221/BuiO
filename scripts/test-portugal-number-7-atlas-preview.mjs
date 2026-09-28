import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts/premium-character-atlases/portugal-number-7');
const browser = await chromium.launch({ headless:true, channel:'chrome' });
const report = { engine:'Phaser', appRegistration:false, walks:[], errors:[] };
try {
  const page = await browser.newPage({ viewport:{width:1280,height:1120} });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if(message.type()==='error') report.errors.push(message.text()); });
  await page.goto(pathToFileURL(path.join(output, 'preview.html')).href);
  await page.waitForFunction(() => window.qa?.ready, { timeout:15000 });
  await page.waitForFunction(() => Object.values(window.qa.clips).every(set => set.size === 8), {}, { timeout:12000 });
  report.observedClips = await page.evaluate(() => Object.fromEntries(Object.entries(window.qa.clips).map(([key,set]) => [key,[...set].sort((a,b)=>a-b)])));
  await page.screenshot({ path:path.join(output,'preview-desktop.png'), fullPage:true });
  for(const direction of ['front','right','back','left']) {
    await page.selectOption('#direction',direction);
    await page.click('#move');
    const before = await page.evaluate(() => window.qa.avatar.x);
    await page.waitForFunction(() => window.qa.stageSeen.size === 8, {}, { timeout:4000 });
    const state = await page.evaluate(() => ({x:window.qa.avatar.x,flip:window.qa.avatar.flipX,frames:[...window.qa.stageSeen].sort((a,b)=>a-b)}));
    assert.notEqual(state.x,before, `${direction} sprite did not move`);
    assert.equal(state.flip,direction==='left');
    await page.screenshot({ path:path.join(output,`walk-${direction}.png`), fullPage:true });
    await page.click('#move');
    const stopped = await page.evaluate(() => ({x:window.qa.avatar.x,y:window.qa.avatar.y}));
    await page.waitForFunction(() => window.qa.stageSeen.size === 8, {}, { timeout:9000 });
    const idle = await page.evaluate(() => window.qa.idleSamples);
    assert(idle.length > 30);
    assert(idle.every(sample => sample.x === stopped.x && sample.y === stopped.y), 'Idle world position changed');
    report.walks.push({direction,...state,idleWorldPositionStable:true,idleFrames:[...new Set(idle.map(sample=>sample.frame))].sort((a,b)=>a-b)});
  }
  await page.click('#rest');
  await page.waitForFunction(() => Number(window.qa.avatar.frame.name) === 34);
  await page.screenshot({path:path.join(output,'rest.png'),fullPage:true});
  report.restFrame = 34;
  await page.click('#idle');
  await page.click('#play');
  const before = await page.evaluate(() => window.qa.sprites.map(s=>Number(s.frame.name)));
  await page.click('#next');
  const after = await page.evaluate(() => window.qa.sprites.map(s=>Number(s.frame.name)));
  assert(after.every((frame,i)=>frame !== before[i]),'Frame step did not advance');
  report.frameStepWorks = true;
  await page.selectOption('#background','#263d52');
  await page.screenshot({path:path.join(output,'preview-dark.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile layout overflow');
  await page.screenshot({path:path.join(output,'preview-mobile.png'),fullPage:true});
  report.mobileOverflow = false;
  assert.deepEqual(report.errors,[]);
  await fs.writeFile(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));
  console.log('Phaser preview passed: every walking/idle frame observed, four directions move, stops stay fixed, rest frame 34, frame controls, mobile layout and no browser errors.');
} finally { await browser.close(); }
