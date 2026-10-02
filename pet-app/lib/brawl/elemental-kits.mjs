const L=(zh,en)=>({'zh-HK':zh,'en-US':en});
const k=(zh,en,description,english,kind,mechanic,damage,mp,cooldown,range,extra={})=>({name:L(zh,en),description:L(description,english),kind,mechanic,damage,mp,cooldown,range,...extra});
// Each pair has a distinct tactical purpose. Guest kits stay outside the released roster.
export const ELEMENTAL_KITS={
  'cloud-ear-dog':[
    k('裂空風刃','Gale Blades','三道穿透風刃分路飛出，可在遠處打斷敵陣。','Three piercing air blades travel in separate lanes.','gale-blades','projectile',8,20,210,600,{spread:[-30,0,30],pierce:true,speed:610,element:'wind',effect:'wind',size:36}),
    k('龍捲風眼','Cyclone Eye','召出移動的龍捲風，吸引附近敵人並連續吹擊。','Send a moving cyclone that pulls nearby foes into repeated gusts.','cyclone-eye','tornado',5,38,480,240,{radius:115,life:150,period:24,speed:95,pull:2.5,element:'wind',effect:'wind'})],
  'pudding-pig':[
    k('裂地震波','Seismic Fault','重踏地面，依次掀起四段岩脊；跳起可避開。','Raise four successive stone ridges; jump to evade.','seismic-fault','fissure',11,24,240,420,{columns:4,gap:90,interval:9,radius:66,arm:18,life:85,element:'earth',effect:'earth'}),
    k('泥漿砲彈','Mud Mortar','高拋泥漿砲彈，落地爆開並留下減速泥沼。','Lob a mud shell that explodes and leaves a slowing mire.','mud-mortar','lob',20,36,450,320,{flight:38,height:170,radius:110,life:150,period:35,fieldDamage:2,slowTicks:90,element:'earth',effect:'mud',size:44})],
  'golden-retriever-dog':[
    k('彈力追獵','Ricochet Fetch','追獵球彈向第二名敵人再返回；接回補充 MP。','A ball ricochets to a second foe, then returns; catching restores MP.','fetch','projectile',10,20,210,440,{returning:true,ricochets:1,catchMp:600,effect:'ball',element:'physical',speed:500,size:32}),
    k('金光守護','Golden Aegis','金色護盾反射迎面飛彈；盾破後反射停止。','A golden barrier reflects incoming projectiles until it breaks.','rally','buff',0,32,450,0,{shield:24,reflect:true,haste:1.15,buffTicks:150,effect:'shield',element:'light'})],
  'crescent-rabbit':[
    k('月牙光輪','Crescent Disc','巨大月牙穿透敵人，再沿原路返回。','A broad crescent disc pierces foes and returns.','moon-disc','projectile',10,22,210,510,{returning:true,pierce:true,size:48,speed:540,effect:'crescent',element:'lunar'}),
    k('月落星雨','Moonfall Rain','近敵周圍留下三個月印，依次落下星光；可走位躲開。','Mark three positions around a foe, then drop successive moon meteors.','moonfall','rain',12,38,480,420,{columns:3,gap:70,interval:12,radius:68,arm:32,life:100,effect:'lunar',element:'lunar'})],
  'bubble-otter':[
    k('泡泡連彈','Bubble Volley','三路大型水泡令敵人濕身及減速，適合配合雷電。','Three lanes of bubbles soak and slow foes, setting up lightning.','bubble-volley','projectile',7,20,180,470,{spread:[-36,0,36],slowTicks:90,wetTicks:180,effect:'bubble',element:'water',speed:380,size:35}),
    k('泡泡牢籠','Bubble Prison','布置巨大泡泡陷阱，踩入者被禁錮；空中敵人不觸發。','Lay a bubble prison that roots grounded foes; jump over it.','bubble-snare','trap',18,35,420,190,{radius:92,rootTicks:48,wetTicks:180,life:240,arm:24,effect:'bubble',element:'water'})],
  'mossback-turtle':[
    k('龜殼反彈','Shell Counter','巨型龜殼護陣抵擋一次近身攻擊並反擊。','A giant shell ward blocks and counters one close attack.','shell-counter','buff',16,20,240,150,{counter:16,shield:10,buffTicks:100,effect:'shield',element:'earth'}),
    k('藤根圍城','Root Fortress','大片藤根纏住並侵蝕地面敵人；跳起可穿過。','A root garden snares and wears down grounded foes; jump to bypass.','moss-garden','field',4,36,480,160,{radius:155,period:36,life:180,slowTicks:70,rootTicks:18,effect:'leaves',element:'nature'})],
  'spark-hamster':[
    k('烈焰噴吐','Flame Breath','持續噴出擴大的火焰，命中後灼燒；施放時不能移動。','Channel a widening flame plume that burns foes while stationary.','flame-breath','flamethrower',6,28,270,370,{pulses:5,period:10,windup:18,duration:83,depth:56,burnTicks:90,effect:'flame',element:'fire'}),
    k('爆炎果實','Blazing Nut','高拋燃燒果實，炸開後留下短暫火海。','Lob a blazing nut that explodes and leaves a fire patch.','blazing-nut','lob',20,38,480,340,{flight:36,height:190,radius:105,life:140,period:35,fieldDamage:3,burnTicks:90,effect:'flame',element:'fire',size:40})],
  'leaftail-fox':[
    k('葉刃回旋','Returning Leaves','兩片葉刃分路穿透敵人後返回。','Two leaf blades pierce separate lanes before returning.','leaf-blade','projectile',8,22,210,490,{spread:[-20,20],returning:true,pierce:true,effect:'leaves',element:'nature',speed:510,size:34}),
    k('森羅葉暴','Leaf Tempest','綠色葉龍捲牽引敵人，並削弱移動速度。','A leaf tornado draws foes inward and slows movement.','leaf-tempest','tornado',5,38,480,230,{radius:130,life:155,period:27,speed:65,pull:2,slowTicks:55,effect:'leaves',element:'nature'})],
  'snowfeather-penguin':[
    k('冰柱長城','Glacial Wall','五根巨大冰柱依次冒出，命中短暫冰封；有地面預警。','Five giant ice columns erupt after warnings and briefly freeze foes.','glacial-wall','fissure',10,27,270,440,{columns:5,gap:76,interval:10,radius:58,arm:24,life:110,freezeTicks:28,slowTicks:100,effect:'ice',element:'ice'}),
    k('極地暴風雪','Polar Blizzard','暴風雪緩慢前進，反覆降下冰晶；連續受寒會冰封。','A moving blizzard drops ice shards; repeated chill freezes foes.','polar-blizzard','tornado',5,42,510,280,{radius:150,life:160,period:30,speed:55,slowTicks:100,effect:'ice',element:'ice'})],
  'thunderhorn-goat':[
    k('雷角連鎖','Horn Lightning','雷電跳至最多三個近敵，濕身目標受額外電擊。','Lightning jumps through three foes; soaked targets take an extra shock.','horn-lightning','chain',18,25,240,380,{jumps:3,jumpRange:230,shockTicks:18,effect:'electric',element:'lightning'}),
    k('天雷審判','Storm Verdict','鎖定位置並預警，三道巨雷依次落下；可走位避開。','Telegraph a marked position, then drop three giant lightning strikes.','storm-verdict','rain',17,42,510,450,{columns:3,gap:82,interval:10,radius:75,arm:35,life:100,shockTicks:24,effect:'electric',element:'lightning'})],
  'coral-seal':[
    k('洶湧巨浪','Tidal Bore','寬闊巨浪穿透並擊退前方敵人，同時使其濕身。','A broad tidal wave pierces, pushes and soaks foes.','tidal-bore','wave',18,25,240,600,{speed:340,pierce:true,depth:62,size:95,knock:13,wetTicks:180,effect:'wave',element:'water'}),
    k('珊瑚潮池','Coral Sanctuary','治療潮池分段回復最多 12 HP，並減慢池內敵人。','A coral pool heals up to 12 HP over time and slows enemies inside.','coral-pool','sanctuary',0,40,540,0,{heal:3,radius:145,period:45,life:181,slowTicks:40,effect:'wave',element:'water'})],
  'nezuko-kamado':[
    k('血焰噴流','Bloodflame Torrent','向前噴出粉紅血焰，持續灼燒多條路線。','Channel pink bloodflame across several depth lanes.','bloodflame-torrent','flamethrower',6,30,270,400,{pulses:5,period:10,windup:18,duration:83,depth:60,burnTicks:120,effect:'bloodflame',element:'fire'}),
    k('爆血花火','Exploding Blood','三朵血焰花在近敵周圍延時爆開，形成火焰封鎖。','Three bloodflame blooms detonate around a foe after warnings.','blood-bloom','rain',15,42,510,400,{columns:3,gap:75,interval:12,radius:100,arm:30,life:105,burnTicks:90,effect:'bloodflame',element:'fire'})],
  'dragon-ball-goku':[
    k('龜波氣功','Kamehameha','先聚氣，再放出粗大持續氣功波，穿透遠處敵陣；不能邊走邊放。','Gather ki, then unleash a massive sustained beam through distant formations while stationary.','kamehameha','beam',6,40,360,760,{pulses:6,period:10,windup:32,duration:106,depth:64,beamWidth:150,knock:4,effect:'ki',element:'ki'}),
    k('元氣玉','Spirit Bomb','高舉巨大能量球，緩慢拋出，命中後大範圍炸開。','Raise a giant energy sphere, launch it slowly and explode over a wide area.','spirit-bomb','projectile',28,48,600,650,{windup:38,duration:64,speed:230,size:90,depth:65,splash:190,splashDamage:10,orb:true,effect:'ki',element:'ki'})],
  'crayon-shin-chan':[
    k('屁屁龍捲風','Cheeky Cyclone','彩色星星龍捲將敵人吸進搞怪風暴。','A colorful star cyclone pulls foes into a playful storm.','cheeky-cyclone','tornado',5,28,270,210,{radius:130,life:140,period:24,speed:85,pull:2.4,effect:'stars',element:'wind'}),
    k('動感光線','Action Beam','寬闊金色光束以三段星光重擊前方敵人。','A broad golden beam strikes in three bursts of star energy.','action-beam','beam',10,40,450,560,{pulses:3,period:10,windup:24,duration:65,depth:56,beamWidth:125,effect:'stars',element:'light'})],
  'doraemon':[
    k('空氣炮','Air Cannon','巨大的壓縮空氣球擊退目標，並震開周圍。','A compressed-air sphere knocks back its target and bursts outward.','air-cannon','projectile',23,25,240,580,{speed:650,knock:15,size:55,splash:90,splashDamage:5,effect:'wind',element:'wind'}),
    k('任意門砲陣','Anywhere Barrage','前方開啟任意門，從出口分三次射出空氣砲。','Open a door ahead that fires three air-cannon bursts.','anywhere-barrage','barrage',9,40,480,260,{volleys:3,period:18,arm:22,life:100,radius:75,shotRange:420,speed:620,size:38,effect:'portal',element:'wind'})],
  'hello-kitty':[
    k('蝴蝶結飛舞','Ribbon Flight','三條蝴蝶結分路飛出再返回，帶出心形光點。','Three ribbons travel along separate lanes and back with heart glints.','ribbon-flight','projectile',7,22,210,450,{spread:[-34,0,34],returning:true,pierce:true,effect:'ribbon',element:'light',speed:440,size:35}),
    k('友誼心光','Friendship Sanctuary','心光結界持續回復最多 12 HP，並獲得 12 點護盾。','A heart sanctuary restores up to 12 HP over time and grants a 12-point shield.','friendship-glow','sanctuary',0,42,540,0,{heal:3,shield:12,buffTicks:160,radius:145,period:45,life:181,effect:'heart',element:'light'})],
  'argentina-number-10':[
    k('連環盤球','Orbit Dribble','足球繞身四圈，從不同角度擦過敵人，最後踢開。','Orbit the ball four times around defenders before a final kick.','orbit-dribble','orbit',6,25,240,170,{pulses:4,period:9,finisher:10,effect:'ball',element:'physical'}),
    k('弧線巧射','Curved Shot','高速弧線球緩緩轉彎；換路線仍可閃避。','A fast curve ball steers gently and can be dodged by changing lanes.','curved-shot','projectile',25,36,450,650,{seek:true,speed:570,size:36,effect:'ball',element:'physical'})],
  'portugal-number-7':[
    k('凌空倒掛','Bicycle Cannon','躍起倒掛射球，在前方落點轟出衝擊波。','Leap into a bicycle kick that blasts the marked landing point.','bicycle-cannon','sky-shot',24,28,270,290,{height:145,windup:8,duration:52,radius:100,effect:'ball',element:'physical'}),
    k('強力自由球','Power Free Kick','明顯蓄力後射出帶火尾的足球，穿透並擊退敵人。','Wind up, then fire a blazing-tailed football that pierces and knocks foes back.','power-kick','projectile',28,42,480,720,{windup:28,duration:50,speed:940,knock:15,pierce:true,size:43,effect:'power-ball',element:'physical'})],
  'pikachu':[
    k('電球','Electro Ball','追蹤電球命中後放出電弧，濕身目標受額外電擊。','A gently homing electric orb arcs on impact and shocks soaked foes harder.','electro-ball','projectile',20,24,240,540,{seek:true,speed:420,size:52,splash:90,splashDamage:5,shockTicks:18,effect:'electric',element:'lightning'}),
    k('十萬伏特','Thunderbolt','前方四道巨雷覆蓋相鄰路線。','Four giant lightning bolts cover neighboring depth lanes.','thunderbolt','rain',13,42,510,350,{columns:4,gap:60,interval:9,radius:78,arm:27,life:110,shockTicks:24,effect:'electric',element:'lightning'})],
  'dragon-ball-frieza':[
    k('死亡光線','Death Beam','精準紫紅光束射程遠，但可換路線避開。','A precise long violet-red ray can be dodged by changing lanes.','death-beam','beam',23,26,240,800,{windup:12,duration:32,depth:18,beamWidth:38,pulses:1,effect:'cosmic',element:'ki'}),
    k('帝王能量球','Emperor Orb','巨大紫色能量球慢速推進，爆炸後留下短暫引力場。','A giant violet orb advances slowly and explodes into a gravity well.','emperor-orb','projectile',26,45,570,600,{speed:210,size:85,splash:170,splashDamage:8,impactField:true,radius:145,life:105,period:35,fieldDamage:2,pull:1.5,effect:'cosmic',element:'ki'})],
  'one-piece-luffy':[
    k('橡膠手槍','Gum-Gum Pistol','拳頭拉長至遠處，收回時留下橡膠殘影。','Stretch a fist across the arena, leaving an elastic afterimage.','gum-pistol','stretch',23,25,240,450,{depth:35,windup:18,beamWidth:48,effect:'elastic',element:'physical'}),
    k('橡膠機關槍','Gum-Gum Gatling','原地連發六記伸縮長拳，打擊前方寬闊路線。','Fire six stretching punches across a broad forward lane while stationary.','gum-gatling','stretch',5,40,480,390,{pulses:6,period:7,windup:20,duration:70,depth:52,beamWidth:50,effect:'elastic',element:'physical'})],
  'spy-family-anya':[
    k('心聲掃描','Mind Scan','大型讀心波標記近敵 4 秒；下一次命中附加 3 傷害。','A telepathic pulse marks nearby foes; your next hit adds three damage.','mind-scan','scan',6,22,240,250,{markTicks:240,effect:'psychic',element:'psychic'}),
    k('預知結界','Foreseen Ward','讀心護盾反射飛彈，並反擊一次近身攻擊。','A telepathic shield reflects projectiles and counters one close attack.','foreseen-counter','buff',12,35,450,170,{counter:12,reflect:true,haste:1.2,shield:16,buffTicks:130,effect:'psychic',element:'psychic'})],
  'one-punch-saitama':[
    k('普通連續拳','Consecutive Punches','四記拳壓化成高速衝擊彈，擊中遠處敵人。','Four punches launch fast pressure projectiles at distant foes.','consecutive-punches','projectile',7,28,270,440,{volleys:4,interval:7,windup:12,duration:55,speed:800,size:40,effect:'impact',element:'physical'}),
    k('認真一拳','Serious Punch','長時間蓄力後釋放巨大擴散拳壓波，擊倒整條路線。','After a long charge, launch an immense pressure wave that knocks down a whole lane.','serious-punch','wave',38,48,570,800,{depth:80,size:125,windup:36,duration:66,speed:650,pierce:true,down:true,knock:17,effect:'impact',element:'physical'})],
  'naruto-uzumaki':[
    k('多重影分身','Shadow Clone Squad','三個影分身在不同路線現身，交錯攻擊敵陣。','Three shadow clones appear in separate lanes and strike in alternating bursts.','shadow-clones','clones',5,30,360,155,{clones:3,period:32,life:140,effect:'smoke',element:'chakra'}),
    k('螺旋丸','Rasengan','手掌聚起螺旋球再推進；命中後連續捲擊，最後炸開擊倒。','Gather a swirling sphere in your palm, advance, grind a caught foe, then detonate.','rasengan','rasengan',5,42,510,300,{windup:24,duration:84,finisher:18,pulses:3,period:9,size:62,effect:'spiral',element:'chakra'})]
};

export const ELEMENTAL_ROLES={
  'cloud-ear-dog':L('風刃龍捲','Gale caster'),'pudding-pig':L('裂地泥砲','Earth artillery'),
  'golden-retriever-dog':L('彈射護衛','Ricochet guardian'),'crescent-rabbit':L('月光星術','Lunar caster'),
  'bubble-otter':L('水泡禁錮','Bubble jailer'),'mossback-turtle':L('大地守城','Earth sentinel'),
  'spark-hamster':L('爆炎煉金','Flame alchemist'),'leaftail-fox':L('森林風暴','Forest stormcaller'),
  'snowfeather-penguin':L('冰雪封路','Glacial controller'),'thunderhorn-goat':L('雷雲術士','Storm sorcerer'),
  'coral-seal':L('潮汐支援','Tidal guardian'),'dragon-ball-goku':L('巨型氣功','Ki powerhouse'),
  'naruto-uzumaki':L('分身螺旋','Clone vortex'),'doraemon':L('空間砲陣','Portal artillery'),
  'nezuko-kamado':L('血焰術士','Bloodflame caster'),'pikachu':L('電球雷暴','Electric storm'),
  'one-punch-saitama':L('拳壓風暴','Pressure striker')
};
