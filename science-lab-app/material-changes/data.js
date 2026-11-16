// Content is deliberately separate from the thermal model and the 3D view.
export const MATERIALS = [
  { id: 'ice', zh: '冰塊', en: 'Ice', initial: -12, heat: 35, melt: 0, latent: 3000, meltDuration: 180, color: '#84cde8', kind: 'melt' },
  { id: 'charcoal', zh: '炭', en: 'Charcoal', initial: 20, heat: 720, color: '#272b2f', kind: 'burn' },
  { id: 'chocolate', zh: '朱古力', en: 'Chocolate', initial: 20, heat: 45, melt: 33, latent: 1500, color: '#4a2b21', kind: 'melt' },
  { id: 'butter', zh: '牛油', en: 'Butter', initial: 20, heat: 45, melt: 32, latent: 1300, color: '#efca58', kind: 'melt' },
  { id: 'egg', zh: '蛋白', en: 'Egg white', initial: 20, heat: 85, color: '#eee8d7', kind: 'cook' },
  { id: 'bread', zh: '麵包', en: 'Bread', initial: 20, heat: 170, color: '#d39b65', kind: 'toast' },
];
export const materialById = Object.fromEntries(MATERIALS.map(d => [d.id, d]));
// Each material has its own observations and plausible alternatives. Answer
// values remain stable for the simulation and saved evidence, while wording
// is specific to the sample instead of borrowing another sample's behaviour.
const choice=(value,zh,en)=>({value,label:[zh,en]});
const meltChoices=(zh,en)=>({
  hot:[choice('liquidChoice',`${zh}熔化成可以流動的液體`,`${en} melted into a flowing liquid`),choice('softOnly','只是變軟，仍保持固體形狀','Only softened, retaining a solid shape'),choice('unchanged','維持原來的固態，沒有明顯變化','Remained solid, with no clear change')],
  cold:[choice('solidChoice',`${zh}重新凝固成固體`,`${en} set into a solid again`),choice('staysLiquid','仍然是可以流動的液體','Remained a flowing liquid'),choice('partlySet','只有部分凝固，仍有液體','Only partly set, with liquid remaining')],
});
export const RECORD_CHOICES={
  ice:{
    hot:[choice('liquidChoice','冰塊熔化成水，可以流動','The ice melted into flowing water'),choice('partialIce','只有部分冰塊熔化，仍有冰','Only some ice melted; ice remained'),choice('unchanged','冰塊沒有明顯熔化','The ice showed no clear melting')],
    cold:[choice('solidChoice','水重新凝固成冰','The water froze into ice again'),choice('staysLiquid','仍然是可以流動的水','Remained flowing water'),choice('partialIce','只有部分水結冰，仍有液態水','Only some water froze; liquid water remained')],
  },
  charcoal:{
    hot:[choice('ashChoice','炭燃燒後，留下少量灰白色的灰','The charcoal burned, leaving a little grey-white ash'),choice('charcoalLiquid','炭熔化成黑色液體','The charcoal melted into a black liquid'),choice('unchanged','炭仍是原來的黑色塊狀，沒有明顯變化','The charcoal remained as the original black pieces')],
    cold:[choice('ashRemains','仍然是灰，沒有變回炭','It remained ash and did not turn back into charcoal'),choice('charcoalReturns','灰變回原來的黑色炭','The ash turned back into the original black charcoal'),choice('ashLiquid','灰變成可以流動的液體','The ash became a flowing liquid')],
  },
  chocolate:meltChoices('朱古力','The chocolate'),butter:meltChoices('牛油','The butter'),
  egg:{
    hot:[choice('setChoice','蛋白變白，並且凝固','The egg white turned white and set'),choice('whiteStillFlows','蛋白變白，但仍能流動','The egg white turned white but still flowed'),choice('unchanged','蛋白仍半透明、黏稠，可以流動','The egg white remained translucent, viscous and flowing')],
    cold:[choice('cookedChoice','仍然是凝固的熟蛋白','Remained a set, cooked egg white'),choice('rawChoice','變回半透明、可以流動的生蛋白','Returned to translucent, flowing raw egg white'),choice('partlySet','只有部分蛋白凝固，仍能流動','Only some egg white was set; some still flowed')],
  },
  bread:{
    hot:[choice('toastChoice','麵包表面變成金黃色','The bread surface turned golden-brown'),choice('warmNoBrowning','麵包變暖，但表面沒有變色','The bread warmed without changing colour'),choice('unchanged','麵包維持原來的淺色和柔軟狀態','The bread retained its original pale colour and softness')],
    cold:[choice('breadChoice','仍然是金黃的多士','Remained golden-brown toast'),choice('freshChoice','變回原來淺色、柔軟的麵包','Returned to the original pale, soft bread'),choice('paleStillCrisp','表面變回淺色，但仍然乾脆','The surface became pale again but stayed dry and crisp')],
  },
};
export function recordChoiceText(id,value,language='zh'){
  const choices=RECORD_CHOICES[id];
  const item=choices&&[...choices.hot,...choices.cold].find(c=>c.value===value);
  return item?.label[language==='en'?1:0]??text(value,language);
}
// Short descriptions for the evidence sequence. Shape is deliberately not the
// criterion: the state/property being tested must be named explicitly.
export const RECORD_STORY = {
  ice:{initial:['冰 · 固態','Ice · solid'],hot:['水 · 液態','Water · liquid'],cold:['冰 · 固態','Ice · solid']},
  charcoal:{initial:['黑色塊狀的炭','Black charcoal pieces'],hot:['少量灰白色的灰','A little grey-white ash'],cold:['仍是灰，沒有變回炭','Still ash, not charcoal']},
  chocolate:{initial:['固態朱古力','Solid chocolate'],hot:['液態朱古力','Liquid chocolate'],cold:['固態朱古力','Solid chocolate']},
  butter:{initial:['固態牛油','Solid butter'],hot:['液態牛油','Liquid butter'],cold:['固態牛油','Solid butter']},
  egg:{initial:['生蛋白 · 可以流動','Raw egg white · flows'],hot:['熟蛋白 · 已凝固','Cooked egg white · set'],cold:['仍是熟蛋白','Still cooked egg white']},
  bread:{initial:['淺色、柔軟的麵包','Pale, soft bread'],hot:['金黃的多士','Golden-brown toast'],cold:['仍是多士','Still toast']},
};
export const COPY = {
  brand: ['變化研究所', 'Change Lab'], title: ['可逆及不可逆變化', 'Reversible & irreversible changes'],
  waterName: ['水', 'Water'], iceName: ['冰', 'Ice'], iceWaterName: ['冰和水', 'Ice + water'], iceSample: ['冰／水', 'Ice / water'],
  ashName:['灰','Ash'], charcoalAshName:['炭和灰','Charcoal + ash'], charcoalSample:['炭／灰','Charcoal / ash'],
  charcoalSolid:['黑色、多孔的固體炭','Black, porous solid charcoal'], charcoalBurning:['炭正在燃燒，逐漸留下灰','Charcoal is burning and leaving ash'], charcoalAsh:['灰白色的灰，不會變回炭','Grey-white ash; does not turn back into charcoal'],
  furnace:['燃燒爐 · 空氣充足','Combustion furnace · air supplied'],
  charcoalModel:['炭燃燒以空氣充足作示意，主要碳變成氣體，留下少量礦物質灰。爐溫與點燃門檻是教學設定，不是實測點燃溫度。為方便觀察，離開處理區會連同燃燒進度一起暫存；真實的熱炭不會因拿離爐具就停止燃燒。','The charcoal model assumes sufficient air: most carbon leaves as gas and a little mineral ash remains. Furnace and ignition settings are illustrative, not measured ignition temperatures. Off-station inspection also pauses burn progress; real hot charcoal does not stop burning simply because it is removed from a furnace.'],
  finishRecord: ['請先完成目前材料的觀察和記錄，才可選下一種。', 'Finish this material’s observations and record before choosing another.'],
  offStation:['已離開處理區：溫度與狀態暫存，可拿起觀察。','Off station: temperature and state are held for inspection.'],
  observationStep:['觀察','Observation'], chooseObservation:['選出你剛才看到的變化。','Choose the change you just observed.'],
  watchChange:['正在處理，先觀察材料的變化。完成後會自動出現觀察題。','Watch the material change. An observation question will appear when processing is complete.'],
  tryCooling:['已完成加熱觀察。把材料移到冷卻區或冷凍區，看看能否恢復。','Heating observation complete. Move the material to cool or freeze it and see whether it changes back.'],
  pendingObservation:['觀察題尚未完成；可先拿起材料查看，再繼續回答。','An observation question is waiting. Inspect the material, then resume.'],
  resumeObservation:['繼續回答','Resume question'], automaticRecord:['確認後自動記下這一步的觀察。','Confirm to record this observation automatically.'],
  continueExperiment:['繼續實驗','Continue experiment'], toVerdict:['比較與判斷','Compare & classify'], finishMaterial:['完成這種材料','Finish this material'],
  lockedMission: ['完成這份材料的記錄，再選下一種', 'Record this material before choosing another'],
  waterChanged: ['冰已熔化成水', 'The ice has melted into water'], iceChanged: ['水已凝固成冰', 'The water has frozen into ice'],
  bootOpening: ['正在打開變化研究所…', 'Opening Change Lab…'], bootApparatus: ['正在準備材料與冷熱器材…', 'Preparing materials and thermal equipment…'],
  bootImages: ['正在準備觀察圖片…', 'Preparing the observation illustrations…'], bootView: ['正在整理實驗桌…', 'Preparing the experiment bench…'], bootReady: ['實驗準備好了', 'Your experiment is ready'],
  chapterOne: ['第一步', 'Step one'], chapterObserve: ['觀察', 'Observe'], chapterObserveLead: ['先看清楚發生了甚麼', 'First, look closely at what happens'],
  chapterTwo: ['第二步', 'Step two'], chapterHypothesis: ['假說', 'Hypothesis'], chapterHypothesisLead: ['你認為答案是甚麼？', 'What do you think the answer is?'],
  chapterFour: ['第四步', 'Step four'], chapterAnalyse: ['分析與反思', 'Analyse & reflect'], chapterAnalyseLead: ['證據怎樣說？', 'What does the evidence say?'],
  wonderTitle: ['我們想知道……', 'We wonder…'], toHypothesis: ['提出假說', 'Make a hypothesis'],
  observe: ['冰塊變成水，還能變回冰嗎？', 'Can melted ice become ice again?'],
  observeText: ['冰塊受熱後，慢慢熔化成水。把這些水放進冰格，冷凍一段時間後，水又凝固成冰。原來，冰變成水後，還可以變回冰。', 'Ice melts into water when it is warmed. Put that water in a freezer and give it enough time: it freezes into ice again. The change from ice to water can be reversed.'],
  wonder: ['冰的變化可以逆轉。其他材料是否也一定可以恢復呢？', 'The change in ice can be reversed. Can every other material also change back?'],
  captions: [['冰塊', 'Ice'], ['加熱 → 水', 'Warm → water'], ['冷凍 → 冰', 'Freeze → ice']],
  hypothesis: ['如果材料發生變化後，我認為……', 'After a material changes, I think…'],
  predictions: [['所有變化都可以逆轉。', 'Every change can be reversed.'], ['有些變化可以逆轉，有些不能。', 'Some changes can be reversed; others cannot.'], ['所有變化都不能逆轉。', 'No change can be reversed.']],
  next: ['繼續', 'Continue'], begin: ['開始探索', 'Start exploring'], back: ['返回', 'Back'], close: ['關閉', 'Close'],
  hypothesisHint: ['先選一個想法，再用實驗找證據。不會即時公布答案。', 'Choose an idea, then look for evidence. No answer is revealed yet.'],
  choose: ['自由選材料，拖到處理區探索', 'Choose a material and drag it to a station'],
  dragHint: ['把材料器皿拖到加熱、冷卻或冷凍區；拖回工作台可停止處理。', 'Drag the sample vessel to heat, cool or freeze it. Drag back to the bench to stop.'],
  selected: ['正在觀察', 'OBSERVING'], temperature: ['材料溫度', 'Sample temperature'], initial: ['最初溫度', 'Starting temperature'],
  heat: ['加熱', 'Heat'], cool: ['冷卻至 20°C', 'Cool to 20°C'], freeze: ['冷凍至 −12°C', 'Freeze to −12°C'], bench: ['放回工作台', 'Return to bench'],
  heater: ['加熱區', 'Heat'], cooler: ['冷卻區 · 20°C', 'Cool · 20°C'], freezer: ['冷凍區 · −12°C', 'Freeze · −12°C'],
  record: ['記錄與判斷', 'Record & classify'], recorded: ['已記錄', 'Recorded'], records: ['我的記錄', 'My records'], analyse: ['分析證據', 'Analyse evidence'],
  complete: ['完成', 'Complete'], samples: ['種材料', 'materials'], settings: ['設定', 'Settings'], language: ['語言 / Language', 'Language / 語言'],
  sound: ['操作提示音', 'Interaction sounds'], motion: ['減少動態效果', 'Reduce motion'], speed: ['縮時速度', 'Time scale'],
  modelTag: ['縮時科學模型', 'TIME-COMPRESSED MODEL'], model: ['溫度是模擬值；加熱、冷卻及凝固均需時間。時間經過縮短，不是實測數據或烹調指引。', 'Temperatures are modelled. Heating, cooling and setting take time. Time is compressed; these are not measured results or cooking instructions.'],
  safety: ['熱水及烘烤須由老師處理。炭燃燒是虛擬示範；真實燃燒須用耐熱器皿和合適通風設備，不可在室內自行燒炭。實驗材料不食用。', 'A teacher must handle hot water and toasting. Charcoal combustion is a virtual demonstration. Real combustion needs heat-resistant apparatus and suitable ventilation; never burn charcoal indoors on your own. Do not eat experimental materials.'],
  ready: ['先加熱，觀察變化，再嘗試冷卻。', 'Heat it, observe the change, then try cooling it.'],
  heating: ['正在受熱，留意材料的變化。', 'Heating: watch the material change.'], cooling: ['正在冷卻，還需要時間。', 'Cooling: give the material time.'],
  changed: ['已出現明顯變化，可以嘗試冷卻。', 'A clear change has occurred. Try cooling it.'], restored: ['已完成冷卻，可以記錄觀察。', 'Cooling is complete. Record what you observed.'],
  warmWater: ['水在 20°C 不會結冰，試試冷凍。', 'Water will not freeze at 20°C. Try the freezer.'],
  freezingEgg: ['變硬不等於變回生蛋白；回到 20°C 後再比較。', 'Becoming hard does not mean becoming raw again. Compare it again at 20°C.'],
  recordWait: ['先充分加熱，再完成冷卻或冷凍，才有足夠證據。水必須冷凍才會重新結冰；其他材料可選冷卻區或冷凍區。', 'Complete heating, then cooling or freezing, to collect enough evidence. Water needs the freezer to become ice again; other materials can use either station.'],
  solid: ['固態，不流動', 'Solid; does not flow'], liquid: ['液態，可以流動', 'Liquid; flows'], melting: ['部分熔化', 'Partly melted'], setting: ['正在凝固', 'Setting'],
  rawEgg: ['半透明、黏稠、可以流動', 'Translucent, viscous and flowing'], cookingEgg: ['逐漸變白和凝固', 'Turning white and setting'], cookedEgg: ['白色、已凝固', 'White and set'],
  frozenRawEgg:['已冷凍的生蛋白，不流動','Frozen raw egg white; does not flow'], frozenCookedEgg:['已冷凍，仍是熟蛋白','Frozen; still cooked egg white'], freezingWhite:['蛋白中的水正在結冰／解凍','Water in the egg white is freezing / thawing'],
  freshBread: ['淺色、柔軟的麵包', 'Pale, soft bread'], toasting: ['表面逐漸變成金黃色', 'Surface is turning golden'], toasted: ['表面金黃的多士', 'Golden-brown toast'],
  hotQuestion: ['加熱後，你看到甚麼？', 'What did you observe after heating?'], coolQuestion: ['回到最初溫度後，你看到甚麼？', 'What did you observe at the starting temperature?'],
  classify: ['這次變化能否逆轉？', 'Can this change be reversed?'], reversible: ['可以逆轉', 'Reversible'], irreversible: ['不能靠這次冷卻逆轉', 'Not reversed by this cooling'], unsure: ['還未能判斷', 'Not enough evidence yet'],
  beforeChange:['最初狀態','Starting state'], afterHeat:['加熱後','After heating'], afterFreeze:['冷凍後','After freezing'], afterCool:['冷卻後','After cooling'],
  chooseBelow:['請在下方選出觀察','Choose your observation below'], checkRecord:['檢查記錄','Check observations'], saveChecked:['儲存記錄，繼續探索','Save record & continue'],
  answerRight:['正確','Correct'], answerWrong:['需要修正','Incorrect — revise'], answerMissing:['尚未選擇','Not answered'],
  recordAllRight:['三項判斷都正確！儲存後便可選下一種材料。','All three answers are correct! Save to unlock the next material.'],
  recordNeedsRevision:['請按每題的提示修訂，再檢查一次。','Use the feedback for each question, then check again.'],
  comparePrompt:['比較最後與最初：材料是否恢復了原來的狀態或性質？','Compare the last and first stages: did the original state or property return?'],
  iceCycle:['冰 → 水 → 冰：固態變成液態後，再變回固態，所以這次熔化可以逆轉。形狀不必完全相同。','Ice → water → ice: the solid became a liquid and then a solid again. This melting is reversible; its shape need not be identical.'],
  freezeExplore:['所有材料都可冷凍。冷凍能使液體凝固，但不會把熟蛋白變回生蛋白，也不會把多士變回麵包。','Every material can use the freezer. Freezing may solidify liquids, but it cannot turn cooked egg white raw or toast back into bread.'],
  liquidChoice: ['熔化成可以流動的液體', 'Melted into a flowing liquid'], setChoice: ['變白，並且凝固', 'Turned white and set'], toastChoice: ['表面變成金黃色', 'Surface turned golden-brown'], unchanged: ['沒有明顯變化', 'No clear change'],
  solidChoice: ['重新凝固成固體', 'Set into a solid again'], cookedChoice: ['仍然是凝固的熟蛋白', 'Remained a set, cooked egg white'], breadChoice: ['仍然是金黃多士', 'Remained golden-brown toast'], rawChoice: ['變回原來的生蛋白', 'Returned to raw egg white'], freshChoice: ['變回未烘烤的麵包', 'Returned to untoasted bread'],
  save: ['儲存觀察', 'Save observations'], revise: ['再看看材料的流動性、顏色及前後變化，試著修訂記錄。', 'Look again at flow, colour and the before/after change, then revise your observations.'],
  saved: ['已記下你的觀察。繼續自由探索！', 'Observation saved. Keep exploring!'], empty: ['還沒有記錄。先選一種材料開始。', 'No records yet. Choose a material to start.'],
  requirement: ['先記錄至少三種材料，並包含炭、蛋白或麵包其中一種。', 'Record at least three materials, including charcoal, egg white or bread.'],
  evidenceTitle: ['你的證據，支持哪個想法？', 'Which idea does your evidence support?'],
  evidenceLead: ['以下只列出你親自完成並記錄的材料。', 'These are only the materials you actually tested and recorded.'],
  conclusionQuestion: ['根據你的實驗，材料的變化……', 'Based on your experiments, material changes…'],
  conclusion: ['有些變化可以逆轉，有些不能靠冷卻逆轉。', 'Some changes can be reversed; others cannot be reversed by cooling.'],
  supported: ['你的假說得到這次實驗證據支持。', 'Your hypothesis is supported by this evidence.'], modified: ['這次證據不支持原來的假說。根據證據修改想法，也是科學探究。', 'This evidence does not support your original hypothesis. Revising an idea using evidence is part of science.'],
  evidenceWrong: ['想想：你記錄的材料，是否每一種都恢復了？又是否每一種都不能恢復？', 'Did every material you recorded change back? Did none of them change back?'],
  charcoalExplain: ['炭燃燒後，冷卻或冷凍都不會令灰變回炭，所以這次變化不能逆轉。炭中的碳主要與氧氣反應成為氣體離開，剩下少量礦物質灰；並非整塊炭都變成灰。', 'Cooling or freezing the ash does not restore the charcoal, so this change is irreversible here. Most carbon reacts with oxygen and leaves as gas; a small mineral ash residue remains. The entire piece does not become ash.'],
  chocolateExplain: ['這裏逆轉的是熔化與凝固。重新凝固後，光澤和質感未必完全恢復。', 'Here, melting is reversed by setting. Gloss and texture may not return exactly.'],
  butterExplain: ['牛油可重新凝固；我們只判斷熔化與凝固，並不聲稱所有微細結構都恢復。', 'Butter can set again. We classify melting and setting, not the exact recovery of every microscopic structure.'],
  iceExplain: ['水經足夠冷凍後重新結冰；只放涼至室溫並不足夠。', 'Water freezes again after sufficient cooling below its freezing point; room temperature is not enough.'],
  eggExplain: ['蛋白質受熱改變結構並聚集成網絡。普通冷卻不會令熟蛋白變回生蛋白。', 'Heat changes protein structure and forms an aggregated network. Ordinary cooling does not turn cooked egg white raw again.'],
  breadExplain: ['烘烤除了失水，還出現褐變反應；冷卻不會把多士變回未烘烤的麵包。', 'Toasting causes browning reactions as well as water loss. Cooling does not turn toast into untoasted bread.'],
  scope: ['這個結論適用於本次測試的變化。「不可逆」指不能用這裏的日常加熱、冷卻方法復原，不是宣稱任何科技都絕對做不到。', 'This conclusion concerns the changes tested here. “Irreversible” means not restored by these everyday heating and cooling methods, not impossible under every conceivable technology.'],
  challenge: ['形狀改變，就一定不可逆嗎？', 'Does a new shape mean a change is irreversible?'],
  challengeText: ['朱古力熔化後，在圓形容器裏凝固。它沒有變回原來的分格形狀，熔化是否仍可以逆轉？', 'Chocolate melts and sets in a round container. Its original segmented shape does not return. Can its melting still be reversed?'],
  yes: ['可以，液態朱古力重新變成固態朱古力。', 'Yes. Liquid chocolate becomes solid chocolate again.'], no: ['不可以，形狀必須完全相同。', 'No. The shape must be identical.'],
  finish: ['完成探究', 'Finish inquiry'], continue: ['繼續探索', 'Keep exploring'], success: ['用證據，讓想法更清楚。', 'Let evidence sharpen your ideas.'],
  resetView: ['重設視角', 'Reset camera'], pause: ['暫停', 'Pause'], resume: ['繼續', 'Resume'], reset: ['換新樣本', 'Fresh sample'],
  resetQuestion: ['換成新樣本？這種材料的處理過程和記錄會清除，其他材料不受影響。', 'Use a fresh sample? This material’s process and record will be cleared. Other materials are kept.'],
  cancel: ['取消', 'Cancel'], confirm: ['換新樣本', 'Use fresh sample'],
  help: ['操作及科學說明', 'Controls & science notes'],
  helpText: ['自由選第一種材料，把器皿拖到處理區。炭使用陶瓷坩堝和燃燒爐；其他材料使用玻璃盤和相應器材。開始處理後，必須先完成這份材料的觀察及記錄，才會解鎖其他材料。拖回空白工作台可停止處理。空白位置拖動可轉動視角，雙指或滾輪可縮放。鍵盤操作：選材料後，按 H 加熱、C 冷卻、F 冷凍、B 返回工作台。', 'Choose your first material freely and drag its vessel to a station. Charcoal uses a ceramic crucible and combustion furnace; other samples use glass dishes and their appropriate equipment. Once processing starts, complete its observations and record before the other materials unlock. Drop on an empty part of the bench to stop processing. Drag empty space to orbit; pinch or scroll to zoom. Keyboard: select a material, then H to heat, C to cool, F to freeze, B to return to the bench.'],
  helpScience: ['這是定性教學模型。熔點、凝固範圍及烹調速度會隨材料配方、份量和器材改變。本模型的定點與時間只用來呈現合理的方向和先後關係，不用於比較不同材料的加熱速度。為方便拿起觀察，離開處理區後會暫存溫度與狀態，沒有模擬室溫中的自然熱交換。所有材料都可放進冷凍區；蛋白中的水可結冰，但冷凍不會逆轉受熱凝固。食品冷凍和解凍後的質感可能改變，本模型不預測這些微細變化。冷凍區的白霧代表空氣中水分凝結成的小水滴，冷空氣本身並不可見。', 'This is a qualitative teaching model. Melting ranges, setting and cooking rates depend on composition, amount and apparatus. Model setpoints and times illustrate direction and sequence; they do not compare measured heating rates. Off-station temperature and state are deliberately held for close inspection; ambient heat exchange is not modelled. Every material can use the freezer. Water in egg white can freeze, but freezing cannot undo heat coagulation. Food texture may change after freezing and thawing; the model does not predict those details. The freezer mist represents tiny condensed water droplets; cold air itself is invisible.'],
  contextLost: ['3D 畫面暫停；請稍候恢復。', '3D view interrupted; waiting to restore.'],
  error: ['無法啟動 3D 畫面。請使用支援 WebGL 的新版瀏覽器。', 'The 3D view could not start. Please use a current WebGL-capable browser.'],
};
export function text(key, language = 'zh') { return COPY[key]?.[language === 'en' ? 1 : 0] ?? key; }
export function name(id, language = 'zh') { return materialById[id]?.[language] ?? id; }
