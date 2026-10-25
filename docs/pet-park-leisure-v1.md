# 樂園多元小遊戲 v1

這次把重複的單人回音記憶改為不同操作，增加四款獨立小遊戲和一款迷宮挑戰。單人記憶只保留在風鈴；原有天空巡遊、香蕉、雙人合奏、共享花圃和其他任務繼續保留。

| 地點 | 遊戲 | 核心操作 | 達標 |
| --- | --- | --- | --- |
| 睡蓮池 | 池畔慢釣 | 拋竿，等真正咬鉤才提竿，再按住／放開控制張力 | 60 秒釣起 2 條魚 |
| 森林小鼓 | 森林節奏鼓 | 四軌音符落到判定線時敲對應鼓面；支援 1–4 鍵 | 30 秒命中 12 次 |
| 願望鐘 | 願望點燈師 | 點燈切換自己及相鄰燈，解開三組可解的邏輯盤面；可要求提示 | 點亮 2 組；3 組即完成全局 |
| 花蔭長椅／草地球會 | 草地迷你高爾夫 | 向後拖曳蓄力，放開推球，利用木欄反彈和摩擦停球 | 90 秒完成 2 洞；共 3 洞 |
| 老樹洞 | 森林郵差迷宮 | 點相鄰格或按方向鍵，走過有牆壁的迷宮送信 | 到達右下出口 |
| 風鈴琴 | 回音記憶 | 看、聽並重奏一次旋律 | 保留唯一單人記憶玩法 |

睡蓮池會先讓玩家選「釣魚」或「查看線索與調查水源」，原本的水道和寶藏線索仍可完成。草地球會也可選擇坐下休息。遊戲手冊列出六款獨立遊戲及森林迷宮，提供前往地點的按鈕；行走地面維持沒有路線圖形。

## 任務、收藏與金幣

委託由 12 個增加至 14 個，新增釣魚與高爾夫委託。小小樂隊改為「風鈴記憶 → 小鼓節奏 → 願望燈謎」三種操作；原森林回音委託改為郵差迷宮。保存進度的 ID 沿用，沒有重設既有錢包或已完成任務。

六種魚有名稱、顏色和分數差異；釣到的魚種保存在當日遊戲紀錄，重玩可補齊收藏。四款新獨立遊戲每日首次達標可得 8 金幣，仍與任務共用每日上限。重送同一次結算不會再發金幣；客戶端傳入分數不作結算依據。

## 實作

- `pet-app/lib/park-leisure.mjs`：固定步長的釣魚狀態、節奏判定、點燈邏輯及高爾夫碰撞／摩擦。由現有 30Hz 小遊戲伺服器執行。
- `pet-app/src/park/leisure-games.ts`：獨立 Canvas 2D 遊戲畫面及 DOM 控制，平板按住／放開、拖曳、按鍵與暫停。
- `pet-app/lib/park-activities.mjs`：由種子產生連通迷宮，伺服器核對每一步有沒有穿牆或跳格。
- `pet-app/src/park/venue.ts`：同一地點的遊戲／原有互動選單。

移動、短按次數與收線狀態使用可替換的輸入樣本，生命週期支援暫停、背景分頁、旋轉、老師鎖定、返回及斷線清理；重連後可重新開始。非必要池水／魚影動畫尊重減少動態效果設定。遊戲沒有新增昂貴的全畫面模糊或複合遮罩。

## 美術與參考

玩法方向參考任天堂的 [Animal Crossing 休閒活動介紹](https://animalcrossing.nintendo.com/new-horizons/explore/) 和 [官方釣魚步驟](https://play.nintendo.com/news-tips/tips-tricks/fishing-new-horizons-tips-and-tricks/)，採用觀察、工具操作及小型收集目標的節奏；沒有使用參考遊戲的圖像、音效、角色或文字。

池畔及草地背景以內建 **ImageGen** 製作，配合原有柔和森林樂園色調。兩份 PNG 原稿、[完整提示](../artifacts/park-leisure-v1/prompts.md) 及 [來源紀錄](../artifacts/park-leisure-v1/source-record.json) 保存在 `artifacts/park-leisure-v1/`。

正式美術檔案：

- [池畔 WebP](../pet-app/public/assets/art/park/leisure-v1/pond-4fbb2206c4ca.webp)
- [草地 WebP](../pet-app/public/assets/art/park/leisure-v1/meadow-8c400a805ec3.webp)

兩份 runtime 圖合計 521,860 bytes，從原稿縮至寬 1200px、轉為 WebP，沒有上採樣或重新繪畫。魚、浮標、燈籠、節奏軌道及球場機關由 Canvas 繪製，與判定位置一致。

## 驗證範圍

53 項樂園規則／整合測試通過，包含新玩法、50 個種子的迷宮、可解點燈、實際節奏時機、魚線控制、高爾夫碰撞、當日收藏、結算重送及共用金幣上限。另通過 TypeScript、原有寵物模組、4 項 production artifact 檢查。

完整瀏覽器測試使用四個隔離的真實登入帳戶，透過實際觸控、按住／放開、拖曳及鍵盤操作四款遊戲，再走到樹洞完成迷宮；沒有直接寫入分數、生命或結果來冒充遊玩。核對平板、手機、桌面及橫向版面、收藏保存、錯誤輸入、錯誤地點、暫停／旋轉、重送結算及原有任務。

測試環境為 Windows Chrome 與模擬觸控；尚未使用實體 iPad，未對外部署。最終版本為 `artifacts/park-leisure-build-3`，入口 SHA-256 為 `c4e5443321adce2d7d9c87cfc0d8635eceb4421e35449585ad23c2b1386e43df`。

- [完整新遊戲與迷宮報告](../artifacts/pet-playtest/park-leisure-release-3/report.json)：釣起 8 條魚、紀錄 5 種魚；節奏鼓命中 56 次；三組燈謎完成；高爾夫三洞 6 桿。結算、收藏和委託進度均由實際輸入及伺服器狀態取得。
- [原有樂園 regression smoke](../artifacts/pet-playtest/park-leisure-regression-3/smoke-report.json)：14 個委託卡、搜尋重試、無地面路線圖形、香蕉觸控、飛行護盾、暫停、老師鎖定及返回正常。
- [本機分發核對](../artifacts/pet-playtest/park-leisure-final-3/preview-verification.json) 與 [驗證清單](../artifacts/pet-playtest/park-leisure-final-3/validation-manifest.json)：實際 HTTP 程式和美術逐 byte 比對，並記錄來源及報告 hash。

[本機預覽](http://localhost:3000/pet) 已更新，伺服器已重啟套用新玩法與委託規則。
