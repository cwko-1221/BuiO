export interface NpcStoryLine {
  zh: string;
  en: string;
}

export interface NpcStoryProfile {
  id: string;
  name: { zh: string; en: string };
  title: { zh: string; en: string };
  accent: string;
  badge: string;
  chapters: readonly (readonly NpcStoryLine[])[];
}

export const NPC_STORIES: Readonly<Record<string, NpcStoryProfile>> = {
  'bear-explorer': {
    id: 'bear-explorer',
    name: { zh: '探險家阿熊', en: 'Barnaby the Explorer' },
    title: { zh: '月灣廣場嚮導', en: 'Crescent Square Guide' },
    accent: '#e09a3e',
    badge: '🧭',
    chapters: [
      [
        {
          zh: '嗨，小夥伴！歡迎來到月灣廣場！我背著這個指南針袋走遍了七座海島，卻還是在這裡停下了腳步。',
          en: 'Hey there, little friend! Welcome to Crescent Square! I crossed seven islands with this satchel, yet this plaza made me stay.',
        },
        {
          zh: '你看中央那座金色月牙噴水池——老水手都說，很久以前有一道月光落在海灣裡，照亮了迷航的小船，居民才把月牙刻成了地標。',
          en: 'See the golden crescent fountain? Old sailors say a moonbeam once guided a lost boat safely home here, so the town carved it in gold.',
        },
        {
          zh: '聽說每當海風吹過水柱、在池面畫出細細的漣漪時，向月牙許個小小的心願，就能遇見意想不到的好運呢！',
          en: 'They say whenever the sea breeze ripples the basin, making a small wish by the crescent brings unexpected good luck!',
        },
        {
          zh: '如果你往東北邊的石階一路爬上去，就能到達翡翠觀星台；那裡的風景可是全島最壯闊的喔！',
          en: 'If you climb the northeast stone stairs, you will reach Jade Observatory—the grandest view on the whole island!',
        },
      ],
      [
        {
          zh: '又見面啦！我剛才在廣場邊數了數，今天天空的雲朵形狀簡直像剛出爐的棉花糖。',
          en: 'Good to see you again! I was just cloud-watching by the plaza—today the clouds look like fresh cotton candy.',
        },
        {
          zh: '島上六個區域都有各自的故事：市集的鼓聲、花圃的風鈴、碼頭的潮聲……有空一定要和每位鄰居聊聊喔！',
          en: 'All six districts have their own stories: market drums, garden windbells, harbor tides... be sure to chat with every neighbor!',
        },
      ],
    ],
  },
  'dock-otter': {
    id: 'dock-otter',
    name: { zh: '水獺阿浪', en: 'Ollie the Otter' },
    title: { zh: '潮光碼頭掌舵手', en: 'Tideglass Dockmaster' },
    accent: '#4aa9cf',
    badge: '⚓',
    chapters: [
      [
        {
          zh: '早安呀！潮光碼頭今天的海風鹹鹹暖暖的，木棧板曬過太陽還會散發淡淡松木香呢！',
          en: 'Ahoy there! The breeze at Tideglass Marina is warm and salty today, and the sunlit planks smell like pine.',
        },
        {
          zh: '你看到港灣裡那幾艘象牙色帆船了嗎？每天漲潮時，船身會隨著浪花輕輕搖晃，像在唱搖籃曲一樣。',
          en: 'See those ivory sailboats bobbing in the cove? Every high tide they sway gently like a lullaby on the waves.',
        },
        {
          zh: '昨天退潮時，我在棧橋柱子底下撿到一枚會反射彩虹光的小貝殼，已經收進腰間的小布袋裡當幸運物啦！',
          en: 'At low tide yesterday, I found a tiny iridescent shell tucked beneath the pier pilings—I keep it in my pouch for luck!',
        },
        {
          zh: '聽說橘帆市集的松鼠童軍最愛聽航海故事，等我巡完這趟碼頭，就帶些海鹽糖去找他換點心！',
          en: 'Squirrel Scout up at Tangerine Market loves sea tales—once my pier patrol is done, I am trading sea-salt candy for snacks!',
        },
      ],
      [
        {
          zh: '嘿嘿，別擔心我會掉進水裡——我可是天生游泳高手，只是這身碼頭圍裙沾濕了可不好曬乾呀！',
          en: 'Hehe, do not worry about me slipping in—I am a born swimmer, though drying this dock apron takes forever!',
        },
        {
          zh: '傍晚的潮水會把天上的雲朵倒映整片海灣，那時候站在棧橋盡頭發呆最舒服了。',
          en: 'At dusk the tide mirrors every cloud across the bay—nothing beats daydreaming at the tip of the pier.',
        },
      ],
    ],
  },
  'squirrel-scout': {
    id: 'squirrel-scout',
    name: { zh: '松鼠小栗', en: 'Pip the Scout' },
    title: { zh: '橘帆市集小隊長', en: 'Tangerine Market Scout' },
    accent: '#e57b4e',
    badge: '🍊',
    chapters: [
      [
        {
          zh: '敬禮！歡迎來到全島最熱鬧的橘帆市集！這裡的柑橘攤車每天清晨都會飄出甜甜的果香喔！',
          en: 'Salute! Welcome to bustling Tangerine Market! Every morning the citrus carts fill the lane with sweet orange scent.',
        },
        {
          zh: '你看到廣場中央石台上那面大鼓了嗎？每逢月圓祭典，大家就會圍著石台敲響節奏，連對岸的松影村都聽得見！',
          en: 'Spot the big drum on the stone stage? On full-moon festivals we beat rhythms loud enough for Pineshade Village to hear!',
        },
        {
          zh: '順帶一提，東邊角落那台復古街機是居民們一起修好的寶貝——不過我的尾巴太蓬鬆，每次玩都差點卡到按鈕呢。',
          en: 'By the way, that retro arcade machine in the corner was restored by the whole town—though my fluffy tail keeps bumping the buttons!',
        },
        {
          zh: '小隊筆記寫著：多跑多跳才會發現藏在巷口的驚喜！祝你在市集逛得開心！',
          en: 'Scout notebook rule #1: keep exploring every alley to find hidden surprises! Have a wonderful time at the market!',
        },
      ],
      [
        {
          zh: '報告！剛才清點完所有花盆和招牌，市集今天一切正常，橘子甜度滿分！',
          en: 'Reporting in! All flower pots and signposts checked—Tangerine Market is shipshape and the oranges are extra sweet!',
        },
        {
          zh: '等一下我打算去風鈴花圃採集落葉標本，聽說小鹿知道哪一棵粉花樹開得最美呢。',
          en: 'Later I am heading to Windbell Gardens for pressed leaves—rumor has it the deer knows the prettiest cherry tree.',
        },
      ],
    ],
  },
  'garden-deer': {
    id: 'garden-deer',
    name: { zh: '花鹿露露', en: 'Lulu the Fawn' },
    title: { zh: '風鈴花圃守護者', en: 'Windbell Gardens Keeper' },
    accent: '#6fb35b',
    badge: '🌼',
    chapters: [
      [
        {
          zh: '輕輕地……你聽見了嗎？海風穿過向日葵花拱時，木頭風鈴會發出清脆溫柔的叮噹聲。',
          en: 'Listen softly... when the coastal breeze slips through the sunflower arch, the wooden bell chimes ever so gently.',
        },
        {
          zh: '這片風鈴花圃種滿了薰衣草、藍繡球和小雛菊。每天清晨，露水會先在石噴泉邊聚成亮晶晶的小水珠。',
          en: 'Windbell Gardens blooms with lavender, blue hydrangea, and daisies. Each dawn, dew gathers like tiny jewels around the stone fountain.',
        },
        {
          zh: '如果你走累了，可以去翡翠涼亭歇一歇——從涼亭望向西邊的拱橋與海灣，就像一幅會動的水彩畫喔。',
          en: 'If your paws get tired, rest in the emerald gazebo—from there, the west stone bridge and cove look like a living watercolor.',
        },
        {
          zh: '謝謝你沒有踩壞花叢！溫柔對待植物的話，花瓣在陽光下都會特別閃亮呢。',
          en: 'Thank you for walking gently around the flower beds! When we care for them kindly, every petal shines brighter in the sun.',
        },
      ],
      [
        {
          zh: '今天的微風帶著紫薰衣草的香氣，連蝴蝶都比平常多飛了兩圈呢。',
          en: 'Today the breeze carries sweet lavender scent—even the butterflies are circling twice as happily.',
        },
        {
          zh: '往南走一小段沙路就能看到寧靜的淺灣，那裡的水面漂著粉色蓮花喔！',
          en: 'Follow the sandy path south and you will discover a quiet lagoon dotted with pink water lilies!',
        },
      ],
    ],
  },
  'hedgehog-scout': {
    id: 'hedgehog-scout',
    name: { zh: '刺蝟阿星', en: 'Bramble the Stargazer' },
    title: { zh: '翡翠觀星台記錄員', en: 'Jade Observatory Chronicler' },
    accent: '#3ba592',
    badge: '🔭',
    chapters: [
      [
        {
          zh: '哇，你真的爬上這麼多層石階來到翡翠觀星台了！先深呼吸一口山頂清爽的海風吧！',
          en: 'Whoa, you climbed all those stone flights up to Jade Observatory! Take a deep breath of that crisp summit breeze!',
        },
        {
          zh: '看見東邊那座金色天球儀了嗎？古時候的島民就是靠它記錄潮汐與星象，才算出最適合出海捕魚和辦慶典的日子。',
          en: 'See that golden orrery to the east? Long ago, islanders tracked tides and constellations with it to pick the best sailing days.',
        },
        {
          zh: '其實我背上的刺看起來尖尖的，但我心裡最喜歡安靜地畫星圖。白天的時候，我就把雲朵的流向記在筆記本裡。',
          en: 'My quills look prickly, I know, but I love quietly sketching star maps—and by day, I chart the drifting clouds instead.',
        },
        {
          zh: '站在這裡往西南邊眺望，可以把整座月灣廣場、雙座拱橋和兩片海灣盡收眼底，是不是很像童話模型呢？',
          en: 'Look southwest from the terrace: Crescent Square, both stone bridges, and both coves spread out like a storybook miniature!',
        },
      ],
      [
        {
          zh: '今天的能見度極佳！剛才透過望遠鏡，我甚至看見碼頭的水獺在幫帆船整理纜繩呢。',
          en: 'Visibility is crystal clear today! Through the dome lens I even spotted Ollie tidying ropes down at the marina.',
        },
        {
          zh: '等夜晚降臨時，月牙形星座會剛好升到圓頂正上方，那可是翡翠觀星台最珍貴的秘密喔。',
          en: 'When night falls, a crescent constellation rises right above the emerald dome—our observatory’s favorite secret.',
        },
      ],
    ],
  },
  'rabbit-mailman': {
    id: 'rabbit-mailman',
    name: { zh: '兔兔郵差阿白', en: 'Clover the Mailman' },
    title: { zh: '松影村飛毛腿信差', en: 'Pineshade Village Postman' },
    accent: '#d0845c',
    badge: '✉️',
    chapters: [
      [
        {
          zh: '叮咚！松影村的每日信件派送中！幸好我這雙長耳朵很靈敏，老遠就聽到你輕快的腳步聲啦！',
          en: 'Ding-dong! Daily mail run in Pineshade Village! Good thing my long ears heard your cheerful footsteps from down the lane!',
        },
        {
          zh: '別看松影村安安靜靜的，每座紅瓦和青綠門小屋之間，天天都有寫滿點心食譜、花園明信片和貝殼畫的信件往來喔。',
          en: 'Pineshade Village looks peaceful, yet every cottage exchanges letters packed with pastry recipes, garden postcards, and shell sketches!',
        },
        {
          zh: '我最喜歡送信經過東邊石橋的時候——橋下海風呼呼吹過，把我的藍郵差帽吹得差點起飛，幸好每次都即時壓住了！',
          en: 'My favorite stretch is crossing the east stone bridge—the sea breeze nearly lifts my blue postman cap every single time!',
        },
        {
          zh: '對了，剛才有一封寫給「最勇敢的小小旅人」的明信片……我想，收件人一定就是正在探索月灣的你吧！',
          en: 'Oh! There was a postcard addressed to "the bravest little traveler"—I am certain it belongs to you!',
        },
      ],
      [
        {
          zh: '呼——剛把最後一疊花籽包裹送進巷尾小屋，趁著太陽暖暖的在村道上散個步！',
          en: 'Phew—just delivered the last bundle of flower seeds down the lane. Time for a sunny stroll through the village!',
        },
        {
          zh: '松影村東邊的海岸步道視野非常棒，沿著柵欄慢慢走就能一直通往東橋喔。',
          en: 'The eastern coastal promenade has lovely sea views and leads straight back up to the east stone bridge.',
        },
      ],
    ],
  },
};

export function getNpcStory(id: string): NpcStoryProfile {
  return (
    NPC_STORIES[id] ?? {
      id,
      name: { zh: '月灣居民', en: 'Moonbay Villager' },
      title: { zh: '海岸小鎮夥伴', en: 'Coastal Neighbor' },
      accent: '#4da398',
      badge: '💬',
      chapters: [
        [
          {
            zh: '你好呀！今天月灣海岸的天氣真好，微風配著藍天白雲，最適合到處散步了！',
            en: 'Hello there! What lovely weather on Moonbay Coast today—blue skies, gentle breeze, perfect for a stroll!',
          },
          {
            zh: '小鎮裡每個角落都藏著不同的風景，祝你和寵物玩得開心喔！',
            en: 'Every corner of town holds a different view—hope you and your pet have a wonderful adventure!',
          },
        ],
      ],
    }
  );
}
