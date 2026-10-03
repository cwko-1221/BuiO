// Chapters 5–8: rescue residents and recover the water crystal.
export const STORY_ACT2 = [
  {
    number:5, title:['沼澤裏的藍箱子','The Blue Crate in the Marsh'],
    summary:['沿水流尋找掉下的晶石箱。沼澤守門人不肯開閘，水位還在上升。','Follow the current to the fallen crystal crate. The marsh keeper refuses to open the floodgate as the water keeps rising.'],
    sections:[
      ['漂來的箱蓋','A Floating Crate Lid','沿水邊找到藍箱子的痕跡','Follow the water and look for traces of the blue crate'],
      ['淹水小徑','Flooded Path','突破小徑，讓被困居民走到高處','Clear the path so trapped residents can reach higher ground'],
      ['通往潮城的水道','The Channel to Tide City','檢查排水口，確認箱子漂往哪裏','Inspect the drain and find where the crate drifted'],
      ['關著的水閘','The Closed Floodgate','擊敗雨苔鷺，打開水閘降低水位','Defeat the Rain-Moss Heron and open the floodgate'],
    ],
    scenes:[
      [
        ['narrator','沼澤渡口的水越漲越高。紙尾在蘆葦間找到一塊藍色木板，上面有發電機的編號。','Water is rising around the marsh landing. Papertail finds a blue plank among the reeds, marked with the generator’s serial number.'],
        ['paperfox','這是水晶石的箱蓋！水往東邊流，我們跟著找。','This is the water crystal’s crate lid! The current flows east. Let us follow it.'],
        ['guide','先看看路上有沒有人被水困住。找晶石，也不能漏掉需要幫忙的居民。','Check for anyone trapped by the flood along the way. We must help residents while looking for the crystal.'],
      ],
      [
        ['hero','前面的居民爬上石頭了。守衛堵住高地入口，他們沒法離開。','Those residents have climbed onto rocks. Guards are blocking the entrance to higher ground, so they cannot get out.'],
        ['paperfox','我在地圖上畫出安全小徑。你們開路，我帶大家去渡口的高台。','I will mark a safe path on my map. Clear the way, and I will guide everyone to the raised landing.'],
        ['guide','水閘本來會自動排水，今天卻被鎖住。有人把避風命令用錯了地方。','The floodgate normally drains extra water automatically. Today it is locked. Someone’s shelter order is making the flood worse.'],
      ],
      [
        ['narrator','排水口卡著藍箱子的鐵扣。水道盡頭的路牌寫著「潮汐古城」。','A metal clasp from the blue crate is caught at the drain. A sign at the end of the channel points to Sunken-Tide City.'],
        ['hero','箱子被沖到潮城去了。先開水閘，讓水退下來，我們才能安全過去。','The crate drifted into Tide City. We need to open the floodgate and lower the water before crossing safely.'],
        ['paperfox','我聽到守門人在說「誰也不能出去」。可是關著水閘，居民反而更危險。','The keeper keeps saying nobody may leave. But closing the floodgate puts the residents in more danger.'],
      ],
      [
        ['reed-heron','黑核通知：風暴期間所有出口必須關閉。水閘也是出口，不能開！','Black Core says all exits must remain closed during the storm. A floodgate is an exit, so it must stay shut!'],
        ['guide','水已經淹到居民腳邊。開閘排水，才是現在最安全的做法。','The flood is reaching the residents. Opening the gate to drain the water is the safest thing to do now.'],
        ['reed-heron','命令沒有說可以排水。再靠近，我就攔住你們！','The order did not say I could drain the water. Come any closer and I will stop you!'],
        ['hero','紙尾，先帶居民退後。我們打停守門人，解除封閘命令。','Papertail, guide the residents back. We will stop the keeper and lift the order sealing the gate.'],
      ],
    ],
    ending:[
      ['narrator','水閘打開，淹水慢慢退去。居民走上高台，向紙尾道謝。','The floodgate opens and the water slowly drops. The residents reach higher ground and thank Papertail.'],
      ['reed-heron','我只顧著照命令做，沒有看看水位。對不起，我會留下來檢查每一道水閘。','I followed the order without checking the water level. I am sorry. I will stay and inspect every floodgate.'],
      ['hero','有危險時要看清楚現場，也要聽居民的話。謝謝你願意幫忙補救。','When there is danger, check what is happening and listen to the residents. Thank you for helping put things right.'],
      ['guide','水晶石漂進潮城，還有居民被轉移到那裏。我們跟著這條水道走。','The water crystal drifted into Tide City, and some residents were transferred there too. We will follow this channel.'],
      ['paperfox','地圖上多了一條安全的路。爸爸回家時，也一定用得上。','Our map now has another safe route. Father will be able to use it when he comes home too.'],
    ],
  },
  {
    number:6, title:['泡泡屋裏出不去的人','Trapped Inside the Bubble Houses'],
    summary:['潮城居民被鎖在避難泡泡屋。跟嚮導渡潮一起開門，查問藍箱子的去向。','Tide City residents are locked inside shelter domes. Help Tideway open the doors and trace the blue crate.'],
    sections:[
      ['潮城入口','Tide City Entrance','找到渡潮，確認居民被困的位置','Find Tideway and locate the trapped residents'],
      ['鎖門的珊瑚街','Locked Coral Street','突破街道守衛，讓渡潮到達泡泡屋','Clear the street so Tideway can reach the shelter domes'],
      ['藍箱子的收據','The Blue Crate Receipt','讀取收據，確認水晶石的下一站','Read the receipt and find the water crystal’s next destination'],
      ['沉潮龜的門禁','The Turtle’s Locked Gates','擊敗沉潮龜，解除泡泡屋的門禁','Defeat the Sunken-Tide Turtle and unlock the shelter domes'],
    ],
    scenes:[
      [
        ['tideguide','我是渡潮。潮城的泡泡屋能讓大家在水底呼吸，可是今天門全被鎖了，居民出不來！','I am Tideway. Our bubble houses let residents breathe underwater, but every door has been locked today. Nobody can get out!'],
        ['hero','我們從沼澤來，正在找一個裝水晶石的藍箱子。先幫大家開門，再查貨物。','We came from the marsh looking for a blue crystal crate. Let us help open the doors before checking the cargo.'],
        ['tideguide','沉潮龜掌管門禁。他收到黑核命令後，連送食物的人也不讓進去。','The Sunken-Tide Turtle controls the locks. Since receiving Black Core’s order, he will not even let food deliveries through.'],
      ],
      [
        ['paperfox','窗裏的小朋友在招手。他們不是想冒險，只是想拿到晚餐、和家人聯絡。','The children at that window are waving. They do not want an adventure. They just need dinner and a way to contact their families.'],
        ['tideguide','我帶著備用鑰匙，但守衛不讓我接近門鎖。請幫我打開這條街。','I have spare keys, but the guards will not let me reach the locks. Please help clear this street.'],
        ['guide','我們開路，渡潮分發食物。紙尾記下每戶需要甚麼，別讓任何人被漏下。','We will clear the way while Tideway delivers food. Papertail, record what each household needs so nobody is forgotten.'],
      ],
      [
        ['narrator','貨站留著一張收據：藍箱子從沼澤打撈上岸，隨即被送往暴雨燈塔。','A receipt remains at the depot. The blue crate was recovered from the marsh and immediately shipped to Storm Beacon.'],
        ['hero','我們慢了一步，水晶石已經去燈塔了。這張轉送命令，也蓋著黑核的印章。','We are one step behind. The water crystal has gone to the lighthouse, and Black Core stamped the transfer order too.'],
        ['tideguide','珊瑚書庫保存所有送貨副本。先救出居民，我陪你們去查是誰改了路線。','Coral Archive keeps copies of every delivery record. Once the residents are free, I will help you investigate who changed the route.'],
      ],
      [
        ['tide-shell','泡泡屋安全，門不用開！居民留在裏面，黑核就不用擔心他們。','The bubble houses are safe. Their doors must stay closed! Black Core cannot worry about residents who stay inside.'],
        ['tideguide','他們缺食物，也找不到家人。你有沒有問過他們需要甚麼？','They need food and cannot find their families. Have you asked what they actually need?'],
        ['tide-shell','黑核命令我拒絕所有開門要求。靠近控制台的，全部攔下！','Black Core ordered me to refuse every request to open a door. Stop anyone approaching the control panel!'],
        ['hero','渡潮，準備備用鑰匙。我們停下他的攻擊，讓大家能自己選擇去留。','Tideway, get the spare keys ready. We will stop his attacks so the residents can decide where to go.'],
      ],
    ],
    ending:[
      ['narrator','控制晶片被取下，泡泡屋的門打開了。有居民選擇留下休息，也有人跟渡潮去找家人。','The control chip is removed and the dome doors open. Some residents choose to rest; others go with Tideway to find their families.'],
      ['tide-shell','我以為把門關好就能保護大家。原來門可以防水，也會把人困住。','I thought closed doors protected everyone. I forgot that a door which keeps water out can also trap people inside.'],
      ['paperfox','請把轉移居民的名單交給我。有人正在找爸爸，我也正在找。','Please give me the transferred residents’ list. Other people are looking for their fathers, just as I am.'],
      ['tideguide','我會安排船送願意回家的居民。然後帶你們去珊瑚書庫，查水晶石的轉送命令。','I will arrange boats for residents who want to go home. Then I will take you to Coral Archive to check the crystal’s transfer order.'],
      ['guide','兩處都收到同一種錯誤命令。我們要找出黑核是甚麼，才能阻止其他地方被封鎖。','Two places received the same harmful orders. We need to learn what Black Core is before it locks down more towns.'],
    ],
  },
  {
    number:7, title:['被塗黑的送貨紀錄','The Blotted-Out Delivery Record'],
    summary:['書庫的紀錄被墨水蓋住。找回原始副本，發現黑核是一部會自動發命令的機器。','Ink has covered the archive records. Find the original copies and discover that Black Core is an automatic command machine.'],
    sections:[
      ['漂書走廊','Floating-Book Hall','保護尚未被塗黑的送貨副本','Protect the delivery copies that have not been covered in ink'],
      ['墨水書架','Ink-Covered Shelves','穿過書架，找到編號為一號的設計圖','Cross the shelves and find the blueprint numbered one'],
      ['備份讀室','The Backup Reading Room','核對黑核的設計圖與燈塔收據','Compare Black Core’s blueprint with the lighthouse receipt'],
      ['章魚的保密命令','The Archivist’s Secrecy Order','擊敗墨卷章魚，阻止他銷毀紀錄','Defeat the Ink Archivist and stop the records from being destroyed'],
    ],
    scenes:[
      [
        ['tideguide','這裏是珊瑚書庫。所有船運紀錄都存兩份，原件壞了也能查副本。','This is Coral Archive. Every shipping record has two copies, so we can still check it if the original is damaged.'],
        ['paperfox','好多頁都被墨水蓋住了。有人專挑昨晚的紀錄，其他日期卻沒有事。','Many pages are covered in ink. Someone targeted last night’s records, leaving the other dates untouched.'],
        ['hero','先把乾淨的副本收好。只要留下證據，就能弄清楚命令從哪裏來。','Save the clean copies first. As long as the evidence survives, we can find out where the orders came from.'],
      ],
      [
        ['guide','工具盒的晶片寫著「黑核一號」。這張設計圖也是一號，右下角有燭鱗的簽名。','Our chip says “Black Core 1.” This blueprint has the same number and Emberscale’s signature in the corner.'],
        ['hero','圖上說黑核能讀取天氣資料，再自動指揮守衛。原來黑核是一部機器。','The diagram says Black Core reads weather reports and sends orders to guards automatically. So Black Core is a machine.'],
        ['paperfox','可是它怎麼知道居民願不願意搬走？這張圖沒有畫能接收居民意見的地方。','But how can it know whether residents want to move? The diagram shows no way for people to send it their views.'],
      ],
      [
        ['tideguide','備份收據確認了：水晶石在燈塔，用來供電給黑核的天氣訊號站。','The backup receipt confirms it: the water crystal powers Black Core’s weather signal station at the lighthouse.'],
        ['guide','設計圖寫著「試作，尚未完成測試」。為甚麼一部未測好的機器，已經能指揮整個樂園？','The blueprint says “Prototype. Testing unfinished.” Why is an untested machine already giving orders across the park?'],
        ['narrator','墨卷章魚帶著墨水瓶出現。他要把剩下的副本一起塗黑，不准任何人查看。','The Ink Archivist arrives carrying an ink bottle. He intends to blot out the remaining copies so nobody can read them.'],
      ],
      [
        ['ink-octopus','黑核要求刪除運貨資料。資料不見，就不會再有人追問！','Black Core ordered the shipping records erased. If the records vanish, nobody can ask questions about them!'],
        ['hero','有人因為這些命令找不到家人。我們需要資料，才能把他們接回去。','These orders have separated families. We need the records to help bring them back together.'],
        ['ink-octopus','我負責保管資料，也必須服從命令。退後，墨水要灑下去了！','I must protect the records, but I must also obey commands. Stand back. I am about to pour the ink!'],
        ['paperfox','請你們攔住他。我把副本包好，絕不讓爸爸的去向也被塗掉！','Please stop him. I will wrap up the copies so the record of Father’s whereabouts is not erased too!'],
      ],
    ],
    ending:[
      ['ink-octopus','晶片讓我把「保管」變成了「銷毀」。謝謝你們保住副本，我會重新整理紀錄。','The chip made me destroy the records I was meant to protect. Thank you for saving the copies. I will organize them again.'],
      ['guide','我們有設計圖和收據了。去燈塔取回水晶石，再去工坊找燭鱗，問他怎樣停掉黑核。','We have the blueprint and receipt. We will recover the water crystal, then ask Emberscale at the forge how to stop Black Core.'],
      ['paperfox','收據也寫著月舟批准了搬運。我想親口問他：爸爸在哪裏，為甚麼不讓爸爸回家？','The receipt says Moonferry approved the shipment. I want to ask him where Father is and why he cannot come home.'],
      ['tideguide','我先留在潮城照顧居民，保持無線電聯絡。你們到燈塔後，記得把電台接通。','I will stay in Tide City to help the residents and keep a radio ready. Please restore the transmitter when you reach the lighthouse.'],
      ['hero','我們會把查到的消息告訴大家。這次不讓任何人只能等命令。','We will share what we discover. Nobody should be left with orders to follow and no way to ask questions.'],
    ],
  },
  {
    number:8, title:['燈塔頂的水晶石','The Crystal at the Lighthouse'],
    summary:['修復燈塔通訊，取回第一顆晶石。預警內容和現場天氣不符，事情還沒結束。','Restore the lighthouse radio and recover the first crystal. The warnings do not match the weather, so the mystery continues.'],
    sections:[
      ['風浪石階','Windswept Steps','穿過海邊石階，前往訊號站','Cross the seaside steps and reach the signal station'],
      ['被剪斷的電纜','Cut Radio Cables','讓雲耳接上電纜，恢復居民通訊','Protect Cloud-Ear while he reconnects the residents’ radio'],
      ['假的全區警報','The False Park-Wide Alarm','保存天氣警報，檢查晶石電源的位置','Save the weather alert and locate its crystal power supply'],
      ['守燈者的封鎖','The Keeper’s Lockdown','擊敗風暴守燈者，取回水晶石','Defeat the Storm Beacon Keeper and recover the water crystal'],
    ],
    scenes:[
      [
        ['narrator','燈塔旁有海風和陣雨，但遠處的樂園仍然晴朗。電台卻不斷說「全區即將被大風暴吹毀」。','Wind and showers sweep the lighthouse, but the distant park remains sunny. The radio keeps warning that a huge storm will destroy every district.'],
        ['hero','局部下雨不等於全區有災難。我們要查清楚這個警報用了甚麼資料。','Rain in one place does not mean every district is in danger. We need to check what information this warning is using.'],
        ['guide','先上訊號站。那裏有水晶石，也有可以聯絡渡潮的電台。','First, reach the signal station. It holds the water crystal and the transmitter we need to contact Tideway.'],
      ],
      [
        ['paperfox','電纜的斷口很整齊，跟森林的風鈴繩一樣。有人不想讓居民互相通話。','The cables have clean cuts, like the bell cords in the forest. Someone does not want residents talking to one another.'],
        ['guide','工具袋裏有接線鉗。紙尾，你爸爸準備得很周全，我可以用它修好電台。','There are wire cutters in the tool bag. Your father came well prepared, Papertail. I can use them to repair the transmitter.'],
        ['hero','你們修電纜，我攔住守衛。接通後，先通知大家我們正在找回晶石。','Repair the cables while I hold off the guards. Once the radio works, tell everyone we are recovering the crystals.'],
      ],
      [
        ['guide','電台通了！渡潮說潮城天氣正常。黑核的全區警報，至少有一部分是錯的。','The radio works! Tideway says the weather in Tide City is normal. At least part of Black Core’s park-wide warning is wrong.'],
        ['paperfox','我把警報錄下來。控制台的影片沒有日期，日後要拿原始資料核對。','I will record the warning. The video on the console has no date, so we need the original footage to check it.'],
        ['narrator','藍色晶石就在燈塔頂。守燈者守住電源台，不肯讓任何人靠近。','The blue crystal is at the lighthouse summit. The keeper guards its power stand and refuses to let anyone near it.'],
      ],
      [
        ['beacon-heron','水晶石供應警報站的電力。黑核說不能停止警報，也不能恢復居民通訊！','The water crystal powers the warning station. Black Core says the alerts must continue and the residents’ radio must stay off!'],
        ['hero','沒有通訊，大家怎知道哪裏安全？你的警報還把晴天的潮城也算進去了。','Without a radio, how can anyone find safe places? Your warning even includes Tide City, where the weather is clear.'],
        ['beacon-heron','收到命令：移走發電晶石的人，全都要被攔下！','Order received: stop anyone trying to remove the power crystal!'],
        ['guide','我們保存了警報，也修好了電台。現在打停守燈者，把晶石送回真正需要它的地方。','We saved the warning and repaired the radio. Now stop the keeper so we can return the crystal where it belongs.'],
      ],
    ],
    ending:[
      ['narrator','第一顆水晶石回到雲耳的工具盒。燈塔換上備用電池，居民電台繼續運作。','The first crystal is safely inside Cloud-Ear’s toolbox. Backup batteries keep the lighthouse and residents’ radio working.'],
      ['beacon-heron','原來關掉居民通訊會讓大家更害怕。我會播放各地確認過的消息，停止重複假警報。','Silencing the residents only made them more afraid. I will broadcast reports checked by each district instead of repeating false alerts.'],
      ['paperfox','渡潮收到消息了！港口和潮城的居民知道有人在幫忙，終於不用亂猜。','Tideway received our message! People at the harbor and in Tide City know help is coming instead of having to guess.'],
      ['guide','還有火、風、雷三顆晶石。我們去熔火工坊，問燭鱗怎樣關掉他設計的黑核。','Three crystals remain: fire, wind, and thunder. We will ask Emberscale at Ember Forge how to shut down the Black Core he designed.'],
      ['hero','晶石追回一顆，通訊也修好了。接下來找設計者，讓錯誤命令一次停下來。','We recovered one crystal and restored the radio. Next, find the inventor so we can stop the harmful orders at their source.'],
    ],
  },
];
