// Chapters 1–4: investigate a theft using witnesses and physical clues.
export const STORY_ACT1 = [
  {
    number:1, title:['樂園怎麼停電了？','Who Turned Off the Lights?'],
    summary:['慶典當天，樂園突然停電。和雲耳檢查發電機，找出四顆能源晶石的下落。','The festival loses power. Check the generator with Cloud-Ear and find out where its four energy crystals went.'],
    sections:[
      ['停電廣場','Darkened Square','穿過廣場，前往星光發電機','Cross the square and reach the Starlight Generator'],
      ['封鎖的通道','Blocked Walkway','突破守衛防線，查清誰下了封路命令','Get past the guards and find out who ordered the road closed'],
      ['貨車的輪印','Cart Tracks','沿輪印走到東門，查看遺下的貨箱','Follow the cart tracks to the east gate and inspect the abandoned crate'],
      ['隊長的黑晶片','The Captain’s Black Chip','擊敗木偶隊長，取下控制他的黑晶片','Defeat Captain Timber and remove his black control chip'],
    ],
    scenes:[
      [
        ['narrator','今天是寵物樂園的星光慶典。攤位才剛開門，街燈全滅了，載著學生的列車也停了。','It is festival day in Pet Paradise. Just as the stalls open, every streetlight goes out and the student train stops.'],
        ['guide','{hero}，星光發電機出了事！它靠水、火、風、雷四顆晶石供電。我們先去檢查。','{hero}, something is wrong with the Starlight Generator! Its water, fire, wind, and thunder crystals power the park. Let us check it.'],
        ['hero','先請大家留在廣場等候。我們找回電力，再讓列車安全開動。','Ask everyone to wait here. We will restore the power so the train can move safely again.'],
      ],
      [
        ['narrator','發電機的四個插槽都空了。旁邊有撬開的箱子，通往機房的門卻被守衛封住。','All four crystal slots are empty. A crate has been forced open, but guards have blocked the machine-room door.'],
        ['guide','門上的命令寫著「為了安全，禁止進入」，卻沒有管理員簽名。有人偷走晶石，還不讓我們查。','The order says “Entry forbidden for safety,” but no manager has signed it. Someone stole the crystals and is blocking the investigation.'],
        ['hero','守衛胸前都有黑色小晶片。我們突破這條通道，看看機房還留下甚麼。','Every guard wears a small black chip. Let us get through this walkway and inspect the machine room.'],
      ],
      [
        ['narrator','機房後面有一道新鮮的貨車輪印。東門旁的空箱子，正好能裝下四顆晶石。','Fresh cart tracks lead away from the machine room. An empty crate by the east gate has room for all four crystals.'],
        ['hero','箱上寫著「送往星燈港」，輪印卻先進了森林。這不是普通的停電。','The crate says “Deliver to Starlamp Harbor,” but the tracks first enter the forest. This is more than a power failure.'],
        ['guide','木偶隊長守著東門。他以前會幫忙帶路，今天卻一直重複同一句命令。','Captain Timber is guarding the east gate. He used to help travelers, but today he keeps repeating the same order.'],
      ],
      [
        ['puppet','東門封鎖！所有寵物留在原地，等待安全轉移！','East gate closed! All pets must stay where they are and wait for a safety transfer!'],
        ['hero','列車裏還有人。讓我們出去找晶石，才能救他們。','There are still passengers on the train. Let us find the crystals so we can help them.'],
        ['guide','他聽不見我們說話，黑晶片正閃著紅光。{hero}，先打停他，我來取下晶片！','He cannot hear us, and his black chip is flashing red. {hero}, stop him so I can remove it!'],
        ['puppet','收到新命令：攔住所有想離開的寵物！','New order received: stop every pet who tries to leave!'],
      ],
    ],
    ending:[
      ['narrator','黑晶片掉在地上，木偶隊長終於停下攻擊。雲耳把晶片裝進工具盒，留下做證據。','The black chip falls off, and Captain Timber stops attacking. Cloud-Ear keeps the chip in his toolbox as evidence.'],
      ['puppet','我記得一輛貨車昨晚出門，卻不記得誰叫我封路。對不起，列車乘客還好嗎？','A cart left last night, but I cannot remember who ordered me to close the road. I am sorry. Are the passengers safe?'],
      ['hero','大家正在照顧他們。請你打開東門，再幫忙送水到列車。','People are looking after them. Please open the east gate and bring water to the train.'],
      ['guide','貨車去了風鈴森林。我們沿輪印追查，隊長留在這裏幫大家。','The cart went into Windbell Woods. We will follow its tracks while the captain stays here to help.'],
      ['narrator','大門打開了。廣場的同伴揮手送行，大家第一次有了清楚的方向：先找到那輛貨車。','The gate opens. Their friends wave them off. They now have a clear first task: find the missing cart.'],
    ],
  },
  {
    number:2, title:['森林裏的可疑貨車','A Suspicious Cart in the Woods'],
    summary:['追蹤晶石貨車，找到被剪斷的警報風鈴，向松鼠查問昨晚發生的事。','Follow the crystal cart, inspect the cut alarm bells, and ask the squirrel what happened last night.'],
    sections:[
      ['剪斷的風鈴','Cut Alarm Bells','沿貨車輪印穿過林口','Follow the cart tracks through the forest entrance'],
      ['封路的木牌','Closed-Trail Signs','移開守衛，檢查封路木牌上的命令','Get past the guards and inspect the trail-closure orders'],
      ['橋下的箱子','The Crate Under the Bridge','找到橋下的貨箱，確認晶石運送路線','Find the crate below the bridge and identify its delivery route'],
      ['松鼠的誤會','The Squirrel’s Mistake','擊敗風鈴松鼠，阻止她繼續封橋','Defeat Windbell Squirrel and stop her from blocking the bridge'],
    ],
    scenes:[
      [
        ['guide','風鈴本來會在貨車經過時響起，提醒小動物避開。現在每條繩子都被剪斷了。','The bells normally ring when a cart passes, warning small animals to move aside. Every bell cord has been cut.'],
        ['hero','輪印旁還有剪刀掉下的小鐵片。搬晶石的人不想讓大家聽到貨車。','A metal piece from some scissors lies beside the tracks. Whoever moved the crystals wanted the cart to pass quietly.'],
        ['narrator','輪印一直伸向樹道。攔路的守衛胸前，也裝著同樣的黑晶片。','The tracks lead along the woodland path. The guards blocking it wear the same black chips.'],
      ],
      [
        ['hero','這些木牌全寫著「風暴將至，請勿外出」。可是今天的天氣明明很好。','Every sign says “Storm approaching. Stay indoors.” But the weather here is clear today.'],
        ['guide','預警是暴雨燈塔發出的。我們先記下日期，找到貨車後再核對。','The warning came from Storm Beacon. Let us record its date and check it once we find the cart.'],
        ['narrator','木牌後面有拖動貨箱的痕跡。守衛擋住去路，兩人只好先突破防線。','Drag marks run behind the signs. Guards block the way, so the companions must first get through them.'],
      ],
      [
        ['narrator','橋下卡著一個破箱角，上面印著星光發電機的圖案，還貼著洞穴倉庫的收貨條。','A broken crate corner is caught below the bridge. It bears the generator emblem and a receipt from the cave warehouse.'],
        ['hero','這就是晶石的箱子！貨車先到星晶洞穴，再去星燈港。','This is the crystal crate! The cart went to Starcrystal Cavern before continuing to Starlamp Harbor.'],
        ['guide','風鈴松鼠在橋上。她也許見過貨車，但她把整座橋都封起來了。','Windbell Squirrel is on the bridge. She may have seen the cart, but she has closed the entire crossing.'],
      ],
      [
        ['squirrel','快回家！戴月亮面具的先生說暴風會來，我答應幫他守橋！','Go home! A gentleman with a moon mask said a storm was coming. I promised to guard the bridge!'],
        ['hero','樂園停電了，有人還困在列車裏。我們需要追回晶石，不能一直等下去。','The park has lost power and passengers are trapped on a train. We must recover the crystals instead of waiting here.'],
        ['squirrel','他救過很多人，我相信他。沒有安全通知，我不會讓你們過橋！','He has rescued many people, and I trust him. I will not let you cross without an all-clear notice!'],
        ['guide','我們會查清預警是真是假。先阻止她攻擊，再把停電的事好好說明。','We will find out whether the warning is real. First stop her attacks, then explain what happened at the park.'],
      ],
    ],
    ending:[
      ['squirrel','你們沒有拆掉風鈴樹……原來只是想去救人。貨車確實進了洞穴，車上有四個彩色箱子。','You did not damage the bell tree. You really want to help. The cart entered the cave carrying four colored crates.'],
      ['guide','戴月亮面具的先生叫月舟。去年暴風時，他救過我。我不明白他為甚麼要搬走晶石。','The masked gentleman is Moonferry. He rescued me during last year’s storm. I do not know why he moved the crystals.'],
      ['hero','先查貨物，再問他原因。我們不能只靠一張預警，就讓乘客一直困著。','Let us inspect the cargo, then ask him why. One warning is not a reason to leave the passengers trapped.'],
      ['squirrel','我會重新掛好警報風鈴，也請大家保持聯絡。這張倉庫收貨條，你們拿去吧。','I will repair the alarm bells and ask everyone to stay in contact. Take this warehouse receipt with you.'],
      ['narrator','兩人帶著收貨條走向洞穴。雲耳想相信救過自己的月舟，也決定先看清楚證據。','They head toward the cave with the receipt. Cloud-Ear wants to trust his rescuer, but decides to follow the evidence first.'],
    ],
  },
  {
    number:3, title:['洞穴倉庫的收貨單','The Cave Warehouse Receipt'],
    summary:['四顆晶石曾在洞穴分箱。檢查貨物紀錄，找出下一個收貨地點。','The four crystals were repacked in the cave. Check the shipping records to discover where they went next.'],
    sections:[
      ['倉庫入口','Warehouse Entrance','穿過洞口，找到貨車停靠的位置','Cross the cave entrance and find where the cart stopped'],
      ['四個空箱','Four Empty Crates','檢查四種顏色的空箱與運貨標籤','Inspect the four colored crates and their shipping labels'],
      ['封存的貨單','Sealed Cargo Records','取回貨單，查出貨船名字','Retrieve the shipping record and identify the cargo ship'],
      ['石像守門人','The Stone Gatekeeper','擊敗星晶石像，打開倉庫出口','Defeat the Starcrystal Guardian and open the warehouse exit'],
    ],
    scenes:[
      [
        ['narrator','洞穴裏的晶石仍在發光，樂園卻沒有電。雲耳指向地上的車輪泥印。','Crystals still glow inside the cave, even though the park has no power. Cloud-Ear points to muddy cart tracks.'],
        ['guide','這些是普通照明石，不能代替發電機的四顆能源晶石。貨車停在前面的倉庫。','These are ordinary light stones. They cannot replace the generator’s four energy crystals. The cart stopped at that warehouse.'],
        ['hero','我們只找失竊的晶石。先穿過洞口，別碰這裏的照明石。','We are looking for the stolen energy crystals. Let us cross the entrance and leave the cave lights alone.'],
      ],
      [
        ['narrator','倉庫裏放著藍、紅、綠、黃四個空箱。每個箱底，都有發電機的編號。','The warehouse contains blue, red, green, and yellow empty crates. Each one carries the generator’s serial number.'],
        ['hero','水晶石在藍箱，火晶石在紅箱。標籤說四個箱子全送上了「白帆號」。','The water crystal was in the blue crate and the fire crystal in the red one. All four labels say “White Sail.”'],
        ['guide','先找完整貨單。只知道船名，還不能確定它從哪個碼頭出發。','We need the full shipping record. A ship’s name alone will not tell us which dock it sailed from.'],
      ],
      [
        ['hero','找到了！白帆號從星燈港出發，貨單上還寫著「由月舟接收」。','Here it is! White Sail departed from Starlamp Harbor. The record says the cargo was received by Moonferry.'],
        ['guide','旁邊還有一批黑晶片，編號都是「黑核一號」。有人用它們向守衛發命令。','There is also a box of black chips labeled “Black Core 1.” Someone is using them to send orders to the guards.'],
        ['narrator','出口忽然落下石門。守倉庫的石像收到晶片命令，走到兩人面前。','A stone door drops across the exit. The warehouse guardian receives a chip command and steps in front of them.'],
      ],
      [
        ['golem','倉庫物品禁止帶走！交回貨單，立即離開！','Warehouse records must stay here! Return the shipping document and leave immediately!'],
        ['hero','晶石是樂園的，現在有人需要它們。我們只想拿貨單查清去向。','The crystals belong to the park, and people need them now. We only want the record so we can find them.'],
        ['golem','黑核一號已確認：查問貨物的人都是入侵者！','Black Core 1 has confirmed: anyone asking about the cargo is an intruder!'],
        ['guide','他也被黑晶片控制了。打停石像後，我會取下晶片，讓他重新聽見我們。','A black chip is controlling him too. Once we stop him, I will remove it so he can hear us again.'],
      ],
    ],
    ending:[
      ['golem','我只是倉庫守門人，不應該聽晶片的命令亂攻擊人。這份貨單請帶走。','I am a warehouse gatekeeper. I should not attack visitors because a chip tells me to. Please take the shipping record.'],
      ['hero','你幫我們確認了船名和碼頭。請保管剩下的黑晶片，別再裝到守衛身上。','You helped us identify the ship and dock. Please keep the remaining black chips away from the guards.'],
      ['guide','四顆晶石都離開洞穴了。下一站是星燈港，我們去找白帆號的船員。','All four crystals have left the cave. Next is Starlamp Harbor, where we can find White Sail’s crew.'],
      ['golem','星燈港也正在封路。把這張倉庫證明帶上，也許能說服守港人。','The harbor roads are being closed too. Take this warehouse certificate. It may help convince the harbor guards.'],
      ['narrator','晶石還沒找回來，但貨單讓方向更清楚了：有人把樂園的電力搬走，還用黑晶片阻止大家追查。','The crystals are still missing, but the record makes one thing clear: someone moved the park’s power supply and used black chips to block the investigation.'],
    ],
  },
  {
    number:4, title:['紙尾的爸爸不見了','Papertail’s Father Is Missing'],
    summary:['星燈港正在強制轉移居民。幫紙尾找爸爸，並追查運送晶石的船。','Harbor residents are being moved against their wishes. Help Papertail find her father and track the crystal shipment.'],
    sections:[
      ['空了的碼頭','An Empty Dock','找到白帆號的靠岸紀錄','Find White Sail’s docking record'],
      ['封門的街道','The Sealed Street','幫紙尾穿過街道，去郵局查乘客名單','Help Papertail reach the post office and inspect the passenger list'],
      ['爸爸的工具袋','Her Father’s Tool Bag','檢查工具袋與船上遺下的轉移通知','Inspect the tool bag and the transfer notice left on the ship'],
      ['港口封鎖令','The Harbor Lockdown','擊敗封緘騎士，讓居民能自由離開港口','Defeat the Sealed-Letter Knight and let residents leave the harbor'],
    ],
    scenes:[
      [
        ['narrator','星燈港的船都停了。一隻叫紙尾的小狐狸抱著地圖，在碼頭逐個問人。','Every boat at Starlamp Harbor has stopped. A young fox named Papertail clutches a map and questions everyone at the dock.'],
        ['paperfox','你們見過我爸爸嗎？他昨晚去修白帆號，今天一直沒有回家。','Have you seen my father? He went to repair White Sail last night and still has not come home.'],
        ['hero','我們也在找白帆號。一起查靠岸紀錄，先弄清楚它昨晚去了哪裏。','We are looking for White Sail too. Let us check the docking records together and find out where it went last night.'],
      ],
      [
        ['paperfox','通知說大家要搬到月門要塞避風暴。可是爸爸只是去修船，為甚麼也被帶走？','The notice says everyone must move to Moon-Gate Fortress to shelter from a storm. Father only went to repair a ship. Why was he taken too?'],
        ['guide','郵局有乘客名單。守衛把街道封了，我們先替你開路。','The post office keeps the passenger list. Guards have blocked the street, so we will clear a path for you.'],
        ['hero','找到爸爸前，先和我們同行。遇到認識的居民，我們也問問他們看到甚麼。','Stay with us while we look for him. We will also ask the other residents what they saw.'],
      ],
      [
        ['narrator','郵局裏有紙尾爸爸的工具袋。名單上寫著「修理員：已轉送月門要塞」，旁邊蓋著黑色印章。','Her father’s tool bag is at the post office. The list says “Repair worker: transferred to Moon-Gate Fortress,” beside a black stamp.'],
        ['paperfox','爸爸連工具都沒拿！他一定不是自己決定走的。我想去要塞找他。','He did not even take his tools! He cannot have chosen to leave like this. I want to find him at the fortress.'],
        ['guide','貨船紀錄還寫著：水晶石的箱子途中掉進雨葉沼澤。先找回這顆，再打聽要塞的路。','The cargo log says the water crystal’s crate fell into Rainleaf Marsh. We can recover it while finding a route to the fortress.'],
      ],
      [
        ['letter-knight','居民一律留在港口，等候轉移！有人查問名單，立刻攔截！','Residents must stay at the harbor and await transfer! Stop anyone who asks about the passenger list!'],
        ['paperfox','我要找爸爸，不是來破壞港口！為甚麼連問一句都不准？','I want to find my father, not damage the harbor! Why are we not even allowed to ask a question?'],
        ['hero','先讓居民安全離開。我們不會讓你把大家當成貨物運走。','Let the residents leave safely. We will not let you transport people as if they were cargo.'],
        ['guide','他的胸口也有黑晶片。打停騎士，這場封鎖就能結束。','There is a black chip on his chest too. Stop the knight so we can end this lockdown.'],
      ],
    ],
    ending:[
      ['narrator','騎士的晶片被取下，港口大門重新打開。居民終於可以回家，也能自己選擇是否避風。','The knight’s chip is removed and the harbor gates open. Residents can return home or choose whether they need shelter.'],
      ['letter-knight','轉移命令是黑核發來的。我只能收到命令，不能回報居民反對……這樣不對。','Black Core sent the transfer orders. It let me receive commands, but not report objections from residents. That was wrong.'],
      ['paperfox','爸爸還在要塞。我懂畫地圖，會把我們走過的路記下來，幫其他人回家。','My father is still at the fortress. I can draw maps. I will mark our route so other people can find their way home.'],
      ['guide','歡迎加入，紙尾。下一站雨葉沼澤：找回掉下的水晶石，也找通往要塞的線索。','Welcome, Papertail. Next is Rainleaf Marsh: we need the fallen water crystal and clues to the fortress route.'],
      ['narrator','紙尾背起爸爸的工具袋，跟上兩位新朋友。這次冒險不只為了電力，也為了把被帶走的同伴接回家。','Papertail shoulders her father’s tool bag and joins her new friends. Their journey is now about restoring power and bringing their missing companions home.'],
    ],
  },
];
