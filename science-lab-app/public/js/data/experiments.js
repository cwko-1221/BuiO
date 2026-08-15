export const TOPICS = ['生命與健康', '物質', '環境', '能量', '力與運動'];

export const experiments = [
  {
    id: 'transmission', number: 1, topic: '生命與健康', grades: '小四', minutes: 10,
    title: '看不見的傳播路線', englishTitle: 'Invisible Trail', color: '#72d6b4', icon: 'hands',
    question: '只用清水沖手，能把模擬污染物完全清除嗎？',
    objective: '以安全示蹤物比較洗手步驟，認識接觸傳播和模型限制。',
    apparatus: ['示蹤乳液', '梘液', '洗手盤', '紫外光檢查燈'],
    curriculum: { items: '#2', codes: ['4LA1'] },
    safety: '畫面中的發光點只是安全示蹤模型，不是真正病原體；不要以此推斷所有傳染病的途徑。',
    modelNote: '發光點代表模擬污染物；真實微生物大小、種類和傳播方式各有不同。',
    prediction: {
      prompt: '哪一個步驟最能清除藏在指縫和指尖的示蹤物？',
      options: ['只用清水快速沖洗', '用梘液仔細搓洗再沖水', '用紙巾抹一次'],
      answer: 1,
    },
    steps: [
      { verb: '加入', title: '塗上安全示蹤乳液', instruction: '把示蹤瓶拖到雙手模型上。', cue: '拖動紫色瓶到雙手', hint: '示蹤物會令「看不見的路線」可視化。', action: { type: 'pour', subject: 'tracer', target: 'hands' }, observation: '普通光下看似乾淨，但 UV 檢查會顯示許多發光點。' },
      { verb: '加入', title: '使用梘液', instruction: '把梘液泵拖到雙手上，加入適量梘液。', cue: '拖動綠色梘液瓶', hint: '梘液配合摩擦和沖洗才有效。', action: { type: 'pour', subject: 'soap', target: 'hands' }, observation: '梘液已覆蓋手掌，還要搓洗難到的位置。' },
      { verb: '搓洗', title: '仔細搓洗雙手', instruction: '按住雙手並畫圓，完成掌心、手背、指縫、拇指和指尖。', cue: '在雙手上畫圓圈', hint: '持續畫圓，進度環完成便可。', action: { type: 'stir', subject: 'hands', amount: 2.4 }, observation: '摩擦把示蹤物從指縫和指尖帶離皮膚表面。' },
      { verb: '沖洗', title: '以清水沖走泡沫', instruction: '把雙手拖到水龍頭下。', cue: '拖動雙手到流動的水', hint: '沖洗把鬆開的示蹤物和梘液帶走。', action: { type: 'place', subject: 'hands', target: 'water' }, observation: '大部分泡沫和示蹤物被水帶走。' },
      { verb: '檢查', title: '打開 UV 檢查燈', instruction: '按下紫外光檢查燈，比較洗手前後。', cue: '點按紫色檢查燈', hint: '發光越少，代表殘留的示蹤物越少。', action: { type: 'tap', subject: 'uv-lamp' }, observation: '殘留面積明顯下降，但指甲邊仍有少量發光點。' },
    ],
    result: {
      title: '你截斷了模擬傳播路線！',
      observation: '用梘液搓洗並沖水後，UV 模式下大部分模擬示蹤物消失，只在指甲邊留下少量光點。',
      explanation: '示蹤物令接觸轉移可見。梘液、摩擦和沖洗共同清除污染物；它只是模型，不能代表所有病原體或所有傳播途徑。',
    },
  },
  {
    id: 'density-column', number: 2, topic: '物質', grades: '小三至小六', minutes: 10,
    title: '密度彩虹塔', englishTitle: 'Density Tower', color: '#9b83ee', icon: 'density',
    question: '液體分層是因為顏色、質量，還是密度不同？',
    objective: '比較液體和固體的密度，以相對密度預測分層與浮沉。',
    apparatus: ['密度柱', '塑膠量杯', '蜂蜜', '水', '油', '軟木與玻璃珠'],
    curriculum: { items: '#19、#27', codes: ['3MA2', '6MA1', '6MA2'] },
    safety: '模擬液體不可飲用；真實活動若有灑漏要立即通知老師並清理。',
    modelNote: '液體顏色為方便辨認而加上；顏色本身不會決定密度。蜂蜜與水可逐漸混合，本模型只呈現輕放後的短時間觀察。',
    prediction: {
      prompt: '把相同體積的蜂蜜、水和油放在一起，哪一種會在最底？',
      options: ['蜂蜜', '水', '油'],
      answer: 0,
    },
    steps: [
      { verb: '倒入', title: '先加入蜂蜜', instruction: '把蜂蜜瓶拖到量筒上方。', cue: '拖動金色蜂蜜瓶', hint: '蜂蜜在三種液體中密度最大。', action: { type: 'pour', subject: 'honey', target: 'column' }, observation: '蜂蜜形成最底的一層。' },
      { verb: '倒入', title: '沿杯壁加入水', instruction: '把藍色水瓶拖到量筒上方。', cue: '拖動水瓶並慢慢倒入', hint: '輕輕倒入可減少暫時混合。', action: { type: 'pour', subject: 'water', target: 'column' }, observation: '水停在蜂蜜上方，形成第二層。' },
      { verb: '倒入', title: '加入食用油', instruction: '把黃色油瓶拖到量筒上方。', cue: '拖動油瓶到量筒', hint: '油的密度比水小。', action: { type: 'pour', subject: 'oil', target: 'column' }, observation: '油浮在水面，三層液體沒有按顏色排列。' },
      { verb: '投入', title: '測試軟木', instruction: '把軟木拖進密度柱。', cue: '拖動輕巧的軟木', hint: '比較軟木與最上層油的密度。', action: { type: 'place', subject: 'cork', target: 'column' }, observation: '軟木浮在油面，代表它的平均密度比油還小。' },
      { verb: '投入', title: '測試玻璃珠', instruction: '把玻璃珠拖進密度柱。', cue: '拖動閃亮玻璃珠', hint: '玻璃珠的密度比三種液體都大。', action: { type: 'place', subject: 'bead', target: 'column' }, observation: '玻璃珠穿過所有液層並沉到底部。' },
    ],
    result: {
      title: '你建成了短時間分層的密度塔！',
      observation: '液體由下至上是蜂蜜、水、油；軟木浮面，玻璃珠沉底。',
      explanation: '密度是單位體積內的質量。液體的浮力向上作用；物件相對周圍液體的平均密度影響浮沉。蜂蜜與水可隨時間混合，所以分層不是永久不變。',
    },
  },
  {
    id: 'water-filter', number: 3, topic: '環境', grades: '小三', minutes: 11,
    title: '清澈不等於安全', englishTitle: 'Filter Challenge', color: '#58bce5', icon: 'filter',
    question: '濾過後看起來清澈的水，可以直接飲用嗎？',
    objective: '按粒子大小設計濾水層，分辨清澈度與飲用安全。',
    apparatus: ['濾斗與支架', '棉層', '細沙', '碎石', '泥水', '濁度檢測器'],
    curriculum: { items: '#23、#56', codes: ['3MA4', '3EA2'] },
    safety: '所有水樣都標示「不可飲用」；實物活動也不可品嘗濾過水。',
    modelNote: '濁度只反映懸浮粒子，不能證明沒有溶解物或微生物。',
    prediction: {
      prompt: '泥水經砂石和棉層過濾後看起來清澈，最安全的下一步是甚麼？',
      options: ['直接飲用', '送往合適消毒及水質檢測', '只靠氣味判斷'],
      answer: 1,
    },
    steps: [
      { verb: '加入', title: '鋪上棉層', instruction: '把棉花拖到濾斗最底。', cue: '拖動白色棉層', hint: '棉層承托上面的濾材並截留幼細顆粒。', action: { type: 'place', subject: 'cotton', target: 'filter' }, observation: '棉層貼在出口上方。' },
      { verb: '加入', title: '加入細沙', instruction: '把細沙杯拖到濾斗。', cue: '拖動淺黃色細沙', hint: '細沙能截留較小的懸浮粒子。', action: { type: 'pour', subject: 'sand', target: 'filter' }, observation: '細沙形成緊密的中層。' },
      { verb: '加入', title: '加入碎石', instruction: '把碎石杯拖到濾斗。', cue: '拖動灰色碎石', hint: '較粗的濾材放在上方先攔截大顆粒。', action: { type: 'pour', subject: 'gravel', target: 'filter' }, observation: '碎石形成最上層，濾水器組裝完成。' },
      { verb: '過濾', title: '倒入泥水', instruction: '把泥水杯拖到濾斗上方。', cue: '慢慢把泥水倒入', hint: '留意每一層截留甚麼粒子。', action: { type: 'pour', subject: 'muddy-water', target: 'filter' }, observation: '大顆粒留在碎石和沙層，收集杯中的水較清澈。' },
      { verb: '檢測', title: '檢查濾過水', instruction: '把濁度探頭拖進收集杯。', cue: '拖動藍色探頭到水中', hint: '清澈度只是水質的其中一個指標。', action: { type: 'place', subject: 'sensor', target: 'filtered-water' }, observation: '本模型的濁度指示由高轉為低，但「微生物／溶解物未知」指示仍亮起。' },
    ],
    result: {
      title: '你完成了濾水，也保留了科學警覺！',
      observation: '濾層除去大部分懸浮粒子，濁度明顯下降；溶解物和微生物風險仍未確定。',
      explanation: '過濾主要按粒子大小分離懸浮物，不能保證移除所有微生物或溶解物。清澈水仍須合適消毒及檢測才可判斷安全。',
    },
  },
  {
    id: 'electric-crane', number: 4, topic: '能量', grades: '小四至小六', minutes: 14,
    title: '電磁起重機', englishTitle: 'Circuit Crane', color: '#65a8ff', icon: 'circuit',
    question: '怎樣接成閉合電路，並在不過熱下增強電磁鐵？',
    objective: '建立閉合電路，觀察電流的熱效應和磁效應。',
    apparatus: ['低壓電池', '開關', '燈泡', '絕緣線圈', '鐵芯', '溫度指示器'],
    curriculum: { items: '#47', codes: ['4MB7', '4MB8', '6MB6', '6MB7'] },
    safety: '只模擬低壓電池；不可接駁市電。短路或導線過熱時應立即斷電。',
    modelNote: '移動光點和磁場線是教學疊加圖，並非肉眼可見的電子或磁場。',
    prediction: {
      prompt: '電池、燈泡和導線只差一個接點未接上，燈泡會怎樣？',
      options: ['不會亮', '一樣亮', '只亮一半'],
      answer: 0,
    },
    steps: [
      { verb: '組裝', title: '把線圈套上鐵芯', instruction: '把絕緣線圈拖到鐵芯上。', cue: '拖動橙色線圈', hint: '線圈要接入完整回路才會產生磁效應。', action: { type: 'place', subject: 'coil', target: 'iron-core' }, observation: '線圈已套上鐵芯，但尚未接線或通電。' },
      { verb: '連接', title: '由電池接到開關', instruction: '從電池正極拖出電線，連接開關左端。', cue: '由紅色正極連到開關', hint: '端口會以形狀和光圈同時提示。', action: { type: 'connect', subject: 'battery-positive', target: 'switch-in' }, observation: '第一段導電路徑完成，但電路仍未閉合。' },
      { verb: '連接', title: '把開關接到線圈', instruction: '把開關右端連到線圈輸入端。', cue: '由開關連到橙色線圈端口', hint: '電流必須真正通過線圈。', action: { type: 'connect', subject: 'switch-out', target: 'coil-in' }, observation: '開關已接到線圈的一端，仍要完成回路。' },
      { verb: '連接', title: '把線圈接到燈泡', instruction: '從線圈輸出端連到燈泡輸入端。', cue: '由線圈連到燈泡', hint: '燈泡可提示回路是否通電。', action: { type: 'connect', subject: 'coil-out', target: 'bulb-in' }, observation: '線圈與燈泡已串聯，還差回到電池的一段。' },
      { verb: '連接', title: '完成回路', instruction: '把燈泡另一端連回電池負極。', cue: '由燈泡連到藍色負極', hint: '完整路徑要回到電池。', action: { type: 'connect', subject: 'bulb-out', target: 'battery-negative' }, observation: '回路完整，但開關仍然斷開，所以線圈未通電。' },
      { verb: '接通', title: '閉合開關', instruction: '按下開關，觀察燈泡、線圈和溫度。', cue: '點按綠色開關', hint: '閉合後電流沿完整路徑通過線圈。', action: { type: 'tap', subject: 'switch' }, observation: '燈泡亮起，線圈通電並磁化鐵芯；模型溫度由 24°C 升至 31°C。' },
      { verb: '提升', title: '啟動起重機', instruction: '按下藍色升降按鈕，測試通電鐵芯。', cue: '點按鐵夾旁的藍色按鈕', hint: '只有開關閉合和線圈通電時才能吸起鐵夾。', action: { type: 'tap', subject: 'crane-lift' }, observation: '通電的電磁鐵提起 6 個鐵夾。' },
      { verb: '斷電', title: '安全關閉回路', instruction: '再次按下開關，觀察斷電後的鐵夾。', cue: '點按綠色開關', hint: '沒有電流時，電磁效應會大幅減弱。', action: { type: 'tap', subject: 'switch' }, observation: '燈泡熄滅，線圈斷電，鐵夾落回托盤。' },
    ],
    result: {
      title: '你的電磁起重機成功運作！',
      observation: '閉合回路令燈泡亮起；通電線圈磁化鐵芯並提起 6 個鐵夾，斷電後磁力大幅消失。',
      explanation: '電流需要完整導電路徑。電流會產生磁場，也會因電阻造成發熱；增強電磁鐵要兼顧圈數、電流和安全溫度。',
    },
  },
  {
    id: 'force-coaster', number: 5, topic: '力與運動', grades: '小三至小五', minutes: 13,
    title: '斜台與摩擦挑戰', englishTitle: 'Ramp Rally', color: '#f28b72', icon: 'ramp',
    question: '車停下時，原來的運動能量去了哪裏？',
    objective: '固定斜角，比較不同表面對運動的影響，並以彈簧秤量度摩擦。',
    apparatus: ['可調斜台', '角度儀', '小車', '粗糙／光滑表面', '彈簧秤'],
    curriculum: { items: '#30、#31、#48、#51–53', codes: ['4MC1', '4MC2', '5MB1', '5MB2'] },
    safety: '小車保持在防護軌道內；真實活動不可把物件朝人發射或拉秤超量程。',
    modelNote: '能量條和力箭咀是教學疊加圖；距離、速度和拉力是本模型的固定示範數值。',
    prediction: {
      prompt: '同一小車以相同高度出發，哪種表面令它最快停下？',
      options: ['粗糙表面', '光滑表面', '兩者完全相同'],
      answer: 0,
    },
    steps: [
      { verb: '調校', title: '把斜台調到 25°', instruction: '轉動斜台把手到 25°。', cue: '拖動黃色角度把手或使用滑桿', hint: '角度儀會顯示實時數值。', action: { type: 'adjust', subject: 'ramp-angle', min: 23, max: 27, unit: '°', range: [5, 40] }, observation: '斜台固定在 25°，垂直高度保持不變。' },
      { verb: '放置', title: '把小車放在起點', instruction: '把小車拖到斜台頂端的起點。', cue: '拖動藍色小車', hint: '每次都由同一高度出發才公平。', action: { type: 'place', subject: 'cart', target: 'ramp-start' }, observation: '小車具有重力勢能，準備轉化為動能。' },
      { verb: '釋放', title: '在光滑面測試', instruction: '按下釋放掣，觀察距離和速度。', cue: '點按綠色釋放掣', hint: '不要推車，只讓重力使它起動。', action: { type: 'tap', subject: 'release' }, observation: '小車在光滑面前進 4.2 m，最高速度 2.1 m/s。' },
      { verb: '更換', title: '改用粗糙表面', instruction: '把粗糙板拖到水平軌道。', cue: '拖動啡色粗糙板', hint: '保持小車、角度和起點不變。', action: { type: 'place', subject: 'rough-track', target: 'runout' }, observation: '只改變表面，形成公平比較。' },
      { verb: '連接', title: '接上彈簧秤', instruction: '把彈簧秤的掛鈎拖到小車前方掛鈎。', cue: '先把秤鈎接到小車', hint: '掛鈎相接後，彈簧秤仍可繼續拖動。', action: { type: 'place', subject: 'spring-scale', target: 'cart-hook' }, observation: '彈簧秤與小車保持可見的物理連接。' },
      { verb: '拉動', title: '沿粗糙面拉車', instruction: '握住彈簧秤，向右拖到黃色終點後放手。', cue: '把彈簧秤向右拖到終點', hint: '盡量平穩拖動；紅色指針顯示即時拉力。', action: { type: 'place', subject: 'spring-scale', target: 'pull-end' }, observation: '讀數由彈簧伸長量、拉動速度及粗糙面摩擦共同決定。' },
      { verb: '再試', title: '再次釋放小車', instruction: '按下釋放掣，觀察粗糙面的結果。', cue: '點按綠色釋放掣', hint: '比較路程、速度和能量條。', action: { type: 'tap', subject: 'release' }, observation: '小車只前進 2.0 m；更多機械能經摩擦轉為熱。' },
    ],
    result: {
      title: '你用數據找到了摩擦的作用！',
      observation: '粗糙面所需拉力較大，小車前進距離較短；斜台高度相同，起始重力勢能相同。',
      explanation: '摩擦力反對相對運動，把部分機械能轉為熱。車停下不是能量消失；公平比較要保持小車、角度和起點相同。',
      comparison: {
        leftLabel: '光滑面 · 同一起點',
        leftValue: '前進 4.2 m',
        rightLabel: '粗糙面 · 同一起點',
        rightValue: '前進 2.0 m',
        conclusion: '只更換接觸表面：粗糙面的摩擦較大，小車更早停下，更多機械能轉為熱。',
      },
    },
  },
];

export const experimentById = new Map(experiments.map((experiment) => [experiment.id, experiment]));

export function getNextExperiment(id) {
  const index = experiments.findIndex((item) => item.id === id);
  if (index < 0) return null;
  return experiments[(index + 1) % experiments.length];
}
