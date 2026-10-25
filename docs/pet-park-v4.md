# 寵物樂園 v4：繪本小鎮與可玩地景

> 小遊戲已另外升級為 [寵物天空巡遊 v2](pet-sky-patrol-v2.md)。本文件保留地圖 v4 的固定版本及驗收證據；目前本機預覽包含後續的小遊戲更新。

2026-10-25。最終測試版本：`artifacts/pet-park-release-candidate-5`。獨立美術覆核及本機預覽更新狀態見 [發行計劃](pet-park-release-plan.md) 與 [批評者紀錄](pet-park-release-art-review.md)。

## 地圖與美術

5120 × 3584 世界分成家園小徑、微光森林、四季花園和星願廣場。兩座橋及環形道路連成完整步行網；道路靠暖石材質、低邊石、寬窄和地標辨認。沒有地面或小地圖行走指引線。

以原生草、石、土、水材質及獨立住宅、樹木、花境、作物和水道機關構成場景，取代放大的整張背景。512 世界單位的地景區塊保留兩側出血，避免分塊接縫；發行鏡頭最高 zoom .68，不放大地面原生 texel。

美術採暖色繪本風格。房屋、道路和花園是主要輪廓；植物沿外緣成組配置，操作入口保留站位。園藝床有實體木框，土壤裏有九株獨立幼苗或花朵，不再縮放整個花盆表示成長。

12 份新增來源圖片及完整提示保存在 [美術來源紀錄](../artifacts/park-art/modular-v4/source-record.json) 和 [ImageGen 提示](../artifacts/park-art/modular-v4/prompts.md)。來源由內建 ImageGen 生成；Sharp 只做透明邊裁切、縮小及 WebP 包裝。新增 runtime WebP 共 2,579,610 bytes；不包含既有角色及場景物件。

## 行走及遮擋

`park-layout-v4.mjs` 是美術、尋路及伺服器碰撞的共同位置來源。足部半徑 18；連續線段掃描阻擋薄欄、河道、花圃、根部及建築物。橋面有有限範圍、實體護欄及分開的前後層次；客戶端插值亦檢查通行，缺少封包不能抄近路穿入欄杆。寵物只在樂園使用腳底原點，房間維持原有位置。

## 遊玩內容

- 12 項 NPC 委託：送信、找橡果、垃圾分類、找包裹、花圃澆水、旋轉水管、音符記憶、尋線索解鎖寶藏及兩款遊戲委託。
- 接香蕉與寵物天空巡遊均進入專用遊戲畫面，支援暫停、觸控、結果及返回；成績及金幣由伺服器判定，重送不會重複領取，每日上限保留。
- 點擊附近同學可邀請擊掌或雙人星光合奏。接受後才開始；合奏每拍需要雙方正確輸入，結果可再邀一局並重新徵求對方同意。
- 同班共同種花：選種、種植、兩次澆水、等待生長、採收班級花束。JSON／PostgreSQL 保存植物及貢獻，重新載入仍在；其他班有自己的花圃。
- 拒絕、逾時、取消、離線、重連、換分頁和老師鎖定均由伺服器清理活動狀態。新社交／種花不改動錢包。

## 最終版本證據

HTML SHA-256：`d7dc88e6b4e974eb9a26d39f46de02bc3ddeb0cc8b985ad19a1398815282607f`。下面瀏覽器命令均以 `PET_APP_TEST_DIST=artifacts/pet-park-release-candidate-5` 啟動隔離伺服器，使用臨時學生資料，不改動正式帳戶。

| 範圍 | 實測及證據 |
| --- | --- |
| 全圖、四區及全部任務 | [完整報告](../artifacts/pet-playtest/release-v4-accepted/report.json)：12 項逐一確認交付、每日精選加成、所有解謎、完整香蕉 45 秒／天空巡遊 53.23 秒、巨雲、金幣上限、重送、重載、觸控、鎖定及返回房間。 |
| 橋及腳底 | [橋檢查](../artifacts/pet-playtest/release-v4-geometry-5/report.json)：782 個實際移動 frame，石／木橋 330／323 個渲染樣本，21 個實際不透明腳底像素量測；包含四角、橋頭、兩側護欄及丟失封包。 |
| 玩家互動 | [社交檢查](../artifacts/pet-playtest/release-v4-social-5/report.json)：7 項、真實雙瀏覽器、八拍合奏、刻意漏一拍、再邀請、同意／拒絕、逾時、離線、班別隔離及老師鎖定；手機直向／橫向均操作。 |
| 持久種花 | [園藝檢查](../artifacts/pet-playtest/release-v4-garden-5/report.json)：兩人種植澆水、20 秒成長、盛開、一次採收、班別隔離、重載及鎖定；圖像包括幼苗及成熟植株。 |
| 四個尺寸及重試 | [UI 與 console 檢查](../artifacts/pet-playtest/release-v4-ui-console-5/report.json)：1440×960、1024×768、390×844、844×390；名字≥12px、次標籤≥11px、44px 控制、無橫向溢出、低動畫、清快取載入、故意斷圖後重試。成功後確認沒有殘留全站錯誤面板。 |
| 登入及老師工具 | [同步 smoke](../artifacts/pet-playtest/release-v4-sync-5/smoke-report.json)：房間出口、同班可見／跨班隔離、移動、表情、權限、每日上限設定、重載及未分班個人樂園。 |
| 規則及儲存 | [36 項單元檢查](../artifacts/pet-playtest/release-v4-accepted/unit-checks.txt)：物理、全部入口可達、30 人安全出生、任務、冪等／並行、JSON 回滾、PostgreSQL 交易及行鎖、社交與園藝。 |
| 原有寵物功能 | [寵物模組檢查](../artifacts/pet-playtest/release-v4-accepted/pet-module-checks.txt) 通過；TypeScript 無錯，四項 production artifact 檢查通過，既有共用載入流程 15 項瀏覽器檢查通過。 |

正常移動 HUD 佔全視窗：桌面 10.80%、平板 14.52%、直向手機 20.26%、橫向手機 14.34%。地面原生密度 1.56–2.00 texels／CSS px。

30 名實際驗證登入的學生，在本機 Windows Chrome：桌面 median 60.07 FPS、p10 59.76；手機尺寸 median 60.01 FPS、p10 60.01。這是本機 HTTP、Chrome 模擬手機，未宣稱實體手機、外網延遲或正式 PostgreSQL 服務的發行實測。PostgreSQL 證據是隔離測試，不是正式資料庫驗收。

完整測試使用 `scripts/test-pet-park-adventure-live.mjs --art-tour`；橋使用 `scripts/test-pet-park-bridge-release-live.mjs`；其他命令見各報告相應測試檔。先前的失敗結果保留，最終採用本節列出的完成報告，不以舊 build 的通過代替新版本。

## 本機預覽

已更新至 [http://localhost:3000/pet](http://localhost:3000/pet)。[預覽核對紀錄](../artifacts/pet-playtest/release-v4-accepted/preview-verification.json) 確認 health 200、未登入導向登入頁，以及 32 個實際 HTTP 回應逐 byte 等同 Candidate 5，包含延遲載入的樂園程式、12 份新美術及共用載入元件。`dist/index.html` 也保持相同 SHA-256；同步保留舊 hash chunks 供仍開著頁面的使用者使用。沒有對外部署。
