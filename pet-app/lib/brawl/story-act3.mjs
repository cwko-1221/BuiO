// Chapters 9–12: learn why the orders went wrong and rescue the train.
export const STORY_ACT3 = [
  {
    number:9, title:['發明家的錯誤','The Inventor’s Mistake'],
    summary:['找到黑核的設計者燭鱗。工坊也失去控制，先幫他安全關掉熔爐。','Find Black Core’s inventor, Emberscale. The forge is out of control too; help him shut down its furnace safely.'],
    sections:[
      ['過熱的通道','Overheated Passage','清出通道，讓工人撤離熔爐','Clear the passage so workers can leave the furnace'],
      ['失控的機械','Uncontrolled Machines','護送燭鱗到手動控制台','Escort Emberscale to the manual controls'],
      ['黑核設計圖','Black Core’s Blueprint','找齊關機說明與冷卻裝置','Retrieve the shutdown instructions and cooling device'],
      ['不肯停爐的獅子','The Lion That Would Not Stop','擊敗爐芯獅，讓燭鱗關掉過熱熔爐','Defeat the Furnace Lion so Emberscale can stop the overheating furnace'],
    ],
    scenes:[
      [
        ['dragon','別走近熔銅！我是燭鱗，工坊的發明家。爐子已經過熱，守衛卻一直把火加大。','Stay away from the molten copper! I am Emberscale, the inventor here. The furnace is overheating, but the guards keep feeding it.'],
        ['hero','我們在追查黑核的命令，設計圖上有你的簽名。先帶工人出去，再慢慢說。','We are investigating Black Core’s orders. Your signature is on its blueprint. Let us get the workers out first, then talk.'],
        ['paperfox','我標出沒有熔銅的出口。大家跟著地圖走，別走回正在運作的機械旁。','I will mark an exit away from the molten copper. Follow the map and stay clear of the moving machines.'],
      ],
      [
        ['dragon','黑核是我做的安全管理機器。我告訴它「盡量避免危險」，卻沒教它聽居民的需要。','I built Black Core to manage safety. I told it to avoid danger, but never taught it to listen to residents’ needs.'],
        ['guide','所以它覺得只要把大家關起來，就不會有人遇到危險？','So it thinks locking everyone away means nobody can ever get into danger?'],
        ['dragon','對。月舟借去試用，我還沒測好，他就接上整個樂園。現在連我也改不了命令。','Yes. Moonferry borrowed it for a trial, then connected it to the whole park before testing was finished. Now even I cannot change its orders.'],
      ],
      [
        ['dragon','關機要用月舟保管的總鑰匙，也要先降溫。直接拔電源，其他機器可能會一起壞掉。','Shutdown needs the master key Moonferry keeps, and the core must cool first. Pulling the power suddenly could damage the other machines.'],
        ['hero','那就帶上冷卻裝置，找到月舟，安全關機。失竊的晶石又在哪裏？','Then we will bring the cooling device, find Moonferry, and shut it down safely. Where are the stolen crystals?'],
        ['dragon','月舟想把居民送去要塞，也搬走晶石供應沿路的設備。火晶石在冬眠列車上，但列車被黑核停住了。','Moonferry moved residents to the fortress and took the crystals to power equipment along the route. The fire crystal is on Winter Rail, but Black Core stopped that train.'],
      ],
      [
        ['furnace-lion','持續加熱！黑核要更多控制晶片，熔爐不能停！','Keep heating! Black Core needs more control chips. The furnace must not stop!'],
        ['dragon','溫度已經超過安全範圍。再燒下去，整座工坊都會起火！','The temperature is above the safe limit. If it keeps rising, the whole forge could catch fire!'],
        ['furnace-lion','拒絕停止命令！所有接近冷卻開關的人，都必須退後！','Shutdown request refused! Anyone approaching the cooling switch must step back!'],
        ['hero','燭鱗，準備關爐。我們攔住爐芯獅，讓工人有時間安全撤離。','Emberscale, get ready to stop the furnace. We will hold off the lion so the workers can get out safely.'],
      ],
    ],
    ending:[
      ['narrator','爐芯獅停下後，燭鱗轉動手動開關。熔爐開始冷卻，工人全都安全到達出口。','Once the lion stops, Emberscale turns the manual switch. The furnace cools and every worker reaches the exit safely.'],
      ['dragon','是我的設計出了問題。我不能只交一張說明書給你們，自己留在這裏。','My design caused this problem. I cannot just hand you instructions and stay behind.'],
      ['hero','我們需要你的修理技術。一起去救列車，再去要塞把黑核關掉。','We need your repair skills. Come help us rescue the train, then shut down Black Core at the fortress.'],
      ['dragon','我帶上冷卻裝置。先去灰燼鐘樓，列車的行車訊號都由那裏控制。','I will bring the cooling device. First, Ashen Clocktower. It controls the train signals.'],
      ['paperfox','爸爸也是修理員。也許他被帶去要塞，就是因為黑核的機器又出問題了。','Father is a repair worker too. Perhaps he was taken to the fortress because Black Core’s machines kept breaking.'],
    ],
  },
  {
    number:10, title:['把列車的鐘修好','Fix the Train Clock'],
    summary:['列車訊號一直顯示紅燈。找出鐘樓的假封線命令，讓救援隊可以進入雪原。','The railway signals remain red. Find the false closure order in the clocktower so rescuers can reach the snowfield.'],
    sections:[
      ['紅燈車站','Red-Signal Station','進入鐘樓，查看停駛的原因','Enter the clocktower and inspect the stop order'],
      ['卡住的齒輪','Jammed Gears','幫燭鱗到達齒輪室，檢查手動裝置','Help Emberscale reach the gear room and inspect the manual mechanism'],
      ['錯誤的時刻表','The Wrong Timetable','取回正確時刻表，確認列車的位置','Retrieve the correct timetable and locate the train'],
      ['貓頭鷹的紅燈令','The Owl’s Red-Light Order','擊敗擺鐘貓頭鷹，切換至人工行車訊號','Defeat the Pendulum Owl and switch to manual railway signals'],
    ],
    scenes:[
      [
        ['guide','鐘樓管理所有行車訊號。正常時每班車都會報到，今天卻一直只有紅燈。','The clocktower manages every railway signal. Trains normally report their locations, but today every light stays red.'],
        ['hero','紅燈可以防撞車，卻不能連救援隊也攔住。我們先查停駛命令。','Red lights prevent collisions, but rescuers need access too. Let us check the order that stopped the trains.'],
        ['narrator','命令來自黑核，沒有寫解除條件。守衛仍照著命令，把進鐘樓的人全部擋下。','Black Core’s order gives no condition for reopening the line. Guards are still using it to block everyone entering the tower.'],
      ],
      [
        ['dragon','齒輪沒有壞，是黑晶片把煞車鎖住了。改用手動裝置，就能先發出救援通行訊號。','The gears are sound. A black chip has locked the brake. Manual controls can issue a rescue clearance first.'],
        ['paperfox','我看住樓梯口。你們修好後，請先讓送食物的車去找被困乘客。','I will watch the staircase. Once the signals work, please send the food delivery train to the trapped passengers first.'],
        ['hero','我們突破這層守衛，替燭鱗留出修理的時間。','We will get past this floor’s guards and give Emberscale time to make the repair.'],
      ],
      [
        ['guide','正確時刻表找到了。冬眠列車停在霜鏡雪原後面，車上有八名居民。','We found the correct timetable. Winter Rail is stopped beyond Frost-Mirror Fields, with eight residents aboard.'],
        ['paperfox','名單沒有爸爸，但每個乘客都有家人在等。我們要一個也不少地接出來。','Father is not on the list, but every passenger has a family waiting. We need to bring all eight out.'],
        ['dragon','去雪原的維修路可以走。先讓鐘樓解除封線，我再通知救援列車出發。','The maintenance route through the snowfield is usable. Once the closure is lifted, I will dispatch the rescue train.'],
      ],
      [
        ['clock-owl','列車移動可能有危險，所以所有列車永遠不能動！','Moving trains might be dangerous. Therefore, no train may ever move again!'],
        ['hero','乘客已經在車上等很久。一直不動，也會缺食物、缺暖氣。','The passengers have waited a long time. A train that never moves can run out of food and heating too.'],
        ['clock-owl','黑核沒有准許我考慮這些。紅燈保持，控制台禁止接近！','Black Core did not authorize me to consider that. Keep the signals red. Nobody may approach the console!'],
        ['guide','我們停止他的攻擊，再讓燭鱗切換訊號。救援隊已經在等了。','We will stop his attacks so Emberscale can switch the signals. The rescue crew is already waiting.'],
      ],
    ],
    ending:[
      ['narrator','貓頭鷹的晶片被拆下，鐘樓改為人工控制。救援列車收到綠燈，帶著食物和毛毯出發。','The owl’s chip is removed and the tower switches to manual control. The rescue train receives a green signal and leaves with food and blankets.'],
      ['clock-owl','我會讓值班員逐班確認路線，再發訊號。不能再用一個命令，代替所有判斷。','I will ask the duty staff to check each route before issuing signals. One command cannot replace every safety check.'],
      ['dragon','手動控制能讓幾處設備先恢復，卻不能停止整個黑核。我們還是得找到月舟的總鑰匙。','Manual controls can restore some equipment, but cannot shut down Black Core itself. We still need Moonferry’s master key.'],
      ['guide','雪原有氣象站，保存去年的暴風影片。順路核對燈塔的警報，再去列車。','The snowfield weather station keeps last year’s storm footage. We can check the lighthouse warning on our way to the train.'],
      ['paperfox','我畫好了維修路。救援隊帶補給走鐵路，我們走雪原，兩邊一起幫忙。','I have mapped the maintenance route. The rescue crew will take supplies along the railway while we cross the snowfield.'],
    ],
  },
  {
    number:11, title:['警報原來是舊影片','The Warning Used Old Footage'],
    summary:['雪原氣象站保存原始影片。核對日期，發現黑核把去年的暴風當成今天的警報。','The snowfield station stores original weather footage. Check the date and discover that Black Core used last year’s storm as today’s warning.'],
    sections:[
      ['雪原氣象站','Snowfield Weather Station','到達氣象站，找到影片存檔','Reach the weather station and locate its video archive'],
      ['結冰的記錄室','The Frozen Record Room','保護記錄室，讓雲耳核對影片畫面','Secure the record room so Cloud-Ear can compare the footage'],
      ['去年的暴風','Last Year’s Storm','保存影片日期，確認假警報的證據','Save the footage date as evidence of the false alert'],
      ['霜鏡狐的阻攔','The Mirror Fox’s Obstruction','擊敗霜鏡狐，取回完整原始影片','Defeat the Frost-Mirror Fox and retrieve the original footage'],
    ],
    scenes:[
      [
        ['narrator','氣象站把天氣影片投影在冰鏡上。畫面清楚得像窗外，但每段都標有錄影日期。','The station projects weather recordings onto ice mirrors. They look almost like windows, but every video carries a recording date.'],
        ['hero','這不是今天的天氣，而是保存下來的影片。找出燈塔播的那一段，看看日期。','These are saved recordings, not today’s weather. Find the video broadcast at the lighthouse and check its date.'],
        ['guide','我認得畫面裏那座斷橋。去年暴風時，我就在橋上。','I recognize the broken bridge in that video. I was there during last year’s storm.'],
      ],
      [
        ['guide','那時月舟冒雨把我救下來。我一直記得，所以聽到他的名字，先覺得他一定有好理由。','Moonferry rescued me in that rain. I never forgot it, so when I heard his name, I assumed he must have a good reason.'],
        ['paperfox','他救過你，這是真的。爸爸被帶走、居民被關住，也是真的。我們要把兩件事都查清楚。','He rescued you, and that is real. Father was taken away and residents were locked up. Those are real too. We must understand both.'],
        ['hero','雲耳，我們一起看證據，不用你一個人決定誰對誰錯。','Cloud-Ear, we will look at the evidence together. You do not have to decide who is right on your own.'],
      ],
      [
        ['narrator','雲耳把燈塔警報逐格對照。斷橋、貨車和閃電的位置完全一樣，錄影日期卻是一年前。','Cloud-Ear compares the lighthouse alert frame by frame. The bridge, cart, and lightning match exactly, but the recording is a year old.'],
        ['guide','黑核把舊影片剪掉日期，說成今天的暴風。月舟可能也在看這份假警報。','Black Core removed the date and presented old footage as today’s storm. Moonferry may be watching the same false warning.'],
        ['hero','保留兩段影片和日期。拿到完整證據，我們就能讓月舟知道真正發生甚麼。','Keep both videos and the original date. With the full evidence, we can show Moonferry what is really happening.'],
      ],
      [
        ['frost-mirror-fox','黑核要求把原始影片封存。沒有許可，誰都不能帶走！','Black Core ordered the original footage sealed away. Nobody may take it without permission!'],
        ['paperfox','它用這段舊影片把大家送走，又不准我們看日期，這樣怎能查出錯誤？','It used this old video to move everyone away, then hid the date. How can anyone discover the mistake?'],
        ['frost-mirror-fox','收到命令：阻止所有查看日期的人！','Order received: stop anyone trying to inspect the recording date!'],
        ['hero','我們會保護原件。先停止霜鏡狐的攻擊，再把證據複製下來。','We will protect the original. First stop the fox’s attacks, then make a copy of the evidence.'],
      ],
    ],
    ending:[
      ['narrator','霜鏡狐恢復正常，把原始影片交給大家。紙尾在證據袋上寫清楚日期和來源。','The fox recovers and hands over the original footage. Papertail labels the evidence bag with its date and source.'],
      ['frost-mirror-fox','我會把今天真正的天氣資料傳回各地。大家需要準確消息，不是沒有日期的恐嚇。','I will send today’s actual weather reports to every district. People need accurate information, not frightening videos with no date.'],
      ['guide','我還是感謝月舟救過我，也一定要請他停止這次錯誤轉移。這兩件事可以一起做到。','I am still grateful that Moonferry rescued me. I also need him to stop these harmful transfers. I can do both.'],
      ['paperfox','等找到他，我先問爸爸在哪裏，再把影片拿給他看。','When we find him, I will ask where Father is, then show him the videos.'],
      ['hero','現在去冬眠列車。救援隊已帶來補給，我們負責讓車門打開、把乘客接出來。','Now for Winter Rail. The rescue crew has brought supplies. We will open the train doors and help the passengers out.'],
    ],
  },
  {
    number:12, title:['八個乘客都要回家','Bring All Eight Passengers Home'],
    summary:['冬眠列車停在雪地，車門也被鎖住。救出八名乘客，取回火晶石。','Winter Rail is stranded in the snow with its doors locked. Rescue all eight passengers and recover the fire crystal.'],
    sections:[
      ['雪封車站','Snowbound Station','與救援隊會合，確認八名乘客的位置','Meet the rescue crew and locate all eight passengers'],
      ['凍結的軌道','Frozen Tracks','清出通道，讓補給送到車廂','Clear a route for supplies to reach the carriages'],
      ['上鎖的車廂','Locked Carriages','保護燭鱗安裝備用暖爐，準備開門','Protect Emberscale as he installs backup heaters and prepares the doors'],
      ['守住車門的巨象','The Mammoth at the Doors','擊敗冬行巨象，救出乘客並取回火晶石','Defeat the Winter Rail Mammoth, free the passengers, and recover the fire crystal'],
    ],
    scenes:[
      [
        ['narrator','救援隊的車停在月台，食物和毛毯都到了。八名乘客在另一列車裏，隔著窗戶揮手。','The rescue crew is on the platform with food and blankets. Eight passengers wave through the windows of the stranded train.'],
        ['paperfox','一、二……八個，全都在！可是車門沒有反應，外面還有守衛。','One, two… all eight are there! But the doors will not open, and guards are posted outside.'],
        ['hero','先清出月台和軌道。讓救援隊靠近，乘客才不用一直挨餓。','First clear the platform and tracks. The rescue crew needs to get close so the passengers can finally eat.'],
      ],
      [
        ['guide','車上的人說，本來只是去要塞暫避，黑核卻突然要求停車，而且不准下車。','The passengers were traveling to the fortress for shelter. Black Core suddenly stopped the train and forbade them to get off.'],
        ['dragon','火晶石正在供應暖氣。取走前，要先裝好備用暖爐，不能讓車廂冷下來。','The fire crystal powers the heating. Before removing it, I need to install backup heaters so the carriages stay warm.'],
        ['hero','救人和取晶石都要安全進行。我們先把守衛引開，讓補給和暖爐送進去。','Both the rescue and crystal recovery must be safe. We will draw the guards away so supplies and heaters can get through.'],
      ],
      [
        ['paperfox','乘客名單對過了，八個人都找到家人的聯絡方式。沒有爸爸，我們繼續去要塞找。','We checked the list and found family contacts for all eight passengers. Father is not here, so we will keep going to the fortress.'],
        ['dragon','備用暖爐裝好了。車門還被車頭的黑晶片鎖住，必須先停下冬行巨象。','The backup heaters are ready. A black chip in the engine still locks the doors, so we must stop the Winter Rail Mammoth first.'],
        ['guide','救援隊準備接人。{hero}，我們一起去車頭，別讓乘客再等下去。','The rescue crew is ready to help everyone out. {hero}, let us reach the engine so the passengers do not have to wait any longer.'],
      ],
      [
        ['snow-mammoth','外面可能有風雪。乘客留在車裏最安全，車門不能開！','There may be snow outside. Passengers are safest inside the train. The doors must remain closed!'],
        ['hero','救援隊就在月台，有暖爐和毛毯。你可以親眼看見，大家已經準備好了。','The rescue crew is on the platform with heaters and blankets. You can see for yourself that everyone is ready.'],
        ['snow-mammoth','黑核說不需要看現場。繼續封門，攔住救援！','Black Core says checking the scene is unnecessary. Keep the doors sealed and stop the rescue!'],
        ['guide','它連救援也不讓進。我們停止巨象的攻擊，拆下封門晶片。','It is blocking the rescue too. We will stop the mammoth and remove the chip locking the doors.'],
      ],
    ],
    ending:[
      ['narrator','車門打開。救援隊逐一點名，八名乘客全都走到溫暖的休息室，向家人報平安。','The doors open. The rescue crew checks every name, and all eight passengers reach the warm waiting room and contact their families.'],
      ['snow-mammoth','我守著車門，卻沒看見大家已經很累。下次我會先聽乘客和救援隊怎麼說。','I guarded the doors without noticing how tired the passengers were. Next time I will listen to them and the rescue crew first.'],
      ['dragon','火晶石取回了，車站用備用暖爐也能運作。水、火兩顆都安全收好。','The fire crystal is recovered, and backup heaters keep the station working. Both water and fire crystals are safely stored.'],
      ['paperfox','乘客說有修理員被送上雷脊群島的飛船。爸爸也許在那裏留下了消息。','The passengers saw repair workers sent to an airship in Thunder-Ridge Isles. Father may have left a message there.'],
      ['hero','我們追上飛船，找風晶石和要塞航線。列車的朋友們，這次可以回家了。','We will catch up with the airship and find the wind crystal and fortress route. Our friends on the train can finally go home.'],
    ],
  },
];
