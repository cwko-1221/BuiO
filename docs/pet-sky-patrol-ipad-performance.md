# 天空巡遊：iPad 操作與效能修正

本次修正處理飛機落後於指標，以及觸控裝置的特效負載。美術資產與遊戲內容沿用天空巡遊 v2。

## 操作

- 滑鼠移動時，飛機在本機下一個繪圖幀直接更新，沒有追趕速度或位置平滑。
- 手指採相對拖曳：落指時保持原位，其後按手指位移一比一移動，可抬手重新選擇舒適位置。到邊界後反向拖曳會立即移回。
- 只由取得控制的手指操控飛機；另一隻手可按護盾／蓄能攻擊。抬手、取消、暫停及旋轉畫面都解除拖曳擷取。
- 鍵盤保留不同機種的移動速度。香蕉籃子也使用即時拖曳。

## 延遲及一致性

原本輸入每 80ms 傳送一次，而且等待確認才發下一次；伺服器每 100ms 集中執行三次模擬，飛機再追趕回傳位置，並額外做 40ms 平滑。

現在本機直接使用與伺服器共用的移動／邊界規則。輸入約每 50ms 傳送最新樣本，不等待確認，也不把斷線期間的位置排隊。護盾與蓄能攻擊使用持續重送的遞增按下計數，短按不會被下一個移動樣本覆蓋。序號阻擋過時輸入。

遊戲模擬獨立以 30Hz 執行，約 15Hz 傳送可替換的狀態；其他物件在繪圖幀間做短距離外推。快速拖曳會沿整段相對移動檢查子彈、敵機及光束；籃子和補給亦檢查整段路徑。生命、命中、分數及金幣仍由伺服器判定。

## 減少畫面停頓

- 重用粒子及圖片物件，過期粒子回到物件池。
- 觸控裝置粒子上限 120，其他裝置 220；觸控裝置減少前景雲層並停用受傷震動。
- 導彈尾跡依時間間隔產生，命中搜尋不用每次建立及排序陣列。
- HUD 數值改變時才更新文字；暫停狀態改變時才操作 tween。
- 18 種音效在開局前分批準備，避免首次使用時即場合成。無 Web Audio 實作的瀏覽器可靜音繼續操作。
- 小遊戲使用原生 Pointer Events，暫停 Phaser 重複的觸控處理，退出時恢復；避免取消手勢時對不可取消事件呼叫 preventDefault。
- 外框使用四塊背景填色，取代全畫面複合遮罩、外框大面積模糊陰影；中央場景及機體圖片不變。

## 驗證與限制

正式驗證版本為 `artifacts/sky-patrol-ipad-build-5`。完整三機種遊玩、香蕉、暫停／音效恢復、重玩、載圖重試、獎勵重送、四種畫面尺寸，以及樂園任務／老師鎖定 regression 均通過。45 項規則／整合檢查、TypeScript、原有寵物模組及 4 項 build artifact 檢查通過。

專用測試 `scripts/test-sky-patrol-input-live.mjs` 經實際 Socket.IO 人為延遲上行與下行各 180ms，再測原生觸控和繪圖。Chrome 平板模擬為 DPR 2、CPU 降速 4 倍；涵蓋連續拖曳、雙指護盾、取消手勢、舊狀態抵達後的位置、伺服器最終位置一致、暫停和橫直屏。

測試中的 responseMs 從 DOM 指標事件到 Phaser postupdate 計時，不是實體觸控螢幕至像素顯示的硬體延遲。Windows Playwright WebKit 測試環境沒有 Web Audio，而且其 WebGL 遊戲畫面未能顯示於截圖；該次報告只證明輸入／狀態功能。另以明確的 `PET_WEBKIT_CANVAS=1` 測試 Canvas fallback，已檢視能顯示機體／場景的截圖。其幀率均不能代表 iPad Safari；未使用實體 iPad，亦未對外部署。

## 實測紀錄

- [延遲與觸控](../artifacts/pet-playtest/sky-ipad-input-release-5/report.json)：Chrome DPR 2、CPU 4 倍降速、360ms 額外往返延遲，101 次移動均在繪圖更新中跟上；幀時間中位 16.7ms、p95 19.5ms。DOM 到 postupdate 的 p95 2.9ms，不作硬體延遲宣稱。
- [WebKit Canvas fallback](../artifacts/pet-playtest/sky-ipad-webkit-canvas-release-5/report.json)：原生觸控落指不跳位、滑鼠直接跟隨、伺服器最終位置一致、暫停及直向版面通過；截圖已檢視。
- [完整遊玩](../artifacts/pet-playtest/sky-ipad-full-release-5/report.json)：三機種均擊破頭目，三階段及技能／補給正常；香蕉完整一局接住 60 顆、104 分。四種尺寸、失敗載圖重試及結算重送通過。
- [樂園 regression](../artifacts/pet-playtest/sky-ipad-regression-release-5/smoke-report.json)：任務、沒有路線圖形、手機拖曳、護盾、暫停、老師鎖定／解除及返回房間通過。
- 外框比較：[修改前](../artifacts/pet-playtest/sky-ipad-webkit-profile-4/report.json) 的 WebKit 幀時間中位 125ms；[修改後](../artifacts/pet-playtest/sky-ipad-webkit-profile-5/report.json) 為 54–60ms。此環境的 WebGL 截圖限制如上，數據只用於比較同環境的外框合成成本，不代表 iPad 的幀率。
- [本機分發核對](../artifacts/pet-playtest/sky-ipad-release-5/preview-verification.json)：入口與已驗證 build 相同；50 個實際 HTTP 程式／美術回應逐 byte 相同，health 200、未登入導向登入頁。

本機預覽為 <http://localhost:3000/pet>，伺服器已重新啟動以套用 30Hz 模擬及新輸入規則。
