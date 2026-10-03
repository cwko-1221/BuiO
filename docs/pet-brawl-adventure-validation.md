# 冒險故事重製驗證紀錄

驗證日期：2026-10-03。故事修訂：2。戰鬥規則：brawl-v10。所有學生、存檔、對戰與獎勵測試使用隔離 JSON 資料。

- 劇本：二十章、八十節、一百段故事、362 句繁中／英文對白；每節都有具體目標，第四節保留 Boss 對話，章末交代結果與下一站。
- 完整瀏覽器通關：逐句核對全部故事，使用合法戰鬥輸入完成二十章；Boss 在對話完成後才生成，結局讀完才結算。下一章解鎖、跨幕前進、完成章節回顧均通過。
- 不可跳過：故事沒有略過按鈕，舊 story-skip 操作也無效；Escape 不關閉進行中故事，重複按鍵不連續翻頁。閱讀時時鐘、MP、敵人與操作都凍結。
- 存檔：讀到中途及最後一句，儲存回大廳再重新載入都停在原句。實際 IndexedDB 舊版存檔移除過時完成標記，從目前場景第一句讀新劇本；戰鬥狀態與重播完全一致。已完成戰鬥保留，勝利存檔仍須先讀新結局。
- 畫面：1180×820、1024×768、844×390、390×844，沒有頁面橫向溢出；下一段按鈕至少 52px，完整留在故事面板內。手機橫向底部按鈕固定顯示；直向可讀故事，戰鬥開始前仍須橫向。已檢視開場、團聚、月舟 Boss 對話與結局畫面。
- 獎勵：二十次勝利通過伺服器核實；每日上限仍只有三次養成獎勵，測試總 XP 為 30。故事回顧不增加獎勵。
- 美術與敵人：八十張背景、二十九組八幀透明敵人圖集、三位同伴立繪檢查通過。十七位新 Boss 的兩組招式、燃燒／結冰命中及防禦阻止狀態均通過。
- 同學對戰：跨班在線通知、拒絕不扣款、接受各付 500、鍵盤與多點觸控、重載恢復、投降結算及素材載入失敗退款均通過；故事修改沒有插入對戰流程。
- 發布檢查：TypeScript、production build、四項推幣機發布檢查通過。戰鬥模組與舊版本快照未修改。

瀏覽器使用 Windows Chrome 的觸控模擬；實體 iPad Safari 未測試。完整劇本見 [星晶失竊事件](pet-brawl-adventure.md)。

測試入口：scripts/test-pet-brawl-story.mjs、scripts/test-pet-brawl-story-live.mjs、scripts/test-pet-brawl-adventure.mjs、scripts/test-pet-brawl-pvp-live.mjs，以及 pet-app/tests/coin-pusher-build-artifact.test.js。

本機完整故事報告與截圖：artifacts/pet-playtest/adventure-story-v2-final；對戰報告：artifacts/pet-playtest/adventure-story-v2-pvp。
