# 大亂鬥 v7 驗收（2026-10-03）

Windows Chrome，1024×768 觸控模擬；全部測試使用隔離 JSON 學生與錢包。

共享模擬 50 招、24 公開招式／12 寵物擁有權、13 隱藏角色的五模式拒絕及不扣款、全 v6 原紀錄重播、27 段完整闖關、三關貓通關、真人付款退款及重連測試均通過。TypeScript 及 Vite production build 通過。

瀏覽器完成全部 50 招的實際渲染、24 公開招式、兩人雷角羊／雪羽企鵝同步、拒絕免費／接受各付 500、大尺寸操作按鈕及無資源錯誤。完整流程回歸完成鍵盤、多觸點、教學、AI、IndexedDB 精確恢復、合法闖關、結算故意失敗後重試只入帳一次及回到房間。

每項大型特效以正常 60 Hz 執行約 1.4 秒鍵盤施放，使用 requestAnimationFrame 量測。以下是此工作站單次樣本，物件上限 72：

| 招式角色 | FPS | 峰值特效 sprites | 命中次數 |
| --- | ---: | ---: | ---: |
| spark-hamster | 60.0 | 4 | 5 |
| snowfeather-penguin | 60.0 | 25 | 1 |
| thunderhorn-goat | 60.0 | 6 | 3 |
| coral-seal | 60.0 | 1 | 1 |
| dragon-ball-goku | 60.0 | 5 | 5 |
| naruto-uzumaki | 60.0 | 5 | 4 |

50 招均無 pageerror 或失敗素材請求，切走場景釋放 sprite pool，練習錢包保持原額。測試也檢查金光／龜殼／讀心技能的實際光效。

來源腳本：test-pet-brawl-elemental.mjs、test-pet-brawl-elemental-live.mjs、test-pet-brawl-roster.mjs、test-pet-brawl-roster-live.mjs、test-pet-brawl.mjs、test-pet-brawl-live.mjs、test-pet-brawl-cat.mjs、test-pet-brawl-pvp.mjs。證據目錄 artifacts/pet-playtest/brawl-v7/ 包含 JSON、50 張招式截圖、showcase.png 及正常速度 elemental-showcase.webm。

悟空／鳴人等隱藏角色只在私有 fixture 展示招式，公開選角及 API 仍關閉。未在實體 iPad Safari 或 PostgreSQL 真實連線執行本次驗收。

整合遠端的縮放／文字選取防護及推銀仔結算修正後，重新通過 TypeScript、Vite、50 招渲染與六招正常速度效能、桌面／iPad／手機橫向多觸點與退出還原，以及 7 項結算／production artifact 檢查。發佈使用此整合版本的圖集與入口。
