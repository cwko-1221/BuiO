# 樂園美術與同班共建

2026-10-25。木橋、石橋和三片花圃木框已改用內建 **ImageGen** 生成的透明美術。新增三個同班共建場景，從樂園工具列的「共建」入口或場景標籤前往。

## 共同改變場景

| 地點 | 操作 | 直接看見的變化 |
| --- | --- | --- |
| 橋邊花廊 | 選擇暖粉、奶白或綠葉花飾，掛在木橋上 | 橋的前後欄杆逐份增加花環 |
| 睡蓮生態池 | 選擇奶白、桃色或青綠睡蓮，合力種植 | 池水表面逐朵增加睡蓮 |
| 願望燈會 | 選擇暖金、蜜桃或薄荷燈籠，掛到願望鐘旁 | 廣場的燈串逐盞增加燈籠 |

每個計畫需要全班 9 次貢獻，每名學生每天每個計畫最多 3 次，讓同學一起完成。每次幫忙都有一份實際裝飾，面板顯示進度、自己的次數與參與同學。活動免費，沒有扣款或發幣。

成果以班級和香港日期儲存，重新登入或伺服器重啟可讀回；每日香港時間午夜開始新的共建場景。不同班級互相隔離。原本的種花、澆水、生長和採收循環繼續可玩。

## ImageGen 素材及分層

使用方式是內建 `image_gen`，透明背景生成；木橋面與花圃以原畫生成，欄杆和後續配件依同組美術保持風格一致。沒有使用外部生圖 CLI。原稿只作透明邊界裁切、縮小和 WebP 壓縮，沒有以程式重新繪製橋、欄杆或木框。

八份完整生成提示保存在 [prompts.json](../artifacts/park-community-v1/prompts.json)，各張來源、裁切位置和輸出大小保存在 [source-record.json](../artifacts/park-community-v1/source-record.json)。正式輸出清單為 [community-art-assets.json](../pet-app/src/park/community-art-assets.json)。

| 素材 | 原始 PNG | 正式 WebP |
| --- | --- | --- |
| 木橋橋面 | [wood-deck.png](../artifacts/park-community-v1/wood-deck.png) | [橋面](../pet-app/public/assets/art/park/community-v1/wood-deck-d319e87c6fa5.webp) |
| 木橋欄杆 | [wood-rail.png](../artifacts/park-community-v1/wood-rail.png) | 依正式輸出清單 |
| 石橋橋面 | [stone-deck.png](../artifacts/park-community-v1/stone-deck.png) | [橋面](../pet-app/public/assets/art/park/community-v1/stone-deck-a18261350f6b.webp) |
| 石橋欄杆 | [stone-rail.png](../artifacts/park-community-v1/stone-rail.png) | 依正式輸出清單 |
| 花圃木框與土壤 | [garden-bed.png](../artifacts/park-community-v1/garden-bed.png) | 依正式輸出清單 |
| 花環 | [garland.png](../artifacts/park-community-v1/garland.png) | 依正式輸出清單 |
| 睡蓮 | [lily.png](../artifacts/park-community-v1/lily.png) | 依正式輸出清單 |
| 燈籠 | [lantern.png](../artifacts/park-community-v1/lantern.png) | 依正式輸出清單 |

橋面、遠側欄杆和近側欄杆分層放置；寵物走在橋面上，近側欄杆會遮擋寵物。原有兩座橋的 640 × 240 行走範圍及欄杆碰撞區域保留。花圃使用完整木框與土壤原畫，對齊原有花圃位置。睡蓮顯示於池塘圖層上方，沒有加入地面行走指引線。

## 儲存與伺服器檢查

`park-projects.mjs` 定義共建計畫與規則；既有共享花圃資料增加 `projects`，沿用 JSON 或 PostgreSQL 的班級／日期交易，不需要新資料表。舊存檔沒有這個欄位時可直接繼續使用。

貢獻沿用 `park:garden:act`，`action:'contribute'`，`plotId` 為計畫 ID、`seed` 為配色 ID。請求包含日期、當前計畫版次及請求 ID；伺服器自行決定貢獻者、次數、時間和完成進度。重送、過期或替換命令不能重複增加裝飾。

操作與提交前均檢查真實位置、可通行視線、當前 socket、老師鎖定、活躍狀態及是否正在其他活動。狀態即時發送到目前班級，更新完成後各客戶端套用相同的裝飾與配色。

## 驗證

TypeScript、57 項樂園規則／JSON／PostgreSQL／伺服器測試、4 項正式產物檢查及原有寵物模組檢查通過。測試紀錄保存在 `artifacts/park-community-v1/`。

- [多人共建實測](../artifacts/pet-playtest/park-community-live-2/report.json)：四個隔離的真實登入測試帳戶，三位同班學生透過實際介面完成全部三個計畫；27 份裝飾同步、跨班隔離、重載、老師鎖定及重送／過期命令正常。
- [原有種花流程](../artifacts/pet-playtest/park-community-garden-2/report.json)：實際種植、兩人澆水、伺服器計時生長、採收與保存正常。
- [原有樂園流程](../artifacts/pet-playtest/park-community-regression-2/smoke-report.json)：14 張任務卡、搜尋重試、無地面路線圖形、香蕉觸控、飛行護盾、暫停及老師鎖定正常。
- 人工檢查木橋、石橋、花圃、過橋與三種共建完成畫面；修正睡蓮被底圖遮住的圖層問題。

最終本機版本為 `artifacts/park-community-build-2`，入口 SHA-256：`804ddf1b625df1e134e619fb82ae909e1e3d81a8584689c8d8eade0bfd311541`。本機分發紀錄見 [preview-verification.json](../artifacts/pet-playtest/park-community-final-2/preview-verification.json)。

測試使用 Windows Chrome、平板與手機觸控模擬；尚未使用實體 iPad，未對外部署。[本機預覽](http://localhost:3000/pet)。
