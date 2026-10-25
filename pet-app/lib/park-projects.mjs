// Shared daily scenery. These actions never touch a student's wallet.
export const PROJECT_RULES={goal:9,perStudent:3,cooldownMs:1200};
export const SCENE_PROJECTS=[
  {id:'bridge-bloom',kind:'garland',at:{x:2100,y:1120},marker:{x:2070,y:890},name:{'zh-HK':'橋邊花廊','en-US':'Blossom Bridge'},description:{'zh-HK':'和同學一起把花飾掛在木橋兩側，讓每次過橋都有花香。','en-US':'Hang flowers along the wooden bridge with your classmates.'},choices:[{id:'peach',zh:'暖粉花飾',en:'Peach blooms',tint:0xffd9d0},{id:'cream',zh:'奶白花飾',en:'Cream blooms',tint:0xfff2cb},{id:'mint',zh:'清新綠葉',en:'Fresh greens',tint:0xc9eed2}]},
  {id:'pond-life',kind:'lily',at:{x:4480,y:820},marker:{x:4750,y:780},name:{'zh-HK':'睡蓮生態池','en-US':'Lily Pond Habitat'},description:{'zh-HK':'合力種下不同顏色的睡蓮，讓小池塘變成生氣盎然的花園。','en-US':'Add colourful water lilies and make a lively pond garden together.'},choices:[{id:'cream',zh:'奶白睡蓮',en:'Cream lily',tint:0xfff4d7},{id:'peach',zh:'桃色睡蓮',en:'Peach lily',tint:0xffd3dc},{id:'mint',zh:'青綠睡蓮',en:'Mint lily',tint:0xcdf0dc}]},
  {id:'wish-lights',kind:'lantern',at:{x:4470,y:2900},marker:{x:4660,y:2850},name:{'zh-HK':'願望燈會','en-US':'Class Wish Lights'},description:{'zh-HK':'把一盞燈掛到願望鐘旁，和同學一起點亮廣場。','en-US':'Hang a lantern by the wishing bell and light up the plaza together.'},choices:[{id:'cream',zh:'暖金燈籠',en:'Golden light',tint:0xffefc3},{id:'peach',zh:'蜜桃燈籠',en:'Peach light',tint:0xffc8b9},{id:'mint',zh:'薄荷燈籠',en:'Mint light',tint:0xc7e9dd}]},
];
export const blankProjects=()=>Object.fromEntries(SCENE_PROJECTS.map(p=>[p.id,{id:p.id,revision:0,contributions:[],completedAt:null}]));
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
export function contributeProject(state,actor,command,now){
  const spec=SCENE_PROJECTS.find(p=>p.id===command.plotId);if(!spec||!spec.choices.some(c=>c.id===command.seed))fail('請選擇有效的場景裝飾。',400);
  state.projects??=blankProjects();const p=state.projects[spec.id]??=(blankProjects()[spec.id]);
  if(!Number.isInteger(command.revision)||command.revision!==p.revision)fail('同學剛更新了這個計畫，看看最新場景再繼續吧。');
  if(p.contributions.length>=PROJECT_RULES.goal)fail('今天的共建計畫完成了，一起欣賞成果吧。');
  const mine=p.contributions.filter(c=>c.actorId===actor.id);
  if(mine.length>=PROJECT_RULES.perStudent)fail('你今天已幫忙三次，把下一份心意留給同學吧。');
  if(mine.length&&now-mine.at(-1).at<PROJECT_RULES.cooldownMs)fail('等這份裝飾放穩，再繼續幫忙吧。',429);
  p.contributions.push({actorId:actor.id,name:actor.name,choice:command.seed,at:now});p.revision++;if(p.contributions.length===PROJECT_RULES.goal)p.completedAt=now;
  state.revision++;state.updatedAt=now;return{action:'contribute',plotId:p.id,revision:p.revision,bouquets:state.bouquets,repeated:false,count:p.contributions.length,completed:!!p.completedAt};
}
export function publicProjects(state){const projects=state.projects||blankProjects();return Object.fromEntries(SCENE_PROJECTS.map(spec=>{const p=projects[spec.id]||blankProjects()[spec.id],count=p.contributions.length;return[spec.id,{id:p.id,revision:p.revision,count,goal:PROJECT_RULES.goal,stage:Math.floor(count/3),completedAt:p.completedAt,contributions:p.contributions.map(c=>({...c}))}];}));}
