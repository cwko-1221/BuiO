// One authored course for every room.  Apart from the forgiving first floor,
// the main route is a succession of rising diagonals: the player is always
// climbing, with a few wide turns that alternate between left and right.
export const MAP_VERSION = 'fixed-1000m-2026.07e';
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
    angle:extra.angle||0,role:'decor',behavior:staticBehavior,tags:['decor']});
}

// Keep individual landings small enough to read as a diagonal route rather
// than a horizontal shelf.  Width and height vary per asset on purpose: these
// are real objects, not a flattened, invisible platform collection.
function risingRun(zone,{x,altitude,direction,count,stepX,stepAltitude,styles,tags=['diagonal-main']}) {
  const run=[];
  for (let index=0;index<count;index++) {
    const [assetId,w,h,extra={}] = styles[index%styles.length];
    run.push(mainSupport(zone,assetId,x+direction*stepX*index,altitude+stepAltitude*index,w,h,{...extra,tags}));
  }
  return run;
}

const castleStyles=[
  ['flat-brick-a',190,92],['flat-brick-strip-2',230,66],['flat-brick-wall-2',205,90],
  ['drawbridge',250,105],['round-table',220,118],['flat-brick-wall-2',205,96]
];
const marketStyles=[
  ['market-basket',220,112],['apple-crate',220,108],['cheese-wheel',210,112],
  ['barrel',205,120],['market-scale',230,118],['flat-brick-strip-2',260,72]
];
const forestStyles=[
  ['tree-stump',225,125],['stone-ledge',260,82],['stone-ledge',260,82],
  ['bench',255,104],['giant-leaf',225,112],['stone-ledge',250,82]
];
const farmStyles=[
  ['hay-block',220,118],['wood-pallet',230,92],['milk-can',170,120],
  ['wheelbarrow',220,112],['feed-bin',210,126],['watering-can',190,110]
];
const snowStyles=[
  ['snow-ledge',250,100],['ice-slab',220,108],['frozen-barrel',185,124],
  ['sled',230,108],['curling-stone',190,110],['ice-slab',240,98]
];
const factoryStyles=[
  ['oil-drum',175,125],['cable-spool',195,116],['conveyor',260,82],
  ['battery',175,126],['valve-wheel',185,122],['metal-bracket',230,96]
];

// CASTLE 0-210m -------------------------------------------------------------
// The one deliberately horizontal area: a continuous spawn floor and broad
// brick steps.  Everything above it immediately becomes a rising diagonal.
const castleGround=[];
for (const x of [360,930,1500,2070,2640]) {
  castleGround.push(mainSupport('castle','flat-brick-strip-4',x,0,600,106,{tags:['ground-chain']}));
}
const castleSteps=[];
castleSteps.push(mainSupport('castle','flat-brick-strip-2',3100,4.5,220,70,{tags:['intro-step']}));
for (let index=0;index<5;index++) {
  castleSteps.push(mainSupport('castle','flat-brick-strip-2',3360+index*285,9+index*9,index===4?300:225,72,{tags:['intro-step']}));
}
const castleLead=mainSupport('castle','flat-brick-wall-2',4850,65,220,92,{tags:['intro-step']});
const castleRun=risingRun('castle',{x:4550,altitude:80,direction:-1,count:10,stepX:280,stepAltitude:14.45,styles:castleStyles});
obstacle('castle','barrel',castleRun[4],56,72,90);
obstacle('castle','treasure-chest',castleRun[6],-54,92,78);
decor('castle','castle-tower',5150,130,240,260);
decor('castle','chandelier',600,160,170,180);

// MARKET 211-274m -----------------------------------------------------------
// A short rightward climb made of generous market props, not a flat transit row.
const marketRun=risingRun('market',{x:2250,altitude:230,direction:1,count:4,stepX:300,stepAltitude:14.7,styles:marketStyles});
obstacle('market','orange-crate',marketRun[1],48,70,70);
decor('market','market-stall',4650,250,300,220);
decor('market','lantern-string',2450,260,300,140);

// FOREST 275-448m -----------------------------------------------------------
const forestRun=risingRun('forest',{x:2800,altitude:295,direction:-1,count:9,stepX:275,stepAltitude:19.125,styles:forestStyles});
obstacle('forest','red-mushroom',forestRun[2],54,74,82);
obstacle('forest','blue-mushroom',forestRun[5],-54,74,82);
decor('forest','treehouse',4800,365,300,300);
decor('forest','butterflies',380,420,210,150);

// FARM 449-573m -------------------------------------------------------------
const farmRun=risingRun('farm',{x:900,altitude:465,direction:1,count:7,stepX:290,stepAltitude:18,styles:farmStyles});
obstacle('farm','potato-crate',farmRun[3],56,76,74);
obstacle('farm','cabbage-crate',farmRun[5],-56,76,74);
decor('farm','tractor',4950,520,290,220);
decor('farm','scarecrow',430,510,150,210);

// SNOW 574-704m -------------------------------------------------------------
const snowRun=risingRun('snow',{x:2400,altitude:592,direction:-1,count:7,stepX:275,stepAltitude:18.67,styles:snowStyles});
obstacle('snow','hockey-puck',snowRun[5],54,68,54);
decor('snow','cable-car',5100,650,300,220);
decor('snow','aurora-crystal',420,680,230,250);

// FACTORY 705-1000m ---------------------------------------------------------
// Three tall chevrons keep the final zone moving upward while making the
// direction changes visually obvious.  No factory row is a continuous shelf.
const factoryRiseA=risingRun('factory',{x:1000,altitude:724,direction:1,count:6,stepX:280,stepAltitude:18,styles:factoryStyles});
const factoryRiseB=risingRun('factory',{x:2700,altitude:834,direction:-1,count:6,stepX:280,stepAltitude:18,styles:factoryStyles});
const factoryRiseC=risingRun('factory',{x:1600,altitude:944,direction:1,count:4,stepX:300,stepAltitude:18,styles:factoryStyles});
const summitBase=mainSupport('factory','conveyor',2800,1000,420,150,{tags:['summit-platform']});
obstacle('factory','factory-monitor',factoryRiseA[4],54,78,70);
obstacle('factory','vent-fan',factoryRiseB[5],-54,76,76);
decor('factory','giant-gear',5050,850,250,250);
decor('factory','generator',440,970,270,220);

// Non-lethal laser gates live beside the diagonal run. They reset to a nearby
// checkpoint rather than sealing a corridor, so every factory approach stays
// passable even while a player is learning the route.
for (const [id,x,altitude,checkpointAltitude] of [
  ['laser-a',2520,760,704],['laser-b',2430,865,820],['laser-c',2500,970,930]
]) hazards.push({id,zone:'factory',x,y:yAt(altitude)-88,w:145,h:16,checkpointAltitude,type:'laser'});

// A missed landing naturally goes to the preceding diagonal object.  These
// explicit edges are also used by the offline verifier and recovery probes.
recovery.push(
  {from:castleRun[9].node.id,to:castleRun[8].node.id,type:'recovery'},
  {from:marketRun[3].node.id,to:marketRun[2].node.id,type:'recovery'},
  {from:forestRun[8].node.id,to:forestRun[7].node.id,type:'recovery'},
  {from:farmRun[5].node.id,to:farmRun[4].node.id,type:'recovery'},
  {from:snowRun[5].node.id,to:snowRun[4].node.id,type:'recovery'},
  {from:factoryRiseB[5].node.id,to:factoryRiseB[4].node.id,type:'recovery'},
  {from:factoryRiseC[3].node.id,to:factoryRiseC[2].node.id,type:'recovery'}
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
  summit:{x:summitBase.object.x,y:yAt(1000)-100,progress:1},
  start:{x:360,y:yAt(0)-92}
};
