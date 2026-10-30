import {createFishing,stepFishing} from './park-fishing.mjs';
import {PARK_ECONOMY} from './park-economy.mjs';
// Deterministic leisure games. Only inputs cross the network; outcomes stay here.
export const LEISURE_RULES={
  fishing:{duration:120,target:2,reward:PARK_ECONOMY.gameReward,name:{'zh-HK':'池畔慢釣','en-US':'Lily Pond Fishing'}},
  rhythm:{duration:30,target:12,reward:PARK_ECONOMY.gameReward,name:{'zh-HK':'森林節奏鼓','en-US':'Woodland Rhythm'}},
  lantern:{duration:90,target:2,reward:PARK_ECONOMY.gameReward,name:{'zh-HK':'願望點燈師','en-US':'Wish Lanterns'}},
  golf:{duration:90,target:2,reward:PARK_ECONOMY.gameReward,name:{'zh-HK':'草地迷你高爾夫','en-US':'Meadow Mini Golf'}},
};
export const FISH=[
  {id:'sunny',name:{'zh-HK':'日光小鯉','en-US':'Sunny Carp'},color:'#f2b86f',points:3,rarity:'common',length:[14,27],pull:9},
  {id:'mint',name:{'zh-HK':'薄荷小魚','en-US':'Mint Minnow'},color:'#9cdcc3',points:2,rarity:'common',length:[8,15],pull:7},
  {id:'moon',name:{'zh-HK':'月光銀魚','en-US':'Moon Dace'},color:'#c6dcf0',points:4,rarity:'uncommon',length:[17,30],pull:14},
  {id:'peach',name:{'zh-HK':'桃花胖鯽','en-US':'Peach Bream'},color:'#eca7a4',points:3,rarity:'common',length:[12,24],pull:11},
  {id:'blue',name:{'zh-HK':'藍尾小魚','en-US':'Bluefin Sprat'},color:'#83becf',points:2,rarity:'uncommon',length:[10,19],pull:16},
  {id:'gold',name:{'zh-HK':'星點金魚','en-US':'Starlit Goldfish'},color:'#e9cf78',points:5,rarity:'rare',length:[20,34],pull:18},
  {"id":"crucian","name":{"zh-HK":"銀鱗鯽魚","en-US":"Silver Crucian"},"color":"#b7d9c8","points":3,"rarity":"common","length":[12,24],"pull":8},
  {"id":"perch","name":{"zh-HK":"斑紋小鱸","en-US":"Striped Perch"},"color":"#b7d9c8","points":3,"rarity":"common","length":[13,25],"pull":10},
  {"id":"loach","name":{"zh-HK":"斑點泥鰍","en-US":"Spotted Loach"},"color":"#b7d9c8","points":2,"rarity":"common","length":[8,17],"pull":8},
  {"id":"catfish","name":{"zh-HK":"鬍鬚鯰魚","en-US":"Whisker Catfish"},"color":"#b7d9c8","points":4,"rarity":"uncommon","length":[20,38],"pull":14},
  {"id":"rainbow","name":{"zh-HK":"彩虹鱒魚","en-US":"Rainbow Trout"},"color":"#b7d9c8","points":4,"rarity":"uncommon","length":[20,36],"pull":15},
  {"id":"koi","name":{"zh-HK":"紅白錦鯉","en-US":"Vermilion Koi"},"color":"#b7d9c8","points":5,"rarity":"rare","length":[24,42],"pull":16},
  {"id":"bitterling","name":{"zh-HK":"珍珠鰟鮍","en-US":"Pearl Bitterling"},"color":"#b7d9c8","points":2,"rarity":"common","length":[5,11],"pull":7},
  {"id":"bass","name":{"zh-HK":"青背黑鱸","en-US":"Olive Bass"},"color":"#b7d9c8","points":4,"rarity":"uncommon","length":[22,40],"pull":15},
  {"id":"tilapia","name":{"zh-HK":"暖陽羅非魚","en-US":"Sun Tilapia"},"color":"#b7d9c8","points":3,"rarity":"common","length":[14,30],"pull":10},
  {"id":"sturgeon","name":{"zh-HK":"銀甲鱘魚","en-US":"Silver Sturgeon"},"color":"#b7d9c8","points":6,"rarity":"rare","length":[35,58],"pull":17},
  {"id":"arowana","name":{"zh-HK":"金輝龍魚","en-US":"Golden Arowana"},"color":"#b7d9c8","points":8,"rarity":"epic","length":[30,52],"pull":20},
  {"id":"betta","name":{"zh-HK":"藍紗鬥魚","en-US":"Sapphire Betta"},"color":"#b7d9c8","points":4,"rarity":"uncommon","length":[6,12],"pull":14},
  {"id":"chub","name":{"zh-HK":"溪流小鯉","en-US":"River Chub"},"color":"#b7d9c8","points":3,"rarity":"common","length":[10,22],"pull":9},
  {"id":"crystal","name":{"zh-HK":"琉璃小魚","en-US":"Opal Dreamfish"},"color":"#b7d9c8","points":9,"rarity":"epic","length":[14,24],"pull":20},
];
export const FISHING_SPOTS=[
  {id:'shallows',x:380,y:355,name:{'zh-HK':'晴光淺灘','en-US':'Sunlit Shallows'},fish:[0,0,1,1,3,6,6,8,12,14,18]},
  {id:'lilies',x:620,y:365,name:{'zh-HK':'睡蓮水灣','en-US':'Lily Cove'},fish:[1,3,5,6,7,8,10,11,12,17,17]},
  {id:'deep',x:485,y:210,name:{'zh-HK':'靜水深潭','en-US':'Quiet Deepwater'},fish:[2,2,4,7,9,10,13,15,16,19]},
];
export const GOLF_COURSES=[
  {start:{x:150,y:440},hole:{x:640,y:170},walls:[{x:365,y:230,w:30,h:230}],par:3},
  {start:{x:135,y:470},hole:{x:665,y:140},walls:[{x:270,y:155,w:28,h:280},{x:490,y:265,w:28,h:265}],par:4},
  {start:{x:150,y:450},hole:{x:650,y:170},walls:[{x:300,y:150,w:220,h:26},{x:300,y:340,w:220,h:26}],par:4},
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const random=s=>{s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;};
const event=(s,type,amount=0)=>{s.effects.push({id:++s.effectSerial,type,x:400,y:300,kind:s.kind,amount,t:s.t});if(s.effects.length>40)s.effects.shift();};
export function toggleLantern(board,index){const out=[...board];for(const n of [index,index%3?index-1:-1,index%3<2?index+1:-1,index-3,index+3])if(n>=0&&n<9)out[n]=!out[n];return out;}
export function lanternHint(board){for(let mask=0;mask<512;mask++){let b=board;for(let i=0;i<9;i++)if(mask>>i&1)b=toggleLantern(b,i);if(b.every(Boolean))return Array.from({length:9},(_,i)=>i).filter(i=>mask>>i&1);}return[];}
function board(s){let tiles=Array(9).fill(true);for(let i=0;i<4+s.leisure.round;i++)tiles=toggleLantern(tiles,Math.floor(random(s)*9));if(tiles.every(Boolean))tiles=toggleLantern(tiles,4);s.leisure.tiles=tiles;s.leisure.moves=0;s.leisure.hint=-1;}
export function createLeisure(s){
  s.leisure={presses:Array(10).fill(0),phase:'ready',round:0,completed:0,hits:0,misses:0,perfect:0,feedback:'',feedbackUntil:0,collection:[],fish:0,biteAt:0,castAt:0,phaseUntil:0,tension:50,progress:0,strain:0,chart:[],tiles:[],moves:0,hint:-1,ball:{x:150,y:440,vx:0,vy:0},strokes:0,totalStrokes:0,cupAt:0};
  const l=s.leisure;
  if(s.kind==='fishing')createFishing(s,FISHING_SPOTS);
  if(s.kind==='rhythm'){l.phase='playing';l.chart=Array.from({length:56},(_,i)=>({id:i,lane:Math.floor(random(s)*4),at:2+i*.46875,done:false}));}
  if(s.kind==='lantern'){l.phase='playing';board(s);}
  if(s.kind==='golf'){l.phase='playing';l.ball={...GOLF_COURSES[0].start,vx:0,vy:0};l.strokes=0;l.totalStrokes=0;l.cupAt=0;}
}
function feedback(s,text,type='tap'){s.leisure.feedback=text;s.leisure.feedbackUntil=s.t+1.2;event(s,type);}
function rhythm(s,pressed){
  const l=s.leisure;
  for(let lane=0;lane<4;lane++)if(pressed[lane]){
    const note=l.chart.find(n=>!n.done&&n.lane===lane&&Math.abs(n.at-s.t)<=.25);
    if(note){note.done=true;const perfect=Math.abs(note.at-s.t)<.12;l.hits++;l.perfect+=perfect?1:0;s.combo++;s.bestCombo=Math.max(s.bestCombo,s.combo);s.score+=perfect?3:2;feedback(s,perfect?'perfect':'good','note');}
    else{l.misses++;s.combo=0;feedback(s,'offbeat','miss');}
  }
  for(const n of l.chart)if(!n.done&&n.at<s.t-.25){n.done=true;l.misses++;s.combo=0;}
  l.completed=l.hits;
}
function lantern(s,pressed){
  const l=s.leisure;
  if(l.phase==='celebrate'){if(s.t<l.phaseUntil)return;l.round++;l.phase='playing';board(s);}
  if(pressed[9]){l.hint=lanternHint(l.tiles)[0]??-1;feedback(s,'hint');return;}
  for(let i=0;i<9;i++)if(pressed[i]){l.tiles=toggleLantern(l.tiles,i);l.moves++;l.hint=-1;event(s,'light');if(l.tiles.every(Boolean)){l.completed++;s.score+=Math.max(3,16-l.moves);l.phase='celebrate';l.phaseUntil=s.t+1;event(s,'clear');if(l.completed>=3){s.status='ended';s.victory=true;}break;}}
}
function golf(s,input,pressed,dt){
  const l=s.leisure,course=GOLF_COURSES[l.round],b=l.ball;
  if(l.phase==='celebrate'){
    if(s.t>=l.cupAt+1){l.round++;if(l.round>=3){s.status='ended';s.victory=true;return;}l.ball={...GOLF_COURSES[l.round].start,vx:0,vy:0};l.strokes=0;l.phase='playing';}return;
  }
  if(pressed[0]&&Math.hypot(b.vx,b.vy)<5&&Number.isFinite(input.x)&&Number.isFinite(input.y)){
    const dx=b.x-input.x/480*800,dy=b.y-input.y/720*600,length=Math.hypot(dx,dy);if(length>=5){const power=Math.min(520,length*4);b.vx=dx/length*power;b.vy=dy/length*power;l.strokes++;l.totalStrokes++;event(s,'putt');}
  }
  // Several small collision steps prevent tunnelling through the wooden bumpers.
  for(let i=0;i<4;i++){
    const step=dt/4,old={x:b.x,y:b.y};b.x+=b.vx*step;b.y+=b.vy*step;
    if(b.x<75||b.x>725){b.x=clamp(b.x,75,725);b.vx*=-.82;event(s,'bounce');}if(b.y<75||b.y>525){b.y=clamp(b.y,75,525);b.vy*=-.82;event(s,'bounce');}
    for(const wall of course.walls)if(b.x>wall.x-8&&b.x<wall.x+wall.w+8&&b.y>wall.y-8&&b.y<wall.y+wall.h+8){
      if(old.x<=wall.x-8||old.x>=wall.x+wall.w+8){b.x=old.x;b.vx*=-.85;}else{b.y=old.y;b.vy*=-.85;}event(s,'bounce');
    }
    const drag=Math.exp(-.95*step);b.vx*=drag;b.vy*=drag;
    if(Math.hypot(b.x-course.hole.x,b.y-course.hole.y)<17&&Math.hypot(b.vx,b.vy)<240){b.x=course.hole.x;b.y=course.hole.y;b.vx=0;b.vy=0;l.completed++;s.score+=Math.max(2,course.par+7-l.strokes);l.phase='celebrate';l.cupAt=s.t;event(s,'cup');break;}
  }
  if(Math.hypot(b.vx,b.vy)<5){b.vx=0;b.vy=0;}
}
export function stepLeisure(s,input,dt){
  const l=s.leisure,pressed=Array(10).fill(false);
  for(let i=0;i<10;i++){const n=input.presses?.[i]||0;pressed[i]=n>l.presses[i];l.presses[i]=Math.max(l.presses[i],n);}
  s.inputSeq=input.seq??s.inputSeq;
  if(s.kind==='fishing')stepFishing(s,input,pressed,dt,FISH,FISHING_SPOTS);
  else if(s.kind==='rhythm')rhythm(s,pressed);
  else if(s.kind==='lantern')lantern(s,pressed);
  else golf(s,input,pressed,dt);
  if(s.t>=LEISURE_RULES[s.kind].duration){s.status='ended';s.victory=l.completed>=LEISURE_RULES[s.kind].target;}
}
export function leisureResult(s){return{score:s.score,qualified:s.leisure.completed>=LEISURE_RULES[s.kind].target,caught:s.caught,kills:0,combo:s.bestCombo,victory:s.victory,seconds:Math.round(s.t),collection:s.kind==='fishing'?[...new Set(s.leisure.collection)]:[],fishCatches:s.kind==='fishing'?s.leisure.records.map(r=>({...r})):[],completed:s.leisure.completed,strokes:s.leisure.totalStrokes||0};}
