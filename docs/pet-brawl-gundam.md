# 元祖高達大亂鬥

已把已發佈的 `gundam-rx-78-2` 接入大亂鬥，放在角色清單最後。角色為史詩級，118 HP、移速 195、普通連段傷害 8／9／14；普通命中沿用少量 MP 回復。需要在寵物樂園擁有此角色，才可進入練習、教學、冒險、AI、自由及排名對戰。

| 技能 | 行為 | 傷害 | MP | 冷卻 |
| --- | --- | --- | --- | --- |
| 光束步槍連射 | 舉槍瞄準、後座力、三發獨立粉紅光束、放下步槍 | 12 × 3 | 35 | 5.5 秒 |
| 光束軍刀三連斬 | 拔刀、下斬、反手上斬、突刺收招；末擊擊倒 | 8 + 8 + 16 | 45 | 8 秒 |

技能可被攻擊打斷。步槍射程 740，對手可換路線躲避；軍刀範圍 210，兩招施放時原地出招。左右方向使用相同規則，角色及特效一起鏡像。

## 素材

使用內建 imagegen，以已發佈的高達右側站姿作外觀參考，整條動畫一次生成，再固定比例整理。每個技能 8 個角色姿勢，另有步槍及軍刀各 8 個特效格，共 32 個新來源格。普通三連段及空中攻擊從同一套軍刀姿勢按命中時間排列；沒有修改寵物樂園的原有行走 atlas。

最終素材及索引位於 `pet-app/public/assets/art/brawl/`，檔名為 `gundam-rx-78-2-{rifle,saber}-{poses,fx}-<hash>.webp`。每張為 1536 × 768 RGBA，角色各條動作使用固定縮放和相同腳底基線。較大透明格保留武器伸展空間，維持原本角色顯示大小；光束、刀光與角色各自分層，槍口及劍柄使用逐格發射點。

完整實際提示詞及來源記錄：[`generation.json`](../pet-app/art-source/gundam-brawl-v1/generation.json)。選定及淘汰的原始圖片保存在同一個本地素材資料夾；第一張混合特效表的邊界及透明留白不合適，因此分成兩張獨立特效表重新生成。

最終檔案：

- [步槍出招姿勢](../pet-app/public/assets/art/brawl/gundam-rx-78-2-rifle-poses-f44ae378308d.webp)
- [軍刀出招姿勢](../pet-app/public/assets/art/brawl/gundam-rx-78-2-saber-poses-94b9b9d42f43.webp)
- [步槍光束及命中特效](../pet-app/public/assets/art/brawl/gundam-rx-78-2-rifle-fx-f016a8408d96.webp)
- [軍刀斬擊及命中特效](../pet-app/public/assets/art/brawl/gundam-rx-78-2-saber-fx-bf9a38e26713.webp)

重建：`node scripts/build-pet-brawl-gundam.mjs`。建構報告、分格及深色底預覽位於 `artifacts/pet-playtest/gundam-brawl/`。

## 版本及驗證

新對戰使用 `brawl-v15`。原 `brawl-v14` 的十二個檔案完整存放於 `pet-app/lib/brawl/legacy/v14/`，僅調整舊版引用相對路徑。舊的 28 隻角色存檔及輸入重播仍交由原版本規則處理。

`node scripts/test-pet-brawl-gundam.mjs` 覆蓋雙方向傷害、MP、冷卻、躲避、打斷、基本命中回 MP、所有權、冒險及自由／排名入場、退款、透明留白和舊版重播。`node scripts/test-pet-brawl-gundam-live.mjs` 使用隔離資料庫及實際 Chrome，驗證大廳鎖定、觸控出招、射擊／軍刀動畫、普通攻擊、MP 不足、正常速度鍵盤操作及 iPad 尺寸。

其他角色的名冊、普通攻擊、屬性、平衡、故事和個別角色測試亦須通過。沒有在實體 iPad 或正式 Postgres 資料庫執行驗證。
