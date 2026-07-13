// One authored course for every room. The route is laid out in distinct rows:
// long traversals are separated by open turn-stairs, so no platform can become
// an accidental ceiling over the route below it.
export const MAP_VERSION = 'fixed-1000m-2026.07b';
export const WORLD = { width:5600, height:6200, startY:5700, summitY:700, pixelsPerMetre:5 };

const objects=[];
const nodes=[];
const main=[];
const shortcut=[];
const recovery=[];
const hazards=[];
let serial=0;

const yAt = altitude => WORLD.startY - altitude * WORLD.pixelsPerMetre;
const staticBehavior = { type:'static' };

function support(zone,assetId,x,altitude,w,h=96,extra={}) {
  const id=extra.id || `fixed-${String(++serial).padStart(3,'0')}`;
  const object={
    id,assetId,zone,x,y:yAt(altitude),w,h,angle:extra.angle||0,
    role:'support',behavior:extra.behavior||staticBehavior,
    routeNode:`node-${id}`,tags:extra.tags||[]
  };
  objects.push(object);
  const node={id:object.routeNode,objectId:id,x,y:object.y-h/2-8,altitude,route:extra.route||'main',safe:extra.safe!==false};
  nodes.push(node);
  return {object,node};
}

function obstacle(zone,assetId,supportRef,xOffset,w,h,extra={}) {
  const id=extra.id || `fixed-obstacle-${String(++serial).padStart(3,'0')}`;
  objects.push({
    id,assetId,zone,x:supportRef.object.x+xOffset,y:supportRef.object.y-120,w,h,
    angle:extra.angle||0,role:'obstacle',behavior:extra.behavior||staticBehavior,
    supportId:supportRef.object.id,tags:extra.tags||['obstacle']
  });
}

function decor(zone,assetId,x,altitude,w,h,extra={}) {
  objects.push({
    id:`fixed-decor-${String(++serial).padStart(3,'0')}`,assetId,zone,x,y:yAt(altitude),w,h,
    angle:extra.angle||0,role:'decor',behavior:staticBehavior,tags:['decor']
  });
}

let previous=null;
function mainSupport(zone,assetId,x,altitude,w,h=96,extra={}) {
  const result=support(zone,assetId,x,altitude,w,h,extra);
  if (previous) main.push({from:previous.node.id,to:result.node.id,type:'main'});
  previous=result;
  return result;
}

function mainRow(zone,altitude,entries,tags=['row']) {
  return entries.map(([x,assetId,w,h=110])=>mainSupport(zone,assetId,x,altitude,w,h,{tags}));
}

// Large silhouettes stay large, but a small themed foothold is authored in
// genuinely wide gaps. This keeps the route readable without inflating the
// large object's art or its collider beyond the declared render box.
function mainObjectChain(zone,entries,connectorAsset) {
  const result=[];
  for (let index=0;index<entries.length;index++) {
    const [x,altitude,assetId,w,h,options={}]=entries[index];
    result.push(mainSupport(zone,assetId,x,altitude,w,h,{tags:['object-row']}));
    const next=entries[index+1];
    if (next&&!options.skipConnector) mainSupport(zone,connectorAsset,(x+next[0])/2,(altitude+next[1])/2,130,50,{tags:['gap-connector']});
  }
  return result;
}

function mainObjectRow(zone,altitude,entries,connectorAsset) {
  return mainObjectChain(zone,entries.map(([x,assetId,w,h,options])=>[x,altitude,assetId,w,h,options]),connectorAsset);
}

function turnRight(zone,fromAltitude,toAltitude) {
  const rise=toAltitude-fromAltitude;
  const stepW=rise<40?220:260, stepH=rise<40?40:58;
  const one=mainSupport(zone,'flat-brick-strip-2',4800,fromAltitude+rise*.3,stepW,stepH,{tags:['turn-step']});
  const two=mainSupport(zone,'flat-brick-strip-2',5150,fromAltitude+rise*.6,stepW,stepH,{tags:['turn-step']});
  const three=mainSupport(zone,'flat-brick-strip-2',5400,fromAltitude+rise*.9,stepW,stepH,{tags:['turn-step']});
  return [one,two,three];
}

function turnLeft(zone,fromAltitude,toAltitude) {
  const rise=toAltitude-fromAltitude;
  const stepW=rise<40?220:260, stepH=rise<40?40:58;
  const one=mainSupport(zone,'flat-brick-strip-2',300,fromAltitude+rise*.42,stepW,stepH,{tags:['turn-step']});
  const two=mainSupport(zone,'flat-brick-strip-2',50,fromAltitude+rise*.68,stepW,stepH,{tags:['turn-step']});
  const three=mainSupport(zone,'flat-brick-strip-2',500,fromAltitude+rise*.9,stepW,stepH,{tags:['turn-step']});
  return [one,two,three];
}

// CASTLE 0-210m -------------------------------------------------------------
// 0-45m: a continuous flat road followed by broad, readable brick steps.
const castleGround=mainRow('castle',0,[
  [400,'flat-brick-strip-4',680,106],[1050,'flat-brick-strip-4',680,106],
  [1700,'flat-brick-strip-4',680,106],[2350,'flat-brick-strip-4',680,106],
  [3000,'flat-brick-strip-4',680,106]
],['ground-chain']);
for (const [x,a] of [[3500,10],[3825,22],[4150,34],[4475,45],[4800,60],[5200,75]]) mainSupport('castle','flat-brick-strip-2',x,a,300,62,{tags:['intro-step']});

// 45m row: obstacles sit on their own visible support, with a clear centre lane.
const castleObstacleRow=mainRow('castle',90,[
  [4900,'flat-brick-strip-4',520,104],[4300,'flat-brick-strip-4',520,104],
  [3700,'flat-brick-strip-4',520,104],[3100,'flat-brick-strip-4',520,104],
  [2500,'flat-brick-strip-4',520,104],[1900,'flat-brick-strip-4',520,104],
  [1300,'flat-brick-strip-4',520,104],[700,'flat-brick-strip-4',520,104]
]);
obstacle('castle','crate',castleObstacleRow[1],-185,105,105);
obstacle('castle','barrel',castleObstacleRow[2],185,100,112);
obstacle('castle','treasure-chest',castleObstacleRow[3],-180,135,105);
obstacle('castle','barrel',castleObstacleRow[6],0,90,80);
turnLeft('castle',90,130);

// 90m row: bricks give way to large but forgiving silhouettes.
const castleMixedA=mainObjectRow('castle',130,[
  [850,'flat-brick-wall-2',500,100],[1650,'drawbridge',500,118],
  [2250,'round-table',500,160],[2850,'flat-brick-strip-4',500,100],
  [3450,'stone-arch',500,120,{skipConnector:true}],[3850,'flat-brick-strip-4',500,100],
  [4450,'flat-brick-wall-2',500,100]
],'flat-brick-a');
obstacle('castle','crate',castleMixedA[3],-170,90,80);
turnRight('castle',130,170);
mainSupport('castle','flat-brick-strip-2',5000,170,260,58,{tags:['turn-top']});

const castleUpperMiddle=mainObjectRow('castle',170,[
  [4500,'flat-brick-strip-4',500,100],[3900,'shield',430,110],
  [3300,'drawbridge',500,118],[2700,'round-table',480,120],
  [2100,'flat-brick-strip-2',480,100],[1500,'stone-arch',480,120],
  [900,'flat-brick-strip-4',500,100,{skipConnector:true}],[500,'flat-brick-strip-2',260,58]
],'flat-brick-a');
turnLeft('castle',170,210);

const castleTop=mainObjectRow('castle',210,[
  [850,'flat-brick-strip-4',500,100],[1450,'drawbridge',500,118],
  [2050,'round-table',480,120],[2650,'flat-brick-strip-4',500,100],
  [3250,'stone-arch',480,120],[3850,'drawbridge',500,118],
  [4450,'flat-brick-strip-4',500,100]
],'flat-brick-a');
const castleExit=castleTop.at(-1);
decor('castle','catapult',5150,150,250,190);
decor('castle','chandelier',650,112,180,180);

// MARKET 211-274m -----------------------------------------------------------
turnRight('market',210,250);
mainSupport('market','flat-brick-strip-2',5000,260,260,58,{tags:['turn-top']});
const marketRow=mainObjectChain('market',[
  [4500,260,'market-wagon',500,200],[3900,262,'market-stall',500,200],
  [3300,264,'picnic-table',500,170],[2700,266,'giant-watermelon',420,220],
  [2100,268,'bread-cart',480,190],[1500,270,'cheese-wheel',420,190],
  [1000,272,'market-stall',480,190,{skipConnector:true}],[550,274,'flat-brick-strip-4',440,90]
],'flat-brick-a');
obstacle('market','apple-crate',marketRow[1],-175,110,100);
decor('market','lantern-string',2850,270,360,160);
decor('market','market-signboard',650,245,150,170);

// FOREST 275-448m -----------------------------------------------------------
turnLeft('forest',274,325);
mainObjectRow('forest',325,[
  [850,'bench',480,150],[1450,'tree-stump',430,190],[2050,'round-table',480,180],
  [2650,'moss-boulder',450,200],[3250,'picnic-table',480,170],
  [3850,'sofa',500,190],[4450,'bed',480,190]
],'wood-deck');
turnRight('forest',325,385);
const forestMiddle=mainObjectRow('forest',385,[
  [4900,'wood-deck',480,130],[4300,'table',450,170],[3700,'stone-ledge',500,150],
  [3100,'grass-ledge',500,160],[2500,'bench',450,150],[1900,'tree-stump',420,190],
  [1300,'moss-boulder',430,190],[700,'wood-deck',480,130]
],'wood-deck');
turnLeft('forest',385,445);
const forestTop=mainObjectRow('forest',445,[
  [850,'grass-ledge',480,160],[1450,'forest-log',420,170],[2050,'stone-ledge',480,150],
  [2650,'table',440,170],[3250,'moss-boulder',430,190],[3850,'picnic-table',480,170],
  [4450,'grass-ledge',500,160]
],'wood-deck');
const forestExit=forestTop.at(-1);
decor('forest','treehouse',600,390,280,280);
decor('forest','butterflies',5000,400,230,150);

// FARM 449-573m -------------------------------------------------------------
// The lower sweep deliberately drops three times before climbing to row two.
turnRight('farm',445,500);
const farmLower=mainObjectChain('farm',[
  [4900,500,'grass-ledge',500,160],[4300,516,'hay-block',450,190],
  [3700,504,'wood-deck',480,130],[3100,518,'hay-cart',430,180],
  [2500,506,'grass-ledge',500,160],[1900,520,'hay-block',450,190],
  [1300,508,'wood-deck',480,130],[700,522,'grass-ledge',480,160]
],'wood-deck');
turnLeft('farm',522,573);
const farmUpper=mainObjectRow('farm',573,[
  [850,'wood-deck',480,130],[1450,'hay-cart',430,180],[2050,'grass-ledge',500,160],
  [2650,'farm-shed',450,210],[3250,'hay-block',450,190],
  [3850,'farm-ladder',410,210],[4450,'grass-ledge',500,160]
],'wood-deck');
const farmExit=farmUpper.at(-1);
decor('farm','tractor',5000,500,300,220);
decor('farm','scarecrow',650,535,170,220);

// SNOW 574-704m -------------------------------------------------------------
turnRight('snow',573,635);
const snowLower=mainObjectRow('snow',635,[
  [4900,'snow-ledge',500,160],[4300,'ice-slab',480,150],[3700,'snow-mound',430,180],
  [2950,'frozen-log',420,160],[2350,'ice-slab',460,150],[1750,'snowman',410,190],
  [1150,'snow-ledge',480,160],[600,'ice-slab',440,150]
],'ice-slab');
turnLeft('snow',635,690);
const snowUpper=mainObjectRow('snow',690,[
  [850,'snow-ledge',480,160],[1450,'frozen-log',420,160],[2050,'ice-slab',460,150],
  [2650,'snow-mound',430,180],[3250,'ice-slab',460,150],
  [3850,'snowman',410,190],[4450,'snow-ledge',480,160]
],'ice-slab');
const snowExit=snowUpper.at(-1);
decor('snow','cable-car',5200,620,300,220);
decor('snow','aurora-crystal',600,690,230,250);

// FACTORY 705-1000m ---------------------------------------------------------
turnRight('factory',704,755);
const factoryRow1=mainRow('factory',755,[
  [4900,'metal-deck',500,150],[4300,'metal-bracket',430,140],[3700,'metal-deck',500,150],
  [3100,'metal-bracket',430,140],[2500,'metal-deck',500,150],
  [1900,'metal-bracket',430,140],[1300,'metal-deck',500,150],[700,'metal-bracket',430,140]
]);
turnLeft('factory',755,805);
const factoryRow2=mainRow('factory',805,[
  [850,'metal-deck',480,150],[1450,'metal-bracket',430,140],[2050,'metal-deck',500,150],
  [2650,'metal-bracket',430,140],[3250,'metal-deck',500,150],
  [3850,'metal-bracket',430,140],[4450,'metal-deck',500,150]
]);
turnRight('factory',805,855);
const factoryRow3=mainRow('factory',855,[
  [4900,'metal-deck',480,150],[4300,'metal-bracket',430,140],[3700,'metal-deck',500,150],
  [3100,'metal-bracket',430,140],[2500,'metal-deck',500,150],
  [1900,'metal-bracket',430,140],[1300,'metal-deck',500,150],[700,'metal-bracket',430,140]
]);
turnLeft('factory',855,905);
const factoryRow4=mainRow('factory',905,[
  [850,'metal-deck',480,150],[1450,'metal-bracket',430,140],[2050,'metal-deck',500,150],
  [2650,'metal-bracket',430,140],[3250,'metal-deck',500,150],
  [3850,'metal-bracket',430,140],[4450,'metal-deck',500,150]
]);
turnRight('factory',905,955);
const factoryRow5=mainRow('factory',955,[
  [4900,'metal-deck',480,150],[4300,'metal-bracket',430,140],[3700,'metal-deck',500,150],
  [3100,'metal-bracket',430,140],[2500,'metal-deck',500,150],
  [1900,'metal-bracket',430,140],[1300,'metal-deck',500,150],[700,'metal-bracket',430,140]
]);
turnLeft('factory',955,1000);
mainObjectRow('factory',1000,[
  [850,'metal-deck',480,120],[1450,'metal-bracket',430,110],[2050,'metal-deck',500,120],
  [2650,'metal-bracket',430,110],[3250,'metal-deck',500,120],
  [3850,'metal-bracket',430,110],[4450,'metal-deck',500,120]
],'metal-bracket');
mainSupport('factory','metal-deck',4900,1000,700,160,{tags:['summit-platform']});

// Solid room pillars sit beside, never across, the route. Lasers are visible,
// non-lethal jump obstacles placed above broad factory decks.
for (const [x,a] of [[5700,790],[-100,850],[5700,905],[-100,960]]) {
  objects.push({
    id:`factory-wall-${a}`,assetId:'flat-brick-pillar-4',zone:'factory',x,y:yAt(a),
    w:60,h:270,angle:0,role:'obstacle',behavior:staticBehavior,supportId:null,
    tags:['wall','route-edge']
  });
}
for (const [x,a,w] of [[3250,805,190],[2500,855,190],[3250,905,190],[2500,955,190]]) {
  hazards.push({id:`laser-${a}`,zone:'factory',x,y:yAt(a)-105,w,h:16,checkpointAltitude:a<880?704:a<935?820:930,type:'laser'});
}
decor('factory','giant-gear',5200,840,260,260);
decor('factory','generator',500,975,280,220);

// Natural recovery: a miss from an upper sweep lands on the broad row below.
recovery.push(
  {from:castleExit.node.id,to:castleUpperMiddle[1].node.id,type:'recovery'},
  {from:forestTop[3].node.id,to:forestMiddle[3].node.id,type:'recovery'},
  {from:farmUpper[3].node.id,to:farmLower[3].node.id,type:'recovery'},
  {from:snowUpper[3].node.id,to:snowLower[3].node.id,type:'recovery'},
  {from:factoryRow3[3].node.id,to:factoryRow2[3].node.id,type:'recovery'},
  {from:factoryRow4[3].node.id,to:factoryRow3[3].node.id,type:'recovery'},
  {from:factoryRow5[3].node.id,to:factoryRow4[3].node.id,type:'recovery'}
);

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
  summit:{x:4900,y:yAt(1000)-90,progress:1},
  start:{x:360,y:yAt(0)-92}
};
