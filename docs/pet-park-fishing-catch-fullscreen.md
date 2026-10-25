# 全屏釣獲展示

2026-10-26。每次成功釣魚後，以覆蓋整個網頁視窗的展示畫面呈現魚的原生圖片、名稱、長度、稀有度、釣點、分數和商人收購價。首次發現的魚會標示「新發現」。

展示期間暫停伺服器遊戲計時及背景操作，學生可慢慢欣賞。選「繼續釣魚」回到同一回合；選「收竿回樂園」則保存本回合魚獲並結算。收購價只作資料顯示，出售仍須到商人處操作。

展示層放在遊戲容器之外，避免受到遊戲畫布比例限制。平板及手機直向採上下排列，矮身橫向改為左右排列。按鈕至少 44 像素；支援鍵盤焦點循環、Escape 繼續，以及減少動態效果設定。關閉遊戲、老師鎖定或離開時會移除展示並恢復輸入狀態。

驗證命令：

```powershell
$env:PET_APP_TEST_DIST='artifacts/park-fishing-catch-build-2'
node scripts/test-park-fishing-catch-live.mjs --output=artifacts/pet-playtest/park-fishing-catch-live-2
```

以真正登入的隔離測試帳戶實際拋竿、提竿及控制張力，檢查 1024×768、768×1024、1440×960、390×844、844×390 五種視窗。驗證計時暫停、兩次魚獲、繼續後不重複展示、收竿保存、重送不重複結算及老師鎖定清理。測試環境是 Windows Chrome 的觸控模擬，未使用實體 iPad。

合併遠端更新後，以 `artifacts/park-fishing-catch-build-2` 重新建置，並再次通過[完整釣獲流程](../artifacts/pet-playtest/park-fishing-catch-live-2/report.json)及[樂園回歸流程](../artifacts/pet-playtest/park-fishing-catch-regression-2/smoke-report.json)。另有 70 項規則及 PostgreSQL／JSON 測試、4 項正式產物檢查、TypeScript 及原有寵物模組檢查通過。

[本機預覽](http://localhost:3000/pet)已同步此版本；[分發核對](../artifacts/pet-playtest/park-fishing-catch-final-1/preview-verification.json)驗證了 142 個檔案，並確認未登入仍須先登入。
