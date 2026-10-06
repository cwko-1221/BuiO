import assert from 'node:assert/strict';
import {ADVENTURE,STORY_REVISION,chapterByStage,chapterScenes,pendingStory,restoreStoryProgress,storyText} from '../pet-app/lib/brawl/story.mjs';
import {createBattle,stepBattle} from '../pet-app/lib/brawl/simulation.mjs';
import {STAGES,FIGHTERS,VERSION} from '../pet-app/lib/brawl/catalog.mjs';

assert.equal(ADVENTURE.chapters.length,STAGES.length);
const ids=new Set();let lines=0;
for(const stage of STAGES){
  const chapter=chapterByStage(stage.id);
  assert.equal(chapter.sections.length,4);
  assert.equal(chapter.sections[3].scene.kind,'boss');
  assert.ok(chapter.sections[3].scene.lines.some(line=>ADVENTURE.speakers[line.speaker]?.enemy===stage.boss));
  assert.equal(new Set(chapter.sections.map(s=>s.objective['zh-HK'])).size,4,'each section has a specific objective');
  for(const scene of chapterScenes(chapter)){
    assert.ok(!ids.has(scene.id));ids.add(scene.id);assert.ok(scene.lines.length>=3);
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
  const progress=restoreStoryProgress(chapter,state);
  assert.equal(progress.revision,STORY_REVISION);
  assert.equal(pendingStory(chapter,state,progress),chapter.sections[0].scene);
  progress.active={id:chapter.sections[0].id,index:1};
  assert.deepEqual(restoreStoryProgress(chapter,state,structuredClone(progress)),progress,'current revision resumes the exact line');
  assert.deepEqual(state,original,'story operations cannot mutate combat');
  progress.seen.push(chapter.sections[0].id);delete progress.active;
  assert.equal(pendingStory(chapter,state,progress),undefined);
  stepBattle(state,0);assert.equal(state.tick,1,'combat tick belongs only to the simulation');
  state.zone=3;state.spawned=0;
  assert.equal(pendingStory(chapter,state,progress).kind,'boss');
  state.tick=1200;state.spawned=1;
  const legacy=restoreStoryProgress(chapter,state);
  assert.deepEqual(legacy.seen,chapter.sections.slice(0,3).map(s=>s.id),'completed encounters stay completed');
  assert.equal(pendingStory(chapter,state,legacy),chapter.sections[3].scene,'legacy resume must read the current scene, even after a boss has spawned');
  const oldSave={seen:chapterScenes(chapter).map(s=>s.id),active:{id:chapter.sections[3].id,index:99}};
  assert.deepEqual(restoreStoryProgress(chapter,state,oldSave),legacy,'old seen flags and line numbers cannot skip the rewritten current scene');
  state.status='won';
  const oldEnding=restoreStoryProgress(chapter,state,oldSave);
  assert.equal(pendingStory(chapter,state,oldEnding),chapter.ending,'the new ending is mandatory before settling an old combat save');
  const dirty={revision:STORY_REVISION,seen:['made-up',null,chapter.sections[0].id,chapter.sections[0].id],active:{id:chapter.ending.id,index:999}};
  const cleaned=restoreStoryProgress(chapter,state,dirty);
  assert.deepEqual(cleaned.seen,[chapter.sections[0].id]);assert.equal(cleaned.active.index,chapter.ending.lines.length-1);
  const wrongScene={revision:STORY_REVISION,seen:[],active:{id:chapter.sections[0].id,index:1}};
  assert.equal(restoreStoryProgress(chapter,state,wrongScene).active,undefined,'stale active scenes cannot bypass the pending ending');
  state.mode='practice';assert.equal(pendingStory(chapter,state,cleaned),undefined);
}
assert.equal(ids.size,100);
assert.ok(Object.isFrozen(ADVENTURE.chapters[0].sections[0].scene.lines[0].text));
assert.equal(VERSION,'brawl-v14','current combat version supports the required adventure story');
console.log(JSON.stringify({pass:true,chapters:20,sections:80,scenes:100,lines,locales:2,storyRevision:STORY_REVISION,combatRules:VERSION}));
