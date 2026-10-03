// Story is presentation data; reading never advances the verified combat clock.
import {STORY_ACT1} from './story-act1.mjs';
import {STORY_ACT2} from './story-act2.mjs';
import {STORY_ACT3} from './story-act3.mjs';
import {STORY_ACT4} from './story-act4.mjs';
import {STORY_ACT5} from './story-act5.mjs';
import {ADVENTURE_CHAPTER_DESIGNS,ADVENTURE_BOSSES} from './adventure-design.mjs';
const text=(zh,en)=>({'zh-HK':zh,'en-US':en});
const line=(speaker,zh,en)=>({speaker,text:text(zh,en)});
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const scripts=[...STORY_ACT1,...STORY_ACT2,...STORY_ACT3,...STORY_ACT4,...STORY_ACT5];
const bosses=Object.fromEntries(Object.entries(ADVENTURE_BOSSES).map(([id,b])=>[id,{name:b.name,enemy:id,symbol:'✦'}]));
// Keep combat versions and existing scene identities stable. Only story saves
// need a revision so an old line number cannot skip newly rewritten dialogue.
export const STORY_REVISION=2;
export const ADVENTURE=freeze({
  title:text('星晶失竊事件','The Stolen Energy Crystals'),
  premise:text('慶典當天，樂園突然停電，四顆能源晶石不見了！和雲耳、紙尾一起追查貨車、救出同伴，揭穿假警報，把大家帶回家。','On festival day the park loses power and four energy crystals disappear! Follow the cargo trail with Cloud-Ear and Papertail, rescue your friends, expose the false alerts, and bring everyone home.'),
  acts:[
    text('第一幕 · 追查失竊晶石','Act I · Follow the Stolen Crystals'),
    text('第二幕 · 救人與假警報','Act II · Rescues and False Alerts'),
    text('第三幕 · 找出錯誤命令','Act III · Uncover the Bad Orders'),
    text('第四幕 · 通往要塞的路','Act IV · The Road to the Fortress'),
    text('第五幕 · 接大家回家','Act V · Bring Everyone Home'),
  ],
  speakers:{
    narrator:{name:text('冒險手記','Adventure journal'),symbol:'✦'},
    hero:{name:text('你的夥伴','Your companion'),symbol:'★'},
    guide:{name:text('雲耳','Cloud-Ear'),fighterId:'cloud-ear-dog',symbol:'☁'},
    puppet:{name:text('木偶隊長','Captain Timber'),enemy:'puppet',symbol:'◆'},
    squirrel:{name:text('風鈴松鼠','Windbell Squirrel'),enemy:'squirrel',symbol:'♬'},
    golem:{name:text('星晶石像','Starcrystal Guardian'),enemy:'golem',symbol:'✧'},
    ...bosses,
    paperfox:{name:text('紙尾','Papertail'),symbol:'✉'},
    dragon:{name:text('燭鱗','Emberscale'),symbol:'⚒'},
    tideguide:{name:text('渡潮','Tideway'),symbol:'≈'},
    moon:{name:text('月舟','Moonferry'),enemy:'moon-ferryman',symbol:'☾'},
  },
  chapters:ADVENTURE_CHAPTER_DESIGNS.map(d=>{
    const script=scripts.find(c=>c.number===d.number);
    if(!script||script.sections.length!==4||script.scenes.length!==4)throw Error('Missing four-section story for chapter '+d.number);
    const prefix=['sunny','windbell','starcrystal'][d.number-1]||d.id;
    return {
      stageId:d.id,number:d.number,act:d.act,
      title:text('第'+d.number+'章 · '+script.title[0],'Chapter '+d.number+' · '+script.title[1]),
      summary:text(...script.summary),
      sections:script.sections.map(([zh,en,goalZh,goalEn],n)=>{
        const id=prefix+'-'+(n+1),boss=n===3,title=text(zh,en);
        return {id,title,objective:text(goalZh,goalEn),scene:{id,kind:boss?'boss':'section',title:boss?text('Boss · '+zh,'Boss · '+en):title,lines:script.scenes[n].map(v=>line(...v))}};
      }),
      ending:{id:prefix+'-end',kind:'ending',title:text(d.number===20?'慶典重新開始':'本章結果與下一站',d.number===20?'The Festival Begins Again':'What Happened and Where to Go Next'),lines:script.ending.map(v=>line(...v))},
    };
  }),
});
export const chapterByStage=stageId=>ADVENTURE.chapters.find(c=>c.stageId===stageId);
export const chapterScenes=chapter=>[...chapter.sections.map(s=>s.scene),chapter.ending];
export function restoreStoryProgress(chapter,state,saved){
  const scenes=chapterScenes(chapter),ids=new Set(scenes.map(s=>s.id));
  if(saved?.revision!==STORY_REVISION){
    // Completed combat sections stay completed. The current section (including
    // an already-spawned boss) must show the rewritten story from its first line.
    const completed=state.status==='won'?4:Math.max(0,Math.min(3,state.zone));
    return {revision:STORY_REVISION,seen:chapter.sections.slice(0,completed).map(s=>s.scene.id)};
  }
  const seen=Array.isArray(saved.seen)?[...new Set(saved.seen.filter(id=>ids.has(id)))]:[];
  const scene=scenes.find(s=>s.id===saved.active?.id);
  const valid=scene&&!seen.includes(scene.id)&&(scene.kind==='ending'?state.status==='won':state.status==='playing'&&scene.id===chapter.sections[state.zone]?.scene.id);
  const index=valid&&Number.isSafeInteger(saved.active.index)?Math.max(0,Math.min(scene.lines.length-1,saved.active.index)):0;
  return {revision:STORY_REVISION,seen,...(valid?{active:{id:scene.id,index}}:{})};
}
export function pendingStory(chapter,state,progress){
  if(!chapter||state.mode!=='campaign')return undefined;
  const scene=state.status==='won'?chapter.ending:state.status==='playing'?chapter.sections[state.zone]?.scene:undefined;
  return scene&&!progress.seen.includes(scene.id)?scene:undefined;
}
export function storyText(value,locale,hero){return value[locale].replaceAll('{hero}',hero);}
