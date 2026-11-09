import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {MAP_ZONES} from '../pokemon-rpg-app/src/data/world.mjs';
const base=process.env.ADVENTURE_TEST_URL||'http://127.0.0.1:3190';
const dir='artifacts/pokemon-rpg-art-overhaul/world-adventure-v1';await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[],missing=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push({url:r.url(),status:r.status()})});
async function closeDialogue(){for(let i=0;i<16&&await page.getByTestId('dialogue-overlay').count();i++){await page.keyboard.press('e');await page.waitForTimeout(35)}}
async function closeModal(){if(await page.getByTestId('close-modal-btn').count())await page.getByTestId('close-modal-btn').click()}
async function position(zone,x,z){await closeModal();await closeDialogue();await page.evaluate(({zone,x,z})=>{const g=window.__POKEMON_RPG__;g.save.position={zone,x,z,facing:'up'};g.clickTarget=null;g.syncRendererWithSave(true);g.renderUI(true)},{zone,x,z});await page.waitForTimeout(220)}
async function field(id){const zone=id.split('_')[0],p=MAP_ZONES[zone].fieldObjects.find(p=>p.id===id);await position(zone,p.x,p.z);assert.match(await page.evaluate(()=>window.__POKEMON_RPG__.getNearbyInteraction()?.label||''),new RegExp(p.nameZh));await page.keyboard.press('e');await page.waitForTimeout(150);}
async function npc(id){const n=await page.evaluate(id=>{const g=window.__POKEMON_RPG__;return id==='prof_hibiscus'?{zone:'dawnleaf',x:-8.5,z:-1.5}:id==='nurse_joy'?{zone:'dawnleaf',x:0,z:-2.5}:{zone:'dawnleaf',x:8.5,z:-1.5}},id);await position(n.zone,n.x+.6,n.z+.6);await page.keyboard.press('e');await page.waitForTimeout(120)}
async function journal(tab='main'){await closeModal();await closeDialogue();await page.getByTestId('open-journal-btn').click();if(tab!=='main')await page.locator(`[data-action="journal-tab"][data-tab="${tab}"]`).click()}
async function claim(id){await page.getByTestId('quest-'+id).locator('[data-action="claim-quest"]').click();}
try{
  await page.goto(base+'/pokemon-rpg/preview?art-preview=legacy',{waitUntil:'networkidle'});await page.getByTestId('new-game-btn').click();await page.getByTestId('confirm-creation-btn').click();await page.getByTestId('overworld-hud').waitFor();await closeDialogue();
  await position('dawnleaf',0,4.5);await page.waitForTimeout(400);await page.screenshot({path:dir+'/00-dawnleaf-plaza.png'});
  assert.equal(await page.evaluate(()=>window.__POKEMON_RPG__.save.adventure.tracked),'m01');
  await npc('prof_hibiscus');await page.screenshot({path:dir+'/01-dawnleaf-story.png'});await closeDialogue();await journal();await claim('m01');
  assert.equal(await page.evaluate(()=>window.__POKEMON_RPG__.save.adventure.tracked),'m02');
  await page.locator('[data-action="journal-tab"][data-tab="side"]').click();for(const id of ['s01','s02'])await page.getByTestId('quest-'+id).locator('[data-action="accept-quest"]').click();await closeModal();
  await field('dawnleaf_berry_2');await field('dawnleaf_herb_3');await npc('nurse_joy');await closeModal();await npc('merchant_adam');await closeModal();await field('dawnleaf_survey_6');await closeDialogue();
  await journal();await claim('m02');assert.equal(await page.evaluate(()=>window.__POKEMON_RPG__.save.adventure.tracked),'m03');await page.screenshot({path:dir+'/02-main-journal.png'});await closeModal();
  await field('dawnleaf_camp_1');await page.getByTestId('field-camp-modal').waitFor();await page.evaluate(()=>{const m=window.__POKEMON_RPG__.save.party[0];m.hp=1;m.mp=0;m.status='burn'});await page.getByTestId('camp-rest-btn').click();
  assert.ok(await page.evaluate(()=>{const m=window.__POKEMON_RPG__.save.party[0];return m.hp===m.maxHp&&m.mp===m.maxMp&&m.status===null}));
  await page.locator('[data-action="camp-craft"][data-recipe="potion"]').click();await page.screenshot({path:dir+'/03-camp-crafting.png'});await closeModal();
  await journal('side');await claim('s01');await page.locator('[data-action="journal-tab"][data-tab="research"]').click();await page.getByTestId('quest-r07').locator('[data-action="accept-quest"]').click();await claim('r07');await closeModal();
  await field('dawnleaf_satchel_5');await closeDialogue();await npc('merchant_adam');await closeModal();await journal('side');await claim('s02');await page.screenshot({path:dir+'/04-side-journal.png'});await closeModal();
  await page.evaluate(()=>window.__POKEMON_RPG__.persistSave(true));const before=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__POKEMON_RPG__.save.adventure)));
  await page.reload({waitUntil:'networkidle'});await page.getByTestId('continue-game-btn').click();await page.getByTestId('overworld-hud').waitFor();const after=await page.evaluate(()=>window.__POKEMON_RPG__.save.adventure);
  for(const id of ['m01','m02','s01','s02','r07'])assert.ok(after.completed.includes(id),id+' survives server reload');assert.deepEqual(after.collected,before.collected);assert.deepEqual(after.resources,before.resources);
  await position('dawnleaf',...['dawnleaf_berry_2'].map(id=>MAP_ZONES.dawnleaf.fieldObjects.find(p=>p.id===id)).flatMap(p=>[p.x,p.z]));assert.equal(await page.evaluate(()=>window.__POKEMON_RPG__.interactWithFieldObject('dawnleaf_berry_2')),false,'Harvest cannot be duplicated');
  for(const map of Object.values(MAP_ZONES)){
    const camp=map.fieldObjects.find(p=>p.kind==='camp');await position(map.id,camp.x+1,camp.z+1);await page.waitForTimeout(500);await page.screenshot({path:dir+`/world-${map.id}.png`});
    // Visit every installed prop once, exercising lazy asset loads and culling.
    for(const p of [...map.themeProps,...(map.landmarkProps||[])])await page.evaluate(({zone,x,z})=>{const g=window.__POKEMON_RPG__;g.save.position={zone,x,z,facing:'down'};g.clickTarget=null;g.renderer.camPx={x:x*58,y:z*48};g.renderUI(true)},{zone:map.id,x:p.x,z:p.z});
  }
  await page.setViewportSize({width:390,height:844});await position('dawnleaf',0,6);await journal('side');await page.screenshot({path:dir+'/05-journal-phone.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await closeModal();
  await field('mosswood_board_0');await page.getByTestId('quest-journal').waitFor();assert.equal(await page.locator('.journey-card').count(),2);await page.screenshot({path:dir+'/06-forest-board-phone.png'});
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);const result={passed:true,base,completed:after.completed,resources:after.resources,serverReloadPreserved:true,errors,missing};await fs.writeFile(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close()}
