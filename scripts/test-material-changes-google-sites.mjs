#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'exports/google-sites/material-changes');
const evidence = path.join(output, 'verification'); await mkdir(evidence, { recursive: true });
const html = await readFile(path.join(output, 'material-changes.html'), 'utf8');
assert.equal(html, await readFile(path.join(output, 'material-changes-embed.txt'), 'utf8'));
const report = JSON.parse(await readFile(path.join(output, 'build-report.json'), 'utf8'));
assert.equal(createHash('sha256').update(html).digest('hex'), report.sha256);
const wrapper = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}iframe{width:100%;height:100dvh;border:0;display:block}</style><iframe title="Sites sandbox" sandbox="allow-scripts" src="/experiment"></iframe>';
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(req.url.startsWith('/sandbox') ? wrapper : html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const checks = [];
async function click(locator) {
  await locator.waitFor({ state: 'visible' });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox(); assert.ok(box);
  const page = locator.page();
  if (page.viewportSize().width < 500) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
async function capture(page, options) { await page.waitForTimeout(500); return page.screenshot(options); }
async function open(context, url, sandbox) {
  const page = await context.newPage(), errors = [], network = [];
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(() => { window.__CHANGE_LAB_QA__ = true; });
  await context.route('**/*', route => {
    if (route.request().isNavigationRequest() && [url, base + '/experiment'].includes(route.request().url())) return route.continue();
    if (/^(file|data|blob):/.test(route.request().url())) return route.continue();
    network.push(route.request().url()); return route.abort();
  });
  await page.goto(url, { waitUntil: 'load' });
  const frame = sandbox ? page.frames().find(f => f !== page.mainFrame()) : page.mainFrame();
  await frame.waitForFunction(() => window.__changeLabTest);
  if (page.viewportSize().width === 1440) {
    await frame.locator('#bootScreen').waitFor({state:'visible'});
    assert.equal(await frame.evaluate(()=>window.__changeLabTest.state().phase),'loading');
    await page.screenshot({path:path.join(evidence,'13-loading-screen.png')});
    await frame.waitForFunction(()=>window.__changeLabTest.state().phase==='chapter' && window.__changeLabTest.state().chapterTarget==='observe');
    await capture(page,{path:path.join(evidence,'14-observe-chapter.png')});
    await frame.locator('#settingsButton').focus(); await page.keyboard.press('Enter');
    await frame.locator('#languageSelect').waitFor({state:'visible'});
    assert.equal(await frame.evaluate(()=>window.__changeLabTest.state().chapterTarget),'observe');
    await click(frame.locator('[data-action="close"]'));
    await click(frame.locator('.chapter-card'));
  }
  await frame.waitForFunction(() => { const img = document.querySelector('.observation-figure img'); return img?.complete && img.naturalWidth > 0; });
  await page.waitForTimeout(450);
  return { page, frame, errors, network };
}
async function move(frame, id, location) {
  await frame.page().waitForTimeout(380);
  const from = await frame.evaluate(id => window.__changeLabTest.screenPoint(id), id);
  const to = await frame.evaluate(id => window.__changeLabTest.screenPoint(id), location);
  const page = frame.page();
  if (page.viewportSize().width < 500) {
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:from.x,y:from.y}]});
    for(let i=1;i<=20;i++) await client.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/20,y:from.y+(to.y-from.y)*i/20}]});
    await client.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    await client.detach();
  } else {
    await page.mouse.move(from.x,from.y); await page.mouse.down(); await page.mouse.move(to.x,to.y,{steps:24}); await page.mouse.up();
  }
  await frame.waitForFunction(({id,location})=>window.__changeLabTest.state().samples[id].location===location,{id,location});
}
async function language(frame, value) {
  await click(frame.locator('#settingsButton')); await frame.locator('#languageSelect').selectOption(value);
  await click(frame.locator('[data-action="close"]')); await frame.locator('#dialog').waitFor({ state: 'hidden' });
}
async function start(frame, prediction = 0) {
  assert.ok((await frame.locator('#stageContent').innerText()).includes('冰塊變成水，還能變回冰嗎？'));
  assert.match(await frame.locator('.observation-figure img').getAttribute('src'), /^data:image\/webp;base64,/);
  await click(frame.locator('[data-action="wonder"]'));
  assert.ok((await frame.locator('#stageContent').innerText()).includes('冰的變化可以逆轉。其他材料是否也一定可以恢復呢？'));
  await click(frame.locator('[data-action="hypothesis"]'));
  await frame.waitForFunction(()=>window.__changeLabTest.state().phase==='chapter' && window.__changeLabTest.state().chapterTarget==='hypothesis');
  if(frame.page().viewportSize().width===1440) {
    await capture(frame.page(),{path:path.join(evidence,'15-hypothesis-chapter.png')});
    // Opening settings must pause the transition and changing language must
    // preserve its position, rather than skip the question or restart loading.
    await click(frame.locator('#settingsButton'));
    await frame.locator('#languageSelect').selectOption('en');
    await frame.page().waitForTimeout(2100);
    assert.equal(await frame.evaluate(()=>window.__changeLabTest.state().chapterTarget),'hypothesis');
    assert.equal(await frame.locator('.chapter-card h2').innerText(),'Hypothesis');
    await frame.locator('#languageSelect').selectOption('zh');
    await click(frame.locator('[data-action="close"]'));
  }
  await frame.waitForFunction(()=>window.__changeLabTest.state().phase==='hypothesis');
  assert.ok((await frame.locator('#stageContent').innerText()).includes('如果材料發生變化後，我認為……'));
  await click(frame.locator(`[data-prediction="${prediction}"]`));
  await click(frame.locator('[data-action="begin"]'));
  await frame.locator('#stage').waitFor({ state: 'hidden' });
  assert.deepEqual((await frame.evaluate(()=>window.__changeLabTest.state().flowHistory)).slice(0,7),['loading','chapter-observe','observe','wonder','chapter-hypothesis','hypothesis','lab']);
}
async function setFast(frame) {
  await click(frame.locator('#settingsButton')); await frame.locator('#speedSelect').selectOption('360');
  await click(frame.locator('[data-action="close"]'));
}
const expected = {
  ice: ['liquidChoice', 'solidChoice', 'reversible'], charcoal: ['ashChoice', 'ashRemains', 'irreversible'],
  chocolate: ['liquidChoice', 'solidChoice', 'reversible'], butter: ['liquidChoice', 'solidChoice', 'reversible'],
  egg: ['setChoice', 'cookedChoice', 'irreversible'], bread: ['toastChoice', 'breadChoice', 'irreversible'],
};
async function answerPrompt(frame,id,group,tryWrong=false) {
  const selector=`[data-observation-stage="${group}"]`;
  await frame.locator(selector).waitFor({state:'visible',timeout:45000});
  const values=expected[id],value=values[['hot','cold','verdict'].indexOf(group)];
  assert.equal(await frame.locator('[data-observation-choice]').count(),3);
  assert.equal(await frame.locator('[data-observation-choice][aria-pressed="true"]').count(),0);
  assert.equal(await frame.locator('[data-action="confirm-observation"]').isDisabled(),true);
  const options=await frame.locator('.observation-question .prediction-options').innerText();
  if(id!=='egg')assert.doesNotMatch(options,/蛋白|egg white/i);
  if(id!=='bread')assert.doesNotMatch(options,/多士|麵包|toast|bread/i);
  if(tryWrong) {
    const wrong=await frame.locator(`[data-observation-choice]:not([data-observation-choice="${value}"])`).first().getAttribute('data-observation-choice');
    await click(frame.locator(`[data-observation-choice="${wrong}"]`));
    assert.equal(await frame.locator('#observationFeedback.incorrect').count(),1);
    assert.equal(await frame.locator('[data-action="confirm-observation"]').isDisabled(),true);
    assert.equal(await frame.evaluate(()=>window.__changeLabTest.state().activeId),id);
    assert.equal(await frame.evaluate(id=>window.__changeLabTest.state().samples[id].record,id),null);
    if(id==='ice' && group==='verdict') {
      assert.match(await frame.locator('#observationFeedback').innerText(),/冰 → 水 → 冰/);
      await capture(frame.page(),{path:path.join(evidence,'24-automatic-ice-verdict-feedback.png')});
    }
  }
  await click(frame.locator(`[data-observation-choice="${value}"]`));
  assert.equal(await frame.locator('#observationFeedback.correct').count(),1);
  if(id==='ice' && group==='hot')await capture(frame.page(),{path:path.join(evidence,'23-automatic-heating-question.png')});
  if(id==='ice' && group==='verdict')await capture(frame.page(),{path:path.join(evidence,'25-automatic-ice-cycle.png')});
  await click(frame.locator('[data-action="confirm-observation"]'));
  if(group==='cold')await frame.locator('[data-observation-stage="verdict"]').waitFor({state:'visible'});
  else await frame.locator('#dialog').waitFor({state:'hidden'});
}
async function thermal(frame,id) {
  return frame.evaluate(id=>{const s=window.__changeLabTest.state().samples[id];return [s.temperature,s.liquid,s.cooked,s.frozen,s.elapsed];},id);
}
async function carryLiquid(frame,id,screenshot) {
  const page=frame.page(); await page.waitForTimeout(450);
  const p=await frame.evaluate(id=>window.__changeLabTest.screenPoint(id),id),before=await thermal(frame,id);
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(140);
  assert.equal(await frame.evaluate(id=>window.__changeLabTest.state().samples[id].held,id),true);
  const lift=await frame.evaluate(id=>window.__changeLabTest.visual(id),id);assert.ok(lift.surfaceEnergy>.00001);
  let peak=lift.surfaceRange;
  for(const [dx,dy] of [[30,8],[70,18],[100,15],[70,20],[20,25]]) {
    await page.mouse.move(p.x+dx,p.y+dy,{steps:6});await page.waitForTimeout(65);
    const visual=await frame.evaluate(id=>window.__changeLabTest.visual(id),id);peak=Math.max(peak,visual.surfaceRange);
    assert.deepEqual(await thermal(frame,id),before,'Thermal state must not change while carrying');
  }
  assert.ok(peak>.05,`Visible waves throughout carrying: ${peak}`);
  await page.screenshot({path:path.join(evidence,screenshot)});
  await page.mouse.up();await page.waitForTimeout(500);
  assert.equal(await frame.evaluate(id=>window.__changeLabTest.state().samples[id].held,id),false);
  assert.equal(await frame.evaluate(id=>window.__changeLabTest.state().samples[id].location,id),'bench');
  const bench=await thermal(frame,id);await page.waitForTimeout(700);assert.deepEqual(await thermal(frame,id),bench);
}
async function charcoalDetail(frame,name) {
  const page=frame.page();await click(frame.locator('#cameraButton'));
  await page.mouse.move(780,440);await page.mouse.wheel(0,-440);await page.waitForTimeout(600);
  const p=await frame.evaluate(()=>window.__changeLabTest.screenPoint('charcoal'));
  await page.screenshot({path:path.join(evidence,name),clip:{x:Math.max(0,Math.min(920,p.x-260)),y:Math.max(0,Math.min(500,p.y-190)),width:520,height:400}});
  await click(frame.locator('#cameraButton'));await page.waitForTimeout(400);
}
async function pickMaterialCentres(frame) {
  const page=frame.page();
  for(const id of ['charcoal','chocolate','egg','bread','ice','butter']){
    await page.waitForTimeout(220);
    const p=await frame.evaluate(id=>window.__changeLabTest.screenPoint(id),id);
    await page.mouse.click(p.x,p.y);
    assert.equal(await frame.evaluate(()=>window.__changeLabTest.state().selected),id,`Clicking the visible centre must select ${id}`);
    assert.equal(await frame.evaluate(()=>window.__changeLabTest.state().activeId),null,'Clicking alone must not start thermal processing');
  }
}
try {
  const desktop=await browser.newContext({viewport:{width:1440,height:900}});
  const run=await open(desktop,base+'/sandbox',true),{page,frame}=run;
  assert.equal(await frame.evaluate(()=>{try{localStorage.getItem('test');return false;}catch{return true;}}),true);
  await capture(page,{path:path.join(evidence,'00-observation-desktop.png')});
  await language(frame,'en');assert.match(await frame.locator('#stageContent').innerText(),/Can melted ice become ice again/);
  await language(frame,'zh');await start(frame,0);await setFast(frame);
  assert.equal(await frame.locator('#recordButton').count(),0);
  assert.equal(await frame.locator('[data-material="wax"]').count(),0);
  assert.match(await frame.locator('[data-material="charcoal"] img').getAttribute('src'),/^data:image\/png;base64,/);
  assert.equal(await frame.locator('[data-location]').count(),0);
  assert.equal(await frame.locator('#sampleState').evaluate(node=>parseFloat(getComputedStyle(node).fontSize)),15);
  await pickMaterialCentres(frame);
  await page.mouse.move(790,420);await page.mouse.wheel(0,-220);await page.waitForTimeout(350);await pickMaterialCentres(frame);
  await click(frame.locator('#cameraButton'));
  await page.mouse.move(760,155);await page.mouse.down();await page.mouse.move(855,180,{steps:18});await page.mouse.up();await page.waitForTimeout(450);
  await pickMaterialCentres(frame);await capture(page,{path:path.join(evidence,'35-accurate-picking-orbit.png')});
  await click(frame.locator('#cameraButton'));await page.waitForTimeout(300);
  checks.push('Actual centre clicks select all six materials correctly at default, zoomed and rotated camera views; hidden geometry and reflection lines cannot steal clicks');
  await click(frame.locator('[data-material="egg"]'));
  await carryLiquid(frame,'egg','26-egg-carried-with-waves.png');
  assert.equal(await frame.evaluate(()=>window.__changeLabTest.state().activeId),null);
  checks.push('Actual pickup, continuous pointer movement and direction changes produce visible liquid waves; carrying and bench preserve thermal state');
  for(const id of ['ice','bread','chocolate','egg','charcoal','butter']) {
    console.log('Testing automatic flow:',id);
    await click(frame.locator(`[data-material="${id}"]`));
    if(id==='charcoal')await charcoalDetail(frame,'33-solid-charcoal-detail.png');
    await move(frame,id,'heat');
    if(id==='charcoal') {
      await frame.waitForFunction(()=>{const b=window.__changeLabTest.state().samples.charcoal.burned;return b>.1&&b<.85;});
      await click(frame.locator('#pauseButton'));
      const visual=await frame.evaluate(()=>window.__changeLabTest.visual('charcoal'));
      assert.equal(visual.furnaceVisible,true);assert.equal(visual.glassTransmission,0);assert.equal(visual.ashVisible,true);assert.ok(visual.fuelScale<1);assert.equal(visual.surfaceRange,0);
      assert.match(await frame.locator('[data-station-label="heat"]').innerText(),/燃燒爐/);
      await capture(page,{path:path.join(evidence,'30-charcoal-burning-furnace.png')});
      await click(frame.locator('#pauseButton'));
    }
    assert.equal(await frame.evaluate(()=>window.__changeLabTest.state().activeId),id);
    assert.equal(await frame.locator('.material-choice:not([aria-pressed="true"]):disabled').count(),5);
    if(id==='bread') {
      await click(frame.locator('#pauseButton'));const before=await thermal(frame,id);await page.waitForTimeout(350);assert.deepEqual(await thermal(frame,id),before);await click(frame.locator('#pauseButton'));
    }
    await answerPrompt(frame,id,'hot',id==='ice');
    if(id==='charcoal') {
      const visual=await frame.evaluate(()=>window.__changeLabTest.visual('charcoal'));
      assert.equal(visual.fuelVisible,false);assert.equal(visual.ashVisible,true);
      assert.equal(await frame.locator('#sampleName').innerText(),'灰');
      await page.keyboard.press('b');await page.waitForTimeout(450);
      await charcoalDetail(frame,'34-loose-ash-detail.png');
      await capture(page,{path:path.join(evidence,'31-charcoal-ash-residue.png')});
    }
    assert.equal(await frame.evaluate(id=>window.__changeLabTest.state().samples[id].observations.hot,id),expected[id][0]);
    assert.equal(await frame.locator('.material-choice:not([aria-pressed="true"]):disabled').count(),5);
    if(id==='ice') {
      await page.keyboard.press('b');await frame.waitForFunction(()=>window.__changeLabTest.state().samples.ice.location==='bench');
      await carryLiquid(frame,'ice','27-water-carried-with-waves.png');
      await move(frame,'ice','cool');await page.waitForTimeout(1500);
      assert.equal(await frame.evaluate(()=>window.__changeLabTest.state().samples.ice.liquid),1);
      assert.equal(await frame.locator('[data-observation-stage]:visible').count(),0,'Water at 20°C cannot create a completed refreezing observation');
      // Lift from the cooling station: heat exchange stops on pointerdown.
      const point=await frame.evaluate(()=>window.__changeLabTest.screenPoint('ice'));
      await page.mouse.move(point.x,point.y);await page.mouse.down();await page.waitForTimeout(100);
      const held=await thermal(frame,'ice');await page.waitForTimeout(450);assert.deepEqual(await thermal(frame,'ice'),held);await page.mouse.up();
    }
    const route=['ice','bread','egg','charcoal'].includes(id)?'freeze':'cool';
    await move(frame,id,route);
    await frame.locator('[data-observation-stage="cold"]').waitFor({state:'visible',timeout:45000});
    assert.equal(await frame.evaluate(id=>window.__changeLabTest.state().samples[id].cold.location,id),route);
    const coldHeading=await frame.locator('.observation-question h2').innerText();assert.match(coldHeading,route==='freeze'?/冷凍後/:/冷卻後/);
    if(id==='egg') {
      assert.equal(await frame.evaluate(()=>window.__changeLabTest.state().samples.egg.cooked),1);
      assert.equal(await frame.evaluate(()=>window.__changeLabTest.state().samples.egg.frozen),1);
    }
    if(id==='ice') {
      // Dismiss, inspect, change language and resume without losing the record.
      await click(frame.locator('[data-action="close"]'));await page.waitForTimeout(950);
      assert.equal(await frame.locator('#dialog').isVisible(),false);
      assert.equal(await frame.locator('#resumeObservation').isVisible(),true);
      await language(frame,'en');await click(frame.locator('#resumeObservation'));assert.match(await frame.locator('.observation-question h2').innerText(),/after freezing/);
      await click(frame.locator('[data-action="close"]'));await language(frame,'zh');await click(frame.locator('#resumeObservation'));
    }
    await answerPrompt(frame,id,'cold',id==='ice');await answerPrompt(frame,id,'verdict',id==='ice');
    assert.equal(await frame.evaluate(()=>window.__changeLabTest.state().activeId),null);
    assert.equal(await frame.locator('.material-choice:disabled').count(),0);
    assert.equal(await frame.evaluate(id=>window.__changeLabTest.state().samples[id].record.verdict,id),expected[id][2]);
    if(id==='charcoal') {
      assert.equal(await frame.evaluate(()=>window.__changeLabTest.state().samples.charcoal.burned),1);
      await click(frame.locator('#notesButton'));
      assert.match(await frame.locator('[data-evidence="charcoal"]').innerText(),/礦物質灰/);
      await capture(page,{path:path.join(evidence,'32-charcoal-irreversible-evidence.png')});
      await click(frame.locator('[data-action="close"]'));
      await language(frame,'en');assert.equal(await frame.locator('#sampleName').innerText(),'Ash');
      await page.keyboard.press('h');await page.waitForTimeout(500);
      assert.equal(await frame.evaluate(()=>window.__changeLabTest.state().samples.charcoal.burned),1);
      assert.equal(await frame.evaluate(()=>window.__changeLabTest.state().activeId),null);
      assert.equal(await frame.locator('[data-observation-stage]:visible').count(),0,'Reheating ash must not invent a fresh charcoal-burning trial');
      await page.keyboard.press('b');await language(frame,'zh');
    }
    if(id==='ice') {
      await page.keyboard.press('b');await page.waitForTimeout(400);
      const before=await thermal(frame,id);await page.waitForTimeout(700);assert.deepEqual(await thermal(frame,id),before,'Frozen sample retains its state off station');
      assert.equal(await frame.locator('[data-label="ice"] .label-word').innerText(),'冰');
      await capture(page,{path:path.join(evidence,'28-large-observation-readout.png')});
    }
    checks.push(`${id}: automatic heating observation, ${route} observation, verdict, relevant three-choice answers and record unlock`);
  }
  await click(frame.locator('#notesButton'));assert.equal(await frame.locator('[data-evidence]').count(),6);
  assert.match(await frame.locator('[data-evidence="ice"]').innerText(),/冰 → 水 → 冰/);
  await click(frame.locator('[data-action="close"]'));
  await click(frame.locator('#analyseButton'));await frame.waitForFunction(()=>window.__changeLabTest.state().phase==='analysis');
  await click(frame.locator('[data-conclusion="0"]'));assert.ok((await frame.locator('#analysisFeedback').innerText()).length);
  await click(frame.locator('[data-conclusion="1"]'));await click(frame.locator('[data-challenge="no"]'));assert.ok((await frame.locator('#analysisFeedback').innerText()).length);
  await click(frame.locator('[data-challenge="yes"]'));assert.match(await frame.locator('#stageContent').innerText(),/這次證據不支持原來的假說/);
  await click(frame.locator('[data-action="lab"]'));await click(frame.locator('[data-material="chocolate"]'));await click(frame.locator('#freshButton'));await click(frame.locator('[data-action="reset-sample"]'));
  assert.equal(await frame.evaluate(()=>window.__changeLabTest.state().samples.chocolate.record),null);assert.ok(await frame.evaluate(()=>window.__changeLabTest.state().samples.egg.record));
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.network,[]);await desktop.close();
  checks.push('Air-style loading and chapter flow; larger inspector; no manual record button; dismiss/resume and bilingual automatic question recovery');
  checks.push('Wrong answers cannot unlock the next material; records and analysis preserve the ice-water-ice evidence sequence');
  const mobile=await browser.newContext({viewport:{width:390,height:900},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const phone=await open(mobile,base+'/sandbox',true);await start(phone.frame,1);await setFast(phone.frame);
  await click(phone.frame.locator('[data-material="egg"]'));await move(phone.frame,'egg','heat');
  await phone.frame.locator('[data-observation-stage="hot"]').waitFor({state:'visible',timeout:45000});
  await capture(phone.page,{path:path.join(evidence,'29-automatic-question-mobile.png')});
  await answerPrompt(phone.frame,'egg','hot');await language(phone.frame,'en');await move(phone.frame,'egg','cool');
  await answerPrompt(phone.frame,'egg','cold');await answerPrompt(phone.frame,'egg','verdict');
  await phone.page.setViewportSize({width:900,height:390});await phone.page.waitForTimeout(400);
  await capture(phone.page,{path:path.join(evidence,'09-phone-landscape.png')});
  assert.equal(await phone.frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(phone.errors,[]);assert.deepEqual(phone.network,[]);await mobile.close();
  checks.push('390px touch drag and automatic ABC questions; English observation and verdict; landscape layout');
  const local=await browser.newContext({viewport:{width:1366,height:768}});
  const file=await open(local,pathToFileURL(path.join(output,'material-changes.html')).href,false);await start(file.frame,2);await setFast(file.frame);
  await file.page.keyboard.press('h');await answerPrompt(file.frame,'ice','hot');
  assert.deepEqual(file.errors,[]);assert.deepEqual(file.network,[]);await local.close();
  checks.push('Opaque allow-scripts sandbox, denied storage and zero external requests; direct offline HTML also opens automatic questions');
  await writeFile(path.join(evidence,'report.json'),JSON.stringify({passed:true,checks,sha256:report.sha256,realGoogleSitesPasteTested:false,completed:new Date().toISOString()},null,2));
  console.log(JSON.stringify({passed:true,checks},null,2));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
