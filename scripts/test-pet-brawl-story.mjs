import assert from 'node:assert/strict';
import {ADVENTURE,chapterByStage,chapterScenes,pendingStory,restoreStoryProgress,storyText} from '../pet-app/lib/brawl/story.mjs';
import {createBattle,stepBattle} from '../pet-app/lib/brawl/simulation.mjs';
import {STAGES,FIGHTERS,VERSION} from '../pet-app/lib/brawl/catalog.mjs';

assert.equal(ADVENTURE.chapters.length,STAGES.length);
const ids=new Set();let lines=0;
for(const stage of STAGES){
  const chapter=chapterByStage(stage.id);
  assert.equal(chapter.sections.length,4);
  assert.equal(chapter.sections[3].scene.kind,'boss');
  assert.ok(chapter.sections[3].scene.lines.some(line=>ADVENTURE.speakers[line.speaker]?.enemy===stage.boss));
  for(const scene of chapterScenes(chapter)){
    assert.ok(!ids.has(scene.id));ids.add(scene.id);assert.ok(scene.lines.length>=2);
    for(const line of scene.lines){
      assert.ok(ADVENTURE.speakers[line.speaker]);
      for(const locale of ['zh-HK','en-US']){
        assert.ok(line.text[locale].length>10);
        assert.ok(!storyText(line.text,locale,'Test Companion').includes('{hero}'));
      }
      lines++;
    }
  }
  const state=createBattle({fighterId:FIGHTERS[0].id,stageId:stage.id,seed:123,mode:'campaign'}),original=structuredClone(state);
  let progress=restoreStoryProgress(chapter,state);
  assert.equal(pendingStory(chapter,state,progress),chapter.sections[0].scene);
  progress.active={id:chapter.sections[0].id,index:1};
  const recovered=restoreStoryProgress(chapter,state,structuredClone(progress));
  assert.deepEqual(recovered,progress);
  assert.deepEqual(state,original,'story operations cannot mutate combat');
  progress.seen.push(chapter.sections[0].id);delete progress.active;
  assert.equal(pendingStory(chapter,state,progress),undefined);
  stepBattle(state,0);assert.equal(state.tick,1,'combat tick belongs only to the simulation');
  state.zone=3;state.spawned=0;
  assert.equal(pendingStory(chapter,state,progress).kind,'boss');
  state.tick=1200;state.spawned=1;
  const legacy=restoreStoryProgress(chapter,state);
  assert.equal(pendingStory(chapter,state,legacy),undefined,'legacy resume never interrupts an existing boss');
  state.status='won';
  assert.equal(pendingStory(chapter,state,legacy),chapter.ending);
  const dirty={seen:['made-up',null,chapter.sections[0].id,chapter.sections[0].id],active:{id:chapter.ending.id,index:999}};
  const cleaned=restoreStoryProgress(chapter,state,dirty);
  assert.deepEqual(cleaned.seen,[chapter.sections[0].id]);assert.equal(cleaned.active.index,chapter.ending.lines.length-1);
  state.mode='practice';assert.equal(pendingStory(chapter,state,cleaned),undefined);
}
assert.equal(ids.size,100);
assert.ok(Object.isFrozen(ADVENTURE.chapters[0].sections[0].scene.lines[0].text));
assert.equal(VERSION,'brawl-v9','new encounters use a versioned combat ruleset');
console.log(JSON.stringify({pass:true,chapters:20,sections:80,scenes:100,lines,locales:2,combatRules:VERSION}));
