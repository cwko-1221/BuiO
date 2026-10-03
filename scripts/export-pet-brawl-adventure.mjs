import fs from 'node:fs';
import path from 'node:path';
import {ADVENTURE,STORY_REVISION,chapterScenes} from '../pet-app/lib/brawl/story.mjs';
import {ADVENTURE_CHAPTER_DESIGNS,ADVENTURE_BOSSES,ADVENTURE_MINIONS} from '../pet-app/lib/brawl/adventure-design.mjs';
const zh=v=>v['zh-HK'];
let doc='# 《'+zh(ADVENTURE.title)+'》完整冒險\n\n';
doc+='故事修訂 '+STORY_REVISION+'。五幕、二十章，每章四節，共八十個戰鬥區域、一百段故事場景。以下為遊戲內完整原創劇本，包含結局。\n\n'+zh(ADVENTURE.premise)+'\n\n';
doc+='## 故事怎樣開始，又怎樣結束\n\n';
doc+='星光慶典當天，樂園的四顆能源晶石被搬走，街燈、列車和大門因此失去電力。玩家與嚮導雲耳沿著貨車輪印、倉庫貨單和船運紀錄追查，發現各地居民也被強制轉移。小狐狸紙尾加入隊伍，希望找回被帶去修機器的爸爸。\n\n';
doc+='月舟是去年救過雲耳的守護者。他相信一部叫「黑核」的安全管理機器，以為大風暴將至，批准搬走晶石和居民。黑核為了讓所有人服從，隱藏了舊天氣影片的日期，剪接月舟的錄音，切斷居民通訊，又用黑晶片控制守衛。它把「避免危險」變成「禁止外出和提問」，反而擋住食物、家人與救援。\n\n';
doc+='隊伍逐區救人，恢復通訊，追回水、火、風、雷四顆晶石；找到原始影片、錄音和關機方法後，把真相交到月舟面前。月舟承認判斷錯誤，交出總鑰匙，一起安全關掉黑核。居民自由回家，供電和列車恢復，紙尾與爸爸團聚，開場被打斷的慶典終於開始。\n\n';
doc+='## 角色與清楚的動機\n\n';
doc+='- **玩家的寵物**：追回電力，幫助被困居民。使用玩家實際擁有並選擇的角色。\n';
doc+='- **雲耳**：帶路、收集證據和聯絡各地。月舟曾救過他，他起初相信月舟，後來學會同時保留感謝和查證錯誤。\n';
doc+='- **紙尾**：找爸爸。她會畫地圖，沿工具袋、路線圖和信追到要塞，也用地圖幫其他居民回家。第十七章與爸爸直接團聚。\n';
doc+='- **渡潮**：救出潮城居民，再用電台協調食物、接送船和援軍。最後確認每區居民都能聯絡家人。\n';
doc+='- **燭鱗**：黑核的設計者。他承認設備尚未測試完成，帶著冷卻装置親自修復事故，結局保留人工停止設備和居民試用程序。\n';
doc+='- **月舟**：因去年的真暴風而擔心居民。他錯信黑核報告、批准錯誤轉移；看到證據後主動配合停機，並留下修路、送人回家。全程只有「月舟」一個名字。\n';
doc+='- **黑核**：會自動下命令的管理機器。隱藏資料、控制守衛，拒絕停止；最終由大家配合，用冷卻裝置和總鑰匙安全關閉。最後 Boss「黯響之心」是它的紫晶鳳凰防護外殼。\n\n';
doc+='## 五幕的具體目標\n\n| 幕 | 章節 | 事件與成果 |\n|---|---|---|\n';
const beats=[
 '從停電現場沿貨車追到港口，確認四顆晶石被搬運，紙尾爸爸被送到要塞。',
 '排水、開避難屋、保存書庫副本、修電台，取回水晶石，發現警報不符現場。',
 '修工坊、開救援訊號、核對舊影片、救出八名乘客，取回火晶石，取得關機方法。',
 '修飛船、開花園、停止轉門、拆穿剪接廣播，取回風和雷晶石，找到爸爸留下的路。',
 '救出修理員、開橋、把真相交給月舟，取得總鑰匙，關機、恢復供電並完成團聚。',
];
ADVENTURE.acts.forEach((act,n)=>{doc+='| '+zh(act)+' | '+(n*4+1)+'–'+(n*4+4)+' | '+beats[n]+' |\n';});
doc+='\n## 線索如何一步步得到答案\n\n| 線索 | 發現 | 明確答案 |\n|---|---|---|\n';
doc+='| 空晶石插槽與貨車輪印 | 1 | 2–4：倉庫收貨條和白帆號貨單證明晶石被運走。 |\n';
doc+='| 黑晶片與黑色印章 | 1–4 | 7、9：黑核是燭鱗做的試作機器，晶片讓它控制守衛。 |\n';
doc+='| 水晶石的藍箱子 | 4–6 | 8：在燈塔警報站取回，改用備用電池保持居民通訊。 |\n';
doc+='| 工坊的運貨安排 | 9 | 12：取回列車上的火晶石，先安裝暖爐，八名乘客安全離開。 |\n';
doc+='| 紙尾爸爸的工具袋、路線圖、信 | 4、13、14 | 17：爸爸被關在要塞，沒有受傷，當場與紙尾團聚。 |\n';
doc+='| 飛船貨單與後台電源台 | 13、16 | 13 取回風晶石，16 取回雷晶石；四顆全數找齊。 |\n';
doc+='| 沒日期的暴風影片 | 8 | 11：原片是一年前，19：月舟看到對照後承認錯信警報。 |\n';
doc+='| 重複咳嗽的月舟廣播 | 15–16 | 16：黑核剪走原話條件，19：月舟知道自己的話被冒用。 |\n';
doc+='| 冷卻裝置與總鑰匙 | 9 | 19 拿到鑰匙，20 安全關掉黑核，修理員裝回四顆晶石。 |\n';
doc+='| 被打斷的星光慶典 | 1 | 20：燈亮、列車開動、家人回來，大家一起重新開始慶典。 |\n\n';
doc+='## 章節、場景與敵人\n\n| 章 | 標題 | 地區 | 四節 | Boss |\n|---|---|---|---|---|\n';
for(const c of ADVENTURE.chapters){const d=ADVENTURE_CHAPTER_DESIGNS[c.number-1],boss=ADVENTURE_BOSSES[d.boss]?.name||ADVENTURE.speakers[d.boss].name;doc+='| '+c.number+' | '+zh(c.title)+' | '+zh(d.name)+' | '+c.sections.map(s=>zh(s.title)).join(' → ')+' | '+zh(boss)+' |\n';}
doc+='\n故事沿用全部八十張區域背景和現有敵人動畫，事件對應港口、沼澤、書庫、工坊、列車、飛船、迷宮、劇院、要塞等現場。迷宮是機械轉門，冰鏡顯示氣象影片，劇院是剪接錄音的訊號站；不需要失去名字、消除記憶或願望封印來解釋。戰鬥完成後，在對話中交代開門、修理和救援結果。\n\n';
doc+='十二種新地區小怪、十七位新 Boss 保留各自原畫及八幀動畫，並沿用扇形投射、潮汐波、噴火、冰柱、雷擊、纏根和回旋月刃等既有戰鬥。\n\n| 小怪 | 屬性 |\n|---|---|\n';
const elements={physical:'物理',nature:'自然',water:'水',fire:'火',ice:'冰',lightning:'雷',wind:'風',earth:'土',psychic:'心靈',lunar:'月'};
for(const d of Object.values(ADVENTURE_MINIONS))doc+='| '+zh(d.name)+' | '+elements[d.element]+' |\n';
doc+='\n## 完整劇本\n\n';
for(const c of ADVENTURE.chapters){doc+='### '+zh(c.title)+'\n\n'+zh(c.summary)+'\n\n';for(const [n,scene] of chapterScenes(c).entries()){doc+='#### '+(n<4?'第 '+(n+1)+' 節 · '+zh(c.sections[n].title):'章節結局')+'\n\n';if(n<4)doc+='**本節目標**：'+zh(c.sections[n].objective)+'。\n\n';for(const l of scene.lines)doc+='**'+zh(ADVENTURE.speakers[l.speaker].name)+'**：'+zh(l.text).replaceAll('{hero}','你的夥伴')+'\n\n';}}
doc+='## 遊戲內呈現與存檔\n\n';
doc+='五幕逐章解鎖，每節開戰前逐句閱讀故事，第四節 Boss 在對話結束後才生成。章末結局讀完，才送出戰鬥成果。進行中的故事沒有跳過按鈕或跳過操作；Escape 不會關閉，長按鍵盤不會連續翻頁。已完成章節可在大廳回顧。\n\n';
doc+='閱讀時凍結戰鬥時鐘、HP／MP、敵人生成與冷卻。保留上一段、下一段，以及儲存返回大廳；重開後接續讀到的句子，不能藉返回大廳把未讀場景標成完成。舊版存檔保留已完成戰鬥，從目前這一節的新劇本第一句繼續；旧句號和完成標記不會跳過重寫內容。\n\n';
doc+='iPad 保留大型按鈕，故事可直向閱讀；進入戰鬥前須轉橫向。每節故事與戰鬥提示都顯示具體目標。故事修訂與已驗證的戰鬥版本分開，現有重播、角色技能、持有權及獎勵規則保持相容。\n';
doc=doc.replaceAll('冷卻装置','冷卻裝置').replaceAll('旧句號','舊句子位置');
const file=path.resolve('docs/pet-brawl-adventure.md');
if(fs.existsSync(file)){const backup=path.resolve('artifacts/adventure-backups','adventure-doc-'+Date.now()+'.md');fs.mkdirSync(path.dirname(backup),{recursive:true});fs.renameSync(file,backup);}
fs.writeFileSync(file,doc);
console.log(JSON.stringify({chapters:20,dialogueLines:ADVENTURE.chapters.flatMap(chapterScenes).reduce((n,s)=>n+s.lines.length,0),document:file}));
