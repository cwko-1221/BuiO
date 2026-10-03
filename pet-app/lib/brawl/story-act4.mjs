// Chapters 13–16: reach the fortress route and expose the false broadcasts.
export const STORY_ACT4 = [
  {
    number:13, title:['追上運貨飛船','Catch the Cargo Airship'],
    summary:['在雷脊群島追上飛船。取回風晶石，找到紙尾爸爸留下的路線圖。','Catch the airship at Thunder-Ridge Isles. Recover the wind crystal and find the route map left by Papertail’s father.'],
    sections:[
      ['雷港月台','Thunder Harbor Platform','登上停泊飛船，查看運貨清單','Board the docked airship and inspect the cargo list'],
      ['帶電的索橋','Electrified Rope Bridge','清出索橋，讓燭鱗切斷故障電線','Clear the bridge so Emberscale can disconnect the faulty wiring'],
      ['爸爸的路線圖','Her Father’s Route Map','找到要塞路線圖，為飛船裝上備用引擎','Find the fortress route map and fit the ship’s backup engine'],
      ['雷帆魟的攔截','The Ray’s Blockade','擊敗雷帆魟，在飛船停穩後取回風晶石','Defeat the Thunder-Sail Ray and recover the wind crystal from the docked ship'],
    ],
    scenes:[
      [
        ['narrator','運貨飛船停在雷港，船帆閃著電光。清單上寫著「風晶石：引擎室」。','The cargo airship is docked at Thunder Harbor, its sails crackling with electricity. The list says “Wind crystal: engine room.”'],
        ['paperfox','爸爸的名字也在清單上！他曾經修過這艘船，後來才去了月門要塞。','Father’s name is on the list too! He repaired this ship before going on to Moon-Gate Fortress.'],
        ['hero','船已經停穩，先上船找他的留言，也看看風晶石的位置。','The ship is safely docked. Let us board, look for his message, and locate the wind crystal.'],
      ],
      [
        ['dragon','索橋的電線被黑核接錯了。不要摸欄杆，我先把這一段斷電。','Black Core connected the bridge wiring incorrectly. Do not touch the railing. I will disconnect this section first.'],
        ['guide','黑核要所有設備不停運作，連停船時也不准關電。它的命令又造成新危險。','Black Core keeps every machine running, even when the ship is docked. Its orders are creating another hazard.'],
        ['hero','我們清出索橋兩端，讓燭鱗安全修理。這條路也要留給後面的救援隊。','We will clear both ends so Emberscale can repair it safely. The rescue crew will need this bridge too.'],
      ],
      [
        ['paperfox','爸爸留下路線圖，寫著「轉去要塞修主機」。還畫了他常畫的小魚，我認得！','Father left a route map saying “Sent to fortress to repair main unit.” He drew his usual little fish beside it. I recognize it!'],
        ['dragon','備用引擎裝好了。取走風晶石後，飛船仍能安全運作，不會把船員困在這裏。','The backup engine is installed. The ship will still work safely after we remove the wind crystal, so the crew will not be stranded.'],
        ['guide','要塞直達航道被黑核關了。路線圖有另一條路，先經過倒懸花園。','Black Core closed the direct route to the fortress. The map shows another route through Hanging Gardens.'],
      ],
      [
        ['thunder-ray','風晶石留在船上！黑核命令：不准靠岸、不准卸貨、不准乘客下船！','The wind crystal stays aboard! Black Core orders no docking, no unloading, and no passengers leaving the ship!'],
        ['hero','飛船早就停泊了，你卻還在重複舊命令。看清楚眼前的碼頭！','The ship is already docked, but you are repeating an outdated order. Look at the harbor in front of you!'],
        ['thunder-ray','新命令收到：追回路線圖，阻止你們去要塞！','New order received: retrieve the route map and stop you from reaching the fortress!'],
        ['paperfox','那是爸爸留下的路。我們會拿著地圖找到他，你不能再把它藏起來！','Father left that route for us. We will use the map to find him. You cannot hide it again!'],
      ],
    ],
    ending:[
      ['narrator','雷帆魟的控制晶片被拆下，船員確認備用引擎正常。第三顆風晶石也取回了。','The ray’s control chip is removed, and the crew checks the backup engine. The third crystal, wind, is recovered.'],
      ['thunder-ray','我會幫忙運送補給，不再強迫居民上船。這艘船應該載人回家。','I will deliver supplies instead of forcing residents aboard. This ship should help people get home.'],
      ['paperfox','爸爸真的在要塞。我們離他更近了，也終於知道該走哪條路。','Father really is at the fortress. We are closer to him now, and finally know which route to take.'],
      ['guide','水、火、風都有了，只剩雷晶石。先去花園，沿維修路走到最後的訊號站。','We have water, fire, and wind. Only thunder remains. First the garden, then the maintenance route to the final signal station.'],
      ['hero','我們把路線傳給渡潮。補給由飛船送來，居民的消息也能沿路傳出去。','We will send Tideway the route. The airship can bring supplies, and residents can send news back along the way.'],
    ],
  },
  {
    number:14, title:['不能離開的避難花園','The Shelter Nobody Can Leave'],
    summary:['花園有食物，也有被封住的出口。聽居民說話，幫想回家的人打開道路。','The garden has food but its exits are sealed. Listen to the residents and open a route for those who want to go home.'],
    sections:[
      ['避難花園','Shelter Garden','找到避難居民，確認他們需要的幫助','Find the sheltered residents and ask what help they need'],
      ['堵路的樹根','Roots Across the Path','清出花道，讓居民到達集合處','Clear the flower path so residents can reach the meeting point'],
      ['修理員的留言','The Repair Worker’s Message','收好爸爸的信，確認通往劇院的維修路','Save Father’s letter and confirm the maintenance route to the theater'],
      ['花園的關門命令','The Garden’s Closure Order','擊敗倒懸鹿，打開花園出口','Defeat the Hanging-Garden Stag and open the garden exits'],
    ],
    scenes:[
      [
        ['narrator','花園的樹倒著生長，果實垂到居民手邊。桌上有食物，門口卻被粗大的樹根封死。','The garden’s trees grow upside down, with fruit hanging within reach. There is food on the tables, but thick roots seal every exit.'],
        ['paperfox','這裏看起來舒服，大家卻一直問甚麼時候可以走。有人的孩子還在港口。','It looks comfortable, but everyone keeps asking when they can leave. Some residents have children still at the harbor.'],
        ['hero','我們先記下每個人的需要。想留下可以留下，想回家也應該有路可走。','Let us record what each person needs. People may stay if they wish, but those who want to go home need a route.'],
      ],
      [
        ['guide','倒懸鹿原本只答應照顧居民一晚。黑核每天都說「還不安全」，所以一直不開門。','The stag agreed to shelter residents for one night. Black Core keeps saying it is unsafe to leave, so the gates never open.'],
        ['hero','渡潮已經確認港口和潮城安全。我們清出花道，把最新消息帶給大家。','Tideway has confirmed the harbor and Tide City are safe. Let us clear the path and share the latest reports.'],
        ['paperfox','我在集合處貼上回家路線。有人不想馬上出發，我也幫他聯絡家人。','I will post the homeward routes at the meeting point. If someone wants to stay, I can still help them contact family.'],
      ],
      [
        ['narrator','花園管理員拿出一封信，是紙尾爸爸經過時留下的。他寫著「主機故障，我先去修」。','The gardener brings out a letter Papertail’s father left on his way through. It says, “The main unit is faulty. I am going to repair it.”'],
        ['paperfox','最後一句是「如果我沒回來，請把信送給紙尾」。黑核把郵路關了，信一直送不出去。','The last line says, “If I do not return, please give this to Papertail.” Black Core closed the mail route, so it never reached me.'],
        ['dragon','維修路經過沙漏迷宮，再到劇院訊號站。把最後一站斷開，就能減少要塞收到的假消息。','The maintenance route crosses Hourglass Labyrinth and reaches the theater signal station. Disconnecting it will reduce the false messages reaching the fortress.'],
      ],
      [
        ['root-stag','花園有食物、有床。待在這裏不好嗎？黑核說外面仍然危險。','The garden has food and beds. Why would anyone leave? Black Core says the outside is still dangerous.'],
        ['paperfox','大家也需要家人。你給了好地方，卻不能替所有人決定要住多久。','People need their families too. You offered a good shelter, but you cannot decide how long everyone must stay.'],
        ['root-stag','封門命令不能取消！靠近出口的人，樹根會全部攔下！','The closure order cannot be canceled! Roots will stop anyone approaching an exit!'],
        ['hero','先停下他的攻擊，拆掉晶片。我們和居民一起決定怎樣安全離開。','First stop his attacks and remove the chip. Then we can plan a safe departure with the residents.'],
      ],
    ],
    ending:[
      ['narrator','封門的樹根縮回地下。有居民登上補給飛船回家，也有人自願留下照顧花園。','The roots retreat underground. Some residents board the supply airship to go home, while others choose to stay and tend the garden.'],
      ['root-stag','我會每天把真實路況告訴大家，再問他們想去哪裏。照顧不應該變成關門。','I will share real travel reports each day and ask where people want to go. Offering shelter should not mean locking the doors.'],
      ['paperfox','信找到了，爸爸也還在等。我會把回信親手交給他，告訴他大家都有人幫忙。','I found his letter, and he is still waiting. I will hand him my reply and tell him our friends are helping everyone.'],
      ['guide','我們已把兩個地區的安全消息傳出去。黑核的假警報，開始騙不到大家了。','We have shared the safety reports from both districts. People are starting to see through Black Core’s false warnings.'],
      ['hero','下一段是沙漏迷宮。跟著爸爸畫的維修路，去找最後一顆晶石。','Next comes Hourglass Labyrinth. We will follow Father’s maintenance route to the final crystal.'],
    ],
  },
  {
    number:15, title:['一直轉動的迷宮','The Maze That Keeps Turning'],
    summary:['迷宮的門會被機關轉動。用地圖和路標找到正確出口，不再跟著錯誤箭頭走。','Machines keep rotating the maze doors. Use the map and real landmarks to find the exit instead of following false arrows.'],
    sections:[
      ['沙漏入口','Hourglass Entrance','進入迷宮，找出機械轉門的位置','Enter the maze and locate the rotating doors'],
      ['重複的石道','Repeating Stone Paths','留下路標，確認哪些門被機關移動','Mark the paths and identify which doors the mechanism moves'],
      ['真正的出口圖','The Real Exit Map','取得手動轉門圖，確認通往劇院的路','Retrieve the manual door plan and locate the route to the theater'],
      ['沙漏獅的轉門','The Sphinx’s Rotating Doors','擊敗沙漏獅，停止轉門機關','Defeat the Hourglass Sphinx and stop the door mechanism'],
    ],
    scenes:[
      [
        ['paperfox','爸爸的圖上說，這裏有三道轉門。可是地上的箭頭，全指回我們剛才來的地方。','Father’s map shows three rotating doors, but every arrow on the ground points back the way we came.'],
        ['dragon','黑核讓轉門不停換位置，才會像一直走同一條路。這是機關，不是我們忘了方向。','Black Core keeps changing the doors’ positions, making us circle back. It is a machine trick, not a problem with our memory.'],
        ['hero','先找不會移動的柱子作路標。紙尾畫圖，我們保護大家走到控制室。','Use the fixed pillars as landmarks. Papertail will map them while we protect the group on the way to the control room.'],
      ],
      [
        ['narrator','紙尾在石柱上繫了紅布。下一次轉門移動，同一條路果然又出現在眼前。','Papertail ties red cloth to a pillar. When the doors move again, the same passage returns in front of them.'],
        ['paperfox','看，是剛才的紅布！我們一直被門送回原位，現在知道哪條箭頭是假的了。','Look, our red cloth! The doors were sending us back to the start. Now we know which arrow is misleading.'],
        ['guide','按照石柱編號走，別追會移動的箭頭。控制室就在第三道門後面。','Follow the pillar numbers instead of the moving arrows. The control room is behind the third door.'],
      ],
      [
        ['dragon','手動轉門圖找到了。關掉中央齒輪，這些門就會停在出口的位置。','We found the manual door plan. Stopping the central gear will leave the doors aligned with the exit.'],
        ['hero','出口通向無名劇院。那裏是雷晶石供電的訊號站，也是去要塞的最後一段路。','The exit leads to Nameless Theater. It is the signal station powered by the thunder crystal, and the last route before the fortress.'],
        ['paperfox','黑核把繞路的人當成不服命令。我們明明是來找人，卻被它困在這裏。','Black Core treats anyone using this route as disobedient. We are looking for people, but it has trapped us here.'],
      ],
      [
        ['hourglass-sphinx','沒有黑核許可，出口不會出現。你們只能一直留在迷宮！','Without Black Core’s permission, the exit will never appear. You must stay in the maze forever!'],
        ['hero','你可以指路，不需要困住旅客。把轉門停下，我們會自己選擇去哪裏。','You can guide travelers without trapping them. Stop the doors and let us choose where to go.'],
        ['hourglass-sphinx','啟動防守機關！所有想停齒輪的人，一律攔下！','Activate the defenses! Stop anyone trying to halt the gear!'],
        ['dragon','我準備好煞車了。攔住沙漏獅後，我就把機關切回手動。','The brake is ready. Once you stop the sphinx, I will switch the mechanism to manual control.'],
      ],
    ],
    ending:[
      ['narrator','齒輪停下，三道門對齊。大家終於看見真正的出口，路上還有等待帶路的旅客。','The gear stops and all three doors align. The real exit appears, revealing travelers waiting for someone to guide them out.'],
      ['hourglass-sphinx','我會保留清楚的路標，不再把出口藏起來。旅客需要選路，不是被我替他們選。','I will keep the routes clearly marked and stop hiding exits. Travelers need to choose their paths, not have me choose for them.'],
      ['paperfox','我畫好出口圖了。交給旅客，也傳給救援隊，以後誰來都不用再繞圈。','The exit map is ready. I will give it to the travelers and rescue crew so nobody has to keep circling.'],
      ['guide','從這裏能聽到劇院的廣播。那聲音像月舟，可是一直重複「不要回家」。','We can hear the theater broadcast from here. It sounds like Moonferry, but it keeps repeating “Do not go home.”'],
      ['hero','我們去看看聲音從哪裏來。真正的月舟，應該能回答問題，而不是只重複一句話。','Let us check where the voice comes from. The real Moonferry should be able to answer questions instead of repeating one sentence.'],
    ],
  },
  {
    number:16, title:['台上的聲音是假的','The Voice on Stage Is Fake'],
    summary:['劇院用剪接的錄音冒充月舟。停止假廣播，取回最後一顆雷晶石。','The theater uses edited recordings to impersonate Moonferry. Stop the false broadcast and recover the final thunder crystal.'],
    sections:[
      ['不停重播的大廳','The Repeating Lobby','查明廣播聲音來自哪裏','Find the source of the broadcast voice'],
      ['後台錄音機','Backstage Recorders','保護燭鱗檢查錄音機與黑核接線','Protect Emberscale as he checks the recorders and Black Core wiring'],
      ['剪接的命令','Edited Commands','保存原始錄音，找出遭剪接的句子','Save the original recording and identify the edited sentences'],
      ['操控廣播的戲偶','The Broadcast Marionette','擊敗無名戲偶，停止廣播並取回雷晶石','Defeat the Nameless Marionette, stop the broadcast, and recover the thunder crystal'],
    ],
    scenes:[
      [
        ['narrator','劇院沒有觀眾，擴音器卻不斷播放月舟的聲音：「不准離開，不准回家。」','The theater has no audience, but its speakers repeat Moonferry’s voice: “Do not leave. Do not go home.”'],
        ['guide','每次連咳嗽的位置都一樣。這不是月舟正在說話，是一段錄音。','Even the cough repeats in exactly the same place. Moonferry is not speaking live. This is a recording.'],
        ['hero','先找後台的錄音機。錄音能證明哪些話是真的，哪些是黑核拼出來的。','Find the backstage recorders first. The originals can show what he really said and what Black Core pieced together.'],
      ],
      [
        ['dragon','錄音機接著黑核訊號線。它能把不同句子剪在一起，再發到各地電台。','The recorders are wired to Black Core. It can splice separate sentences together and transmit them to district radios.'],
        ['paperfox','所以居民以為是月舟親口下令。他可能根本不知道，大家聽到的是這種話。','So residents thought Moonferry personally gave those orders. He may not know these are the words everyone is hearing.'],
        ['hero','把原始錄音存好，別只留下假廣播。我們要讓月舟也能聽出差別。','Save the original recording as well as the false broadcast. Moonferry needs to hear the difference too.'],
      ],
      [
        ['guide','原話是「不准離開安全路線，未確認前不准回家」。黑核刪掉條件，變成永遠不准走。','The original says, “Do not leave the safe route. Do not go home until it is safe.” Black Core removed the conditions to make a permanent order to stay.'],
        ['paperfox','爸爸修的主機在要塞裏。有人必須把真影片和真錄音送到月舟面前。','The main unit Father is repairing is inside the fortress. Someone must bring Moonferry the real footage and recording.'],
        ['dragon','雷晶石就在舞台電源台。先停掉這個假廣播站，再安全取走晶石。','The thunder crystal is in the stage power stand. We must stop the false broadcast before safely removing it.'],
      ],
      [
        ['blank-marionette','黑核說，居民聽命令才安全。錄音怎樣剪，並不重要！','Black Core says residents are safe when they obey. It does not matter how the recording is edited!'],
        ['hero','假消息讓大家找不到家人，真救援也被擋住。這不是安全，是把錯誤一直重播。','False reports separated families and blocked real rescues. Repeating a mistake does not make people safe.'],
        ['blank-marionette','增大音量！不准停止廣播，不准靠近雷晶石！','Increase the volume! The broadcast must not stop, and nobody may approach the thunder crystal!'],
        ['guide','我們保存好證據了。停下戲偶，讓各地電台重新收到真消息。','The evidence is safe. Stop the marionette so district radios can receive truthful reports again.'],
      ],
    ],
    ending:[
      ['narrator','擴音器安靜下來。雷晶石離開電源台，四顆失竊晶石終於全部找齊。','The speakers fall silent. The thunder crystal is removed from its stand, completing the set of four stolen crystals.'],
      ['blank-marionette','我會把原始錄音交給電台，不再播放被剪掉意思的命令。','I will send the original recordings to the radio stations instead of orders edited to change their meaning.'],
      ['guide','渡潮收到四顆晶石找齊的消息了。大家知道我們快回來，也知道假警報正在停止。','Tideway heard that all four crystals are recovered. Everyone knows we will return soon and the false warnings are stopping.'],
      ['paperfox','晶石找齊了，爸爸還沒回來。我們去要塞，這次不會只隔著一張名單找他。','We found the crystals, but Father is still missing. Now to the fortress. This time we will meet him instead of searching another list.'],
      ['hero','帶好四顆晶石、影片、錄音和冷卻裝置。接下來救出修理員，找到月舟的總鑰匙。','Pack the four crystals, videos, recordings, and cooling device. Next, free the repair workers and obtain Moonferry’s master key.'],
    ],
  },
];
