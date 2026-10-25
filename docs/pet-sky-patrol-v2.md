# 寵物天空巡遊 v2

2026-10-25。遊戲重新製作為寵物駕駛的垂直捲動射擊，保留原來入口、委託、每日金幣上限與伺服器結算。美術／UX 最終結論見 [獨立審查](pet-sky-patrol-v2-review.md)。

## 遊玩及畫面

| 機體 | 一般攻擊 | 蓄能攻擊 |
| --- | --- | --- |
| 晨星號 Starling | 高速雙連射，升級後增加側炮 | 五列高速星光突擊 |
| 森羽號 Leafwing | 花瓣扇形炮，升級後擴大覆蓋 | 全向花雨綻放 |
| 霞光號 Sundancer | 貫穿炮及追蹤導彈 | 曙光重型光束 |

機種的速度、射速、彈道、貫穿及特殊攻擊由伺服器決定。機庫展示自己的寵物駕駛員、三款機體和選中武器；不消耗金幣選機。遊玩中可用滑鼠、方向鍵／WASD、觸控拖曳，Space 或按鈕使用護盾，蓄滿能量後按 X 或蓄能按鈕。

敵機有偵察機、攔截機、重裝轟炸機，飛行路徑、血量及炮火不同。末段的「暴風方舟」有三個護甲／攻擊階段、短暫轉階段護甲、扇形／環形彈幕及預告光束；高傷害亦不能跳過階段。補給需要靠近收集，包括 P 武器升級、生命、能量及護盾。

原生溪谷美術、不同速度的雲層、機身傾斜、尾焰、轉動渦輪、炮口閃光、不同形狀的彈道、導彈尾跡、命中亮色、煙霧／碎光、補給吸附及波次／頭目演出各自對應遊戲狀態。受擊亮色以畫面時間限制為 55ms，使用低強度加色以保留頭目材質，低動畫設定取消該閃光與鏡頭搖晃。

香蕉遊戲同步更新為原創果園與編織籃子，加入收集、金香蕉及連接的視聽回饋，規則仍為 45 秒、接住八顆達標。飛行維持 60 秒與擊破六架的委託目標；完整擊退頭目為額外勝利挑戰。

## 音效

18 種原創合成 cue：三款武器、敵機射擊、導彈、命中、普通爆破、頭目爆破、護盾、警示、補給、普通／金香蕉、受傷、特殊攻擊、勝利、失敗及起飛。搭配獨立飛行／果園配樂，支援音量、靜音、背景分頁及老師鎖定。每次最多 18 個飛行音效聲部，專用 compressor bus 控制重疊爆破。

暫停會停止飛行音效及配樂；繼續遊戲時，在使用者操作內解鎖 Web Audio，再恢復伺服器狀態。退出會清理聲部並恢復樂園原有音樂。真實測試會主動 suspend 正在運作的 AudioContext，驗證按繼續後恢復 running，而非只看按鈕文字。

原創 DSP 在 `pet-app/lib/sky-sound.mjs`；[18 份 WAV 與試聽合輯](../artifacts/sky-patrol-v2/audio/sound-reel.wav) 由同一程式匯出。來源取樣不削波、首尾柔化及聲音指紋差異有自動檢查；未將數位測試宣稱為不同實體喇叭或裝置的聽感驗收。

## 資產及實作

十一份原創圖片由內建 ImageGen 生成：三個玩家機體、三個敵機、頭目、溪谷、雲、籃子、果園。原始 PNG 和逐份提示保存在 `artifacts/sky-patrol-v2/`，完整 [提示集](../artifacts/sky-patrol-v2/prompts.md) 與 [來源紀錄](../artifacts/sky-patrol-v2/source-record.json) 保留。打包僅裁透明邊、縮小及轉 WebP，沒有上採樣。

參考 [Infinite Dreams 官方頁面](https://www.idreams.pl/en/our-products/show/product/77-Sky-Force-Reloaded) 及 [官方 Steam 介紹](https://store.steampowered.com/app/667600/Sky_Force_Reloaded/) 的機體差異、捲動場景、武器層次及大型頭目原則；沒有使用該遊戲的圖像、聲音或商標。

模擬位於 `park-games.mjs`，繪圖由 `mini-game-scene.ts` 讀取狀態，機庫／HUD／結果及生命週期由 `mini-games.ts` 管理。伺服器驗證機體白名單、座標及輸入，不接受客戶端分數；效果事件有期限／90 個上限、敵彈上限 180、畫面粒子上限 220。載圖失敗會阻擋開始並提供本遊戲的重試，成功後不殘留全站錯誤面板。場景的 shutdown／destroy 都解除 resize listener。

## iPad 操作更新

飛機及香蕉籃子已改為本機即時回應；iPad 使用相對拖曳，支援另一隻手操作技能。輸入不再等待網絡確認，並加入觸控效能預算、粒子池及音效預先準備。最新規則、驗證範圍與限制見 [iPad 效能修正](pet-sky-patrol-ipad-performance.md)。以下 Build 9 數據保留為美術版歷史紀錄。

## 驗證範圍

最終瀏覽器報告及原尺寸畫面保存於 `artifacts/pet-playtest/sky-v2-release-9/`。命令為：

```powershell
$env:PET_APP_TEST_DIST = (Resolve-Path artifacts/sky-patrol-v2-build-9).Path
node scripts/test-sky-patrol-v2-live.mjs --output=artifacts/pet-playtest/sky-v2-release-9
```

三個隔離登入帳戶實際控制不同機型遊玩，檢查三階段頭目、補給、專屬攻擊、結算重送、完整香蕉、重玩／返回、音效、靜音、暫停／恢復、四種尺寸及斷圖重試。手機使用連續 touchStart／touchMove 拖曳，沒有把腳本直接寫分數或生命當作遊玩證據。

規則與整合檢查共 42 項，另有 TypeScript、原有寵物模組及四項 production artifact 檢查。樂園 regression smoke 涵蓋原生地景、無路線圖形、任務搜尋、手機盾、暫停、老師鎖定／解除及返回房間。測試在 Windows Chrome、本機 HTTP；手機為瀏覽器模擬，沒有宣稱實體手機或正式資料庫／外網測試。

### 最終結果及本機預覽

Build 9 的 [實際遊玩報告](../artifacts/pet-playtest/sky-v2-release-9/report.json) 通過，錯誤清單為空。三款機體都完成三個頭目階段並勝利：晨星號 55.43 秒、森羽號 56.60 秒、霞光號 58.43 秒；各局中位 FPS 約 59.84–60.28。香蕉遊戲完整一局接住 50 顆、76 分。資料來自實際按鈕、方向控制、連續觸控及伺服器遊戲狀態；不是直接改寫生命或分數。

十一份 runtime WebP 合計 2,000,692 bytes。最終入口 SHA-256 為 `acdc8892686a02957dc9b14bdfb7000ae76d52937812b6b156544b1db09b84f7`，與獨立複審及兩份最終瀏覽器報告一致。[驗證清單](../artifacts/pet-playtest/sky-v2-release-9/validation-manifest.json) 保存程式、報告及覆核的 hash。

[本機預覽](http://localhost:3000/pet) 已更新並重新啟動伺服器，使機種及新戰鬥規則生效。[分發核對](../artifacts/pet-playtest/sky-v2-release-9/preview-verification.json) 確認 health 200、未登入轉往登入頁，以及 43 個實際程式／美術／載入回應逐 byte 與已驗證版本相同。沒有對外部署。
