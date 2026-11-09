const at=(zone,x,z)=>({zone,x,z});
const event=(key,label,target)=>({type:'event',key,count:1,label,target});
const node=(id,label,target)=>({type:'inspect',key:id,count:1,label,target});
const take=(id,label,target)=>({type:'collected',key:id,count:1,label,target});
const talk=(id,name,zone,x,z)=>event(`talk:${id}`,`與${name}對話`,at(zone,x,z));
const defeated=(id,name,zone,x,z)=>({type:'defeated',key:id,count:1,label:`戰勝${name}`,target:at(zone,x,z)});
const visit=zone=>({type:'visit',key:zone,count:1,label:'抵達指定地區',target:at(zone,...({dawnleaf:[0,6],meadow:[-21,0],mosswood:[-31,0],coast:[0,-21],canyon:[21,0],twilight:[0,21]}[zone]))});
const count=(type,n,label,target)=>({type,count:n,label,target});
const main=(id,titleZh,zone,story,objectives,reward,requires=[])=>({id,category:'main',titleZh,zone,story,objectives,reward,requires,autoAccept:true});
const task=(id,category,titleZh,zone,story,objectives,reward,requires=[])=>({id,category,titleZh,zone,story,objectives,reward,requires});
const doc=()=>talk('prof_hibiscus','木槿博士','dawnleaf',-8.5,-1.5);
export const QUEST_CATEGORIES={main:'主線故事',side:'居民委託',research:'圖鑑研究',exploration:'探索紀錄',challenge:'訓練挑戰'};
export const QUESTS=[
  main('m01','序章・晨曦鎮的邀請','dawnleaf','木槿博士收到各地棲地異常的報告。你的第一份工作，是帶著夥伴成為星輝調查員。',[doc()],{gold:120,items:{pokeball:3}}),
  main('m02','啟程前的三件事','dawnleaf','拜訪醫護與補給商，記錄南庭水質；鎮上的日常，也能成為解開異變的線索。',[talk('nurse_joy','喬伊護士','dawnleaf',0,-2.5),talk('merchant_adam','商人亞當','dawnleaf',8.5,-1.5),node('dawnleaf_survey_6','記錄南庭水質',at('dawnleaf',4,31))],{gold:160,items:{potion:2}},['m01']),
  main('m03','第一章・風中的異動','meadow','北風觀測碑的刻度不斷偏移。觀察草原並認識新夥伴，才能理解這份不安。',[visit('meadow'),node('meadow_survey_4','調查北風觀測點',at('meadow',20,-33)),count('dex',2,'累計收服兩種寶可夢',at('meadow',0,6))],{gold:200,items:{greatball:2}},['m02']),
  main('m04','翠葉守護者的託付','meadow','莉莉以一場對戰確認你的準備。她懷疑異常來自東方森林流出的溪水。',[defeated('warden_lily','守護者莉莉','meadow',18.5,1.5)],{gold:260,items:{potion:3}},['m03']),
  main('m05','第二章・消失的林間歌聲','mosswood','林間寶可夢離開了清溪。研究員的手帳遺落在木橋附近，記錄著最後一段鳥鳴。',[visit('mosswood'),take('mosswood_satchel_5','尋回木橋旁的研究手帳',at('mosswood',-8,8))],{gold:220,items:{greatball:2}},['m04']),
  main('m06','兩岸的三段回聲','mosswood','溪流、古樹與南境刻痕，記載著同一種星輝波動。把三段紀錄連起來。',[node('mosswood_survey_6','觀察清溪棲地',at('mosswood',12,8)),node('mosswood_survey_4','解讀古樹刻痕',at('mosswood',24,-33)),node('mosswood_survey_7','解讀觀林臺刻痕',at('mosswood',24,32))],{gold:300,items:{ether:2}},['m05']),
  main('m07','讓森林重新歌唱','mosswood','巡林員葵守護著調查營地。與她切磋後，一起完成穩定地脈的調查。',[defeated('forest_warden','巡林員葵','mosswood',-13,26)],{gold:350,items:{ultraball:2},worldFlag:'forest_restored'},['m06']),
  main('m08','回到晨曦的答案','dawnleaf','手帳中的波形指向海岸燈塔。把研究成果帶回木槿博士身邊，讓零散的線索變成下一步。',[doc()],{gold:250,items:{super_potion:2}},['m07']),
  main('m09','第三章・失準的潮汐','coast','航海手記與潮汐碑出現矛盾。瀾需要你證明能保護海岸，再一起調整燈塔的星輝信標。',[node('coast_survey_4','讀取燈塔潮汐記錄',at('coast',10,11)),take('coast_satchel_5','尋找漂流航海手記',at('coast',-20,5)),defeated('master_marina','潮汐館主瀾','coast',12.5,6.5)],{gold:450,items:{ultraball:3},worldFlag:'coast_beacon'},['m08']),
  main('m10','第四章・赤岩深處的脈動','canyon','凱伊想搶先找到星輝源頭。地脈記錄顯示能量正往北方神殿集中，炎司則要考驗你的判斷與實力。',[node('canyon_survey_4','調查赤岩地脈',at('canyon',-35,-10)),defeated('rival_kai','勁敵凱伊','canyon',6.5,1.5),defeated('master_ignis','烈焰館主炎司','canyon',-14.5,3.5)],{gold:600,items:{hyper_potion:2},worldFlag:'canyon_stable'},['m09']),
  main('m11','第五章・星庭的約定','twilight','封印並非牢籠，而是人與寶可夢共同留下的約定。讀取兩處刻痕，並取得瑟琳的認可。',[node('twilight_survey_4','解讀星輝封印',at('twilight',-4,-19)),node('twilight_survey_6','解讀月影迴廊',at('twilight',0,10)),defeated('sage_selene','幻影賢者瑟琳','twilight',-6,-6)],{gold:750,items:{ultraball:4}},['m10']),
  main('m12','終章・回應星輝之聲','twilight','超夢被各地失衡的波動喚醒。用一路培養的夥伴與經驗回應它，選擇挑戰或收服，平息異變。',[count('ending',1,'完成超夢的最終挑戰',at('twilight',0,-8.5))],{gold:1200,items:{elixir:2},worldFlag:'starlight_restored'},['m11']),
  main('m13','尾聲・每一段旅程都有回聲','dawnleaf','回晨曦鎮向博士報告。人們記住了你的幫助，但未知的棲地、圖鑑與訓練挑戰仍等待你探索。',[doc()],{gold:500,items:{masterball:1}},['m12']),
  task('s01','side','喬伊的庭院藥箱','dawnleaf','護士希望用鎮上的藥草補充急救用品，請實地採集樹果與藥草。',[take('dawnleaf_herb_3','採集庭院藥草',at('dawnleaf',-13,11)),take('dawnleaf_berry_2','採集花園樹果',at('dawnleaf',12,12)),talk('nurse_joy','喬伊護士','dawnleaf',0,-2.5)],{gold:120,items:{potion:3}}),
  task('s02','side','南庭遺落的包裹','dawnleaf','亞當的補給包裹留在南庭散步道。找回後親手向他確認收件。',[take('dawnleaf_satchel_5','尋找南庭包裹',at('dawnleaf',-25,23)),talk('merchant_adam','商人亞當','dawnleaf',8.5,-1.5)],{gold:160,items:{pokeball:4}}),
  task('s03','side','旅行者的失物','meadow','巡林員小楓正在找一位旅行者遺失的背包。',[take('meadow_satchel_5','尋找東境失物',at('meadow',42,12)),talk('ranger_maple','巡林員小楓','meadow',-12.5,2)],{gold:180,items:{greatball:2}}),
  task('s04','side','花野的補給路線','meadow','為南風營地記錄安全的採集與觀察路線。',[take('meadow_berry_2','採集花野樹果',at('meadow',20,23)),node('meadow_survey_6','記錄南風花野',at('meadow',38,24)),{type:'rest',key:'meadow',count:1,label:'在南風營地休息',target:at('meadow',6,19)}],{gold:180,items:{ether:2}}),
  task('s05','side','研究員的第二本手帳','mosswood','營地研究員森需要木橋旁的手帳，補齊鳥鳴與溪流的紀錄。',[take('mosswood_satchel_5','尋回手帳',at('mosswood',-8,8)),talk('forest_researcher','研究員森','mosswood',-18,26)],{gold:200,items:{greatball:3}}),
  task('s06','side','蕈光營地的夜前準備','mosswood','葵想確認觀林臺記錄，並補足營地藥草。',[take('mosswood_herb_3','採集蕨葉藥草',at('mosswood',-20,-14)),node('mosswood_survey_7','記錄南境觀林臺',at('mosswood',24,32)),{type:'rest',key:'mosswood',count:1,label:'返回蕈光營地休息',target:at('mosswood',-16,28)}],{gold:230,items:{super_potion:2}}),
  task('s07','side','漂流手記的主人','coast','瀾想把航海手記送回失主，也許其中有燈塔失準前的記錄。',[take('coast_satchel_5','尋找航海手記',at('coast',-20,5)),talk('master_marina','瀾','coast',12.5,6.5)],{gold:230,items:{greatball:3}}),
  task('s08','side','鹽風營地的急救藥','coast','救援隊需要耐鹽藥草與西灣觀測資料。',[take('coast_herb_3','採集海風藥草',at('coast',-33,-11)),node('coast_survey_6','記錄鹽風小徑',at('coast',-12,-35))],{gold:220,items:{super_potion:3}}),
  task('s09','side','凱伊沒說出口的筆記','canyon','勁敵也會迷路。把他的地形筆記找回，聽聽他急著向前的理由。',[take('canyon_satchel_5','尋回地形筆記',at('canyon',35,-4)),talk('rival_kai','凱伊','canyon',6.5,1.5)],{gold:260,items:{ether:3}}),
  task('s10','side','灰燼中的安全線','canyon','遠征隊需要兩份地脈紀錄，規劃下一次補給。',[node('canyon_survey_4','記錄赤岩瞭望',at('canyon',-35,-10)),node('canyon_survey_6','記錄熔岩溫度',at('canyon',32,2)),{type:'rest',key:'canyon',count:1,label:'在避風營地休息',target:at('canyon',-31,-7)}],{gold:280,items:{hyper_potion:2}}),
  task('s11','side','未寄出的古代書信','twilight','瑟琳想讀懂神殿深處留下的手記。',[take('twilight_satchel_5','尋回古代手記',at('twilight',6,-29)),talk('sage_selene','瑟琳','twilight',-6,-6)],{gold:320,items:{elixir:1}}),
  task('s12','side','月影藥草的紀錄','twilight','星庭藥草與封印刻痕，都值得留下平靜時的記錄。',[take('twilight_herb_2','採集月光藥草',at('twilight',-8,2)),node('twilight_survey_6','解讀月影刻痕',at('twilight',0,10))],{gold:300,items:{revive:2}}),
  ...[3,6,12,24].map((n,i)=>task(`r0${i+1}`,'research',`${n}種相遇的紀錄`,'dawnleaf','每一種相遇都讓星輝圖鑑更完整，已收服的種類亦計入。',[count('dex',n,`累計收服${n}種寶可夢`,at('dawnleaf',-5,5))],{gold:n*45,items:{[n===24?'masterball':'greatball']:n===24?1:2}})),
  task('r05','research','六份生態觀測','dawnleaf','從各地不同觀測碑累積資料，重複讀同一座不會重複計數。',[count('observations',6,'調查六個不同觀測點',at('dawnleaf',-16,-30))],{gold:400,items:{ultraball:3}}),
  task('r06','research','採集者的足跡','dawnleaf','從不同採集點認識當地補給，每個採集點只計一次。',[count('harvest',6,'採集六處不同樹果或藥草',at('dawnleaf',12,12))],{gold:300,items:{super_potion:3}}),
  task('r07','research','野外調製入門','dawnleaf','營地的補給箱備有調製工具。用樹果與藥草製作傷藥，讓採集成為照顧夥伴的一部分。',[{type:'craft',key:'potion',count:1,label:'在營地調製一份傷藥',target:at('dawnleaf',-24,13)}],{gold:200,items:{ether:2}}),
  task('e01','exploration','星輝六區巡遊','dawnleaf','親自抵達六個地區，記住各地的風景與人。',[count('regions',6,'走訪六個不同地區',at('dawnleaf',0,6))],{gold:600,items:{ultraball:4}}),
  task('e02','exploration','營火以外的片刻寧靜','dawnleaf','在六區的營地或休憩站照顧夥伴，恢復隊伍狀態。',[count('camps',6,'使用六處不同休憩站',at('dawnleaf',-24,13))],{gold:450,items:{elixir:2}}),
  task('e03','exploration','讀懂大地留下的話','twilight','探索各地刻痕與觀測資料。',[count('observations',12,'調查十二個不同觀測點',at('twilight',0,10))],{gold:700,items:{revive:3}}),
  ...[5,15].map((n,i)=>task(`c0${i+1}`,'challenge',`${n}場勝利的約定`,'dawnleaf','用不同的夥伴與屬性戰術面對對手；既有勝利亦計入。',[count('wins',n,`累計贏得${n}場對戰`,at('dawnleaf',5,5))],{gold:n*40,items:{super_potion:3}})),
  task('c03','challenge','與夥伴一起成長','dawnleaf','把任意一位夥伴培育至16級，迎接進化與新招式。',[count('level',16,'任一夥伴達到16級',at('dawnleaf',5,5))],{gold:500,items:{ultraball:3}}),
];
export const QUEST_BY_ID=Object.fromEntries(QUESTS.map(q=>[q.id,q]));
