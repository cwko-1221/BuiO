// One fixed, hand-authored course for every room. The route grammar follows
// the supplied reference sequence: a forgiving brick tutorial, landmark
// bases, short prop chains, large set-pieces, and alternating rising turns.
// Art and object identities remain original to this project.
export const MAP_VERSION = 'fixed-1000m-2026.07at';
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
for (const x of [360,930,1500,2070,2640]) {
  castleGround.push(mainSupport('castle','flat-brick-strip-4',x,0,600,106,{tags:['ground-chain','tutorial-floor']}));
}
for (const x of [560,760,960]) decor('castle','ref-go-pennant',x,14,88,132,{tags:['reference-frame-01','tutorial-flag']});
obstacle('castle','castle-banner',castleGround[2],90,88,132);
obstacle('castle','ref-lamp-post',castleGround[3],-80,110,250,{tags:['reference-frame-03','lamp-obstacle']});
obstacle('castle','ref-lamp-post',castleGround[4],-140,110,250,{tags:['reference-frame-11','lamp-obstacle']});
obstacle('castle','treasure-chest',castleGround[4],110,112,88);
decor('castle','castle-arch',1280,25,300,250,{tags:['tutorial-gate']});
decor('castle','castle-arch',2100,35,340,285,{tags:['tutorial-gate']});

const castleIntro=authoredRoute('castle',[
  ['flat-brick-a',3100,4,190,82],
  ['flat-brick-strip-2',3370,9,230,68],
  ['flat-brick-wall-2',3640,16,225,92],
  ['flat-brick-strip-2',3910,24,245,70],
  ['flat-brick-wall-2',4180,34,225,96],
  ['flat-brick-strip-2',4450,46,250,72],
  ['ref-stone-ramp-front',4720,59,300,84,{angle:-0.16,tags:['reference-frame-04','stone-ramp']}],
  ['flat-brick-a',4930,73,205,90],
  ['flat-brick-strip-2',5230,88,260,76,{safe:false,tags:['underpass-step']}],
  ['flat-brick-wall-2',5520,103,190,90],
  ['ref-shield-rack',5200,112,280,180,{tags:['reference-frame-03','shield-step']}],
  ['flat-brick-strip-2',4920,135,245,72],
  ['ref-stone-ramp-front',4680,151,280,84,{angle:0,tags:['reference-frame-06','stone-ramp']}],
  ['flat-brick-wall-2',4440,166,240,98],
  ['round-table',4200,181,250,122],
  ['flat-brick-strip-2',3960,195,245,72],
  ['flat-brick-wall-2',3720,210,250,102,{tags:['zone-landing']}]
],['authored-castle','rising-left']);
// Large landmarks must never consume the only safe standing column. They sit
// beside the main line as scenery; smaller props remain true obstacles.
decor('castle','ref-shield-rack',5140,142,180,125,{tags:['reference-frame-10']});
decor('castle','throne',4250,193,118,150,{tags:['reference-landmark']});
decor('castle','catapult',4660,174,190,110,{tags:['reference-landmark']});
decor('castle','chandelier',720,165,170,180);
recoverLast(castleIntro,4);

// MARKET 211-274m -----------------------------------------------------------
// A compact market ascent: crates lead to a broad stall/wagon landing, then
// another short item chain. Objects sit on or become the route, as in reference.
const marketRun=authoredRoute('market',[
  ['ref-produce-crate',3470,220,220,132,{tags:['reference-frame-02','produce-step']}],
  ['ref-produce-crate',3700,230,220,132,{tags:['reference-frame-02','produce-step']}],
  ['ref-produce-crate',3930,241,220,132,{tags:['reference-frame-02','produce-step']}],
  ['market-wagon',4160,252,300,142],
  ['ref-oven-front',4425,263,270,220,{tags:['reference-frame-03','landmark-base']}],
  ['flat-brick-strip-4',4950,274,680,106,{tags:['zone-landing','landmark-base','reference-frame-02','workshop-landing']}]
],['authored-market','rising-right']);
obstacle('market','lemon-crate',marketRun[3],-72,76,72);
obstacle('market','ref-bellows-front',marketRun[5],-180,280,105,{tags:['reference-frame-08','bellows-obstacle']});
obstacle('market','ref-market-stall-red',marketRun[5],190,260,280,{tags:['reference-frame-02']});
decor('market','lantern-string',2740,274,340,150);
recoverLast(marketRun,3);

// FOREST 275-448m -----------------------------------------------------------
// Chairs, logs, stumps and broad natural landmarks create a readable leftward
// climb. A final short right turn avoids a mechanical straight diagonal.
const forestRun=authoredRoute('forest',[
  ['bench',4540,295,320,100],
  ['ref-feast-table',4250,310,430,165,{tags:['landmark-base','turn-pad','reference-frame-05','feast-table']}],
  ['round-table',3960,325,300,118],
  ['ref-stone-ramp-front',3700,340,300,84,{angle:-0.16,tags:['reference-frame-04','stone-ramp']}],
  ['ref-chair-front',3500,354,240,200,{tags:['reference-frame-05','chair-step']}],
  ['ref-stone-column-front',3260,368,300,250,{tags:['reference-frame-06','stone-column']}],
  ['ref-stone-column-front',3020,382,300,250,{tags:['reference-frame-06','stone-column']}],
  ['ref-stone-column-front',2780,396,300,250,{tags:['reference-frame-06','stone-column']}],
  ['market-wagon',2540,410,280,136],
  ['ref-barrel-front',2300,423,160,180,{tags:['reference-frame-04','barrel-step']}],
  ['ref-feast-table',2060,435,330,150,{tags:['reference-frame-06','feast-table']}],
  ['ref-stone-ramp-front',1810,442,285,84,{angle:0.10,tags:['reference-frame-06','stone-ramp']}],
  ['round-table',1560,448,280,118,{tags:['zone-landing']}]
],['authored-forest']);
decor('forest','treehouse',5000,370,320,310);
recoverLast(forestRun,4);

// FARM 449-573m -------------------------------------------------------------
// Small barrels/pallets lead into paired carts and farm furniture. The route
// stays rising while the direction changes naturally around each set-piece.
const farmRun=authoredRoute('farm',[
  ['flat-brick-strip-2',1250,452,210,72,{tags:['zone-transition']}],
  ['ref-hanging-lantern',1000,464,280,220,{tags:['reference-frame-07','lantern-step']}],
  ['ref-bed-front',1210,476,330,175,{tags:['reference-frame-07','bed-step']}],
  ['ref-barrel-cart',1470,490,360,215,{tags:['landmark-base','turn-pad','reference-frame-05','barrel-cart']}],
  ['ref-bed-front',1730,504,320,170,{tags:['reference-frame-07','bed-step']}],
  ['ref-stone-pillar-front',1990,518,280,260,{tags:['reference-frame-05','stone-pillar']}],
  ['ref-catapult-front',2250,532,330,214,{tags:['reference-frame-07','reference-frame-08','catapult-step']}],
  ['ref-log-step',2510,546,250,100,{tags:['reference-frame-08','log-step']}],
  ['ref-log-step',2770,558,250,100,{tags:['reference-frame-08','log-step','repeated-prop']}],
  ['ref-feast-table',3040,566,300,145,{tags:['reference-frame-05','feast-table','wide-safety-pad']}],
  ['ref-stone-ramp-front',3360,573,330,88,{angle:-0.08,tags:['zone-landing','landmark-base','reference-frame-04','stone-ramp']}]
],['authored-farm','rising-right']);
obstacle('farm','potato-crate',farmRun[3],-76,76,72);
decor('farm','tractor',4950,520,300,225);
recoverLast(farmRun,3);

// SNOW 574-704m -------------------------------------------------------------
// The snow route reverses left through ice slabs, a sled and a cabin landmark.
const snowRun=authoredRoute('snow',[
  ['snow-ledge',3600,584,260,102],
  ['ice-slab',3360,598,230,108],
  ['ref-cookpot',3120,613,180,145,{tags:['reference-frame-09','cookpot-step']}],
  ['ref-cookpot',2880,629,180,145,{tags:['reference-frame-09','cookpot-step','repeated-prop']}],
  ['ref-cookpot',2640,645,180,145,{tags:['reference-frame-09','cookpot-step','repeated-prop']}],
  ['ref-castle-banner-blue',2400,646,220,300,{tags:['reference-frame-09','reference-frame-10','banner-step']}],
  ['ref-castle-banner-red',2160,660,220,300,{tags:['reference-frame-09','reference-frame-10','banner-step']}],
  ['snow-ledge',1920,690,270,102],
  ['flat-brick-strip-4',1500,704,500,90,{tags:['zone-landing','landmark-base','reference-frame-10','armory-platform']}]
],['authored-snow','rising-left']);
obstacle('snow','ref-knight-stand',snowRun[8],-135,112,158,{tags:['reference-frame-10','knight-stand']});
obstacle('snow','ref-knight-stand',snowRun[8],-20,112,158,{tags:['reference-frame-10','knight-stand','repeated-prop']});
obstacle('snow','ref-shield-rack',snowRun[8],150,150,112,{tags:['reference-frame-10','armory-rack']});
recoverLast(snowRun,3);

// FACTORY 705-1000m ---------------------------------------------------------
// The first pass still referenced the old grey prototype silhouettes.  The
// finished route deliberately reuses the illustrated props already established
// elsewhere in the climb, mixed with the finished gear/conveyor art.  Reuse is
// intentional: it gives the final ascent the playful found-object rhythm of the
// reference map without letting temporary geometric art leak into the course.
const factoryA=authoredRoute('factory',[
  ['ref-book-step',1760,718,170,104,{tags:['reference-frame-09','book-step']}],
  ['ref-book-step',1980,728,170,104,{tags:['reference-frame-09','book-step','repeated-prop']}],
  ['ref-book-step',2200,738,170,104,{tags:['reference-frame-09','book-step','repeated-prop']}],
  ['ref-scroll-step',2440,748,190,82,{tags:['reference-frame-09','scroll-step']}],
  ['ref-sand-ledge',2580,758,220,160,{tags:['reference-frame-10','reference-frame-12','sand-ledge']}],
  ['ref-sand-ledge',2760,768,260,190,{tags:['reference-frame-10','reference-frame-12','sand-ledge','repeated-prop','landmark-base']}],
  ['ref-sand-ledge',2940,778,230,168,{tags:['reference-frame-10','reference-frame-12','sand-ledge','repeated-prop']}],
  ['ref-sand-ledge',3120,788,300,220,{tags:['reference-frame-10','reference-frame-12','sand-ledge','repeated-prop']}]
],['authored-factory','factory-room-a','rising-right']);
const factoryB=authoredRoute('factory',[
  ['ref-fishing-boat',3320,805,270,200,{tags:['reference-frame-10','reference-frame-12','boat-step']}],
  ['ref-fishing-boat',3560,825,270,200,{tags:['reference-frame-10','reference-frame-12','boat-step','repeated-prop']}],
  ['ref-sand-ledge',3820,845,260,190,{tags:['reference-frame-10','reference-frame-12','sand-ledge','repeated-prop']}],
  ['ref-round-table-front',4110,865,300,240,{tags:['reference-frame-11','reference-frame-13','round-table-step']}],
  ['ref-bowl-front',4400,885,154,104,{tags:['reference-frame-11','bowl-step']}],
  ['ref-monitor-front',4640,905,230,170,{tags:['reference-frame-13','reference-frame-14','monitor-step']}],
  ['ref-potted-plant',4880,925,150,150,{tags:['reference-frame-13','reference-frame-14','plant-step']}],
  ['ref-office-safe',5120,945,230,160,{tags:['reference-frame-14','office-safe-step']}],
  ['ref-office-desk',5400,960,340,96,{tags:['reference-frame-14','office-desk-step']}],
  ['ref-office-desk',5000,968,190,76,{tags:['reference-frame-14','office-desk-step','repeated-prop']}],
  ['ref-office-chair',4770,978,150,170,{tags:['reference-frame-14','office-chair-step']}],
  ['ref-basketball-hoop',4540,989,190,245,{angle:-0.08,tags:['reference-frame-14','basketball-hoop-step']}],
  ['ref-office-desk',4290,1000,280,100,{tags:['reference-frame-14','summit-platform','landmark-base','repeated-prop']}]
],['authored-factory','factory-room-b','rising-right']);
recoverLast(factoryA,3);
recoverLast(factoryB,3);

// World-space tutorial and wayfinding annotations. These are deliberately
// separate from collision objects so signs can never create invisible walls.
annotations.push(
  {id:'guide-jump',type:'guide',x:3260,y:yAt(9)-165,text:'跳！',assetId:'ref-jump-arrow',renderSize:{w:120,h:120}},
  {id:'guide-run-jump',type:'guide',x:4130,y:yAt(38)-175,text:'跑動時起跳，跳得更遠！',assetId:'ref-run-jump-sign',renderSize:{w:330,h:126},showText:false},
  {id:'guide-double',type:'guide',x:4970,y:yAt(72)-175,text:'二段跳！',assetId:'ref-double-jump-sign',renderSize:{w:230,h:150},showText:false},
  {id:'turn-castle',type:'turn',x:5200,y:yAt(94)-120,text:'← 繼續向左上'},
  {id:'summit-castle',type:'summit',x:3460,y:yAt(210)-165,text:'高峰 1/6・熔城攀登',assetId:'ref-zone-title',renderSize:{w:330,h:130},showText:false},
  {id:'turn-market',type:'turn',x:4500,y:yAt(276)-165,text:'↙ 下一段'},
  {id:'summit-market',type:'summit',x:4460,y:yAt(274)-170,text:'高峰 2/6・市集飛躍'},
  {id:'turn-forest',type:'turn',x:4980,y:yAt(304)-165,text:'← 沿物件向左上'},
  {id:'summit-forest',type:'summit',x:1700,y:yAt(448)-165,text:'高峰 3/6・奇物冒險'},
  {id:'turn-farm',type:'turn',x:1500,y:yAt(486)-165,text:'→ 轉向右上'},
  {id:'turn-snow',type:'turn',x:4160,y:yAt(706)-175,text:'← 進入最後攀登'},
  {id:'summit-final-label',type:'summit',x:4100,y:yAt(1000)-118,text:'山頂！'}
);

const summitBase=factoryB[factoryB.length-1];
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
    {altitude:0},{altitude:210},{altitude:274,x:4660},{altitude:448},
    {altitude:573,x:3600,y:yAt(584)-59},{altitude:704},{altitude:820},{altitude:930}
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
