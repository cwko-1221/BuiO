// One fixed, hand-authored course for every room. The route grammar follows
// the supplied reference sequence: a forgiving brick tutorial, landmark
// bases, short prop chains, large set-pieces, and alternating rising turns.
// Art and object identities remain original to this project.
export const MAP_VERSION = 'fixed-1000m-2026.07t';
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
  objects.push({id,assetId,zone,x:supportRef.object.x+xOffset,y:supportRef.object.y-120,w,h,
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
  ['flat-brick-strip-4',4850,274,500,106,{tags:['zone-landing','landmark-base','reference-frame-02']}]
],['authored-market','rising-right']);
obstacle('market','lemon-crate',marketRun[3],-72,76,72);
obstacle('market','ref-market-stall-red',marketRun[5],0,300,300,{tags:['reference-frame-02']});
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
decor('forest','butterflies',430,390,200,145);
recoverLast(forestRun,4);

// FARM 449-573m -------------------------------------------------------------
// Small barrels/pallets lead into paired carts and farm furniture. The route
// stays rising while the direction changes naturally around each set-piece.
const farmRun=authoredRoute('farm',[
  ['flat-brick-strip-2',1250,452,210,72,{tags:['zone-transition']}],
  ['ref-barrel-front',1000,464,170,185,{tags:['reference-frame-05','barrel-step']}],
  ['ref-bed-front',1210,476,330,175,{tags:['reference-frame-07','bed-step']}],
  ['ref-barrel-cart',1470,490,360,215,{tags:['landmark-base','turn-pad','reference-frame-05','barrel-cart']}],
  ['ref-bed-front',1730,504,320,170,{tags:['reference-frame-07','bed-step']}],
  ['ref-stone-pillar-front',1990,518,280,260,{tags:['reference-frame-05','stone-pillar']}],
  ['ref-stone-ramp-front',2250,532,295,84,{angle:0.10,tags:['reference-frame-06','stone-ramp']}],
  ['ref-barrel-cart',2510,546,300,185,{tags:['reference-frame-05','barrel-cart']}],
  ['ref-feast-table',2770,558,300,145,{tags:['reference-frame-05','feast-table']}],
  ['ref-stone-pillar-front',3040,566,280,260,{tags:['reference-frame-05','stone-pillar']}],
  ['ref-stone-ramp-front',3360,573,330,88,{angle:-0.08,tags:['zone-landing','landmark-base','reference-frame-04','stone-ramp']}]
],['authored-farm','rising-right']);
obstacle('farm','potato-crate',farmRun[3],-76,76,72);
decor('farm','tractor',4950,520,300,225);
decor('farm','scarecrow',470,520,155,215);
recoverLast(farmRun,3);

// SNOW 574-704m -------------------------------------------------------------
// The snow route reverses left through ice slabs, a sled and a cabin landmark.
const snowRun=authoredRoute('snow',[
  ['snow-ledge',3600,584,260,102],
  ['ice-slab',3360,598,230,108],
  ['gift-stack',3120,613,240,128],
  ['sled',2880,629,235,110],
  ['curling-stone',2640,645,195,112],
  ['ice-slab',2400,661,245,104],
  ['gift-stack',2160,676,225,128],
  ['snow-ledge',1920,690,270,102],
  ['snow-ledge',1500,704,500,130,{tags:['zone-landing','landmark-base']}]
],['authored-snow','rising-left']);
obstacle('snow','snowman',snowRun[2],-62,78,104);
obstacle('snow','hockey-puck',snowRun[5],70,68,52);
decor('snow','cable-car',5000,650,310,225);
decor('snow','aurora-crystal',450,680,230,250);
recoverLast(snowRun,3);

// FACTORY 705-1000m ---------------------------------------------------------
// The first pass still referenced the old grey prototype silhouettes.  The
// finished route deliberately reuses the illustrated props already established
// elsewhere in the climb, mixed with the finished gear/conveyor art.  Reuse is
// intentional: it gives the final ascent the playful found-object rhythm of the
// reference map without letting temporary geometric art leak into the course.
const factoryA=authoredRoute('factory',[
  ['ref-barrel-front',1850,718,160,180,{tags:['reference-frame-04','barrel-step']}],
  ['conveyor',2090,736,238,96],
  ['giant-gear',2330,754,176,98],
  ['crate',2570,772,178,132],
  ['cannon',2810,790,226,126],
  ['round-table',3050,808,204,114,{tags:['landmark-base']}],
  ['conveyor',3290,826,236,96],
  ['bench',3530,844,216,102]
],['authored-factory','factory-room-a','rising-right']);
const factoryB=authoredRoute('factory',[
  ['giant-gear',3770,862,196,108],
  ['market-wagon',4010,884,224,126],
  ['ref-barrel-front',4200,904,160,180,{tags:['reference-frame-06','barrel-step']}],
  ['picnic-table',4490,928,204,108],
  ['conveyor',4730,952,232,94],
  ['flat-brick-strip-2',4940,976,320,90,{tags:['landmark-base']}],
  ['conveyor',5310,1000,430,90,{tags:['summit-platform','landmark-base']}]
],['authored-factory','factory-room-b','rising-right']);
obstacle('factory','book-stack',factoryA[2],-72,82,72);
obstacle('factory','market-basket',factoryA[6],72,78,76);
obstacle('factory','cash-chest',factoryB[4],-90,80,72);
decor('factory','giant-gear',5000,850,260,260);
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
  {id:'factory-warning',type:'guide',x:3320,y:yAt(842)-150,text:'雷射不致命・失誤會回到房間入口',arrow:{dx:-60,dy:-60}},
  {id:'summit-final',type:'summit',x:5110,y:yAt(1000)-190,text:'山頂！'}
);

// Non-lethal laser gates reset to the nearest room entrance and never form
// part of the required main path.
for (const [id,x,altitude,checkpointAltitude] of [
  ['laser-a',3380,770,704],['laser-b',2260,875,820],['laser-c',2520,970,930]
]) hazards.push({id,zone:'factory',x,y:yAt(altitude)-88,w:145,h:16,checkpointAltitude,type:'laser'});

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
