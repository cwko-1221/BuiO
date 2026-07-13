// One authored course for every room. Coordinates are immutable; altitude is
// five world pixels per metre, measured up from the start floor.
export const MAP_VERSION = 'fixed-1000m-2026.07';
export const WORLD = { width:5600, height:6200, startY:5700, summitY:700, pixelsPerMetre:5 };

const objects=[];
const nodes=[];
const main=[];
const shortcut=[];
const recovery=[];
const hazards=[];
let serial=0;

const yAt = altitude => WORLD.startY - altitude * WORLD.pixelsPerMetre;
const behavior = { type:'static' };

function support(zone, assetId, x, altitude, w, h=96, extra={}) {
  const id=extra.id || `fixed-${String(++serial).padStart(3,'0')}`;
  const object={ id,assetId,zone,x,y:yAt(altitude),w,h,angle:extra.angle||0,role:'support',behavior:extra.behavior||behavior,routeNode:`node-${id}`,tags:extra.tags||[] };
  objects.push(object);
  const node={id:object.routeNode,objectId:id,x,y:object.y-h/2-8,altitude,route:extra.route||'main',safe:extra.safe!==false};
  nodes.push(node);
  return {object,node};
}

function obstacle(zone,assetId,supportRef,xOffset,w,h,extra={}) {
  const id=extra.id || `fixed-obstacle-${String(++serial).padStart(3,'0')}`;
  objects.push({id,assetId,zone,x:supportRef.object.x+xOffset,y:supportRef.object.y-120,w,h,angle:extra.angle||0,role:'obstacle',behavior:extra.behavior||behavior,supportId:supportRef.object.id,tags:extra.tags||['obstacle']});
}

function decor(zone,assetId,x,altitude,w,h,extra={}) {
  objects.push({id:`fixed-decor-${String(++serial).padStart(3,'0')}`,assetId,zone,x,y:yAt(altitude),w,h,angle:extra.angle||0,role:'decor',behavior, tags:['decor']});
}

let previous=null;
function mainSupport(zone,assetId,x,altitude,w,h=96,extra={}) {
  const result=support(zone,assetId,x,altitude,w,h,extra);
  if(previous) main.push({from:previous.node.id,to:result.node.id,type:'main'});
  previous=result;
  return result;
}

// 0-45m: continuous front-facing brick floor and broad, readable steps.
const castle=[];
for (const x of [420,1050,1680,2310,2940]) castle.push(mainSupport('castle','flat-brick-strip-4',x,0,680,106));
for (const [x,a,w,id] of [[3540,10,560,'flat-brick-strip-4'],[3990,22,470,'flat-brick-strip-2'],[4400,34,430,'flat-brick-strip-2'],[4850,45,560,'flat-brick-strip-4']]) castle.push(mainSupport('castle',id,x,a,w,104));

// 45-110m: solid props sit on the bricks and must be jumped over.
const c45=mainSupport('castle','flat-brick-strip-4',4300,58,620,104); obstacle('castle','crate',c45,-90,105,105);
const c60=mainSupport('castle','flat-brick-strip-4',3650,70,620,104); obstacle('castle','barrel',c60,80,100,112);
const c75=mainSupport('castle','flat-brick-wall-2',3000,84,560,150); obstacle('castle','castle-banner',c75,-70,120,145);
const c90=mainSupport('castle','flat-brick-strip-4',2350,98,620,104); obstacle('castle','treasure-chest',c90,85,135,105);
const c110=mainSupport('castle','flat-brick-wall-2',1700,110,560,150); obstacle('castle','armor-stand',c110,20,120,175);

// 110-210m: brick islands mix with broad objects and a lower recovery shelf.
for (const [x,a,w,id] of [[1150,124,500,'flat-brick-strip-2'],[650,140,430,'flat-brick-wall-2'],[1120,154,460,'flat-brick-strip-2'],[1700,166,500,'drawbridge'],[2320,178,500,'round-table'],[2980,188,520,'flat-brick-strip-4'],[3650,198,520,'stone-arch'],[4300,210,680,'flat-brick-strip-4']]) mainSupport('castle',id,x,a,w,id==='stone-arch'?210:118);
const castleExit=previous;
const castleRecovery=support('castle','flat-brick-strip-4',2100,132,1700,100,{route:'recovery',tags:['recovery']});
recovery.push(
  {from:nodes.find(node=>node.altitude===178).id,to:castleRecovery.node.id,type:'recovery'},
  {from:castleRecovery.node.id,to:nodes.find(node=>node.altitude===154).id,type:'recovery'}
);
decor('castle','catapult',4850,166,250,190); decor('castle','chandelier',850,190,180,180);

// 211-274m market: short transition made from large forgiving silhouettes.
for (const [x,a,w,id,h] of [[3820,220,650,'market-wagon',220],[3100,232,620,'market-stall',230],[2380,244,620,'picnic-table',190],[1660,255,600,'giant-watermelon',280],[980,265,560,'bread-cart',210],[580,274,520,'flat-brick-strip-4',104]]) mainSupport('market',id,x,a,w,h);
obstacle('market','apple-crate',previous,110,110,100);
decor('market','lantern-string',2750,270,360,160); decor('market','market-signboard',900,242,150,170);

// 275-448m forest: wide furniture/stone chain, then a return sweep.
for (const [x,a,w,id,h] of [[1100,290,540,'bench',150],[1680,306,500,'tree-stump',210],[2260,323,540,'round-table',210],[2870,342,500,'moss-boulder',240],[3470,360,560,'picnic-table',190],[4100,380,570,'sofa',220],[4700,398,500,'bed',220],[4250,414,520,'forest-log',190],[3600,428,500,'table',190],[2920,438,500,'stone-ledge',170],[2200,448,620,'grass-ledge',190]]) mainSupport('forest',id,x,a,w,h);
const forestExit=previous;
const forestRecovery=support('forest','grass-ledge',2400,386,600,100,{route:'recovery',tags:['recovery']});
const forestRecoveryStep=support('forest','grass-ledge',2950,400,600,100,{route:'recovery',tags:['recovery']});
const forestRecoveryStep2=support('forest','stone-ledge',3500,414,520,100,{route:'recovery',tags:['recovery']});
recovery.push(
  {from:forestExit.node.id,to:forestRecovery.node.id,type:'recovery'},
  {from:forestRecovery.node.id,to:forestRecoveryStep.node.id,type:'recovery'},
  {from:forestRecoveryStep.node.id,to:forestRecoveryStep2.node.id,type:'recovery'},
  {from:forestRecoveryStep2.node.id,to:nodes.find(node=>node.altitude===428).id,type:'recovery'}
);
decor('forest','treehouse',900,380,280,280); decor('forest','butterflies',4900,440,230,150);

// 449-573m farm: three deliberate descents create a down/across/up route.
for (const [x,a,w,id,h] of [[1600,460,560,'grass-ledge',180],[980,478,520,'hay-block',240],[560,466,430,'wood-deck',150],[1120,486,500,'hay-cart',210],[1800,512,560,'wood-deck',160],[2560,500,620,'grass-ledge',180],[3340,522,600,'hay-block',230],[4100,544,580,'farm-shed',250],[4660,536,470,'farm-ladder',260],[4200,555,620,'grass-ledge',180],[3500,573,600,'wood-deck',160]]) mainSupport('farm',id,x,a,w,h);
const farmExit=previous;
const farmRecovery=support('farm','grass-ledge',3200,460,600,100,{route:'recovery',tags:['recovery']});
const farmRecovery2=support('farm','wood-deck',3750,482,600,100,{route:'recovery',tags:['recovery']});
const farmRecovery3=support('farm','wood-deck',3450,504,520,100,{route:'recovery',tags:['recovery']});
const farmRecovery4=support('farm','wood-deck',4100,526,500,100,{route:'recovery',tags:['recovery']});
const farmRecovery5=support('farm','wood-deck',3500,542,500,100,{route:'recovery',tags:['recovery']});
recovery.push(
  {from:farmExit.node.id,to:farmRecovery.node.id,type:'recovery'},
  {from:farmRecovery.node.id,to:farmRecovery2.node.id,type:'recovery'},
  {from:farmRecovery2.node.id,to:farmRecovery3.node.id,type:'recovery'},
  {from:farmRecovery3.node.id,to:farmRecovery4.node.id,type:'recovery'},
  {from:farmRecovery4.node.id,to:farmRecovery5.node.id,type:'recovery'},
  {from:farmRecovery5.node.id,to:nodes.find(node=>node.altitude===544).id,type:'recovery'}
);
decor('farm','tractor',4900,520,300,220); decor('farm','scarecrow',600,545,170,220);

// 574-704m snow: narrower but still generous static footholds.
for (const [x,a,w,id,h] of [[3550,588,560,'snow-ledge',190],[2890,605,500,'ice-slab',180],[2250,622,480,'snow-mound',190],[1650,640,450,'frozen-log',170],[1080,658,430,'ice-slab',170],[600,676,400,'snowman',220],[1120,690,450,'snow-ledge',180],[1780,704,600,'ice-slab',180]]) mainSupport('snow',id,x,a,w,h);
const snowExit=previous;
const snowRecovery=support('snow','snow-ledge',2100,645,1700,100,{route:'recovery',tags:['recovery']});
const snowRecoveryStep=support('snow','ice-slab',1550,658,420,100,{route:'recovery',tags:['recovery']});
const snowRecoveryStep2=support('snow','ice-slab',1050,670,420,100,{route:'recovery',tags:['recovery']});
recovery.push(
  {from:snowExit.node.id,to:snowRecovery.node.id,type:'recovery'},
  {from:snowRecovery.node.id,to:snowRecoveryStep.node.id,type:'recovery'},
  {from:snowRecoveryStep.node.id,to:snowRecoveryStep2.node.id,type:'recovery'},
  {from:snowRecoveryStep2.node.id,to:nodes.find(node=>node.altitude===676).id,type:'recovery'}
);
decor('snow','cable-car',4300,650,300,220); decor('snow','aurora-crystal',5000,700,230,250);

// 705-1000m factory: front-on rooms, door openings and a deterministic laser maze.
for (const [x,a,w,id,h] of [[2380,718,620,'metal-deck',160],[3020,735,560,'metal-deck',160],[3650,752,520,'metal-bracket',150],[4260,770,560,'metal-deck',160],[4700,790,520,'metal-deck',160],[4180,810,520,'metal-bracket',150],[3540,820,680,'metal-deck',160],[2920,840,520,'metal-deck',160],[2350,860,500,'metal-bracket',150],[1800,880,500,'metal-deck',160],[1250,900,500,'metal-deck',160],[750,920,480,'metal-bracket',150],[1150,930,560,'metal-deck',160],[1750,944,500,'metal-bracket',150],[2350,958,520,'metal-deck',160],[3000,972,540,'metal-deck',160],[3700,984,600,'metal-deck',160],[4450,994,700,'metal-deck',160],[4900,1000,880,'metal-deck',170]]) mainSupport('factory',id,x,a,w,h);

// Fixed wall pieces frame the tech rooms without becoming invisible platforms.
for (const [x,a] of [[3300,780],[3900,850],[1450,885],[2700,950]]) {
  objects.push({id:`factory-wall-${a}`,assetId:'flat-brick-pillar-4',zone:'factory',x,y:yAt(a)-120,w:128,h:320,angle:0,role:'obstacle',behavior,supportId:null,tags:['wall','clearance-84']});
}
for (const [x,a,w] of [[3240,830,280],[2580,905,260],[2050,968,280]]) hazards.push({id:`laser-${a}`,zone:'factory',x,y:yAt(a)-60,w,h:16,checkpointAltitude:a<900?820:930,type:'laser'});
decor('factory','giant-gear',5100,850,290,290); decor('factory','generator',600,970,300,240);

// A safe, static shortcut is never required by the main route.
const shortcutA=support('forest','hanging-ring',4720,432,150,150,{route:'shortcut',safe:false});
const shortcutB=support('forest','hanging-ring',5000,448,150,150,{route:'shortcut',safe:false});
shortcut.push({from:forestExit.node.id,to:shortcutA.node.id,type:'shortcut'},{from:shortcutA.node.id,to:shortcutB.node.id,type:'shortcut'},{from:shortcutB.node.id,to:forestExit.node.id,type:'shortcut'});

export const FIXED_MAP = {
  mapVersion:MAP_VERSION,
  world:WORLD,
  zones:[
    {id:'castle',min:0,max:210},{id:'market',min:211,max:274},{id:'forest',min:275,max:448},
    {id:'farm',min:449,max:573},{id:'snow',min:574,max:704},{id:'factory',min:705,max:1000}
  ],
  objects,nodes,
  routes:{main,shortcut,recovery},
  progressSensors:nodes.filter(node=>node.route==='main').map((node,index,all)=>({id:`progress-${index}`,x:node.x,y:node.y,progress:index/(all.length-1),altitude:node.altitude})),
  checkpoints:[0,210,274,448,573,704,820,930].map(altitude=>({id:`checkpoint-${altitude}`,altitude})),
  recoveryBounds:[
    {id:'recovery-castle',minAltitude:108,maxAltitude:200,resetAltitude:110},
    {id:'recovery-forest',minAltitude:350,maxAltitude:445,resetAltitude:342},
    {id:'recovery-farm',minAltitude:470,maxAltitude:570,resetAltitude:460},
    {id:'recovery-snow',minAltitude:610,maxAltitude:703,resetAltitude:588}
  ],
  hazards,
  summit:{x:4900,y:yAt(1000)-90,progress:1},
  start:{x:360,y:yAt(0)-92}
};
