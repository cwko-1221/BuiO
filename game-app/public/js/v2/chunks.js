import { ZONES, ZONE_ASSET_IDS } from './assets.js';

const W = 1200, H = 760;
const globalMechanics = ['crate','barrel','plank','stone-slab','rope-bridge','trampoline','spring-pad','conveyor','seesaw','rotating-beam','moving-lift','cloud-pad','basketball','beach-ball','balloons','fan','arrow-sign'];

const platform = (assetId, x, y, w, h, extra = {}) => ({ assetId, x, y, w, h, angle: 0, behavior: { type: 'static' }, ...extra });
const moving = (assetId, x, y, w, h, dx, dy, speed = .8) => platform(assetId, x, y, w, h, { behavior: { type: 'move', dx, dy, speed } });
const rotating = (assetId, x, y, w, h, speed = .45) => platform(assetId, x, y, w, h, { behavior: { type: 'rotate', speed } });
const bounce = (assetId, x, y, w, h, power = 14) => platform(assetId, x, y, w, h, { behavior: { type: 'bounce', power } });
const conveyor = (x, y, w, speed = 1.8) => platform('conveyor', x, y, w, 48, { behavior: { type: 'conveyor', speed } });
const oneWay = (assetId, x, y, w, h, angle = 0) => platform(assetId, x, y, w, h, {
  angle,
  bodyOverride: { type: Math.abs([...assetId].reduce((n,c)=>n+c.charCodeAt(0),0)) % 3 ? 'trapezoid' : 'polygon', oneWay: true, material: 'solid' }
});

function themed(zone, index) {
  const ids = ZONE_ASSET_IDS[zone];
  return ids[index % ids.length];
}

const layouts = [
  {
    name: 'gentle-start', difficulty: 1, tags: ['traverse','recovery','grounded','easy'],
    build: z => [
      platform('castle-brick-long',110,660,360,70), platform('castle-brick-long',430,660,360,70), platform('castle-brick-long',750,660,360,70),
      platform('castle-brick-corner',1010,610,340,120), platform('castle-brick-medium',800,485,320,100),
      platform('castle-brick-step',570,425,300,150), platform('castle-brick-long',760,255,320,90),
      platform('castle-brick-medium',970,160,320,100), platform('castle-brick-long',1040,70,280,80),
      platform('castle-brick-thick',300,735,230,120)
    ]
  },
  {
    name: 'down-and-around', difficulty: 2, tags: ['descent','underpass','recovery','traverse'],
    build: z => [
      platform(themed(z,8),110,570,220,78), oneWay(themed(z,9),330,650,180,54),
      oneWay(themed(z,10),560,700,180,54,.08), platform(themed(z,11),810,620,250,94),
      oneWay(themed(z,12),1010,500,160,52), platform(themed(z,13),790,390,180,96),
      oneWay(themed(z,14),520,310,190,50,-.08), platform(themed(z,15),270,210,220,92),
      oneWay(themed(z,16),570,120,180,50), oneWay(themed(z,17),950,70,210,54)
    ]
  },
  {
    name: 'long-traverse', difficulty: 2, tags: ['traverse','branch','recovery'],
    build: z => [
      platform(themed(z,18),90,620,190,100), conveyor(300,560,260,1.7),
      platform(themed(z,19),600,520,170,120), oneWay(themed(z,20),820,470,210,58,.1),
      platform(themed(z,21),1040,390,210,110), oneWay('rope-bridge',680,310,410,36),
      platform(themed(z,22),350,250,210,104), oneWay(themed(z,23),100,160,170,56),
      oneWay(themed(z,0),420,95,190,54), oneWay(themed(z,1),930,75,240,56),
      oneWay('crate',470,690,160,50), oneWay('barrel',770,690,150,56)
    ]
  },
  {
    name: 'moving-machines', difficulty: 3, tags: ['dynamic','traverse','recovery'],
    build: z => [
      platform(themed(z,2),100,620,190,90), moving('moving-lift',330,560,170,48,180,0,.75),
      rotating('rotating-beam',600,480,250,34,.5), moving(themed(z,3),880,410,170,68,0,-150,.65),
      platform(themed(z,4),1030,300,200,100), rotating('seesaw',760,250,260,38,-.38),
      moving(themed(z,5),460,180,170,64,-150,0,.8), platform(themed(z,6),180,100,210,96),
      oneWay(themed(z,7),930,70,220,52), oneWay('stone-slab',450,690,280,48)
    ]
  },
  {
    name: 'bounce-chain', difficulty: 3, tags: ['bounce','descent','recovery'],
    build: z => [
      platform(themed(z,8),100,620,210,90), bounce('trampoline',330,675,150,38,15),
      platform(themed(z,9),530,520,130,105), bounce('basketball',720,570,92,92,13),
      bounce('beach-ball',910,500,112,112,14), platform(themed(z,10),1080,380,170,100),
      bounce('spring-pad',850,350,130,34,16), oneWay(themed(z,11),620,210,180,56),
      bounce('cloud-pad',390,240,180,48,14), platform(themed(z,12),190,120,190,98),
      oneWay(themed(z,13),930,70,220,54), oneWay('crate',560,700,180,50)
    ]
  },
  {
    name: 'split-routes', difficulty: 3, tags: ['branch','dynamic','recovery'],
    build: z => [
      platform(themed(z,14),100,620,220,94), oneWay(themed(z,15),320,520,170,52),
      moving('moving-lift',540,430,150,46,0,-130,.85), oneWay(themed(z,16),780,350,190,54),
      platform(themed(z,17),1040,270,220,100), oneWay(themed(z,18),850,170,170,52),
      oneWay(themed(z,19),1040,75,200,52), bounce('spring-pad',300,610,120,32,15),
      oneWay(themed(z,20),470,330,160,48,-.1), rotating('rotating-beam',260,230,220,32,.45),
      platform(themed(z,21),100,120,180,90), oneWay('rope-bridge',540,690,440,34)
    ]
  },
  {
    name: 'underpass-return', difficulty: 3, tags: ['descent','underpass','traverse','recovery'],
    build: z => [
      platform(themed(z,22),100,590,210,92), oneWay(themed(z,23),330,670,170,54),
      platform(themed(z,0),570,705,210,90), oneWay('plank',790,610,220,34,.12),
      platform(themed(z,1),1040,540,220,96), oneWay(themed(z,2),820,420,170,52),
      platform(themed(z,3),580,330,210,100), oneWay(themed(z,4),320,245,170,52),
      platform(themed(z,5),100,160,190,94), moving('moving-lift',500,125,150,44,180,0,.7),
      oneWay(themed(z,6),930,70,230,54)
    ]
  },
  {
    name: 'freeform-finale', difficulty: 4, tags: ['dynamic','bounce','branch','descent','recovery'],
    build: z => [
      platform(themed(z,7),100,620,210,100), rotating('seesaw',330,650,230,36,.32),
      bounce('spring-pad',530,620,120,34,15), platform(themed(z,8),700,490,180,118,{angle:-.1}),
      moving(themed(z,9),940,430,160,62,-140,0,.8), oneWay(themed(z,10),1070,310,170,52),
      rotating('rotating-beam',820,240,240,32,-.5), bounce('cloud-pad',570,280,170,46,14),
      platform(themed(z,11),350,180,180,105), oneWay(themed(z,12),100,100,180,52),
      oneWay(themed(z,13),930,70,220,54), oneWay('rope-bridge',420,705,390,34)
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
