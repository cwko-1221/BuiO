// One fixed, hand-authored course for every room. The route grammar follows
// the supplied reference sequence: a forgiving brick tutorial, landmark
// bases, short prop chains, large set-pieces, and alternating rising turns.
// Art and object identities remain original to this project.
export const MAP_VERSION = 'fixed-1000m-2026.07av';
export const WORLD = { width:5600, height:6200, startY:5700, summitY:700, pixelsPerMetre:5 };

const objects=[];
const nodes=[];
const main=[];
const shortcut=[];
const recovery=[];
const hazards=[];
const annotations=[];
let serial=0;
let previous=null;

const yAt = altitude => WORLD.startY - altitude * WORLD.pixelsPerMetre;
const staticBehavior = { type:'static' };

function support(zone,assetId,x,altitude,w,h=96,extra={}) {
  const id=extra.id || `fixed-${String(++serial).padStart(3,'0')}`;
  const object={id,assetId,zone,x,y:yAt(altitude),w,h,angle:extra.angle||0,
    role:'support',behavior:extra.behavior||staticBehavior,routeNode:`node-${id}`,tags:extra.tags||[]};
  objects.push(object);
  const node={id:object.routeNode,objectId:id,x,y:object.y-h/2-8,altitude,route:extra.route||'main',safe:extra.safe!==false};
  nodes.push(node);
  return {object,node};
}

function mainSupport(zone,assetId,x,altitude,w,h=96,extra={}) {
  const result=support(zone,assetId,x,altitude,w,h,extra);
  if (previous) main.push({from:previous.node.id,to:result.node.id,type:'main'});
  previous=result;
  return result;
}

function obstacle(zone,assetId,supportRef,xOffset,w,h,extra={}) {
  const id=extra.id || `fixed-obstacle-${String(++serial).padStart(3,'0')}`;
  const supportTop=supportRef.object.y-supportRef.object.h/2;
  objects.push({id,assetId,zone,x:supportRef.object.x+xOffset,y:supportTop-h/2,w,h,
    angle:extra.angle||0,role:'obstacle',behavior:staticBehavior,supportId:supportRef.object.id,tags:['obstacle',...(extra.tags||[])]});
}

// Tutorial masonry is assembled from independent front-facing pieces.  Unlike
// a decorative arch image, every visible brick piece owns its exact collider,
// so the open doorway remains open and there is no invisible platform.
function placedObstacle(zone,assetId,x,y,w,h,extra={}) {
  const id=extra.id || `fixed-obstacle-${String(++serial).padStart(3,'0')}`;
  objects.push({id,assetId,zone,x,y,w,h,angle:extra.angle||0,role:'obstacle',
    behavior:staticBehavior,tags:['obstacle','tutorial-masonry',...(extra.tags||[])]});
  return id;
}

function decor(zone,assetId,x,altitude,w,h,extra={}) {
  objects.push({id:`fixed-decor-${String(++serial).padStart(3,'0')}`,assetId,zone,x,y:yAt(altitude),w,h,
    angle:extra.angle||0,role:'decor',behavior:staticBehavior,tags:['decor',...(extra.tags||[])]});
}

// Every entry is deliberately positioned rather than repeated by a generator.
// This makes the silhouette and route pacing match the supplied map references.
function authoredRoute(zone,entries,tags=[]) {
  return entries.map(([assetId,x,altitude,w,h,extra={}])=>mainSupport(
    zone,assetId,x,altitude,w,h,{...extra,tags:[...tags,...(extra.tags||[])]}
  ));
}

function recoverLast(run,count=2) {
  for (let index=Math.max(1,run.length-count);index<run.length;index++) {
    recovery.push({from:run[index].node.id,to:run[index-1].node.id,type:'recovery'});
  }
}

// CASTLE 0-210m -------------------------------------------------------------
// The opening mirrors the reference pacing: long floor, low gates, forgiving
// brick steps, then a left-climbing sequence of castle props and landmarks.
const castleGround=[];
for (let x=128;x<=2944;x+=256) {
  castleGround.push(mainSupport('castle','flat-brick-strip-4',x,0,260,78,{tags:['ground-chain','tutorial-floor']}));
}
for (const x of [300,500,700]) decor('castle','ref-go-pennant',x,11,66,100,{tags:['reference-frame-01','tutorial-flag']});

const tutorialFloorTop=yAt(0)-78/2;
// Low hop: a short open bench, matching the first reference teaching beat.
placedObstacle('castle','flat-brick-a',930,yAt(0)-48.8125,70,70,{tags:['reference-frame-01','low-gate']});
placedObstacle('castle','flat-brick-a',930,yAt(0)-104.8125,70,70,{tags:['reference-frame-01','low-gate']});
placedObstacle('castle','flat-brick-a',1110,yAt(0)-48.8125,70,70,{tags:['reference-frame-01','low-gate']});
placedObstacle('castle','flat-brick-a',1110,yAt(0)-104.8125,70,70,{tags:['reference-frame-01','low-gate']});
placedObstacle('castle','flat-brick-strip-2',1020,yAt(0)-157.3125,230,48,{tags:['reference-frame-01','low-gate-top']});
// A readable two-step rise before the taller run-and-jump frame.
placedObstacle('castle','flat-brick-a',1450,tutorialFloorTop-32.25,100,80,{tags:['reference-frame-01','tutorial-step']});
placedObstacle('castle','flat-brick-a',1570,tutorialFloorTop-88,100,80,{tags:['reference-frame-01','tutorial-step']});
placedObstacle('castle','flat-brick-a',1690,tutorialFloorTop-143.75,100,80,{tags:['reference-frame-01','tutorial-step']});
// Tall but completely open doorway: the player can pass beneath it or climb it.
placedObstacle('castle','flat-brick-pillar-4',2180,tutorialFloorTop-111.4314,52,220,{tags:['reference-frame-01','tall-gate']});
placedObstacle('castle','flat-brick-pillar-4',2460,tutorialFloorTop-111.4314,52,220,{tags:['reference-frame-01','tall-gate']});
placedObstacle('castle','flat-brick-strip-2',2320,tutorialFloorTop-247.8628,340,52,{tags:['reference-frame-01','tall-gate-top']});

// Frames 1-14 below deliberately follow the supplied screenshot order.  Only
// front-facing brick pieces and the reference-matched prop set are allowed on
// the visible route; legacy snow slabs, generic furniture and filler decor are
// intentionally absent.
const frame01=authoredRoute('castle',[
  ['flat-brick-a',3170,5,190,82],['flat-brick-strip-2',3390,11,230,68],
  ['flat-brick-wall-2',3630,18,220,92],['flat-brick-strip-2',3870,26,240,70],
  ['flat-brick-wall-2',4110,35,220,94],['flat-brick-strip-2',4350,45,245,70],
  ['flat-brick-wall-2',4590,55,220,94]
],['reference-frame-01','tutorial-stair-bridge']);

const frame02=authoredRoute('castle',[
  ['flat-brick-strip-2',4830,62,245,70],['flat-brick-pillar-4',5100,70,118,230],
  ['flat-brick-strip-2',5260,80,245,70],['flat-brick-strip-2',4930,91,245,70],
  ['flat-brick-strip-2',4650,103,245,70],['flat-brick-strip-4',4250,115,600,90]
],['reference-frame-02','market-threshold']);
const marketStallBase=support('castle','flat-brick-strip-2',3500,115,260,72,{route:'side',tags:['reference-frame-02','market-stall-base']});
obstacle('castle','ref-market-stall-red',marketStallBase,0,180,195,{tags:['reference-frame-02']});
obstacle('castle','ref-produce-crate',frame02[4],0,92,78,{tags:['reference-frame-02','market-threshold-crate']});

const frame03=authoredRoute('castle',[
  ['ref-produce-crate',4300,132,210,128],['ref-produce-crate',4550,144,210,128],
  ['ref-produce-crate',4800,156,210,128],['ref-shield-rack',5100,168,300,175],
  ['ref-barrel-front',5350,179,155,165],['ref-stone-ramp-front',5050,190,340,105,{angle:-0.12}]
],['reference-frame-03','oven-crate-ascent']);
obstacle('castle','ref-oven-front',frame02[5],-180,250,198,{tags:['reference-frame-03','oven-obstacle']});
decor('castle','ref-lamp-post',4050,142,108,250,{tags:['reference-frame-03','oven-lamp']});

const frame04=authoredRoute('market',[
  ['ref-barrel-front',4780,202,150,165],['ref-barrel-front',4530,215,150,165],
  ['ref-barrel-front',4250,228,150,165],['ref-stone-ramp-front',4020,242,340,105,{angle:-0.16}],
  ['ref-shield-rack',3800,256,270,115]
],['reference-frame-04','barrel-ramp-turn']);

const frame05=authoredRoute('market',[
  ['ref-barrel-cart',4050,274,330,160],['ref-barrel-cart',4350,286,330,160],
  ['ref-stone-pillar-front',4650,304,180,180],['ref-stone-pillar-front',4900,316,180,180],
  ['ref-chair-front',5200,326,170,150,{tags:['reference-frame-06']}],
  ['ref-feast-table',5450,335,330,140,{tags:['reference-frame-06']}]
],['reference-frame-05','feast-hall-ascent']);

const frame06=authoredRoute('forest',[
  ['ref-stone-ramp-front',5350,350,420,150,{angle:-0.14}],
  ['ref-stone-ramp-front',5200,372,420,150,{angle:0.12}],
  ['ref-stone-column-front',4950,398,235,100]
],['reference-frame-06','ramp-gallery']);
decor('forest','ref-barrel-front',5550,390,150,150,{tags:['reference-frame-06','ramp-gallery-barrel']});

const frame07=authoredRoute('forest',[
  ['ref-bed-front',4850,420,360,60],['ref-hanging-lantern',5000,436,270,120],
  ['ref-bed-front',5200,460,430,140,{angle:-0.12,tags:['reference-frame-08']}],
  ['ref-catapult-front',5500,475,320,205]
],['reference-frame-07','bed-lantern-climb']);

const frame08=authoredRoute('farm',[
  ['ref-hanging-lantern',5250,495,270,205],['ref-catapult-front',4920,507,320,205],
  ['ref-log-step',4600,519,205,88],['ref-log-step',4350,529,205,88],
  ['ref-oven-front',4050,538,280,220],['ref-bellows-front',3750,545,300,115]
],['reference-frame-08','oven-workshop']);

const frame09=authoredRoute('farm',[
  ['ref-log-step',3500,552,205,88],['ref-cookpot',3270,565,180,145],
  ['ref-cookpot',3040,578,180,145],['ref-cookpot',2810,591,180,145],
  ['ref-log-step',2570,603,205,88],['flat-brick-strip-4',2230,615,520,88,{tags:['banner-landing']}]
],['reference-frame-09','banner-pot-ascent']);
obstacle('farm','ref-castle-banner-blue',frame09[5],-100,150,210,{tags:['reference-frame-09','reference-frame-10']});
obstacle('farm','ref-castle-banner-red',frame09[5],105,150,210,{tags:['reference-frame-09','reference-frame-10']});

const frame10=authoredRoute('snow',[
  ['flat-brick-a',2630,625,150,50],['flat-brick-pillar-4',2830,638,135,135],
  ['flat-brick-pillar-4',3030,651,135,135],['flat-brick-pillar-4',3230,664,135,135],
  ['flat-brick-pillar-4',3430,677,135,135],['flat-brick-strip-4',3780,690,560,90,{tags:['armory-platform']}]
],['reference-frame-10','armory-finale']);
obstacle('snow','ref-knight-stand',frame10[5],-145,112,158,{tags:['reference-frame-10']});
obstacle('snow','ref-knight-stand',frame10[5],-25,112,158,{tags:['reference-frame-10']});
obstacle('snow','ref-shield-rack',frame10[5],145,150,112,{tags:['reference-frame-10']});

const frame11=authoredRoute('snow',[
  ['ref-shield-rack',4180,700,240,155],['ref-book-step',4400,711,175,108],
  ['ref-book-step',4620,722,175,108],['ref-book-step',4840,733,175,108],
  ['ref-scroll-step',5070,744,190,84]
],['reference-frame-11','library-wall']);
const upperLampBase=support('snow','flat-brick-strip-4',5400,755,560,90,{route:'side',tags:['reference-frame-11','library-upper-landing']});
obstacle('snow','ref-lamp-post',upperLampBase,150,100,230,{tags:['reference-frame-11']});

const frame12=authoredRoute('factory',[
  ['ref-sand-ledge',5000,758,250,100],['ref-fishing-boat',4750,778,285,120],
  ['ref-fishing-boat',4550,800,285,120],['ref-sand-ledge',4350,825,300,140]
],['reference-frame-12','coral-boats','rising-left']);

const frame13=authoredRoute('factory',[
  ['ref-sand-ledge',4100,842,250,150],['ref-round-table-front',3800,858,300,220],
  ['ref-bowl-front',3500,868,150,102],['ref-bowl-front',3260,876,150,102],
  ['ref-bowl-front',3020,884,150,102],['ref-bowl-front',2780,890,150,102],
  ['ref-bowl-front',2540,898,150,102],
  ['ref-monitor-front',2300,906,225,168,{tags:['reference-frame-14']}]
],['reference-frame-13','curio-table','rising-left']);
decor('factory','ref-potted-plant',2050,920,145,145,{tags:['reference-frame-13','reference-frame-14','plant-chain']});

const frame14=authoredRoute('factory',[
  ['ref-office-safe',2550,932,230,160],['ref-office-desk',2850,946,310,96],
  ['ref-office-desk',3200,959,240,84],['ref-office-chair',3480,971,175,185],
  ['ref-basketball-hoop',3760,985,210,260,{angle:-0.08}],
  ['ref-office-desk',4050,1000,290,102,{tags:['summit-platform','landmark-base']}]
],['reference-frame-14','office-summit','rising-right']);

for (const run of [frame01,frame02,frame03,frame04,frame05,frame06,frame07,frame08,frame09,frame10,frame11,frame12,frame13,frame14]) recoverLast(run,3);

// World-space tutorial and wayfinding annotations. These are deliberately
// separate from collision objects so signs can never create invisible walls.
annotations.push(
  {id:'guide-jump',type:'guide',x:3260,y:yAt(9)-165,text:'跳！',assetId:'ref-jump-arrow',renderSize:{w:120,h:120}},
  {id:'guide-run-jump',type:'guide',x:4130,y:yAt(38)-175,text:'跑動時跳得更遠！',assetId:'ref-run-jump-sign',renderSize:{w:330,h:126},showText:false},
  {id:'guide-double',type:'guide',x:5010,y:yAt(72)-175,text:'二段跳！',assetId:'ref-double-jump-sign',renderSize:{w:230,h:150},showText:false},
  {id:'summit-castle',type:'summit',x:3890,y:yAt(112)-175,text:'高峰 1/6・熔城攀登',assetId:'ref-zone-title',renderSize:{w:330,h:130},showText:false},
  {id:'turn-oven',type:'turn',x:5050,y:yAt(188)-145,text:'← 沿木桶轉向'},
  {id:'turn-ramp',type:'turn',x:3280,y:yAt(258)-155,text:'→ 登上宴會廳'},
  {id:'turn-workshop',type:'turn',x:3210,y:yAt(543)-155,text:'→ 沿工場物件攀升'},
  {id:'summit-coral',type:'summit',x:3660,y:yAt(830)-175,text:'高峰 2/6・珊瑚攀登'},
  {id:'turn-office',type:'turn',x:1690,y:yAt(910)-155,text:'→ 進入最後攀登'},
  {id:'summit-final-label',type:'summit',x:4050,y:yAt(1000)-145,text:'登頂！'}
);

const summitBase=frame14[frame14.length-1];
export const FIXED_MAP = {
  mapVersion:MAP_VERSION,
  world:WORLD,
  zones:[
    {id:'castle',min:0,max:210},{id:'market',min:211,max:274},{id:'forest',min:275,max:448},
    {id:'farm',min:449,max:573},{id:'snow',min:574,max:704},{id:'factory',min:705,max:1000}
  ],
  objects,nodes,
  routes:{main,shortcut,recovery},
  progressSensors:nodes.filter(node=>node.route==='main').map((node,index,all)=>({
    id:`progress-${index}`,x:node.x,y:node.y,progress:index/(all.length-1),altitude:node.altitude
  })),
  checkpoints:[
    {altitude:0},{altitude:210},{altitude:274},{altitude:448},
    {altitude:573},{altitude:704},{altitude:820},{altitude:930}
  ].map(item=>({id:`checkpoint-${item.altitude}`,...item})),
  recoveryBounds:[
    {id:'recovery-castle',minAltitude:35,maxAltitude:210,resetAltitude:0},
    {id:'recovery-forest',minAltitude:290,maxAltitude:448,resetAltitude:274},
    {id:'recovery-farm',minAltitude:460,maxAltitude:573,resetAltitude:448},
    {id:'recovery-snow',minAltitude:588,maxAltitude:704,resetAltitude:573},
    {id:'recovery-factory',minAltitude:718,maxAltitude:1000,resetAltitude:704}
  ],
  hazards,
  annotations,
  summit:{x:summitBase.object.x,y:yAt(1000)-100,progress:1},
  start:{x:360,y:yAt(0)-92}
};
