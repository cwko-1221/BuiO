import { ZONES, ZONE_PROP_IDS } from './assets.js';

const W = 1200, H = 760;

const platform = (assetId, x, y, w, h, extra = {}) => ({ assetId, x, y, w, h, angle: 0, role: 'route', behavior: { type: 'static' }, ...extra });
const moving = (assetId, x, y, w, h, dx, dy, speed = .8) => platform(assetId, x, y, w, h, { behavior: { type: 'move', dx, dy, speed } });
const rotating = (assetId, x, y, w, h, speed = .45) => platform(assetId, x, y, w, h, { behavior: { type: 'rotate', speed } });
const bounce = (assetId, x, y, w, h, power = 14) => platform(assetId, x, y, w, h, { behavior: { type: 'bounce', power } });
const conveyor = (x, y, w, speed = 1.8) => platform('conveyor', x, y, w, 48, { role:'support', behavior: { type: 'conveyor', speed } });
const oneWay = (assetId, x, y, w, h, angle = 0) => platform(assetId, x, y, w, h, {
  angle, role:'support',
  bodyOverride: { type: Math.abs([...assetId].reduce((n,c)=>n+c.charCodeAt(0),0)) % 3 ? 'trapezoid' : 'polygon', oneWay: true, material: 'solid' }
});

function themed(zone, index) {
  const ids = ZONE_PROP_IDS[zone];
  return ids[index % ids.length];
}

// Walkable surfaces per zone — finished illustrations only. Art-poor zones
// borrow big furniture/food/mechanism pieces, DLD's trademark absurdism.
const zoneSurfaces = {
  // castle-brick-step/thick/corner have isometric top faces that clash with
  // the 2D side view — keep to the flat-front pieces.
  castle: { long:'flat-brick-strip-4', medium:'flat-brick-strip-2', step:'flat-brick-wall-2', thick:'flat-brick-wall-2', corner:'flat-brick-wall-4' },
  market: { long:'picnic-table', medium:'market-awning', step:'barrel-stack', thick:'market-stall', corner:'market-wagon' },
  forest: { long:'grass-ledge', medium:'stone-ledge', step:'moss-boulder', thick:'treehouse', corner:'stone-arch' },
  farm: { long:'grass-ledge', medium:'wood-deck', step:'hay-block', thick:'tractor', corner:'bread-cart' },
  snow: { long:'snow-ledge', medium:'ice-slab', step:'crate', thick:'ice-arch', corner:'grand-clock' },
  factory: { long:'metal-deck', medium:'metal-deck', step:'metal-bracket', thick:'bookcase', corner:'giant-gear' }
};

const surface = (zone, kind, x, y, w, h, extra = {}) => platform(zoneSurfaces[zone][kind], x, y, w, h, { role:'support', ...extra });
const prop = (zone, index, x, y, w, h, extra = {}) => platform(themed(zone,index),x,y,w,h,{ role:'stacked', ...extra });

const layouts = [
  {
    name: 'gentle-start', difficulty: 1, tags: ['traverse','recovery','grounded','easy'],
    build: z => [
      surface(z,'long',100,660,360,76), surface(z,'long',410,660,360,76), surface(z,'long',720,660,360,76),
      surface(z,'corner',980,664,330,130), surface(z,'medium',850,476,330,104),
      surface(z,'medium',610,368,260,72), surface(z,'long',750,267,330,86),
      surface(z,'medium',970,183,320,100), surface(z,'long',1040,70,300,82),
      prop(z,8,180,590,120,100), prop(z,13,885,420,135,105),
      platform('arrow-sign',705,595,90,90,{role:'stacked'})
    ]
  },
  {
    name: 'down-and-around', difficulty: 2, tags: ['descent','underpass','recovery','traverse'],
    build: z => [
      surface(z,'long',120,590,300,74), surface(z,'medium',390,650,230,70),
      surface(z,'medium',650,700,230,70), surface(z,'thick',920,630,260,120),
      surface(z,'step',1060,500,180,120), oneWay(zoneSurfaces[z].long,790,400,300,62),
      surface(z,'corner',520,330,230,115), oneWay(zoneSurfaces[z].medium,270,250,240,62,-.06),
      surface(z,'step',520,150,190,120), surface(z,'long',930,75,320,72),
      prop(z,11,930,535,120,100), prop(z,14,525,260,110,90),
      platform('arrow-sign',700,630,84,84,{role:'stacked',angle:Math.PI})
    ]
  },
  {
    name: 'long-traverse', difficulty: 2, tags: ['traverse','branch','recovery'],
    build: z => [
      surface(z,'long',120,620,310,76), surface(z,'long',405,620,310,76), conveyor(670,595,250,1.5),
      surface(z,'thick',900,540,230,120), surface(z,'step',1080,430,180,120),
      oneWay('rope-bridge',790,340,390,38), surface(z,'medium',460,300,260,72),
      surface(z,'corner',220,220,210,110), oneWay(zoneSurfaces[z].medium,500,125,250,60),
      surface(z,'long',930,72,320,70), prop(z,2,405,545,110,95), prop(z,6,900,445,120,100),
      prop(z,15,220,145,105,90), platform('barrel',610,680,115,90), platform('barrel',720,680,115,90)
    ]
  },
  {
    name: 'moving-machines', difficulty: 3, tags: ['dynamic','traverse','recovery'],
    build: z => [
      surface(z,'long',120,620,300,74), moving('moving-lift',380,560,190,48,150,0,.65),
      surface(z,'thick',630,510,210,118), rotating('rotating-beam',850,450,250,36,.42),
      surface(z,'step',1060,350,180,118), moving('moving-lift',820,260,180,48,-150,0,.7),
      surface(z,'medium',520,220,250,72), rotating('seesaw',280,170,250,38,-.34),
      surface(z,'long',930,72,320,70), oneWay('stone-slab',530,690,300,48),
      prop(z,3,630,415,110,90), prop(z,5,520,145,110,90), platform('fan',1060,260,100,100,{role:'stacked'})
    ]
  },
  {
    name: 'bounce-chain', difficulty: 3, tags: ['bounce','descent','recovery'],
    build: z => [
      surface(z,'long',120,620,300,74), bounce('trampoline',350,665,170,40,14),
      surface(z,'thick',540,540,190,118), bounce('basketball',720,570,108,108,13),
      bounce('basketball',870,500,108,108,13), bounce('beach-ball',1020,430,125,125,14),
      surface(z,'medium',1060,320,220,70), bounce('spring-pad',820,310,145,36,15),
      oneWay(zoneSurfaces[z].medium,590,225,230,58), bounce('cloud-pad',350,245,190,50,14),
      surface(z,'corner',150,150,210,110), surface(z,'long',930,72,320,70),
      prop(z,9,540,445,105,90), prop(z,12,150,75,100,85)
    ]
  },
  {
    name: 'split-routes', difficulty: 3, tags: ['branch','dynamic','recovery'],
    build: z => [
      surface(z,'long',120,620,300,74), surface(z,'step',360,540,180,118),
      moving('moving-lift',590,455,170,46,0,-115,.72), surface(z,'medium',820,370,250,68),
      surface(z,'thick',1050,280,220,120), oneWay(zoneSurfaces[z].medium,850,180,220,58),
      surface(z,'long',1030,72,300,70), bounce('spring-pad',300,610,130,34,14),
      oneWay('rope-bridge',540,690,420,36), oneWay(zoneSurfaces[z].medium,510,325,220,58,-.08),
      rotating('rotating-beam',270,245,230,34,.4), surface(z,'corner',120,150,200,110),
      prop(z,17,1050,185,110,90), prop(z,20,120,75,100,84)
    ]
  },
  {
    name: 'underpass-return', difficulty: 3, tags: ['descent','underpass','traverse','recovery'],
    build: z => [
      surface(z,'long',120,590,300,74), surface(z,'medium',380,680,240,68),
      surface(z,'thick',650,705,230,118), oneWay('plank',860,620,240,36,.1),
      surface(z,'corner',1060,540,210,110), surface(z,'step',840,430,180,118),
      surface(z,'medium',590,350,250,68), oneWay(zoneSurfaces[z].medium,340,270,220,58),
      surface(z,'thick',130,190,210,118), moving('moving-lift',500,135,170,46,170,0,.62),
      surface(z,'long',930,72,320,70), prop(z,0,650,610,110,90), prop(z,3,130,95,105,88)
    ]
  },
  {
    name: 'freeform-finale', difficulty: 4, tags: ['dynamic','bounce','branch','descent','recovery'],
    build: z => [
      surface(z,'long',120,620,300,74), rotating('seesaw',360,650,240,36,.3),
      bounce('spring-pad',560,620,130,34,15), surface(z,'corner',720,500,200,112,{angle:-.08}),
      moving('moving-lift',950,430,170,48,-130,0,.72), surface(z,'step',1080,320,170,115),
      rotating('rotating-beam',830,245,240,34,-.44), bounce('cloud-pad',580,280,185,48,14),
      surface(z,'thick',350,190,200,118), oneWay(zoneSurfaces[z].medium,120,110,210,58),
      surface(z,'long',930,72,320,70), oneWay('rope-bridge',430,705,390,36),
      prop(z,7,720,405,105,88), prop(z,11,350,95,105,88)
    ]
  }
];

export const CHUNKS = ZONES.flatMap(zone => layouts.map((layout, index) => ({
  id: `${zone}-${layout.name}`,
  zone,
  index,
  difficulty: layout.difficulty,
  size: { w: W, h: H },
  entry: { x: 100, y: 620 },
  exits: [{ x: 1040, y: 70, facing: 1 }],
  objects: layout.build(zone),
  progressSensors: [
    { x: 240, y: 560, progress: .25 }, { x: 600, y: 380, progress: .5 }, { x: 940, y: 170, progress: .75 }
  ],
  checkpoint: index === 0 ? { x: 100, y: 540 } : null,
  recoveryBounds: { y: H + 150 },
  tags: layout.tags
})));

export const CHUNK_BY_ID = new Map(CHUNKS.map(chunk => [chunk.id, chunk]));
export const CHUNK_SIZE = { w: W, h: H };
