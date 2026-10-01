const L=(zh,en)=>({'zh-HK':zh,'en-US':en});
const skill=(zh,en,description,english,kind,mechanic,damage,mp,cooldown,range,extra={})=>({name:L(zh,en),description:L(description,english),kind,mechanic,damage,mp,cooldown,range,...extra});
const fighter=(id,zh,en,role,english,rarity,hp,speed,color,skills)=>({id,name:L(zh,en),role:L(role,english),rarity,hp,speed,color,damage:[8,8,14],airDamage:14,skills});
export const EXTRA_FIGHTERS=Object.freeze([
  fighter('golden-retriever-dog','金毛犬','Golden Retriever','接球護衛','Fetch guardian','common',110,215,0xe4b458,[
    skill('接球追獵','Fetch Pursuit','拋出彈力球，來回各命中一次；接回球恢復少量 MP。','Throw a ball that hits on the way out and back. Catch it to regain a little MP.','fetch','projectile',9,20,210,360,{returning:true,catchMp:600,effect:'ball',speed:440}),
    skill('忠犬守護','Loyal Guard','獲得 22 點護盾及短暫加速，適合擋招後追擊。','Gain a 22-point barrier and a brief speed boost for a defensive pursuit.','rally','buff',0,30,420,0,{shield:22,haste:1.2,buffTicks:150,effect:'shield'})]),
  fighter('crescent-rabbit','月芽兔','Crescent Rabbit','月弧游擊','Lunar skirmisher','common',92,270,0xd5b7f7,[
    skill('月牙飛踢','Crescent Kick','沿月牙弧線躍向前方，在落點踢倒近敵。','Leap along a crescent arc and knock down nearby foes at the landing.','moon-kick','leap',20,20,210,200,{height:105,windup:8,duration:42,effect:'crescent'}),
    skill('月光迴旋','Moonwheel','以三圈月光掃擊周圍，最後一圈推開敵人。','Sweep nearby foes with three lunar rings; the last pushes them away.','moonwheel','orbit',6,35,420,135,{pulses:3,period:10,effect:'crescent'})]),
  fighter('bubble-otter','泡泡水獺','Bubble Otter','泡泡陷阱','Bubble trapper','common',98,230,0x67c9d8,[
    skill('泡泡連彈','Bubble Volley','向三條前後路線發射泡泡，命中令敵人短暫減速。','Fire bubbles into three depth lanes, briefly slowing anyone hit.','bubble-volley','projectile',6,20,180,420,{spread:[-32,0,32],slowTicks:90,effect:'bubble',speed:380}),
    skill('泡泡陷阱','Bubble Snare','在前方放置泡泡，敵人踩入後短暫定身；跳躍可避開。','Place a bubble trap ahead. It briefly roots foes who step in; jumping avoids it.','bubble-snare','trap',20,35,420,160,{radius:85,rootTicks:30,life:240,arm:24,effect:'bubble'})]),
  fighter('mossback-turtle','苔背龜','Mossback Turtle','反彈守城','Shell defender','common',120,170,0x82ae74,[
    skill('龜殼反彈','Shell Counter','短暫展開反擊龜殼，抵擋一次攻擊並反彈近敵。','Open a counter shell to block one attack and retaliate against a nearby attacker.','shell-counter','buff',16,20,240,150,{counter:16,shield:8,buffTicks:100,effect:'shield'}),
    skill('苔地圍城','Moss Garden','前方長出苔地，持續擦傷並減慢地面敵人。','Grow moss ahead that repeatedly grazes and slows grounded foes.','moss-garden','field',4,35,450,100,{radius:140,period:30,life:150,slowTicks:70,effect:'leaves'})]),
  fighter('spark-hamster','火花鼠','Spark Hamster','蓄電突襲','Spark raider','common',92,260,0xffb857,[
    skill('火花彈跳','Spark Hop','以低弧跳躍撞擊近敵，落地後短暫加速。','Hop in a low arc into a foe, then accelerate briefly after landing.','spark-hop','leap',16,20,180,180,{height:70,haste:1.3,buffTicks:90,windup:7,duration:36,effect:'electric'}),
    skill('蓄電爆破','Charged Nut','在前方留下蓄電果實，延時放電並擊倒附近敵人。','Leave a charged nut ahead that discharges after a delay and knocks nearby foes down.','charged-nut','blast',26,35,450,145,{radius:110,arm:36,life:80,effect:'electric'})]),
  fighter('leaftail-fox','葉尾狐','Leaftail Fox','葉影誘敵','Leaf trickster','common',95,255,0x77b36e,[
    skill('葉刃回旋','Returning Leaf','葉刃穿過敵人後返回，兩程均可造成傷害。','Send a piercing leaf blade out and back, damaging foes on both passes.','leaf-blade','projectile',10,20,210,400,{returning:true,pierce:true,effect:'leaves',speed:500}),
    skill('葉影替身','Leaf Decoy','向後閃避並留下葉影；追上來的敵人會被葉影反擊。','Dodge backward and leave a leaf decoy that strikes pursuers.','leaf-decoy','retreat',12,35,420,110,{invuln:14,radius:90,arm:25,life:150,effect:'leaves'})]),
  fighter('snowfeather-penguin','雪羽企鵝','Snowfeather Penguin','冰滑控場','Ice slider','rare',105,205,0x92daf6,[
    skill('冰滑突襲','Ice Slide','貼地滑行撞擊，命中後留下短暫冰冷減速。','Slide along the ground, striking and chilling foes into a brief slow.','ice-slide','dash',20,20,210,210,{slowTicks:90,windup:10,effect:'ice'}),
    skill('雪羽風暴','Snowfeather Storm','分兩次發射扇形雪羽，封住前方多條路線。','Release two fans of snow feathers to cover several depth lanes ahead.','snow-storm','projectile',5,35,450,460,{spread:[-48,0,48],volleys:2,interval:10,slowTicks:75,effect:'ice',speed:420,duration:48})]),
  fighter('thunderhorn-goat','雷角羊','Thunderhorn Goat','雷角破陣','Thunder breaker','rare',112,210,0xb1a1ff,[
    skill('雷角連衝','Twin Thunder Ram','分兩段向前頂撞，第二撞帶雷光擊退。','Ram forward in two bursts; the second thunder strike knocks foes away.','thunder-ram','rush',10,25,240,190,{pulses:2,period:12,effect:'electric'}),
    skill('雷雲落擊','Thundercloud','鎖定近敵當下位置，預警後落下一道雷；可走位避開。','Mark a nearby foe’s current position, then drop a telegraphed lightning strike that can be dodged.','thundercloud','target-blast',28,40,480,380,{radius:90,arm:32,life:75,effect:'electric'})]),
  fighter('coral-seal','珊瑚海豹','Coral Seal','潮音支援','Tidal support','rare',108,200,0xf0b7ce,[
    skill('珊瑚音波','Coral Song','發射穿透音波，推開前方敵人。','Send a piercing sound wave that pushes foes away.','coral-song','projectile',17,20,210,480,{pierce:true,knock:10,effect:'wave',speed:460}),
    skill('潮汐療癒','Healing Tide','回復 12 HP，並用潮汐推開身旁敵人。','Restore 12 HP and push nearby enemies back with a tidal pulse.','healing-tide','heal',8,40,540,145,{heal:12,effect:'wave'})]),
  fighter('nezuko-kamado','竈門禰豆子','Nezuko Kamado','血焰連踢','Flame kicker','epic',105,245,0xff79ba,[
    skill('血焰連踢','Flame Kicks','連續三次踢擊，最後一下擊倒並綻放粉紅火焰。','Land three kicks, ending in a knockdown and a pink flame bloom.','flame-kicks','flurry-melee',8,25,240,145,{pulses:3,finisher:12,period:9,effect:'flame'}),
    skill('爆血花火','Blooming Flame','在前方引燃花火，命中後留下三次微弱灼燒。','Ignite a bloom ahead that leaves three small burn ticks on a hit.','blood-bloom','blast',24,40,480,165,{radius:140,arm:24,life:65,burnTicks:90,effect:'flame'})]),
  fighter('dragon-ball-goku','孫悟空','Son Goku','蓄力氣功','Ki channeler','epic',105,240,0x75dfff,[
    skill('龜波氣功','Kamehameha','蓄力後射出持續氣功波；施放期間不能移動。','Charge a sustained ki beam; you cannot move while channeling.','kamehameha','beam',7,35,300,520,{pulses:4,period:8,windup:20,duration:58,depth:32,effect:'ki'}),
    skill('瞬間移動','Instant Transmission','瞬移到近敵身後，短暫閃避並以氣勁追擊。','Teleport behind a nearby foe, briefly evade and follow with a ki strike.','transmission','teleport',14,30,420,300,{invuln:12,effect:'ki'})]),
  fighter('crayon-shin-chan','蠟筆小新','Shin-chan','搞怪旋風','Playful whirlwind','epic',100,230,0xffd467,[
    skill('屁屁旋風','Cheeky Whirl','扭動旋轉三圈，用動感星星推開近敵。','Spin three cheeky circles, pushing nearby foes with playful stars.','cheeky-whirl','orbit',5,25,240,115,{pulses:3,period:9,effect:'stars'}),
    skill('動感光線','Action Beam','射出寬闊但射程較短的動感光線。','Fire a broad action beam with a shorter reach.','action-beam','beam',22,35,420,380,{pulses:1,windup:17,depth:52,effect:'stars'})]),
  fighter('doraemon','多啦A夢','Doraemon','道具機動','Gadget tactician','epic',110,210,0x51c1ef,[
    skill('空氣炮','Air Cannon','快速射出空氣炮，把單一敵人向後推。','Fire a fast air cannon to push one foe back.','air-cannon','projectile',22,25,240,500,{speed:650,knock:12,effect:'wave'}),
    skill('任意門','Anywhere Door','從門中向前換位，出口提供 8 點護盾。','Step through a door to reposition forward and gain an 8-point barrier.','anywhere-door','teleport',0,30,390,220,{shield:8,preferTarget:false,invuln:10,effect:'portal'})]),
  fighter('hello-kitty','Hello Kitty','Hello Kitty','心光護衛','Heart guardian','epic',100,225,0xf594c4,[
    skill('蝴蝶結飛舞','Ribbon Flight','兩條蝴蝶結沿不同路線飛出再返回。','Send two ribbons down different lanes, then let them return.','ribbon-flight','projectile',7,20,210,320,{spread:[-24,24],returning:true,effect:'ribbon',speed:400}),
    skill('友誼心光','Friendship Glow','回復 10 HP，並獲得 12 點心形護盾。','Restore 10 HP and gain a 12-point heart barrier.','friendship-glow','heal',0,40,540,0,{heal:10,shield:12,buffTicks:150,effect:'heart'})]),
  fighter('argentina-number-10','阿根廷10號','Argentina No. 10','盤球巧射','Dribble playmaker','epic',98,260,0x8bdbf7,[
    skill('靈巧盤球','Close Dribble','帶球作三次短衝，近身擦過敵人。','Dribble through three short bursts, grazing nearby defenders.','close-dribble','rush',6,25,240,170,{pulses:3,period:8,effect:'ball'}),
    skill('弧線巧射','Curved Shot','踢出可微調方向的弧線球；走遠或換路線仍可避開。','Kick a gently steering curve ball; distance and lane changes can still evade it.','curved-shot','projectile',24,35,450,500,{seek:true,speed:460,effect:'ball'})]),
  fighter('portugal-number-7','葡萄牙7號','Portugal No. 7','凌空強射','Aerial striker','epic',108,240,0xf9856d,[
    skill('爆發凌空','Aerial Burst','高高躍起，在前方落點作一次凌空重擊。','Leap high and land a heavy aerial strike ahead.','aerial-burst','leap',23,25,240,240,{height:140,windup:9,duration:45,effect:'ball'}),
    skill('強力自由球','Power Free Kick','較長蓄力後射出高速足球，命中強力擊退。','Take a longer windup, then fire a fast football with strong knockback.','power-kick','projectile',29,40,480,660,{windup:24,speed:900,knock:14,effect:'ball'})]),
  fighter('pikachu','比卡超','Pikachu','電速追擊','Electric pursuer','epic',95,265,0xffdc48,[
    skill('電光一閃','Quick Attack','帶電快速衝向前方，起手有短暫閃避。','Dash forward in a flash of electricity with brief startup evasion.','quick-attack','dash',18,20,210,230,{windup:7,invuln:10,effect:'electric'}),
    skill('十萬伏特','Thunderbolt','雷電最多連鎖三名近敵，後續跳躍傷害遞減。','Chain lightning through up to three nearby foes with diminishing damage.','thunderbolt','chain',24,40,480,280,{jumps:3,jumpRange:170,effect:'electric'})]),
  fighter('dragon-ball-frieza','弗利沙','Frieza','精準壓制','Precision tyrant','epic',105,220,0xc690ff,[
    skill('死亡光線','Death Beam','快速發出細長光線，射程遠但路線很窄。','Fire a quick, long beam that covers a very narrow lane.','death-beam','beam',20,25,240,620,{windup:10,depth:14,pulses:1,effect:'cosmic'}),
    skill('帝王能量球','Emperor Orb','緩慢推進的能量球命中後爆開，周圍也受較弱衝擊。','Send a slow orb that explodes on contact, grazing nearby foes.','emperor-orb','projectile',24,40,480,520,{speed:220,splash:130,splashDamage:8,effect:'cosmic'})]),
  fighter('one-piece-luffy','路飛','Monkey D. Luffy','橡膠長拳','Elastic brawler','epic',110,240,0xff8e79,[
    skill('橡膠手槍','Gum-Gum Pistol','伸長拳頭直擊前方，射程長但前後路線窄。','Stretch a fist far forward along a narrow depth lane.','gum-pistol','stretch',20,25,240,320,{depth:25,windup:14,effect:'elastic'}),
    skill('橡膠火箭','Gum-Gum Rocket','鎖定近敵位置，拉伸後沿弧線飛向落點。','Lock a nearby foe’s position and launch along an elastic arc.','gum-rocket','leap',26,35,450,300,{height:75,targeted:true,windup:12,duration:46,effect:'elastic'})]),
  fighter('spy-family-anya','安妮亞','Anya Forger','讀心反制','Telepath trickster','epic',94,245,0xf59bc3,[
    skill('心聲掃描','Mind Scan','掃描附近敵人並標記 4 秒；自己下一次命中附加 3 傷害。','Scan nearby foes for four seconds; your next hit adds three damage.','mind-scan','scan',6,20,240,180,{markTicks:240,effect:'psychic'}),
    skill('預知閃避','Foreseen Counter','短暫預備反擊，讀到近敵攻擊後閃避並反擊。','Prepare a brief counter, evade a nearby attacker and retaliate.','foreseen-counter','buff',12,30,420,150,{counter:12,haste:1.3,shield:6,buffTicks:90,effect:'psychic'})]),
  fighter('one-punch-saitama','埼玉','Saitama','蓄拳終結','Charged finisher','epic',115,210,0xffd359,[
    skill('普通連續拳','Consecutive Punches','快速連續四拳，適合近身連段。','Deliver four quick punches for a close-range combo.','consecutive-punches','flurry-melee',5,25,240,145,{pulses:4,period:7,effect:'impact'}),
    skill('認真一拳','Serious Punch','明顯蓄力後作一次重拳；傷害高但可走位避開。','Wind up visibly for one heavy punch; it hits hard but can be sidestepped.','serious-punch','stretch',38,45,540,190,{depth:42,windup:32,duration:66,down:true,knock:17,effect:'impact'})]),
  fighter('naruto-uzumaki','漩渦鳴人','Naruto Uzumaki','分身追擊','Clone pursuer','epic',102,255,0xffb264,[
    skill('影分身','Shadow Clones','召出兩個短暫分身，輪流攻擊前方近敵。','Create two brief shadow clones that take turns attacking nearby foes ahead.','shadow-clones','clones',4,25,300,120,{clones:2,period:30,life:110,effect:'smoke'}),
    skill('螺旋丸','Rasengan','帶螺旋氣流向前突進，命中擊倒敵人。','Rush forward with swirling chakra and knock your target down.','rasengan','dash',27,40,480,220,{windup:14,effect:'spiral'})]),
]);
