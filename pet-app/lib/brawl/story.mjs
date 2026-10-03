// Story is presentation data; it never advances the verified combat clock.
import {PROLOGUE} from './story-prologue.mjs';
import {STORY_ACT2} from './story-act2.mjs';
import {STORY_ACT3} from './story-act3.mjs';
import {STORY_ACT4} from './story-act4.mjs';
import {STORY_ACT5} from './story-act5.mjs';
import {ADVENTURE_ACTS,ADVENTURE_CHAPTER_DESIGNS,ADVENTURE_BOSSES} from './adventure-design.mjs';
const text=(zh,en)=>({'zh-HK':zh,'en-US':en});
const line=(speaker,zh,en)=>({speaker,text:text(zh,en)});
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const first=structuredClone(PROLOGUE.chapters);
first[0].sections[0].scene.lines.splice(2,0,line('narrator','雲耳胸前的藍鈴輕響了一下。他握住鈴鐺，像想起甚麼，又很快鬆開。','The blue bell on Cloud-Ear’s chest rings once. He holds it as if remembering something, then lets go.'));
first[0].sections[2].scene.lines.push(line('hero','徽章背面有一枚舊郵印。為甚麼訓練場的命令，會用上信使的標記？','An old postal seal marks its back. Why would a training order carry a courier’s mark?'));
first[1].sections[2].scene.lines.push(line('squirrel','那個戴面具的人，說他會讓所有等待都結束。他的鈴聲，和嚮導的一樣。','The masked traveler said he would end all waiting. His bell sounded like the guide’s.'));
first[2].sections[1].scene.lines.push(line('guide','可是……我好像曾在另一條橋上聽過這種聲音。那段路，我怎樣也想不起來。','But… I think I heard this on another bridge. I cannot remember that journey.'));
first[2].sections[3].scene.lines.splice(3,0,line('golem','守護者的舊誓約只准一人留下。你們來得太晚，那位信使已經沒有名字了。','The old covenant allowed only one guardian to stay. You came too late. The courier has already lost his name.'));
first[2].ending={id:'starcrystal-end',kind:'ending',title:text('核心之下的舊信','The letter beneath the core'),lines:[
 line('golem','我把共鳴星印交還大家。願望不能被鎖住……也不能再只讓一個人守著。','I return the Harmony Seal. Wishes cannot be locked away, or guarded by one person alone.'),
 line('narrator','三枚星印讓樂園重新亮起，核心下卻浮出一封一年前的信。封面印著一枚藍鈴。','The three seals rekindle the paradise. Beneath the core appears a year-old letter bearing a blue bell.'),
 line('hero','「答應我，別讓名字再次消失。」只有這一行，署名被擦掉了。','“Promise me, do not let the names disappear again.” One line remains. The signature is erased.'),
 line('guide','這個筆跡……我應該認得。我們去星燈港，那裏保存所有投遞紀錄。','This handwriting… I should know it. Starlamp Harbor keeps the delivery records.'),
 line('golem','樂園的光只是回來了一部分。沿著舊信走，你們才會找到黯響真正的源頭。','Only part of the light has returned. Follow the letter to find the true source of the echo.'),
 line('narrator','雲耳把信放在藍鈴旁。他沒有說出突然湧上的不安，而那封未寄出的信，正等著下一個答案。','Cloud-Ear places the letter beside his bell. He keeps his sudden unease unspoken. The undelivered letter waits for its next answer.'),
]};
const later=[...STORY_ACT2,...STORY_ACT3,...STORY_ACT4,...STORY_ACT5];
const bosses=Object.fromEntries(Object.entries(ADVENTURE_BOSSES).map(([id,b])=>[id,{name:b.name,enemy:id,symbol:'✦'}]));
export const ADVENTURE=freeze({
 title:PROLOGUE.title,
 premise:text('一場星晶熄滅的意外，牽出一封被遺忘的舊信。與雲耳、紙尾和各地夥伴走過五幕二十章，找回名字、追問真相，讓每個願望都有人回答。','A darkened crystal reveals a forgotten letter. Journey through five acts and twenty chapters with Cloud-Ear, Papertail, and companions from every region to restore names, uncover the truth, and answer each wish.'),
 acts:ADVENTURE_ACTS,
 speakers:{...PROLOGUE.speakers,...bosses,paperfox:{name:text('紙尾','Papertail'),symbol:'✉'},dragon:{name:text('燭鱗','Emberscale'),symbol:'⚒'},tideguide:{name:text('渡潮','Tideway'),symbol:'≈'},moon:{name:text('月舟','Moonferry'),enemy:'moon-ferryman',symbol:'☾'}},
 chapters:ADVENTURE_CHAPTER_DESIGNS.map(d=>{
  const title=text(`第${d.number}章 · ${d.title['zh-HK']}`,`Chapter ${d.number} · ${d.title['en-US']}`);
  if(d.number<=3)return {...first[d.number-1],title,act:d.act};
  const script=later.find(c=>c.number===d.number);if(!script)throw Error(`Missing chapter ${d.number}`);
  return {stageId:d.id,number:d.number,act:d.act,title,summary:text(...script.summary),sections:d.sections.map((name,n)=>{
   const id=`${d.id}-${n+1}`,boss=n===3,objective=boss?text(`擊敗${ADVENTURE_BOSSES[d.boss].name['zh-HK']}，解開通往下一段旅程的道路`,`Defeat ${ADVENTURE_BOSSES[d.boss].name['en-US']} and open the path onward`):text(`清除${name['zh-HK']}的守衛，留意屬性攻擊的地面預警`,`Clear ${name['en-US']}; watch the elemental ground warnings`);
   return {id,title:name,objective,scene:{id,kind:boss?'boss':'section',title:boss?text(`Boss · ${ADVENTURE_BOSSES[d.boss].name['zh-HK']}`,`Boss · ${ADVENTURE_BOSSES[d.boss].name['en-US']}`):name,lines:script.scenes[n].map(v=>line(...v))}};
  }),ending:{id:`${d.id}-end`,kind:'ending',title:text(d.number===20?'每個願望，都有回聲':'下一封回信',d.number===20?'Every Wish Finds an Answer':'The Next Reply'),lines:script.ending.map(v=>line(...v))}};
 }),
});

export const chapterByStage = stageId => ADVENTURE.chapters.find(c=>c.stageId===stageId);
export const chapterScenes = chapter => [...chapter.sections.map(s=>s.scene),chapter.ending];
export function restoreStoryProgress(chapter, state, saved){
  const scenes=chapterScenes(chapter),ids=new Set(scenes.map(s=>s.id));
  const seen=Array.isArray(saved?.seen)?[...new Set(saved.seen.filter(id=>ids.has(id)))]:[];
  // Existing combat saves have no story data. Keep their current encounter and
  // show the next new beat, rather than replaying the beginning over a live boss.
  if(!saved && state.tick>0)for(let n=0;n<=state.zone;n++)if(n<state.zone||state.spawned>0||state.status!=='playing')seen.push(chapter.sections[n].scene.id);
  const scene=scenes.find(s=>s.id===saved?.active?.id);
  const valid=scene && !seen.includes(scene.id) && (scene.kind==='ending'?state.status==='won':state.status==='playing'&&scene.id===chapter.sections[state.zone]?.scene.id);
  const index=valid&&Number.isSafeInteger(saved.active.index)?Math.max(0,Math.min(scene.lines.length-1,saved.active.index)):0;
  return {seen:[...new Set(seen)],...(valid?{active:{id:scene.id,index}}:{})};
}
export function pendingStory(chapter,state,progress){
  if(!chapter||state.mode!=='campaign')return undefined;
  const scene=state.status==='won'?chapter.ending:state.status==='playing'?chapter.sections[state.zone]?.scene:undefined;
  return scene&&!progress.seen.includes(scene.id)?scene:undefined;
}
export function storyText(value,locale,hero){return value[locale].replaceAll('{hero}',hero);}
