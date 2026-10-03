// Story runs outside the deterministic combat clock: reading never spends HP/MP,
// advances cooldowns, spawns an enemy, or changes a server-verified input replay.
const text = (zh, en) => ({'zh-HK':zh, 'en-US':en});
const line = (speaker, zh, en) => ({speaker, text:text(zh,en)});
const section = (id, title, objective, scene, lines) => ({id, title:text(...title), objective:text(...objective), scene:{id, kind:id.endsWith('-4')?'boss':'section', title:text(...scene), lines}});
const ending = (id, title, lines) => ({id:id+'-end', kind:'ending', title:text(...title), lines});
function freeze(value){if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

export const PROLOGUE = freeze({
  title:text('失落的星光','The Lost Starlight'),
  premise:text('樂園的星晶突然熄滅，三位守護者陷入失控。帶上你的夥伴，尋回勇氣、信任與共鳴，讓星光回家。','The paradise crystal goes dark and three guardians lose control. Journey with your companion to recover courage, trust and harmony, and bring the starlight home.'),
  speakers:{
    narrator:{name:text('冒險手記','Adventure journal'),symbol:'✦'},
    hero:{name:text('你的夥伴','Your companion'),symbol:'★'},
    guide:{name:text('雲耳嚮導','Cloud-Ear Guide'),fighterId:'cloud-ear-dog',symbol:'☁'},
    puppet:{name:text('木偶隊長','Captain Timber'),enemy:'puppet',symbol:'◆'},
    squirrel:{name:text('風鈴松鼠','Windbell Squirrel'),enemy:'squirrel',symbol:'♬'},
    golem:{name:text('星晶石像','Starcrystal Guardian'),enemy:'golem',symbol:'✧'},
  },
  chapters:[
    {stageId:'sunny-training',number:1,title:text('第一章 · 熄滅的晨光','Chapter 1 · A Morning Without Light'),summary:text('追查失控的訓練木偶，找回第一枚勇氣星印。','Investigate the runaway training puppets and recover the Courage Seal.'),
      sections:[
        section('sunny-1',['晨光廣場','Dawn Square'],['擊退被黯霧纏住的巡邏隊','Free the patrol from the dark mist'],['沒有升起的星光','The missing morning star'],[
          line('narrator','每天清晨照亮寵物樂園的星晶，今天沒有亮起。訓練場傳來急促的警鈴。','The crystal that lights Pet Paradise every morning stays dark today. An alarm rings from the training grounds.'),
          line('guide','{hero}，木偶隊長把所有出口封住了！他以前明明最喜歡跟大家練習。','{hero}, Captain Timber has sealed every exit! He used to love training with everyone.'),
          line('hero','先帶大家離開危險。我們會弄清楚，星光為甚麼不見了。','Let’s get everyone to safety first. We will find out what happened to the starlight.'),
        ]),
        section('sunny-2',['木偶防線','The Puppet Line'],['突破盾衛，沿足跡追查隊長','Break through the shields and follow the captain’s trail'],['錯誤的命令','An order gone wrong'],[
          line('guide','盾衛一直重複「保護星晶」。可是，星晶根本不在這裏。','The shields keep repeating “Protect the crystal.” But the crystal is not here.'),
          line('hero','有人把保護的命令扭曲了。跟著地上的星屑走！','Something has twisted their orders. Follow the stardust on the ground!'),
        ]),
        section('sunny-3',['星屑長廊','Stardust Walk'],['清理長廊，抵達封鎖大門','Clear the walkway and reach the sealed gate'],['第一枚星印','The first seal'],[
          line('narrator','星屑在大門前匯成一枚發暗的徽章。黑霧正從隊長胸口的裂縫冒出。','The dust gathers into a dim badge at the gate. Dark mist leaks from a crack in the captain’s chest.'),
          line('guide','那是勇氣星印！它應該照亮道路，現在卻只剩下恐懼。','The Courage Seal! It should light the path, but now it holds only fear.'),
        ]),
        section('sunny-4',['隊長的誓言','The Captain’s Promise'],['擊敗木偶隊長，驅散勇氣星印的黯霧','Defeat Captain Timber and free the Courage Seal'],['Boss · 木偶隊長','Boss · Captain Timber'],[
          line('puppet','停下！外面太危險了。只要沒有人離開，就沒有人會受傷！','Stop! It is too dangerous outside. If nobody leaves, nobody can get hurt!'),
          line('hero','把大家困住，並不是保護。隊長，你的勇氣去哪裏了？','Trapping everyone is not protection. Captain, where has your courage gone?'),
          line('puppet','勇氣……我答應過，要帶大家回家。可那個聲音說，我一定會失敗！','Courage… I promised to bring everyone home. But that voice says I will fail!'),
          line('guide','那是黯霧在說話！{hero}，打散它，讓隊長想起真正的約定！','That is the mist talking! {hero}, scatter it and remind the captain of his real promise!'),
        ]),
      ],ending:ending('sunny',['重新亮起的勇氣','Courage shines again'],[
        line('puppet','我想起來了。勇氣不是鎖上大門，是害怕時仍然願意向前。','I remember now. Courage is not locking the gate. It is moving forward even when you are afraid.'),
        line('hero','我們會帶著你的星印，一起把星光找回來。','We will carry your seal and bring the starlight back together.'),
        line('puppet','去風鈴森林。昨晚所有風鈴同時失聲，那是星晶崩裂的時候。','Go to Windbell Woods. Every bell fell silent last night, when the crystal cracked.'),
        line('narrator','勇氣星印重新發光。通往森林的大門打開了，但深處沒有一絲鈴聲。','The Courage Seal lights up. The forest gate opens, but not a single bell rings beyond it.'),
      ])},
    {stageId:'windbell-forest',number:2,title:text('第二章 · 沉默的風鈴','Chapter 2 · The Silent Bells'),summary:text('穿越逆風，聆聽被誤解的守護者，尋回信任星印。','Cross the headwind, listen to a misunderstood guardian, and recover the Trust Seal.'),
      sections:[
        section('windbell-1',['無聲林口','The Silent Trail'],['清除林口魔物，尋找失聲的風鈴','Clear the trail and find the silent bells'],['沒有人聽見的求救','A call nobody heard'],[
          line('narrator','勇氣星印照亮林口。樹上掛滿風鈴，卻像被凍住一樣沉默。','The Courage Seal lights the forest entrance. Bells hang from every tree, silent as if frozen.'),
          line('guide','風鈴松鼠昨晚發出過求救。我們聽到的，卻只有刺耳的雜音。','Windbell Squirrel called for help last night. All we heard was a harsh, broken noise.'),
          line('hero','也許他一直在等我們。先找出阻擋聲音的東西。','Maybe he is still waiting for us. Let’s find what is blocking his voice.'),
        ]),
        section('windbell-2',['逆風樹道','Headwind Path'],['避開風彈，突破林間伏兵','Evade wind shots and break the forest ambush'],['風裏的碎片','Fragments in the wind'],[
          line('guide','小心風彈！黑霧把求救的聲音變成了攻擊。','Watch the wind shots! The mist has turned his call for help into an attack.'),
          line('hero','我聽到了……「別再丟下我」。這些風彈，不只是憤怒。','I can hear it… “Do not leave me behind again.” These shots hold more than anger.'),
        ]),
        section('windbell-3',['失落鈴橋','The Lost Bell Bridge'],['掃清橋上魔物，接近風鈴樹','Clear the bridge and reach the bell tree'],['被藏起的信任','Trust hidden away'],[
          line('narrator','斷裂的風鈴下，留下了前往星晶洞穴的足印。信任星印被鎖在最高的樹枝上。','Below a broken bell, footprints lead toward Starcrystal Cavern. The Trust Seal is locked on the highest branch.'),
          line('guide','松鼠不是偷走了星印。他怕再被拋下，才把它藏起來。','Squirrel did not steal the seal. He hid it because he was afraid of being left behind.'),
        ]),
        section('windbell-4',['風鈴樹頂','The Bell Treetop'],['擊敗風鈴松鼠，解開信任星印','Defeat Windbell Squirrel and release the Trust Seal'],['Boss · 風鈴松鼠','Boss · Windbell Squirrel'],[
          line('squirrel','你們終於來了？星晶碎掉時，我叫了那麼久，卻沒有人回答！','Now you come? I called for so long when the crystal broke, and nobody answered!'),
          line('guide','對不起，我們聽不到。黯霧把你的聲音擋住了。','I am sorry. We could not hear you. The dark mist blocked your voice.'),
          line('squirrel','騙人！只要風不停，你們就不能再離開我！','Lies! As long as the wind keeps blowing, you cannot leave me again!'),
          line('hero','我們已經聽見了，也會留下來幫你。先讓這場暴風停下！','We hear you now, and we will stay to help. First, let’s stop this storm!'),
        ]),
      ],ending:ending('windbell',['第一聲回響','The first answering bell'],[
        line('squirrel','風停了……你們還在。原來求救，也可以得到回答。','The wind has stopped… and you are still here. A call for help can be answered.'),
        line('hero','下次別把話藏在風裏。我們是夥伴，可以一起承擔。','Next time, do not hide your words in the wind. We are companions. We can share the burden.'),
        line('squirrel','星晶石像把核心帶進洞穴。他說，要替所有人保管願望，永遠不讓它們受傷。','The guardian carried the crystal core into the cavern. He said he would keep everyone’s wishes safe forever.'),
        line('narrator','信任星印亮起，第一聲風鈴傳入洞穴。那裏的回聲，卻像一聲漫長的嘆息。','The Trust Seal shines. A single bell rings into the cavern. Its echo sounds like a long, lonely sigh.'),
      ])},
    {stageId:'starcrystal-cave',number:3,title:text('第三章 · 讓星光回家','Chapter 3 · Bring the Starlight Home'),summary:text('走進願望的回聲，解開石像的執念，重燃樂園的星晶。','Enter the echo of wishes, free the guardian from his fear, and rekindle the paradise crystal.'),
      sections:[
        section('starcrystal-1',['微光洞口','Glimmer Entrance'],['清除洞口守衛，循星印深入洞穴','Clear the cave guards and follow the seals inward'],['被收藏的願望','Wishes kept under lock'],[
          line('narrator','兩枚星印照亮洞壁。晶石裏映出樂園每個夥伴的願望，卻都被黑色裂紋纏住。','Two seals light the cave walls. Every companion’s wish glows in a crystal, trapped inside dark cracks.'),
          line('guide','我看見隊長想守護大家，松鼠想有人陪伴……石像把所有願望都搬來了。','The captain wants to protect everyone. Squirrel wants company… The guardian has brought every wish here.'),
          line('hero','願望要跟夥伴一起實現。鎖在洞穴裏，只會變得孤單。','Wishes are meant to be shared with companions. Locked in a cave, they only become lonely.'),
        ]),
        section('starcrystal-2',['裂晶迴廊','The Cracked Crystal Hall'],['突破混合守衛，避開遠程攻擊','Break the mixed guard line and evade ranged attacks'],['黯響的真相','The truth of the Dark Echo'],[
          line('narrator','晶石傳來低語：「你會失敗。沒有人會來。」那些話，正是隊長和松鼠最害怕的事。','The crystals whisper: “You will fail. Nobody will come.” These are the captain’s and squirrel’s deepest fears.'),
          line('guide','黯響不是外來的怪物……它是被封住的願望，積成的恐懼！','The Dark Echo is not an invader… It is the fear that grew inside wishes sealed away!'),
        ]),
        section('starcrystal-3',['願望迴聲','The Chamber of Wishes'],['清除核心前守衛，讓兩枚星印共鳴','Clear the core guards and bring the two seals together'],['把勇氣交給信任','Courage meets trust'],[
          line('hero','勇氣讓我們向前，信任讓我們不必獨自向前。還缺少的，是一起發光的共鳴。','Courage helps us move forward. Trust means we do not move alone. What is missing is the harmony of shining together.'),
          line('guide','看！兩枚星印正在回應核心。這次別只想打倒石像，要把我們的聲音傳給他。','Look! The two seals are answering the core. We must do more than defeat the guardian. We must reach him.'),
        ]),
        section('starcrystal-4',['星心祭壇','The Starlight Altar'],['擊敗星晶石像，打破封印並重燃星心','Defeat the guardian, break the seal and rekindle the core'],['Boss · 星晶石像','Boss · Starcrystal Guardian'],[
          line('golem','退下。願望很脆弱，只有我能永遠保護它們。','Stand back. Wishes are fragile. Only I can protect them forever.'),
          line('hero','你把大家的願望鎖住，恐懼才變成黯響。真正需要被保護的，是一起實現願望的機會。','Sealing our wishes gave fear a voice. What needs protecting is our chance to make those wishes come true together.'),
          line('golem','如果星晶再碎一次呢？如果我守不住呢？我不能……再失去任何人！','What if the crystal breaks again? What if I fail? I cannot… lose anyone again!'),
          line('guide','你不必一個人守住全部。隊長、松鼠，還有我們，都在這裏！','You do not have to carry it alone. The captain, squirrel, and all of us are here!'),
          line('hero','{hero}的勇氣、大家的信任——讓星光一起回家吧！','With my courage and everyone’s trust—let’s bring the starlight home together!'),
        ]),
      ],ending:ending('starcrystal',['每個願望，都有回聲','Every wish finds an answer'],[
        line('golem','原來……守護不只是收藏。我願意把共鳴星印，交還給大家。','I see now… Guarding is more than keeping things safe. I return the Harmony Seal to everyone.'),
        line('narrator','三枚星印匯成光環。封住願望的裂紋逐一消散，星光沿著風鈴的回聲，重新照亮樂園。','The three seals form a ring of light. The cracks around the wishes fade. Starlight follows the answering bells home to the paradise.'),
        line('guide','隊長開了大門，松鼠掛上新的風鈴，石像也走出了洞穴。這次，大家一起守護樂園。','The captain opens the gate, squirrel hangs new bells, and the guardian leaves the cavern. This time, everyone protects the paradise together.'),
        line('hero','明天也許還會害怕，但我們有彼此。每個願望，都會有人聽見。','Tomorrow may still bring fear, but we have each other. Every wish will find someone to listen.'),
        line('narrator','《失落的星光》完。你和夥伴的冒險，從來不只是一個人的故事。','The Lost Starlight · The End. Your adventure with your companion was never a story you had to face alone.'),
      ])},
  ],
});
