export const WORLD = Object.freeze({ width: 1280, height: 720, pathWidth: 62 });

export const DIFFICULTIES = Object.freeze({
  guardian: { id: 'guardian', name: '守衛', enemyHp: 1, enemySpeed: 1, reward: 1, lives: 20, startingGold: 360, score: 1 },
});

export const QUIZ_RULES = Object.freeze({
  guardian: Object.freeze({ answersPerWave:2, killGoldRate:.06, quizGoldMultiplier:1.65 }),
});

export const MAPS = Object.freeze({
  starport: {
    id: 'starport', chapter: 1, name: '星港迴廊', subtitle: '守住浮空港的最後一枚航行晶核',
    palette: { sky: 0x071b34, ground: 0x123b50, ground2: 0x1b5966, path: 0xc49462, edge: 0xf4d49a, water: 0x0c7893, accent: 0x57e8d2 },
    weather: 'stars', boss: 'leviathan',
    paths: [
      [[-40,120],[160,120],[160,310],[350,310],[350,80],[570,80],[570,470],[760,470],[760,180],[980,180],[980,500],[1160,500],[1160,360],[1280,360]],
      [[-40,610],[130,610],[130,400],[310,400],[310,640],[510,640],[510,350],[700,350],[700,620],[900,620],[900,410],[1080,410],[1080,560],[1190,560],[1190,360],[1280,360]],
    ],
    noBuild: [{ x: 535, y: 250, w: 120, h: 150, kind: 'dock' }, { x: 1010, y: 70, w: 120, h: 110, kind: 'hangar' }],
    decor: [[70,82,'crystal'],[330,550,'crate'],[535,620,'ship'],[790,70,'antenna'],[1040,620,'crystal'],[1210,90,'antenna']],
  },
  moonwood: {
    id: 'moonwood', chapter: 2, name: '月影森徑', subtitle: '古樹根脈正在被虛空孢子侵蝕',
    palette: { sky: 0x11152e, ground: 0x193d3a, ground2: 0x28574a, path: 0x7c6757, edge: 0xb7d79b, water: 0x315b80, accent: 0xa8f06a },
    weather: 'fireflies', boss: 'ancient',
    paths: [
      [[-40,120],[200,120],[200,260],[410,260],[410,90],[650,90],[650,330],[850,330],[850,170],[1070,170],[1070,350],[1280,350]],
      [[-40,570],[170,570],[170,410],[360,410],[360,610],[590,610],[590,470],[760,470],[760,610],[970,610],[970,450],[1120,450],[1120,350],[1280,350]],
      [[940,-40],[940,100],[800,100],[800,255],[615,255],[615,405],[825,405],[825,545],[1040,545],[1040,350],[1280,350]],
    ],
    noBuild: [{ x: 35, y: 240, w: 120, h: 150, kind: 'pond' }, { x: 430, y: 70, w: 120, h: 130, kind: 'tree' }, { x: 1080, y: 520, w: 140, h: 110, kind: 'ruin' }],
    decor: [[80,110,'tree'],[280,210,'mushroom'],[485,145,'tree'],[690,650,'mushroom'],[900,95,'ruin'],[1160,600,'tree']],
  },
  embercore: {
    id: 'embercore', chapter: 3, name: '熔火核心', subtitle: '在鑄星爐爆發前擊退機械軍團',
    palette: { sky: 0x210d1b, ground: 0x3c2028, ground2: 0x5b2d2b, path: 0x77645d, edge: 0xffb45c, water: 0xb83d28, accent: 0xffca56 },
    weather: 'embers', boss: 'colossus',
    paths: [
      [[-40,135],[235,135],[235,315],[455,315],[455,110],[690,110],[690,365],[900,365],[900,185],[1090,185],[1090,350],[1280,350]],
      [[-40,595],[205,595],[205,455],[425,455],[425,625],[650,625],[650,500],[845,500],[845,620],[1045,620],[1045,455],[1160,455],[1160,350],[1280,350]],
    ],
    noBuild: [{ x: 40, y: 550, w: 140, h: 105, kind: 'forge' }, { x: 520, y: 340, w: 90, h: 110, kind: 'lava' }, { x: 1110, y: 500, w: 120, h: 120, kind: 'gear' }],
    decor: [[90,590,'forge'],[340,70,'pipe'],[560,390,'lava'],[740,100,'gear'],[970,650,'pipe'],[1180,560,'gear']],
  },
});

const level = (name, damage, range, cooldown, extra = {}) => ({ name, damage, range, cooldown, ...extra });

export const TOWERS = Object.freeze({
  bolt: {
    id: 'bolt', name: '晶弩塔', role: '高速單體', icon: '✦', color: 0x55e6c1, cost: 95, target: 'both', attack: 'bolt', projectileSpeed: 620,
    description: '高速發射晶片，穩定對付地面與飛行敵人。',
    levels: [level('晶弦',18,150,.54),level('雙晶弦',28,165,.47),level('追星弩',44,180,.40,{crit:.15}),level('天穹連弩',68,198,.32,{crit:.25})],
    upgradeCosts: [85,145,225],
  },
  cannon: {
    id: 'cannon', name: '星梭火箭塔', role: '追蹤爆破', icon: '⬢', color: 0xffa95e, cost: 165, target: 'ground', attack: 'rocket', projectileSpeed: 390,
    description: '發射帶煙尾的追蹤火箭，命中後轟炸密集裝甲群。',
    levels: [level('脈衝彈',46,145,1.38,{splash:58}),level('震盪彈',72,155,1.25,{splash:66}),level('聚變炮',112,170,1.10,{splash:75,armorPierce:5}),level('超新星炮',178,188,.92,{splash:90,armorPierce:10})],
    upgradeCosts: [135,210,315],
  },
  frost: {
    id: 'frost', name: '霜環塔', role: '範圍減速', icon: '❄', color: 0x76c9ff, cost: 135, target: 'both', attack: 'frostField', projectileSpeed: 0,
    description: '在目標周圍綻放雪花霜域，降低整個範圍內敵人的速度。',
    levels: [level('冷凝環',8,138,.82,{slow:.28,slowDuration:1.5,fieldRadius:58}),level('霜脈環',13,150,.72,{slow:.36,slowDuration:1.8,fieldRadius:68}),level('極地環',22,164,.62,{slow:.45,slowDuration:2.2,freezeChance:.08,fieldRadius:80}),level('永冬之眼',34,182,.50,{slow:.55,slowDuration:2.8,freezeChance:.16,fieldRadius:94})],
    upgradeCosts: [110,175,260],
  },
  storm: {
    id: 'storm', name: '雷鏈塔', role: '連鎖攻擊', icon: 'ϟ', color: 0xb78cff, cost: 195, target: 'both', attack: 'chain', projectileSpeed: 0,
    description: '閃電在多個目標之間跳躍，無視部分護甲。',
    levels: [level('電弧',25,150,1.02,{chains:2,chainRange:90,armorPierce:3}),level('分流電弧',38,162,.92,{chains:3,chainRange:100,armorPierce:4}),level('雷暴線圈',61,176,.80,{chains:4,chainRange:112,armorPierce:6}),level('蒼穹雷網',94,195,.65,{chains:6,chainRange:128,armorPierce:9})],
    upgradeCosts: [155,235,345],
  },
  prism: {
    id: 'prism', name: '星芒棱鏡', role: '持續灼燒', icon: '◇', color: 0xff6da8, cost: 230, target: 'both', attack: 'beam', projectileSpeed: 0,
    description: '光束鎖定同一目標會逐步增強，專門擊破首領。',
    levels: [level('聚光',18,178,.22,{ramp:.08,maxRamp:1.8}),level('折射',27,190,.20,{ramp:.10,maxRamp:2.1}),level('耀斑',42,205,.18,{ramp:.13,maxRamp:2.5}),level('恆星之心',63,225,.15,{ramp:.16,maxRamp:3})],
    upgradeCosts: [185,275,400],
  },
  beacon: {
    id: 'beacon', name: '熾焰噴塔', role: '扇形灼燒', icon: '◉', color: 0xffe27a, cost: 180, target: 'ground', attack: 'flame', projectileSpeed: 0,
    description: '持續向前噴射扇形星焰，同時灼燒路線上的整群敵人。',
    levels: [level('星火噴流',7,128,.20,{flameWidth:.48}),level('聚焰噴流',11,140,.18,{flameWidth:.56}),level('日冕洪流',17,154,.16,{flameWidth:.64,armorPierce:3}),level('恆星吐息',26,172,.13,{flameWidth:.74,armorPierce:6})],
    upgradeCosts: [145,220,330],
  },
});

export const ENEMIES = Object.freeze({
  drone: { id:'drone',name:'虛空蟲',hp:72,speed:58,reward:9,lifeDamage:1,armor:0,size:17,color:0xe76f80 },
  runner: { id:'runner',name:'疾行獸',hp:52,speed:102,reward:10,lifeDamage:1,armor:0,size:14,color:0xffb84d },
  guard: { id:'guard',name:'鐵甲衛',hp:230,speed:43,reward:18,lifeDamage:2,armor:7,size:21,color:0x8194aa },
  wisp: { id:'wisp',name:'星蝕飛靈',hp:105,speed:70,reward:14,lifeDamage:1,armor:0,size:15,color:0x87d9ff,air:true },
  medic: { id:'medic',name:'孢子醫師',hp:180,speed:48,reward:24,lifeDamage:2,armor:2,size:19,color:0x6fe39a,ability:'heal' },
  shielder: { id:'shielder',name:'棱盾兵',hp:250,speed:45,reward:25,lifeDamage:2,armor:4,size:21,color:0x8d7aff,shield:130,ability:'shield' },
  splitter: { id:'splitter',name:'裂殖核心',hp:145,speed:60,reward:17,lifeDamage:1,armor:1,size:18,color:0xf276b7,ability:'split' },
  phantom: { id:'phantom',name:'折光潛行者',hp:165,speed:78,reward:22,lifeDamage:2,armor:0,size:18,color:0xc5b8ff,stealth:true },
  shard: { id:'shard',name:'核心碎片',hp:42,speed:92,reward:3,lifeDamage:1,armor:0,size:10,color:0xff9cd2 },
  leviathan: { id:'leviathan',name:'星港巨鯨',hp:4200,speed:29,reward:360,lifeDamage:12,armor:9,size:42,color:0x44cbd1,boss:true,shield:650,ability:'bossPulse' },
  ancient: { id:'ancient',name:'腐化古樹',hp:5100,speed:25,reward:420,lifeDamage:14,armor:11,size:45,color:0x84bd55,boss:true,ability:'heal' },
  colossus: { id:'colossus',name:'熔爐巨像',hp:6200,speed:23,reward:500,lifeDamage:16,armor:15,size:47,color:0xe5643e,boss:true,shield:900,ability:'bossPulse' },
});

export const ABILITIES = Object.freeze({
  meteor: { id:'meteor',name:'晶隕轟擊',icon:'☄',cost:40,cooldown:35,description:'對進度最前方區域造成大量範圍傷害。' },
  stasis: { id:'stasis',name:'時霜停滯',icon:'❅',cost:30,cooldown:42,description:'所有敵人減速 70%，持續 6 秒。' },
  overdrive: { id:'overdrive',name:'全塔超載',icon:'ϟ',cost:50,cooldown:48,description:'所有塔攻速提升 45%，持續 9 秒。' },
});

const WAVES = [
  [['drone',8,.78]],
  [['drone',10,.66],['runner',4,.8]],
  [['runner',10,.50],['drone',8,.55]],
  [['guard',5,1.05],['drone',12,.45]],
  [['wisp',10,.58],['guard',4,.9],['drone',12,.38]],
  [['splitter',8,.72],['runner',12,.38]],
  [['medic',3,1.1],['guard',10,.62],['drone',12,.35]],
  [['shielder',7,.78],['wisp',12,.42]],
  [['phantom',10,.5],['runner',16,.3],['medic',3,.9]],
  [['guard',16,.45],['splitter',12,.38],['wisp',12,.36]],
  [['shielder',10,.52],['medic',5,.7],['runner',22,.24]],
  [['phantom',16,.34],['wisp',18,.30],['guard',12,.42]],
  [['splitter',18,.30],['shielder',12,.42],['medic',6,.60]],
  [['guard',24,.28],['phantom',20,.26],['wisp',22,.24]],
];

export function buildWave(mapId, waveNumber) {
  const map = MAPS[mapId] || MAPS.starport;
  if (waveNumber === 15) return [{ type: map.boss, count: 1, interval: 0, delay: 0 }, { type:'guard',count:18,interval:.34,delay:2.5 }, { type:'wisp',count:16,interval:.30,delay:1.2 }];
  const source = WAVES[Math.max(0, Math.min(WAVES.length - 1, waveNumber - 1))];
  return source.map(([type,count,interval],index) => ({ type, count, interval, delay:index ? 1.1 : 0 }));
}

export function towerStats(tower) {
  const definition = TOWERS[tower.type];
  return definition.levels[Math.max(0, Math.min(definition.levels.length - 1, tower.level - 1))];
}

export function mapPaths(map) {
  if (Array.isArray(map?.paths) && map.paths.length) return map.paths;
  return Array.isArray(map?.path) ? [map.path] : [];
}

export function distanceToPaths(x,y,paths) {
  return Math.min(...paths.map(points=>distanceToPath(x,y,points)));
}

export function pointAlongPath(points, distance) {
  let remaining = Math.max(0, distance);
  for (let index = 0; index < points.length - 1; index++) {
    const [x1,y1] = points[index];
    const [x2,y2] = points[index + 1];
    const length = Math.hypot(x2-x1,y2-y1);
    if (remaining <= length) {
      const ratio = length ? remaining / length : 0;
      return { x:x1+(x2-x1)*ratio, y:y1+(y2-y1)*ratio, angle:Math.atan2(y2-y1,x2-x1), done:false };
    }
    remaining -= length;
  }
  const [x,y] = points.at(-1);
  return { x,y,angle:0,done:true };
}

export function pathLength(points) {
  return points.slice(1).reduce((sum,point,index) => sum + Math.hypot(point[0]-points[index][0],point[1]-points[index][1]),0);
}

export function distanceToPath(x,y,points) {
  let best = Infinity;
  for (let index=0; index<points.length-1; index++) {
    const [ax,ay]=points[index], [bx,by]=points[index+1];
    const dx=bx-ax,dy=by-ay;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
    best=Math.min(best,Math.hypot(x-(ax+dx*t),y-(ay+dy*t)));
  }
  return best;
}
