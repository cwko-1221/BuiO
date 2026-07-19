import { alphaBounds, fittedSize } from './colliders.js?v=20260719-six-launchers';

// One fixed, hand-authored course for every room. The route grammar follows
// the supplied reference sequence: a forgiving brick tutorial, landmark
// bases, short prop chains, large set-pieces, and alternating rising turns.
// Art and object identities remain original to this project.
export const MAP_VERSION = 'fixed-1500m-2026.07j';
export const WORLD = { width:5600, height:8700, startY:8200, summitY:700, pixelsPerMetre:5 };
export const PLAYER_VISUAL_HEIGHT = 70;
export const MAX_ROUTE_OBJECT_HEIGHT = PLAYER_VISUAL_HEIGHT * 1.2;

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
  // A route prop may be wide, but never visually towers over the player.
  // Oversized landmarks belong in decor; every physical foothold is capped at
  // 1.2x the 70px player sprite so it remains readable and easy to clear.
  w=Math.min(w,MAX_ROUTE_OBJECT_HEIGHT);
  h=Math.min(h,MAX_ROUTE_OBJECT_HEIGHT);
  const id=extra.id || `fixed-${String(++serial).padStart(3,'0')}`;
  const object={id,assetId,zone,x,y:yAt(altitude),w,h,angle:extra.angle||0,
    role:'support',behavior:extra.behavior||staticBehavior,routeNode:`node-${id}`,tags:extra.tags||[]};
  objects.push(object);
  const canIdle=fittedSize(object).w>=58;
  const node={id:object.routeNode,objectId:id,x,y:object.y-h/2-8,altitude,route:extra.route||'main',
    safe:extra.safe!==false&&canIdle&&!object.tags.includes('ground-chain')};
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
  w=Math.min(w,MAX_ROUTE_OBJECT_HEIGHT);
  h=Math.min(h,MAX_ROUTE_OBJECT_HEIGHT);
  const id=extra.id || `fixed-obstacle-${String(++serial).padStart(3,'0')}`;
  const supportTop=supportRef.object.y-supportRef.object.h/2;
  // Once route pieces are capped at 84px there is no safe room for a second
  // collider on the same foothold. Retain these landmarks visually, but the
  // small route support itself owns the only physical body.
  objects.push({id,assetId,zone,x:supportRef.object.x+xOffset,y:supportTop-h/2,w,h,
    angle:extra.angle||0,role:'decor',behavior:staticBehavior,tags:['decor','mounted-landmark',...(extra.tags||[])]});
}

// Tutorial masonry is assembled from independent front-facing pieces.  Unlike
// a decorative arch image, every visible brick piece owns its exact collider,
// so the open doorway remains open and there is no invisible platform.
function placedObstacle(zone,assetId,x,y,w,h,extra={}) {
  const id=extra.id || `fixed-obstacle-${String(++serial).padStart(3,'0')}`;
  const physical=(extra.tags||[]).includes('reference-frame-01');
  objects.push({id,assetId,zone,x,y,w,h,angle:extra.angle||0,role:physical?'obstacle':'decor',
    behavior:staticBehavior,tags:[physical?'obstacle':'decor','tutorial-masonry',...(extra.tags||[])]});
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
  const available=run.filter(item=>item.node.route==='main');
  for (let index=Math.max(1,available.length-count);index<available.length;index++) {
    // A launcher crossing is intentionally one-way. Falling behind it should
    // use the checkpoint recovery system, not require an impossible reverse
    // jump across the launcher-sized gap.
    if (available[index-1].object.behavior?.type==='launcher') continue;
    recovery.push({from:available[index].node.id,to:available[index-1].node.id,type:'recovery'});
  }
}

// CASTLE 0-210m -------------------------------------------------------------
// The opening mirrors the reference pacing: long floor, low gates, forgiving
// brick steps, then a left-climbing sequence of castle props and landmarks.
const castleGround=[];
for (let x=48;x<=3088;x+=80) {
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
  ['ref-produce-crate',4300,137,180,108],['ref-produce-crate',4580,149,180,108],
  ['ref-produce-crate',4860,161,180,108],['ref-shield-rack',5100,171,200,110],
  ['ref-barrel-front',5310,182,110,105],['ref-stone-ramp-front',5050,203,300,88,{angle:-0.12}]
],['reference-frame-03','oven-crate-ascent']);
obstacle('castle','ref-oven-front',frame02[5],-180,250,198,{tags:['reference-frame-03','oven-obstacle']});
decor('castle','ref-lamp-post',4050,142,108,250,{tags:['reference-frame-03','oven-lamp']});

const frame04=authoredRoute('market',[
  ['ref-barrel-front',4780,209,110,105],['ref-barrel-front',4550,222,110,105],
  ['ref-barrel-front',4320,235,110,105],['ref-stone-ramp-front',4000,248,300,88,{angle:-0.16}],
  ['ref-shield-rack',3700,258,190,110]
],['reference-frame-04','barrel-ramp-turn']);

const frame05=authoredRoute('market',[
  ['ref-barrel-cart',3980,274,200,95],['ref-barrel-cart',4230,286,200,95],
  ['ref-stone-ramp-front',4540,300,230,80,{angle:-0.08}],
  ['ref-stone-ramp-front',4770,312,230,80,{angle:0.08}],
  ['ref-chair-front',4980,323,140,105,{tags:['reference-frame-06']}],
  ['ref-feast-table',5200,333,260,105,{tags:['reference-frame-06']}]
],['reference-frame-05','feast-hall-ascent']);
decor('market','ref-stone-pillar-front',4630,317,105,150,{tags:['reference-frame-05','off-route-landmark']});

const frame06=authoredRoute('forest',[
  ['ref-barrel-front',5440,346,110,105],
  ['ref-stone-ramp-front',5180,360,300,80,{angle:-0.14}],
  ['ref-stone-ramp-front',4880,370,300,80,{angle:0.12}],
  ['ref-barrel-front',4620,382,110,105]
],['reference-frame-06','ramp-gallery']);
decor('forest','ref-stone-column-front',4380,382,120,155,{tags:['reference-frame-06','off-route-landmark']});

const frame07=authoredRoute('forest',[
  ['ref-bed-front',4800,402,300,85],['ref-hanging-lantern',4960,420,240,100],
  ['ref-bed-front',5160,438,320,105,{angle:-0.12}],
  ['ref-catapult-front',5400,452,195,120],['ref-log-step',5160,469,185,78],
  ['ref-log-step',4920,482,185,78],['ref-oven-front',4660,495,155,120],
  ['ref-bellows-front',4400,508,240,95],['ref-cookpot',4160,521,150,115],
  ['ref-cookpot',3850,534,150,115,{tags:['double-jump-gap']}],['ref-log-step',3700,547,185,78,{safe:false}]
],['reference-frame-07','bed-lantern-climb']);

const frame08=authoredRoute('farm',[
  ['ref-log-step',3480,556,205,88,{safe:false}],
  ['flat-brick-strip-4',3070,570,660,88,{tags:['market-lower-landing','u-wall']}],
  ['ref-produce-crate',2690,580,180,108],
  ['ref-catapult-front',2440,590,180,115,{safe:false}],
  ['ref-produce-crate',2210,601,180,108],
  ['ref-produce-crate',1950,606,180,108],
  ['flat-brick-strip-4',1450,615,700,90,{tags:['market-upper-landing']}]
],['reference-frame-08','market-u-climb']);
obstacle('farm','ref-market-stall-blue',frame08[1],-135,225,220,{tags:['reference-frame-08']});
obstacle('farm','ref-market-stall-red',frame08[6],65,225,220,{tags:['reference-frame-08']});
const frame08WallBottom=frame08[1].object.y+frame08[1].object.h/2;
placedObstacle('farm','flat-brick-pillar-4',2805,frame08WallBottom+112,82,220,{tags:['reference-frame-08','u-wall-side']});
decor('farm','ref-stone-column-front',2180,604,105,145,{tags:['reference-frame-08','off-route-landmark']});

const frame09=authoredRoute('snow',[
  ['flat-brick-a',1100,628,120,80,{tags:['reference-frame-08']}],
  ['flat-brick-a',980,646,120,80,{tags:['reference-frame-08']}],
  ['flat-brick-a',1100,662,120,80,{tags:['reference-frame-08']}],
  ['flat-brick-strip-4',1400,678,650,90,{tags:['armory-platform']}],
  ['ref-book-step',1900,680,175,108],['ref-scroll-step',2160,686,190,84],
  ['flat-brick-strip-4',2670,690,650,90,{tags:['library-u-top']}]
],['reference-frame-09','armory-library']);
decor('snow','ref-castle-banner-blue',1000,638,95,145,{tags:['reference-frame-08','reference-frame-09']});
decor('snow','ref-castle-banner-red',1180,655,95,145,{tags:['reference-frame-08','reference-frame-09']});
obstacle('snow','ref-knight-stand',frame09[3],-190,112,158,{tags:['reference-frame-09']});
obstacle('snow','ref-knight-stand',frame09[3],-45,112,158,{tags:['reference-frame-09']});
obstacle('snow','ref-shield-rack',frame09[3],150,170,120,{tags:['reference-frame-09']});
obstacle('snow','ref-lamp-post',frame09[6],0,100,230,{tags:['reference-frame-09']});
const frame09LibraryBottom=frame09[6].object.y+frame09[6].object.h/2;
placedObstacle('snow','flat-brick-pillar-4',2440,frame09LibraryBottom+122,82,240,{tags:['reference-frame-09','library-u-wall']});
placedObstacle('snow','flat-brick-pillar-4',2980,frame09LibraryBottom+122,82,240,{tags:['reference-frame-09','library-u-wall']});

const frame10=authoredRoute('snow',[
  ['ref-sand-ledge',3180,700,300,105],['ref-fishing-boat',3620,710,285,120,{tags:['double-jump-gap']}],
  ['ref-fishing-boat',3880,720,285,120],['ref-sand-ledge',4140,730,300,105],
  ['ref-round-table-front',4410,740,230,110],['ref-bowl-front',4650,748,130,86,{safe:false}],
  ['ref-bowl-front',4800,755,130,86,{safe:false}]
],['reference-frame-10','coral-table-chain']);
decor('snow','ref-coral-cluster',3880,742,125,125,{tags:['reference-frame-10','coral-detail']});

const frame11=authoredRoute('factory',[
  ['ref-sand-ledge',4950,758,280,100],['ref-reef-rock',5220,770,280,125],
  // Finish the right-climbing chain before making one clean, well-separated
  // left turn. Short props lift the route first; the tall tree only appears
  // after there is more than a full jump of clearance above the bowl chain.
  ['ref-potted-plant',5450,785,125,90],['ref-monitor-front',4715,807,165,110,{tags:['double-jump-gap']}],
  ['ref-wood-sign',4520,822,240,105],['ref-monitor-front',4280,837,165,110],
  ['ref-monitor-front',4040,849,165,110]
],['reference-frame-11','nature-monitor-chain','rising-left']);
// The large tree is retained as a reference landmark only. It is deliberately
// outside the jumping line and has no body, so its canopy can never cap the
// player above the table/sign route again.
decor('factory','ref-round-tree',5550,837,180,205,{tags:['reference-frame-11','off-route-landmark']});

const frame12=authoredRoute('factory',[
  ['ref-reef-rock',3770,865,290,125],['ref-sand-ledge',3480,868,280,100],
  ['ref-fishing-boat',3210,871,275,115],['ref-fishing-boat',2820,874,275,115,{safe:false,tags:['double-jump-gap']}],
  ['ref-sand-ledge',2650,877,280,100,{safe:false}],['ref-bowl-front',2420,880,130,86,{safe:false}],
  ['ref-sand-ledge',2190,883,280,100,{safe:false}],['ref-reef-rock',1900,906,290,125]
],['reference-frame-12','reef-boat-climb','rising-left']);
decor('factory','ref-coral-cluster',3500,866,135,135,{tags:['reference-frame-12','reef-detail']});
decor('factory','ref-coral-cluster',1610,886,125,125,{tags:['reference-frame-12','reef-detail']});

const frame13=authoredRoute('factory',[
  ['ref-sand-ledge',2200,914,280,100],['ref-sand-ledge',2485,920,280,100],
  ['ref-telescope',2730,927,140,115],['ref-split-platform',2980,935,300,90],
  ['ref-sand-ledge',3260,943,260,95],['ref-sand-ledge',3525,951,260,95],
  ['ref-white-table',3800,960,280,120],['ref-charcoal-table',4050,968,220,120]
],['reference-frame-13','agent-adventure','rising-right']);
decor('factory','ref-potted-plant',3470,954,125,125,{tags:['reference-frame-13','agent-plant']});
decor('factory','ref-door-panel',3230,947,95,140,{tags:['reference-frame-13','off-route-landmark']});
decor('factory','ref-door-panel',3490,955,95,140,{tags:['reference-frame-13','off-route-landmark']});

const frame14=authoredRoute('factory',[
  ['ref-office-safe',4250,976,160,110],['ref-office-desk',4460,982,210,80],
  ['ref-white-table',4690,990,230,105],['ref-charcoal-table',4920,996,230,105],
  ['ref-office-desk',5150,998,210,80,{safe:false}],
  ['ref-office-desk',5380,1000,220,84,{tags:['office-bridge','landmark-base']}]
],['reference-frame-14','office-bridge','rising-right']);
decor('factory','ref-potted-plant',5000,990,140,140,{tags:['reference-frame-14','office-plant']});
decor('factory','ref-office-chair',5190,994,130,145,{tags:['reference-frame-14','off-route-landmark']});
decor('factory','ref-basketball-hoop',5350,988,210,260,{angle:-0.08,tags:['reference-frame-14','office-hoop']});

// FACTORY EXTENSION 1000-1500m ---------------------------------------------
// A dense final climb continues the same front-facing prop language. These
// short runs deliberately reuse readable supports rather than stretching a
// handful of objects across the extra 500 metres.
const frame15=authoredRoute('factory',[
  ['ref-monitor-front',5200,1022,150,92,{tags:['vertical-bridge']}],['ref-office-safe',4960,1040,150,100],
  ['ref-office-desk',4720,1058,210,80],['ref-white-table',4470,1072,220,88],
  ['ref-charcoal-table',4210,1086,210,88],['ref-potted-plant',3980,1100,120,86],
  ['ref-sand-ledge',3710,1114,260,86],['ref-reef-rock',3440,1128,250,92]
],['reference-frame-14','factory-extension-a','rising-left']);

const frame16=authoredRoute('factory',[
  ['ref-bowl-front',3200,1142,120,82],['ref-monitor-front',2960,1156,150,92],
  ['ref-wood-sign',2720,1170,210,90],['ref-split-platform',2470,1184,230,84],
  ['ref-telescope',2230,1198,135,96],['ref-book-step',1990,1212,165,88],
  ['ref-scroll-step',1750,1226,170,84],['ref-shield-rack',1510,1240,175,92]
],['reference-frame-14','factory-extension-b','rising-left']);

const frame17=authoredRoute('factory',[
  ['ref-log-step',1270,1254,175,78],['ref-cookpot',1030,1268,135,90],
  ['ref-barrel-front',790,1282,105,92],['ref-produce-crate',550,1296,165,92],
  ['ref-stone-ramp-front',790,1310,230,80,{angle:-0.1}],['ref-catapult-front',1030,1324,170,96],
  ['ref-bed-front',1270,1338,240,84],['ref-hanging-lantern',1510,1352,190,88]
],['reference-frame-14','factory-extension-c','switchback-climb']);

const frame18=authoredRoute('factory',[
  ['ref-office-safe',1750,1366,150,100],['ref-office-desk',1990,1380,205,80],
  ['ref-white-table',2230,1394,220,88],['ref-charcoal-table',2470,1408,210,88],
  ['ref-monitor-front',2710,1422,150,92],['ref-potted-plant',2950,1436,120,86],
  ['ref-split-platform',3190,1450,230,84],['ref-telescope',3430,1464,135,96],
  ['ref-office-safe',3670,1478,150,100],['ref-office-desk',3910,1489,205,80],
  ['ref-white-table',4150,1500,230,84,{tags:['summit-platform','landmark-base']}]
],['reference-frame-14','factory-extension-d','summit-run']);

// Reflow the authored route after applying the 84x84px hard size cap. The
// original left/right rhythm is retained. Ordinary footholds remain friendly,
// while regular milestones introduce a clearly wider double-jump gap. Attached
// obstacles follow their support during the reflow.
function compactPhysicalRoute() {
  const objectById=new Map(objects.map(object=>[object.id,object]));
  // Deliberately remove redundant middle footholds from five dense chains.
  // This creates the same readable "missing rung" challenge seen in the
  // reference map instead of merely placing many tiny objects close together.
  const removedAltitudes=new Set([149,222,606,720,920,982,990]);
  for (const node of nodes.filter(item=>item.route==='main'&&removedAltitudes.has(item.altitude))) {
    const object=objectById.get(node.objectId);
    node.route='removed';
    object.role='decor';
    object.tags.push('removed-route-rung');
  }
  const routeNodes=nodes.filter(node=>node.route==='main');
  main.length=0;
  for (let index=1;index<routeNodes.length;index++) {
    main.push({from:routeNodes[index-1].id,to:routeNodes[index].id,type:'main'});
  }
  const attachedBySupport=new Map();
  for (const object of objects.filter(item=>item.supportId)) {
    if (!attachedBySupport.has(object.supportId)) attachedBySupport.set(object.supportId,[]);
    attachedBySupport.get(object.supportId).push(object);
  }
  const visibleBox=(object,x=object.x)=>{
    const bounds=alphaBounds(object.assetId,fittedSize(object));
    return {left:x+bounds.minX,right:x+bounds.maxX,top:object.y+bounds.minY,bottom:object.y+bounds.maxY};
  };
  const clearsEarlierRoute=(object,x,index)=>{
    const upper=visibleBox(object,x);
    for (let earlierIndex=0;earlierIndex<index-1;earlierIndex++) {
      const earlierObject=objectById.get(routeNodes[earlierIndex].objectId);
      const lower=visibleBox(earlierObject);
      if (upper.bottom>=lower.top) continue;
      const overlapX=Math.min(upper.right,lower.right)-Math.max(upper.left,lower.left);
      const clearance=lower.top-upper.bottom;
      if (overlapX>4&&clearance<120) return false;
    }
    return true;
  };
  // The ground is a continuous tutorial runway. Above it, alternate long
  // diagonal sweeps with a few compact switchbacks, so some sequences require
  // jumping right and then immediately climbing back left.
  let direction=1;
  let doubleJumpChallenges=0;
  const doubleJumpMilestones=[150,180,210,235,275,320,340,390,410,435,495,550,615,660,700,730,790,840,865,927,1050,1120,1190,1260,1330,1400,1470];
  const forcedTurnMilestones=[300,370,520,580,822,906,1050,1150,1250,1350,1450];
  let milestoneIndex=0;
  let forcedTurnIndex=0;
  let spacingDebt=0;
  for (const node of routeNodes) {
    const object=objectById.get(node.objectId);
    object.tags=object.tags.filter(tag=>tag!=='double-jump-gap');
  }
  for (let index=1;index<routeNodes.length;index++) {
    const previousNode=routeNodes[index-1], node=routeNodes[index];
    const previousObject=objectById.get(previousNode.objectId), object=objectById.get(node.objectId);
    if (previousObject.tags.includes('ground-chain')&&object.tags.includes('ground-chain')) continue;
    if (forcedTurnIndex<forcedTurnMilestones.length&&node.altitude>=forcedTurnMilestones[forcedTurnIndex]) {
      direction*=-1;
      object.tags.push('switchback-turn');
      forcedTurnIndex++;
      spacingDebt=0;
    }
    const halfWidths=(fittedSize(previousObject).w+fittedSize(object).w)/2;
    const wantsDoubleJump=milestoneIndex<doubleJumpMilestones.length
      &&node.altitude>=doubleJumpMilestones[milestoneIndex];
    const routeRise=previousNode.y-node.y;
    const preferredDoubleGaps=routeRise<=70?[245,240,235]:routeRise<=105?[240,235,230]:[235,230];
    const doubleChoice=wantsDoubleJump
      ? preferredDoubleGaps.map(gap=>({gap,candidate:previousObject.x+direction*(halfWidths+gap)}))
        .find(choice=>choice.candidate>=250&&choice.candidate<=5350&&clearsEarlierRoute(object,choice.candidate,index))
      : undefined;
    // At the 1000m seam, climb almost vertically first. This keeps the first
    // extension jump comfortably reachable without placing it beneath the
    // final supports of the original route.
    const bridgeCandidate=previousObject.x+82;
    const verticalTarget=object.tags.includes('vertical-bridge')
      &&bridgeCandidate>=42&&clearsEarlierRoute(object,bridgeCandidate,index)
      ? bridgeCandidate
      : undefined;
    let target=verticalTarget??doubleChoice?.candidate;
    if (verticalTarget===undefined&&target!==undefined) {
      object.tags.push('double-jump-gap');
      doubleJumpChallenges++;
      milestoneIndex++;
      spacingDebt+=Math.max(0,doubleChoice.gap-88);
    }
    const baseOrdinaryGaps=node.altitude<120?[34,48,62,76]:[88,104,120,136,72];
    const repayment=Math.min(40,spacingDebt);
    // Once the course reaches the more technical upper half, never repay a
    // previous double-jump gap by squeezing the following props together.
    // A 96px visible gap keeps switchbacks readable while remaining a very
    // comfortable ordinary jump.
    const minimumOrdinaryGap=node.altitude>=700?96:32;
    const ordinaryGaps=baseOrdinaryGaps.map(gap=>Math.max(minimumOrdinaryGap,gap-repayment));
    if (target===undefined) {
      target=ordinaryGaps
        .map(gap=>previousObject.x+direction*(halfWidths+gap))
        .find(candidate=>candidate>=42&&candidate<=5480&&clearsEarlierRoute(object,candidate,index));
      if (target!==undefined) spacingDebt=Math.max(0,spacingDebt-repayment);
    }
    if (target===undefined) {
      direction*=-1;
      const turnGaps=[235,240,245,230];
      target=turnGaps
        .map(gap=>previousObject.x+direction*(halfWidths+gap))
        .find(candidate=>candidate>=42&&candidate<=5480&&clearsEarlierRoute(object,candidate,index));
      if (target!==undefined) {
        object.tags.push('double-jump-gap');
        doubleJumpChallenges++;
        if (wantsDoubleJump) milestoneIndex++;
        spacingDebt=0;
      }
    }
    if (target===undefined) {
      const candidate=previousObject.x+direction*(halfWidths+210);
      const upper=visibleBox(object,candidate);
      const conflicts=routeNodes.slice(0,index-1).map(earlierNode=>{
        const earlierObject=objectById.get(earlierNode.objectId),lower=visibleBox(earlierObject);
        return {id:earlierObject.id,x:earlierObject.x,altitude:earlierNode.altitude,
          overlap:Math.min(upper.right,lower.right)-Math.max(upper.left,lower.left),
          clearance:lower.top-upper.bottom};
      }).filter(item=>item.overlap>4&&item.clearance<120);
      throw new Error(`No clear authored route position for ${object.id} at ${node.altitude}m from x=${previousObject.x.toFixed(1)} direction=${direction}; candidate=${candidate.toFixed(1)} conflicts=${JSON.stringify(conflicts)}`);
    }
    const shift=target-object.x;
    object.x=target;
    node.x=target;
    for (const attached of attachedBySupport.get(object.id)||[]) attached.x+=shift;
  }
  if (doubleJumpChallenges<24||doubleJumpChallenges>34) throw new Error(`Expected 24-34 double-jump challenges, got ${doubleJumpChallenges}`);
}
compactPhysicalRoute();

// Six launcher crossings replace one foothold apiece. Power 20 gives a clear
// vertical launch without changing ordinary horizontal air control. Each
// launcher receives its own approach space and a single, unambiguous landing;
// moving the complete suffix preserves the course rhythm after the crossing.
function installSlingshotCrossings() {
  const objectById=new Map(objects.map(object=>[object.id,object]));
  const nodeAt=altitude=>nodes.find(node=>node.route==='main'&&node.altitude===altitude);
  const specs=[
    {from:300,remove:[312],to:323,direction:1},
    {from:469,remove:[482],to:495,direction:1},
    {from:580,remove:[590],to:601,direction:-1},
    {from:710,remove:[730],to:740,direction:-1},
    {from:868,remove:[871],to:874,direction:1},
    {from:1366,remove:[1380],to:1394,direction:-1}
  ];
  const attachedBySupport=new Map();
  for (const object of objects.filter(item=>item.supportId)) {
    if (!attachedBySupport.has(object.supportId)) attachedBySupport.set(object.supportId,[]);
    attachedBySupport.get(object.supportId).push(object);
  }
  const moveNode=(node,x)=>{
    const object=objectById.get(node.objectId);
    const shift=x-object.x;
    object.x=x;
    node.x=x;
    for (const attached of attachedBySupport.get(object.id)||[]) attached.x+=shift;
  };
  for (const spec of specs) {
    const fromNode=nodeAt(spec.from), landingNode=nodeAt(spec.to);
    if (!fromNode||!landingNode) throw new Error(`Missing slingshot crossing ${spec.from}m>${spec.to}m`);
    const launcher=objectById.get(fromNode.objectId), landing=objectById.get(landingNode.objectId);
    const routeNodes=nodes.filter(node=>node.route==='main');
    const launcherIndex=routeNodes.indexOf(fromNode);
    const approachNode=routeNodes[launcherIndex-1];
    const approach=approachNode&&objectById.get(approachNode.objectId);
    if (!approach) throw new Error(`Missing slingshot approach before ${spec.from}m`);
    // The screenshot problem was caused by comparing object centres: the
    // painted edges could still nearly touch. Measure the physical widths and
    // leave a full 160px of air before every launcher.
    const approachDirection=Math.sign(launcher.x-approach.x)||spec.direction;
    const approachHalfWidths=(fittedSize(approach).w+fittedSize(launcher).w)/2;
    moveNode(fromNode,approach.x+approachDirection*(approachHalfWidths+160));
    launcher.assetId='slingshot-platform';
    launcher.tags=launcher.tags.filter(tag=>tag!=='crumble-platform');
    launcher.tags.push('slingshot-launcher','launcher-approach-gap');
    landing.tags.push('slingshot-landing');
    // Move the landing and every later main node by the same amount. This
    // keeps the approach/exit gaps compact instead of creating an empty arc.
    const landingIndex=routeNodes.indexOf(landingNode);
    // Power 20 supports a longer but still local crossing. A 240px centre
    // distance produces about 158px of visible air between capped 84px props:
    // clearly separated, yet the intended next platform remains on-screen.
    const desiredLandingX=launcher.x+spec.direction*240;
    const suffixShift=desiredLandingX-landing.x;
    for (const node of routeNodes.slice(landingIndex)) moveNode(node,node.x+suffixShift);
    launcher.angle=0;
    launcher.behavior={type:'launcher',power:20,flightMs:2000};
    const direction=landing.x>=launcher.x?1:-1;
    launcher.tags.push(direction>0?'launcher-steer-right':'launcher-steer-left');
    annotations.push({
      id:`launcher-arrow-${spec.from}`,
      type:'launcher-guide',
      x:launcher.x,
      y:launcher.y-105,
      assetId:'ref-jump-arrow',
      renderSize:{w:58,h:58},
      showText:false,
      flipX:direction<0
    });
    for (const altitude of spec.remove) {
      const node=nodeAt(altitude);
      if (!node) throw new Error(`Missing removable slingshot rung at ${altitude}m`);
      const object=objectById.get(node.objectId);
      node.route='removed';
      object.role='decor';
      object.tags.push('removed-for-slingshot-gap');
    }
  }
  const routeNodes=nodes.filter(node=>node.route==='main');
  // Launcher suffix shifts can accumulate near the right world edge. Ease any
  // overflow back into the 900-1000m run instead of clamping one platform and
  // creating a cramped corner. The small distributed correction is visually
  // imperceptible and preserves every authored jump margin.
  const maxRight=Math.max(...routeNodes.map(node=>{
    const object=objectById.get(node.objectId);
    return object.x+fittedSize(object).w/2;
  }));
  const overflow=Math.max(0,maxRight-(WORLD.width-4));
  if (overflow>0) {
    for (const node of routeNodes) {
      const t=Math.max(0,Math.min(1,(node.altitude-900)/100));
      if (t>0) moveNode(node,node.x-overflow*t);
    }
    for (const note of annotations.filter(item=>item.type==='launcher-guide')) {
      const altitude=Number(note.id.replace('launcher-arrow-',''));
      const launcherNode=nodeAt(altitude);
      if (launcherNode) note.x=launcherNode.x;
    }
  }
  main.length=0;
  for (let index=1;index<routeNodes.length;index++) {
    const from=routeNodes[index-1],to=routeNodes[index];
    const launcher=objectById.get(from.objectId);
    main.push({from:from.id,to:to.id,type:launcher.behavior?.type==='launcher'?'launcher':'main'});
  }
}
installSlingshotCrossings();

// Final hand-tuned passes for the four route sections called out during the
// full-map review. Keep this separate from the broad spacing grammar above:
// these are authored compositions, not another procedural layout pass.
function applyReviewReflow() {
  const objectById=new Map(objects.map(object=>[object.id,object]));
  const routeNodes=nodes.filter(node=>node.route==='main');
  const nodeAt=altitude=>routeNodes.find(node=>node.altitude===altitude);
  const attachedBySupport=new Map();
  for (const object of objects.filter(item=>item.supportId)) {
    if (!attachedBySupport.has(object.supportId)) attachedBySupport.set(object.supportId,[]);
    attachedBySupport.get(object.supportId).push(object);
  }
  const moveNode=(node,x)=>{
    const object=objectById.get(node.objectId);
    const shift=x-object.x;
    object.x=x;
    node.x=x;
    for (const attached of attachedBySupport.get(object.id)||[]) attached.x+=shift;
  };
  const placeAfter=(fromAltitude,toAltitude,gap,direction)=>{
    const from=nodeAt(fromAltitude),to=nodeAt(toAltitude);
    if (!from||!to) throw new Error(`Missing review reflow node ${fromAltitude}m>${toAltitude}m`);
    const fromObject=objectById.get(from.objectId),toObject=objectById.get(to.objectId);
    const halfWidths=(fittedSize(fromObject).w+fittedSize(toObject).w)/2;
    moveNode(to,from.x+direction*(halfWidths+gap));
  };
  const moveSuffix=(altitude,shift)=>{
    for (const node of routeNodes.filter(item=>item.altitude>=altitude)) moveNode(node,node.x+shift);
  };

  // 493m review: retain the zig-zag, but give the small oven, bellows, pots
  // and logs 110-125px of visible air instead of compressing them into one
  // dense silhouette. The launcher approach and landing keep their measured
  // power-20 gaps.
  placeAfter(495,508,115,1);
  placeAfter(508,521,125,1);
  placeAfter(521,534,115,1);
  placeAfter(534,547,115,1);
  placeAfter(547,556,245,-1);
  placeAfter(556,570,110,-1);
  placeAfter(570,580,160,-1);
  placeAfter(580,601,158,-1);
  placeAfter(601,615,245,-1);
  const node615=nodeAt(615),node628=nodeAt(628);
  const object615=objectById.get(node615.objectId),object628=objectById.get(node628.objectId);
  const target628=node615.x+(fittedSize(object615).w+fittedSize(object628).w)/2+110;
  moveSuffix(628,target628-node628.x);
  for (const altitude of [508,521,534,547,570]) objectById.get(nodeAt(altitude).objectId).tags.push('review-spacing');

  // 1051m review: fold this local run inward before authoring the laser. The
  // following double-jump reconnects to the unchanged upper route, moving the
  // third gate almost half a screen away from the hard right world boundary.
  placeAfter(1022,1040,110,-1);
  placeAfter(1040,1058,240,-1);
  placeAfter(1058,1072,110,-1);
  placeAfter(1072,1086,110,-1);
  placeAfter(1086,1100,120,-1);
  placeAfter(1100,1114,120,-1);
  const node1114=nodeAt(1114),node1128=nodeAt(1128);
  const object1114=objectById.get(node1114.objectId),object1128=objectById.get(node1128.objectId);
  const target1128=node1114.x+(fittedSize(object1114).w+fittedSize(object1128).w)/2+245;
  moveSuffix(1128,target1128-node1128.x);

  // 1301m review: open the compact left-hand turn into a readable staircase.
  // Ordinary landings use 120-130px gaps; the tagged double-jumps and the
  // launcher retain their exact challenge envelopes.
  placeAfter(1268,1282,120,-1);
  placeAfter(1282,1296,130,-1);
  placeAfter(1296,1310,125,-1);
  placeAfter(1310,1324,130,-1);
  placeAfter(1324,1338,125,-1);
  placeAfter(1338,1352,245,1);
  placeAfter(1352,1366,160,1);
  placeAfter(1366,1394,158,-1);
  placeAfter(1394,1408,245,1);
  placeAfter(1408,1422,120,1);
  const node1422=nodeAt(1422),node1436=nodeAt(1436);
  const object1422=objectById.get(node1422.objectId),object1436=objectById.get(node1436.objectId);
  const target1436=node1422.x+(fittedSize(object1422).w+fittedSize(object1436).w)/2+120;
  moveSuffix(1436,target1436-node1436.x);
  for (const altitude of [1282,1296,1310,1324,1338,1422]) objectById.get(nodeAt(altitude).objectId).tags.push('review-spacing');

  // Launcher arrows are authored before this pass, so keep them attached to
  // the launcher bodies after all targeted moves.
  for (const note of annotations.filter(item=>item.type==='launcher-guide')) {
    const altitude=Number(note.id.replace('launcher-arrow-',''));
    const launcherNode=nodeAt(altitude);
    if (launcherNode) note.x=launcherNode.x;
  }
}
applyReviewReflow();

// Screenshot corrections requested for the reviewed route. These edits run
// after the broad spacing passes so the named props keep their exact authored
// relationship even if the general route grammar changes later.
function applyScreenshotCorrections() {
  const objectById=new Map(objects.map(object=>[object.id,object]));
  const nodeByObjectId=new Map(nodes.map(node=>[node.objectId,node]));
  const attachedBySupport=new Map();
  for (const object of objects.filter(item=>item.supportId)) {
    if (!attachedBySupport.has(object.supportId)) attachedBySupport.set(object.supportId,[]);
    attachedBySupport.get(object.supportId).push(object);
  }
  const removeSupport=id=>{
    const object=objectById.get(id),node=nodeByObjectId.get(id);
    if (!object||!node) throw new Error(`Missing screenshot correction support ${id}`);
    object.role='decor';
    object.tags.push('removed-by-screenshot-review');
    node.route='removed';
  };
  const moveObject=(id,{x,y})=>{
    const object=objectById.get(id),node=nodeByObjectId.get(id);
    if (!object||!node) throw new Error(`Missing screenshot correction object ${id}`);
    const shiftX=(x??object.x)-object.x;
    object.x=x??object.x;
    object.y=y??object.y;
    node.x=object.x;
    node.y=object.y;
    for (const attached of attachedBySupport.get(id)||[]) attached.x+=shiftX;
  };

  // 180m barrel, 281m barrel cart, 361m ramp, 803m monitor,
  // 943m sand ledge, 1098m planter, 1106m ledge and 1350m lantern.
  for (const id of ['fixed-074','fixed-084','fixed-091','fixed-143','fixed-162','fixed-172','fixed-173','fixed-183','fixed-184','fixed-185','fixed-201']) {
    removeSupport(id);
  }

  // The two cookpots shown at 518m and 531m share the requested 501m row.
  moveObject('fixed-103',{y:yAt(504)});
  moveObject('fixed-104',{y:yAt(504)});

  // Keep the lower white oval at the reviewed 972m position.
  const whiteOval=objectById.get('fixed-171');
  const whiteOvalNode=nodeByObjectId.get('fixed-171');
  whiteOval.role='support';
  whiteOval.tags=whiteOval.tags.filter(tag=>tag!=='removed-route-rung');
  whiteOval.tags.push('moved-by-screenshot-review');
  whiteOvalNode.route='main';
  moveObject('fixed-171',{y:yAt(974)});

  // Removing a foothold joins its two neighbours directly. Keep those new
  // joins inside the existing double-jump envelope without restoring any of
  // the deleted art or collision bodies.
  const makeReachable=(fromId,toId,{maxRise=135,maxGap=255,doubleJump=false}={})=>{
    const from=objectById.get(fromId),to=objectById.get(toId);
    const toNode=nodeByObjectId.get(toId);
    const fromBounds=alphaBounds(from.assetId,fittedSize(from));
    const toBounds=alphaBounds(to.assetId,fittedSize(to));
    const fromTop=from.y+fromBounds.minY-8;
    const toTop=to.y+toBounds.minY-8;
    const rise=fromTop-toTop;
    if (rise>maxRise) moveObject(toId,{y:to.y+(rise-maxRise)});
    const halfWidths=(fittedSize(from).w+fittedSize(to).w)/2;
    const direction=Math.sign(to.x-from.x)||1;
    const gap=Math.max(0,Math.abs(to.x-from.x)-halfWidths);
    if (gap>maxGap||(doubleJump&&gap<230)) {
      moveObject(toId,{x:from.x+direction*(halfWidths+maxGap)});
    }
    if (doubleJump&&!to.tags.includes('double-jump-gap')) to.tags.push('double-jump-gap');
    toNode.x=to.x;
    toNode.y=to.y;
  };
  const earlyLanding=objectById.get('fixed-075');
  const earlyNext=objectById.get('fixed-078');
  const earlyDoubleHalf=(fittedSize(earlyLanding).w+fittedSize(earlyNext).w)/2;
  moveObject('fixed-075',{x:earlyNext.x+earlyDoubleHalf+235});
  const earlyApproach=objectById.get('fixed-073');
  const earlyHalf=(fittedSize(earlyApproach).w+fittedSize(earlyLanding).w)/2;
  moveObject('fixed-073',{x:earlyLanding.x-earlyHalf-120});
  makeReachable('fixed-073','fixed-075',{maxRise:109,maxGap:120});
  makeReachable('fixed-083','fixed-085');
  objectById.get('fixed-085').tags.push('screenshot-removal-approach');
  makeReachable('fixed-104','fixed-105');
  makeReachable('fixed-142','fixed-144');
  makeReachable('fixed-161','fixed-163',{doubleJump:true});
  makeReachable('fixed-171','fixed-174',{doubleJump:true});
  makeReachable('fixed-182','fixed-186',{maxGap:240,doubleJump:true});
  makeReachable('fixed-186','fixed-187',{maxGap:240,doubleJump:true});
  makeReachable('fixed-187','fixed-188');
  objectById.get('fixed-186').tags.push('screenshot-tight-clearance');
  objectById.get('fixed-187').tags.push('screenshot-tight-clearance');

  // Move the final launcher to the bed's upper-left at a standing height of
  // about 1355m. Shift the landing and summit suffix together so the power-20
  // arc and the following route remain compact and readable.
  const bed=objectById.get('fixed-200');
  const launcher=objectById.get('fixed-202');
  const launcherNode=nodeByObjectId.get('fixed-202');
  const landing=objectById.get('fixed-204');
  const landingNode=nodeByObjectId.get('fixed-204');
  const approachGap=160;
  const launcherX=bed.x-(fittedSize(bed).w+fittedSize(launcher).w)/2-approachGap;
  const launcherBounds=alphaBounds(launcher.assetId,fittedSize(launcher));
  const hudStartY=yAt(0)-92;
  const launcherY=hudStartY-1355*WORLD.pixelsPerMetre-launcherBounds.minY+35;
  moveObject('fixed-202',{x:launcherX,y:launcherY});
  const landingGap=158;
  const landingX=launcher.x-(fittedSize(launcher).w+fittedSize(landing).w)/2-landingGap;
  const suffixShift=landingX-landing.x;
  for (const node of nodes.filter(item=>item.route==='main'&&item.altitude>=1394)) {
    moveObject(node.objectId,{x:objectById.get(node.objectId).x+suffixShift});
  }
  // Keep the landing within the launcher's tested vertical envelope.
  moveObject('fixed-204',{y:launcher.y-209.6});
  launcher.tags=launcher.tags.filter(tag=>tag!=='launcher-steer-left');
  launcher.tags.push('launcher-steer-left','moved-by-screenshot-review');
  const launcherArrow=annotations.find(item=>item.id==='launcher-arrow-1366');
  if (launcherArrow) {
    launcherArrow.x=launcherNode.x;
    launcherArrow.y=launcher.y-105;
    launcherArrow.flipX=landingNode.x<launcherNode.x;
  }

  // Rebuild the main chain after removing the requested footholds. Side-route
  // props remain physical but do not receive progress sensors.
  const routeNodes=nodes.filter(node=>node.route==='main');
  main.length=0;
  for (let index=1;index<routeNodes.length;index++) {
    const from=routeNodes[index-1],to=routeNodes[index];
    const fromObject=objectById.get(from.objectId);
    main.push({from:from.id,to:to.id,type:fromObject.behavior?.type==='launcher'?'launcher':'main'});
  }
}
applyScreenshotCorrections();

// Five red timing gates appear only in the factory half of the climb. The
// beam is active for two seconds, then the passage is open for two seconds.
// Each gate sits in the actual air gap between two consecutive main supports;
// there is no hidden platform or collider around the visual beam.
function installTimedLaserPassages() {
  const objectById=new Map(objects.map(object=>[object.id,object]));
  const nodeAt=altitude=>nodes.find(node=>node.route==='main'&&node.altitude===altitude);
  const specs=[
    {from:748,to:755,phaseMs:0},
    {from:906,to:914,phaseMs:800},
    {from:1040,to:1058,phaseMs:1600},
    {from:1212,to:1226,phaseMs:2400},
    {from:1408,to:1422,phaseMs:3200}
  ];
  for (const [index,spec] of specs.entries()) {
    const from=nodeAt(spec.from),to=nodeAt(spec.to);
    if (!from||!to) throw new Error(`Missing timed laser passage ${spec.from}m>${spec.to}m`);
    const fromObject=objectById.get(from.objectId),toObject=objectById.get(to.objectId);
    const fromSize=fittedSize(fromObject),toSize=fittedSize(toObject);
    const direction=Math.sign(to.x-from.x)||1;
    const fromEdge=from.x+direction*fromSize.w/2;
    const toEdge=to.x-direction*toSize.w/2;
    const gap=Math.abs(toEdge-fromEdge);
    if (gap<72) throw new Error(`Timed laser passage ${spec.from}m has only ${gap.toFixed(1)}px of air`);
    const surfaceY=(from.y+to.y)/2;
    hazards.push({
      id:`timed-laser-${index+1}`,
      type:'timed-laser',
      x:(fromEdge+toEdge)/2,
      y:surfaceY-150,
      w:14,
      h:400,
      altitude:Math.round((spec.from+spec.to)/2),
      fromAltitude:spec.from,
      toAltitude:spec.to,
      cycleMs:4000,
      activeMs:2000,
      phaseMs:spec.phaseMs,
      tags:['factory-laser','timed-passage']
    });
  }
}
installTimedLaserPassages();

// From 300m onward, roughly every tenth main-route foothold becomes a
// temporary crumble platform. Keep them away from double-jump landings,
// switchback pivots, checkpoints and the summit so a disappearing support is
// surprising without ever becoming a mandatory soft-lock.
function markCrumblePlatforms() {
  const routeNodes=nodes.filter(node=>node.route==='main'&&node.altitude>=300&&node.altitude<1470);
  const objectById=new Map(objects.map(object=>[object.id,object]));
  const protectedAltitudes=[448,573,704,820,930,1058,1198,1324,1464];
  let previousChosenIndex=-Infinity;
  const desiredCount=Math.floor(routeNodes.length/10);
  for (let slot=1;slot<=desiredCount;slot++) {
    const targetIndex=Math.round(slot*routeNodes.length/(desiredCount+1));
    const offsets=[0,1,-1,2,-2,3,-3,4,-4,5,-5,6,-6];
    const node=offsets.map(offset=>routeNodes[targetIndex+offset]).find(candidate=>{
      if (!candidate || protectedAltitudes.some(altitude=>Math.abs(candidate.altitude-altitude)<=8)) return false;
      if (routeNodes.indexOf(candidate)-previousChosenIndex<7) return false;
      const object=objectById.get(candidate.objectId);
      return object?.role==='support'
        && object.behavior?.type==='static'
        && !object.tags.includes('double-jump-gap')
        && !object.tags.includes('switchback-turn')
        && !object.tags.includes('crumble-platform');
    });
    if (!node) continue;
    const object=objectById.get(node.objectId);
    object.behavior={type:'crumble',triggerDelayMs:140,fallDurationMs:650,respawnMs:4000};
    object.tags.push('crumble-platform');
    previousChosenIndex=routeNodes.indexOf(node);
  }
  const marked=routeNodes.filter(node=>objectById.get(node.objectId)?.behavior?.type==='crumble').length;
  if (marked!==desiredCount) throw new Error(`Expected ${desiredCount} crumble platforms after launcher layout, got ${marked}`);
}
markCrumblePlatforms();

// Decorative stand-ins caused visible objects that the player could walk
// through and could also overlap the real route after it was reflowed. Keep
// them in referenceObjects for the asset audit, but never ship them into the
// playable world. Every visible world prop is now a physical body.
const referenceObjects=objects.slice();
const runtimeObjects=objects.filter(object=>object.role!=='decor');

for (const run of [frame01,frame02,frame03,frame04,frame05,frame06,frame07,frame08,frame09,frame10,frame11,frame12,frame13,frame14,frame15,frame16,frame17,frame18]) recoverLast(run,3);

// World-space tutorial and wayfinding annotations. These are deliberately
// separate from collision objects so signs can never create invisible walls.
annotations.push(
  {id:'guide-jump',type:'guide',x:3260,y:yAt(9)-255,text:'跳！',assetId:'ref-jump-arrow',renderSize:{w:54,h:54}},
  {id:'guide-run-jump',type:'guide',x:4000,y:yAt(38)-300,text:'跑動時跳得更遠！',assetId:'ref-run-jump-sign',renderSize:{w:120,h:46},showText:false},
  {id:'guide-double',type:'guide',x:5070,y:yAt(72)-285,text:'二段跳！',assetId:'ref-double-jump-sign',renderSize:{w:96,h:63},showText:false},
  {id:'summit-castle',type:'summit',x:3890,y:yAt(112)-280,text:'高峰 1/6・熔城攀登',assetId:'ref-zone-title',renderSize:{w:150,h:59},showText:false},
  {id:'turn-oven',type:'turn',x:5050,y:yAt(188)-145,text:'← 沿木桶轉向'},
  {id:'turn-ramp',type:'turn',x:3280,y:yAt(258)-155,text:'→ 登上宴會廳'},
  {id:'turn-workshop',type:'turn',x:3210,y:yAt(543)-155,text:'→ 沿工場物件攀升'},
  {id:'summit-coral',type:'summit',x:3660,y:yAt(830)-175,text:'高峰 2/6・珊瑚攀登'},
  {id:'turn-office',type:'turn',x:1690,y:yAt(910)-155,text:'→ 進入最後攀登'},
  {id:'milestone-1000',type:'turn',x:4050,y:yAt(1000)-145,text:'繼續向上！'},
  {id:'summit-final-label',type:'summit',x:4050,y:yAt(1500)-145,text:'登頂！'}
);

const summitBase=frame18[frame18.length-1];
export const FIXED_MAP = {
  mapVersion:MAP_VERSION,
  world:WORLD,
  zones:[
    {id:'castle',min:0,max:210},{id:'market',min:211,max:274},{id:'forest',min:275,max:448},
    {id:'farm',min:449,max:573},{id:'snow',min:574,max:704},{id:'factory',min:705,max:1500}
  ],
  objects:runtimeObjects,referenceObjects,nodes,
  routes:{main,shortcut,recovery},
  progressSensors:nodes.filter(node=>node.route==='main').map((node,index,all)=>({
    id:`progress-${index}`,x:node.x,y:node.y,progress:index/(all.length-1),altitude:node.altitude
  })),
  checkpoints:[
    {altitude:0},{altitude:210},{altitude:274},{altitude:448},
    // The farm flag was moved back to the preceding platform shown around
    // 561m in the HUD, before the mandatory 580m launcher.
    {altitude:573,nodeAltitude:556,flagSide:-1},{altitude:704},{altitude:820},{altitude:930},
    {altitude:1058},{altitude:1198},{altitude:1324},{altitude:1464}
  ].map(item=>({id:`checkpoint-${item.altitude}`,...item})),
  recoveryBounds:[
    {id:'recovery-castle',minAltitude:35,maxAltitude:210,resetAltitude:0},
    {id:'recovery-forest',minAltitude:290,maxAltitude:448,resetAltitude:274},
    {id:'recovery-farm',minAltitude:460,maxAltitude:573,resetAltitude:448},
    {id:'recovery-snow',minAltitude:588,maxAltitude:704,resetAltitude:573},
    {id:'recovery-factory',minAltitude:718,maxAltitude:1500,resetAltitude:704}
  ],
  hazards,
  annotations,
  summit:{x:summitBase.object.x,y:yAt(1500)-100,progress:1},
  start:{x:360,y:yAt(0)-92}
};
