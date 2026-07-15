// One fixed, hand-authored course for every room. The route grammar follows
// the supplied reference sequence: a forgiving brick tutorial, landmark
// bases, short prop chains, large set-pieces, and alternating rising turns.
// Art and object identities remain original to this project.
export const MAP_VERSION = 'fixed-1000m-2026.07f';
export const WORLD = { width:5600, height:6200, startY:5700, summitY:700, pixelsPerMetre:5 };

const objects=[];
const nodes=[];
const main=[];
const shortcut=[];
const recovery=[];
const hazards=[];
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
    angle:extra.angle||0,role:'obstacle',behavior:staticBehavior,supportId:supportRef.object.id,tags:['obstacle']});
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
obstacle('castle','checkpoint-flag',castleGround[0],-120,92,128);
obstacle('castle','castle-banner',castleGround[2],90,88,132);
obstacle('castle','treasure-chest',castleGround[4],110,112,88);
decor('castle','castle-arch',1040,25,300,250,{tags:['tutorial-gate']});
decor('castle','castle-arch',2100,35,340,285,{tags:['tutorial-gate']});

const castleIntro=authoredRoute('castle',[
  ['flat-brick-a',3100,4,190,82],
  ['flat-brick-strip-2',3370,9,230,68],
  ['flat-brick-wall-2',3640,16,225,92],
  ['flat-brick-strip-2',3910,24,245,70],
  ['flat-brick-wall-2',4180,34,225,96],
  ['flat-brick-strip-2',4450,46,250,72],
  ['drawbridge',4720,59,285,110],
  ['flat-brick-a',5000,73,205,90],
  ['round-table',5270,88,250,124],
  ['flat-brick-wall-2',4820,103,215,94],
  ['catapult',4540,119,270,140],
  ['flat-brick-strip-2',4260,135,245,72],
  ['drawbridge',3980,151,285,112],
  ['flat-brick-wall-2',3700,166,220,98],
  ['round-table',3420,181,250,122],
  ['flat-brick-strip-2',3140,195,245,72],
  ['flat-brick-wall-2',2860,210,250,102,{tags:['zone-landing']}]
],['authored-castle','rising-left']);
obstacle('castle','barrel',castleIntro[8],-64,74,90);
obstacle('castle','shield',castleIntro[11],58,82,92);
obstacle('castle','throne',castleIntro[14],-58,82,104);
decor('castle','castle-tower',5200,110,260,285);
decor('castle','chandelier',720,165,170,180);
recoverLast(castleIntro,4);

// MARKET 211-274m -----------------------------------------------------------
// A compact market ascent: crates lead to a broad stall/wagon landing, then
// another short item chain. Objects sit on or become the route, as in reference.
const marketRun=authoredRoute('market',[
  ['apple-crate',3130,220,220,108],
  ['orange-crate',3400,230,220,108],
  ['market-basket',3670,241,225,112],
  ['market-wagon',3940,252,300,142],
  ['picnic-table',4210,263,285,128],
  ['market-stall',4480,274,450,210,{tags:['zone-landing','landmark-base']}]
],['authored-market','rising-right']);
obstacle('market','lemon-crate',marketRun[3],-72,76,72);
decor('market','lantern-string',2740,274,340,150);
recoverLast(marketRun,3);

// FOREST 275-448m -----------------------------------------------------------
// Chairs, logs, stumps and broad natural landmarks create a readable leftward
// climb. A final short right turn avoids a mechanical straight diagonal.
const forestRun=authoredRoute('forest',[
  ['bench',4800,286,360,106],
  ['picnic-table',5150,299,500,134,{tags:['landmark-base','turn-pad']}],
  ['round-table',4900,313,400,124],
  ['drawbridge',4585,328,300,110,{angle:-0.07}],
  ['chair',4270,343,190,116],
  ['market-basket',3955,358,225,112],
  ['barrel',3640,373,205,120],
  ['chair',3325,388,190,116],
  ['market-wagon',3010,403,300,142],
  ['barrel',2695,418,205,120],
  ['picnic-table',2380,432,290,128],
  ['drawbridge',2065,441,285,108],
  ['round-table',1750,448,300,124,{tags:['zone-landing']}]
],['authored-forest']);
decor('forest','treehouse',5000,370,320,310);
decor('forest','butterflies',430,390,200,145);
recoverLast(forestRun,4);

// FARM 449-573m -------------------------------------------------------------
// Small barrels/pallets lead into paired carts and farm furniture. The route
// stays rising while the direction changes naturally around each set-piece.
const farmRun=authoredRoute('farm',[
  ['barrel',1450,458,220,120],
  ['hay-block',1100,470,225,118],
  ['tractor',750,484,700,240,{tags:['landmark-base','turn-pad']}],
  ['barrel',1150,498,260,120],
  ['wood-deck',1470,512,285,96],
  ['drawbridge',1790,526,285,108,{angle:0.06}],
  ['market-wagon',2110,540,300,142],
  ['picnic-table',2430,553,290,128],
  ['wood-deck',2750,564,285,96],
  ['tractor',3070,573,330,210,{tags:['zone-landing','landmark-base']}]
],['authored-farm','rising-right']);
obstacle('farm','potato-crate',farmRun[2],-76,76,72);
decor('farm','tractor',4950,520,300,225);
decor('farm','scarecrow',470,520,155,215);
recoverLast(farmRun,3);

// SNOW 574-704m -------------------------------------------------------------
// The snow route reverses left through ice slabs, a sled and a cabin landmark.
const snowRun=authoredRoute('snow',[
  ['snow-ledge',3450,584,260,102],
  ['ice-slab',3720,598,230,108],
  ['gift-stack',3950,613,240,128],
  ['sled',4180,629,235,110],
  ['curling-stone',4410,645,195,112],
  ['ice-slab',4640,661,245,104],
  ['gift-stack',4870,676,225,128],
  ['snow-ledge',5100,690,270,102],
  ['cabin-roof',5330,704,560,150,{tags:['zone-landing','landmark-base']}]
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
  ['barrel',4930,718,184,128],
  ['conveyor',4720,733,238,96],
  ['giant-gear',4510,749,176,98],
  ['crate',4300,765,178,132],
  ['cannon',4090,781,226,126],
  ['round-table',3880,798,204,114,{tags:['landmark-base']}],
  ['conveyor',3670,815,236,96],
  ['bench',3460,830,216,102]
],['authored-factory','factory-room-a','rising-right']);
const factoryB=authoredRoute('factory',[
  ['giant-gear',3250,846,196,108],
  ['market-wagon',3040,862,224,126],
  ['barrel',2830,878,184,128],
  ['picnic-table',2620,894,204,108],
  ['conveyor',2410,910,232,94],
  ['tractor',2200,927,218,128,{tags:['landmark-base']}],
  ['drawbridge',1990,943,232,108]
],['authored-factory','factory-room-b','rising-left']);
const factoryC=authoredRoute('factory',[
  ['market-stall',1780,956,178,132],
  ['giant-gear',1570,968,190,106],
  ['conveyor',1360,979,232,94],
  ['barrel',1150,989,184,128],
  ['conveyor',850,1000,430,150,{tags:['summit-platform','landmark-base']}]
],['authored-factory','factory-room-c','rising-right']);
obstacle('factory','book-stack',factoryA[2],-72,82,72);
obstacle('factory','market-basket',factoryA[6],72,78,76);
obstacle('factory','cash-chest',factoryB[4],36,80,72);
obstacle('factory','giant-key',factoryC[2],72,74,82);
decor('factory','giant-gear',5000,850,260,260);
decor('factory','summit-flag',470,960,220,250);
recoverLast(factoryA,3);
recoverLast(factoryB,3);
recoverLast(factoryC,3);

// Non-lethal laser gates reset to the nearest room entrance and never form
// part of the required main path.
for (const [id,x,altitude,checkpointAltitude] of [
  ['laser-a',3380,770,704],['laser-b',2260,875,820],['laser-c',2520,970,930]
]) hazards.push({id,zone:'factory',x,y:yAt(altitude)-88,w:145,h:16,checkpointAltitude,type:'laser'});

const summitBase=factoryC[factoryC.length-1];
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
  checkpoints:[0,210,274,448,573,704,820,930].map(altitude=>({id:`checkpoint-${altitude}`,altitude})),
  recoveryBounds:[
    {id:'recovery-castle',minAltitude:35,maxAltitude:210,resetAltitude:0},
    {id:'recovery-forest',minAltitude:290,maxAltitude:448,resetAltitude:274},
    {id:'recovery-farm',minAltitude:460,maxAltitude:573,resetAltitude:448},
    {id:'recovery-snow',minAltitude:588,maxAltitude:704,resetAltitude:573},
    {id:'recovery-factory',minAltitude:718,maxAltitude:1000,resetAltitude:704}
  ],
  hazards,
  summit:{x:summitBase.object.x,y:yAt(1000)-100,progress:1},
  start:{x:360,y:yAt(0)-92}
};
