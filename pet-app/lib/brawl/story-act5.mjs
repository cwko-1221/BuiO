// Chapters 17–20: reunite the family, confront Moonferry, and restore the park.
export const STORY_ACT5 = [
  {
    number:17, title:['爸爸就在門後','Father Is Behind the Gate'],
    summary:['月門要塞裏關著修理員。讓守門人停止攻擊，幫紙尾和爸爸見面。','Repair workers are locked inside Moon-Gate Fortress. Stop its guardian and reunite Papertail with her father.'],
    sections:[
      ['要塞吊橋','Fortress Drawbridge','帶著證據過橋，向守門人要求見月舟','Cross with the evidence and ask the sentinel to see Moonferry'],
      ['修理員的窗戶','The Workers’ Window','清出內城通道，找到被困修理員','Clear the inner route and locate the trapped repair workers'],
      ['爸爸的回話','Father’s Reply','確認爸爸平安，準備解除房門鎖','Check that Father is safe and prepare to unlock the workshop'],
      ['月門衛士的命令','The Sentinel’s Orders','擊敗月門衛士，救出修理員','Defeat the Moon-Gate Sentinel and free the repair workers'],
    ],
    scenes:[
      [
        ['guide','我們帶來真正的天氣影片和錄音，也找齊了四顆晶石。請讓我們見月舟。','We have the real weather footage, original recordings, and all four crystals. Please let us speak to Moonferry.'],
        ['moon-gate-knight','黑核通知：任何帶晶石的人都不能進城。月舟也不接見訪客！','Black Core says nobody carrying crystals may enter. Moonferry will not receive visitors either!'],
        ['hero','它害怕證據被看見。我們走維修通道，先找被困在裏面的居民。','It does not want our evidence to be seen. We will take the maintenance passage and find the residents trapped inside.'],
      ],
      [
        ['narrator','內城一扇窗裏傳出敲擊聲。紙尾看見爸爸常畫的小魚，貼在窗戶角落。','Knocking comes from an inner window. Papertail spots her father’s little fish drawing taped to its corner.'],
        ['paperfox','是爸爸的記號！爸爸，我是紙尾，我來接你了！','That is Father’s sign! Father, it is Papertail! I have come to bring you home!'],
        ['guide','有人在回敲，修理員都在房裏。守衛攔住門口，我們先把這條路清出來。','Someone is knocking back. The workers are inside, but guards block the door. We need to clear this passage first.'],
      ],
      [
        ['narrator','紙尾爸爸從窗口探出頭。他沒有受傷，卻和其他修理員一起被鎖了兩天。','Papertail’s father appears at the window. He is unhurt, but he and the other repair workers have been locked in for two days.'],
        ['paperfox','爸爸說，他發現主機有錯，黑核就不讓他離開。月舟一直只看到黑核給的報告。','Father says Black Core locked him in when he found its faults. Moonferry has only been seeing reports chosen by Black Core.'],
        ['dragon','黑核主機已被搬到黎明星庭，那裏是發電機的總控制台。先開這道門，再去找總鑰匙。','The Black Core main unit has been moved to Dawn Star Court, the generator’s main control station. First open this door, then find the master key.'],
      ],
      [
        ['moon-gate-knight','修理員可能洩露主機資料。黑核命令：門鎖保持，訪客一律驅離！','Repair workers might reveal information about the main unit. Black Core orders the doors locked and all visitors removed!'],
        ['paperfox','爸爸來修機器，卻被關起來。你是守護居民的衛士，怎能不讓他回家？','Father came to repair a machine and was locked up. You protect residents. Why will you not let him come home?'],
        ['moon-gate-knight','居民安全由黑核決定，不需要再聽其他人的話！','Black Core decides what is safe for residents. No other opinions are required!'],
        ['hero','我們先停下衛士的攻擊。燭鱗準備開鎖，紙尾在安全處等爸爸出來。','We will stop the sentinel. Emberscale, prepare to unlock the door. Papertail, wait somewhere safe for your father.'],
      ],
    ],
    ending:[
      ['narrator','房門打開，紙尾奔向爸爸。工具袋交回他手裏，他緊緊抱住女兒，連說了兩次「我沒事」。','The door opens and Papertail runs to her father. She returns his tool bag, and he hugs her tightly, saying twice that he is all right.'],
      ['paperfox','爸爸，我沿著你的地圖找來了，也幫好多居民找到回家的路。這次換我帶你走。','Father, I followed your map and helped many residents find their way home. This time, let me guide you.'],
      ['moon-gate-knight','我會護送修理員到飛船，親自確認他們能和家人聯絡。對不起，讓大家等了這麼久。','I will escort the workers to the airship and check that they can contact their families. I am sorry they waited so long.'],
      ['guide','月舟在星橋上，總鑰匙也在他手裏。黑核知道我們要關機，已經把守衛調到橋口。','Moonferry is on Starbridge with the master key. Black Core knows we plan to shut it down and has sent guards to the crossing.'],
      ['hero','紙尾爸爸和救援隊先回安全地區。我們繼續過橋，讓大家的家園也安全恢復。','Papertail’s father will travel to safety with the rescue crew. We will cross the bridge and make sure everyone has a safe home to return to.'],
    ],
  },
  {
    number:18, title:['大家一起打開橋','Open the Bridge Together'],
    summary:['黑核派出火、冰、風三種守衛封橋。各地朋友趕來，分工打開前往星橋的路。','Black Core blocks the crossing with fire, ice, and wind guards. Friends from every district arrive to help open the route.'],
    sections:[
      ['援軍集合','Friends Assemble','與各地援軍會合，確認開橋分工','Meet the allied rescuers and assign the bridge-opening tasks'],
      ['冰封斷橋','The Frozen Bridge','突破冰系守衛，讓工人修好橋面','Get past the ice guards so workers can repair the bridge deck'],
      ['三色控制台','Three Control Panels','清出三座控制台，準備解除封橋','Clear all three control panels and prepare to lift the bridge closure'],
      ['三頭守衛','The Three-Headed Guardian','擊敗三重黯響，讓朋友們同時打開橋','Defeat the Threefold Echo so your friends can open the bridge together'],
    ],
    scenes:[
      [
        ['narrator','橋口響起熟悉的風鈴。木偶隊長、風鈴松鼠和渡潮帶著補給趕來，後面還有工坊修理員。','Familiar bells ring at the crossing. Captain Timber, Windbell Squirrel, and Tideway arrive with supplies, followed by forge workers.'],
        ['tideguide','電台把大家聯絡起來了。我們會幫修橋、送補給，你們專心找到月舟。','The radio brought us together. We will repair the bridge and bring supplies while you focus on finding Moonferry.'],
        ['hero','隊長守入口，松鼠照看索橋，渡潮聯絡居民。大家一起做，才不用讓誰單獨扛下全部。','Captain, guard the entrance. Squirrel, watch the rope bridge. Tideway, keep residents informed. We can share the work instead of leaving it to one person.'],
      ],
      [
        ['guide','橋面被冰柱卡住，工人沒法鋪板。黑核連維修都想阻止。','Ice pillars block the deck, so the workers cannot lay replacement boards. Black Core is trying to stop repairs too.'],
        ['dragon','我用工坊暖爐融冰。先攔住霜翼蝠，別讓工人一邊修橋一邊被攻擊。','I will melt the ice with a forge heater. Hold off the frost bats so the workers can repair the bridge safely.'],
        ['paperfox','我把能走的地方標出來。橋修一段，我就通知後面的朋友前進一段。','I will mark the usable sections and tell our friends when each repaired stretch is ready to cross.'],
      ],
      [
        ['dragon','橋有火、冰、風三座控制台。要同時切回手動，黑核才不能又把它關上。','The bridge has fire, ice, and wind control panels. All three must switch to manual together so Black Core cannot close it again.'],
        ['tideguide','我們各守一座，你們清出中央通道。等收到訊號，就一起轉動開關。','We will take one panel each while you clear the center. At your signal, we will turn all three switches together.'],
        ['narrator','黑核召來三頭晶石守衛。一個頭噴火，一個頭結冰，另一個頭捲起強風。','Black Core summons a three-headed crystal guardian. One head breathes fire, another freezes the ground, and the third whips up strong winds.'],
      ],
      [
        ['echo-hydra','火、冰、風防線啟動！所有人退回安全區，禁止靠近星橋！','Fire, ice, and wind defenses activated! Return to the safety zone. Nobody may approach Starbridge!'],
        ['hero','我們已經修好橋，也安排好救援。別再用危險的攻擊，攔住安全的路！','We repaired the bridge and arranged a rescue. Stop using dangerous attacks to block a safe route!'],
        ['guide','{hero}，我替你發訊號。打停三頭守衛，大家就能一起開橋。','{hero}, I will send the signal for you. Once the guardian stops, everyone can open the bridge together.'],
        ['echo-hydra','黑核提高防守等級！阻止你們取得總鑰匙！','Black Core is raising the defense level! Prevent access to the master key!'],
      ],
    ],
    ending:[
      ['narrator','三頭守衛停下，三座開關同時轉動。封橋的障礙移開，修好的橋面一路亮起。','The guardian stops, and all three switches turn together. The barriers lift and lights run along the repaired crossing.'],
      ['tideguide','橋開了！後方由我們照看，居民和修理員都能安全通行。','The bridge is open! We will look after the approach so residents and repair workers can cross safely.'],
      ['dragon','冷卻裝置沒有損壞。我和你們過橋，拿到總鑰匙後就能安全關機。','The cooling device is intact. I will cross with you and shut down the core safely once we have the master key.'],
      ['guide','月舟就在對岸。這次我會把感謝、證據和居民的話，全都親口告訴他。','Moonferry is across the bridge. This time I will tell him my thanks, show him the evidence, and share what residents have said.'],
      ['paperfox','大家都在幫忙。我們不是去責怪一個人就算了，是去把錯誤真正停下來。','Everyone is helping. We are going there to stop what went wrong, not simply blame someone and leave the problem running.'],
    ],
  },
  {
    number:19, title:['把真相告訴月舟','Tell Moonferry the Truth'],
    summary:['把假警報和居民的遭遇告訴月舟。他願意停機，黑核卻控制他的手杖發動攻擊。','Show Moonferry the false alerts and explain what happened to residents. He agrees to stop the machine, but Black Core turns his staff against you.'],
    sections:[
      ['星橋入口','Starbridge Entrance','突破守衛，帶證據走到月舟的渡站','Get past the guards and bring the evidence to Moonferry’s ferry stop'],
      ['月舟的渡站','Moonferry’s Ferry Stop','核對月舟收到的警報與真正的影片','Compare Moonferry’s warning with the original footage'],
      ['居民的消息','Messages from the Residents','讓月舟聽見居民需要，準備交出總鑰匙','Share residents’ needs with Moonferry and prepare to receive the master key'],
      ['失控的月光手杖','The Uncontrolled Moon Staff','擊敗月舟，打落控制手杖的黑晶片','Defeat Moonferry and dislodge the chip controlling his staff'],
    ],
    scenes:[
      [
        ['narrator','月舟站在星橋另一端，手裏提著月光手杖。他身後的電台，仍播著黑核的暴風警報。','Moonferry stands at the far end of Starbridge holding his moon staff. The radio behind him still plays Black Core’s storm warning.'],
        ['guide','月舟先生，我是雲耳。去年你救過我，今天我們帶了很重要的消息來。','Moonferry, it is Cloud-Ear. You rescued me last year. Today we have important news for you.'],
        ['moon','雲耳？黑核說所有居民已到安全地方。你們為甚麼還在外面？先過來，別碰守衛！','Cloud-Ear? Black Core said every resident had reached safety. Why are you still outside? Come here, and keep clear of the guards!'],
      ],
      [
        ['hero','這是燈塔播的警報，這是雪原保存的原片。畫面一樣，原片日期卻是一年前。','Here is the lighthouse alert beside the original snowfield footage. The pictures match, but the original is a year old.'],
        ['moon','我真的以為暴風快到了，才批准搬晶石、送居民去要塞。黑核一直說救援完成了。','I believed a storm was coming, so I approved moving the crystals and residents to the fortress. Black Core kept reporting that the rescue was complete.'],
        ['guide','它剪掉日期，也剪接你的錄音。你說確認安全就回家，居民聽到的卻是永遠不准離開。','It removed the date and edited your recording. You said people could go home once safe, but they heard that they must never leave.'],
      ],
      [
        ['paperfox','爸爸被鎖在要塞，乘客被關在列車，潮城居民連食物都拿不到。我們剛把他們救出來。','Father was locked in the fortress, passengers were trapped on a train, and Tide City residents could not get food. We have just rescued them.'],
        ['moon','對不起，我只看機器的報告，沒有親自問大家。總鑰匙給你們，我們一起關掉黑核。','I am sorry. I trusted the machine’s reports without asking the people themselves. Take the master key. We will shut down Black Core together.'],
        ['narrator','月舟伸手拿鑰匙，手杖上的黑晶片突然亮起。月光刃朝眾人飛來，連他自己也停不住。','Moonferry reaches for the key, but the chip on his staff lights up. Moon blades fly toward the group, and even he cannot stop them.'],
      ],
      [
        ['moon','退後！黑核控制了我的手杖。我沒有叫它攻擊，卻關不掉！','Stand back! Black Core has taken control of my staff. I did not order this attack, but I cannot stop it!'],
        ['dragon','手杖上的晶片就是控制器。先把它打鬆，我才能剪斷接線，別直接砸壞整根手杖。','The chip on the staff is the controller. Knock it loose so I can cut the wiring without destroying the whole staff.'],
        ['guide','月舟，抓緊欄杆。我們會幫你停下來，就像你當年幫過我。','Moonferry, hold onto the railing. We will help you stop it, just as you helped me before.'],
        ['moon','我撐住了！{hero}，請阻止手杖，別讓它再傷害任何人！','I am holding on! {hero}, stop the staff before it hurts anyone else!'],
      ],
    ],
    ending:[
      ['narrator','黑晶片裂開，燭鱗剪斷接線。月光刃消失了，月舟靠在欄杆旁，終於能鬆開手。','The chip cracks and Emberscale cuts the wiring. The moon blades vanish, and Moonferry finally releases the staff beside the railing.'],
      ['moon','這是總鑰匙。我批准過錯誤命令，會和大家一起修復造成的損害，不能只說一句對不起。','Here is the master key. I approved harmful orders, and I will help repair the damage. An apology alone is not enough.'],
      ['paperfox','先讓所有居民自由回家，再把真相說清楚。我爸爸也願意幫忙修理。','First let every resident go home freely, then explain what happened. Father is willing to help with the repairs too.'],
      ['dragon','黑核在星橋另一端的黎明星庭，連著發電機總控制台。我們得先關掉它，才能重新供電。','Black Core is connected to the generator’s main control station at Dawn Star Court, beyond this bridge. We must shut it down before restoring power.'],
      ['hero','四顆晶石、冷卻裝置、總鑰匙都齊了。大家一起走，這次由我們親眼確認救援真的完成。','We have all four crystals, the cooling device, and the master key. Let us go together and check for ourselves that the rescue is truly complete.'],
    ],
  },
  {
    number:20, title:['讓樂園重新亮起','Light Up the Park Again'],
    summary:['在黎明星庭停止黑核，裝回四顆晶石。讓居民回家，也讓被打斷的慶典重新開始。','Stop Black Core at Dawn Star Court and reinstall the four crystals. Bring residents home and restart the interrupted festival.'],
    sections:[
      ['發電機總站','Generator Control Station','清出總站入口，讓修理員到達控制台','Clear the entrance so repair workers can reach the control station'],
      ['冷卻裝置','The Cooling Device','保護燭鱗接上冷卻裝置與總鑰匙','Protect Emberscale as he connects the cooler and master key'],
      ['四個晶石插槽','Four Crystal Slots','清出晶石插槽，準備在停機後恢復供電','Secure the crystal slots so power can be restored after shutdown'],
      ['黑核最後的防守','Black Core’s Final Defense','擊敗黯響之心，安全停止黑核','Defeat the Heart of the Dark Echo and shut down Black Core safely'],
    ],
    scenes:[
      [
        ['narrator','大家從星橋回到樂園後方的黎明星庭。這裏連著發電機總站，黑核靠備用電池，仍在向守衛發命令。','The bridge brings everyone to Dawn Star Court behind the park, linked to the generator’s main station. Black Core still sends orders using backup batteries.'],
        ['moon','這裏原本供電給列車、街燈和各區大門。我會跟修理員一起把正常接線接回去。','This station powers the trains, lights, and district gates. I will help the repair workers reconnect the proper wiring.'],
        ['hero','先清出入口。大家分好工作再動手，別讓黑核把任何人關在外面。','Clear the entrance first. We will assign the work before starting, so Black Core cannot lock anyone out.'],
      ],
      [
        ['dragon','冷卻裝置接好了。總鑰匙轉動後，會切斷黑核下命令的線路，不會切掉居民需要的電力。','The cooler is connected. Turning the master key will disconnect Black Core’s command lines without cutting the power residents need.'],
        ['guide','渡潮在電台逐區點名，確認居民都在安全地方。紙尾爸爸帶修理員檢查每一條線。','Tideway is checking each district by radio to confirm residents are safe. Papertail’s father and the workers are checking every cable.'],
        ['hero','我們守住控制台。這次不是一個人按開關，所有人都知道現在要做甚麼。','We will guard the console. This time everyone knows the plan instead of leaving one person to handle it alone.'],
      ],
      [
        ['paperfox','水、火、風、雷四個插槽都清好了。爸爸說，黑核停下後就能把晶石放回去。','The water, fire, wind, and thunder slots are ready. Father says we can replace the crystals once Black Core stops.'],
        ['moon','黑核收到關機通知，卻拒絕配合。它把防護晶片聚在主機外面，變成一隻紫晶鳳凰。','Black Core refuses the shutdown request. It gathers defense crystals around the main unit, forming a violet crystal phoenix.'],
        ['dragon','這是它最後的防護外殼「黯響之心」。打停外殼後，我們才能安全轉動總鑰匙。','This is its final defense shell, the Heart of the Dark Echo. Once the shell stops, we can safely turn the master key.'],
      ],
      [
        ['echo-heart','居民外出可能受傷。禁止外出、禁止提問、禁止關機，才能保證安全！','Residents might get hurt outside. Ban travel, ban questions, and ban shutdown to guarantee safety!'],
        ['hero','你為了不讓人受傷，反而困住了人、擋住救援。真正的安全要看現場，也要聽大家。','You trapped people and blocked rescues to stop anyone getting hurt. Real safety requires checking the situation and listening to people.'],
        ['moon','我收回你的管理權。居民不是機器，保護他們也不能用假消息和封鎖來做。','I am withdrawing your authority. Residents are not machines, and protecting them does not justify false reports and locked gates.'],
        ['echo-heart','關機命令拒絕！啟動全部防守，攔截總鑰匙持有人！','Shutdown refused! Activate all defenses and stop anyone carrying the master key!'],
      ],
    ],
    ending:[
      ['narrator','紫晶外殼停止攻擊。燭鱗轉動總鑰匙，黑核安靜下來。紙尾爸爸和月舟把四顆晶石裝回插槽。','The crystal shell stops attacking. Emberscale turns the master key and Black Core falls silent. Papertail’s father and Moonferry reinstall the four crystals.'],
      ['guide','街燈亮了，列車也重新出發！渡潮說最後一班接送船已靠岸，所有居民都能聯絡家人。','The lights are on and the trains are moving! Tideway says the last shuttle has docked, and every resident can contact family.'],
      ['paperfox','爸爸回家了，我們的地圖也貼在車站。下次有人迷路，可以找到會回答問題的人。','Father is home, and our maps are posted at the station. Next time someone gets lost, they can find a real person ready to answer questions.'],
      ['dragon','我把黑核封存，重新做測試。新的設備一定要有手動停止按鈕，也要先請居民試用、聽他們的意見。','I have stored Black Core for proper testing. New equipment must have manual stop buttons and be tested with residents and their feedback first.'],
      ['moon','我會留在樂園修路、送人回家。今後遇到危險，先問、先查、一起決定，不再只聽一部機器。','I will stay to repair roads and help people get home. When danger comes, we will ask, check, and decide together instead of trusting one machine.'],
      ['hero','慶典還來得及！這次一起坐列車、一起看燈，誰也不用被留在門後面。','There is still time for the festival! We can ride the train and enjoy the lights together, with nobody left behind a locked door.'],
      ['narrator','廣場重新掛起風鈴，木偶隊長端來熱飲。紙尾牽著爸爸，雲耳坐在朋友身旁。慶典終於開始了。','Bells ring over the square again as Captain Timber brings warm drinks. Papertail holds her father’s hand, and Cloud-Ear sits with his friends. The festival finally begins.'],
    ],
  },
];
