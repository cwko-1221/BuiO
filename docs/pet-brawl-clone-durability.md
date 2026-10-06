# 鳴人分身調整（brawl-v14）

多重影分身術仍召喚兩個自主移動、追敵及普通攻擊的分身。每個分身現在需要受兩次有效攻擊才化煙消失；第一擊後仍可繼續行動。普通攻擊及技能不論傷害多少，每次有效命中只扣一格分身生命。

最多存在 180 tick（3 秒）；不顯示分身名稱、倒數或血條。MP、冷卻、攻擊力、重召替換及主人倒下清理沿用原設定。分身攻擊不回復 MP，分身消失不計擊殺或掉落。冒險、練習、AI、自由對戰及排名對戰共用同一套規則。

原有 v13 戰鬥模組完整封存到 `pet-app/lib/brawl/legacy/v13/`，舊冒險繼續用原有一擊消失規則恢復及驗證。新開的戰鬥使用 v14。

驗證：`node scripts/test-pet-brawl-utility.mjs` 檢查第一擊存活、第二擊一次煙霧消失、精確三秒期限、自主攻擊、重召清理及舊版本重播。`node scripts/test-pet-brawl-utility-pvp.mjs` 檢查真正 Socket.IO 同步。`node scripts/test-pet-brawl-utility-live.mjs` 使用隔離資料和 iPad 尺寸觸控瀏覽器檢查新版分身、隱藏標示及三秒煙霧動畫。
