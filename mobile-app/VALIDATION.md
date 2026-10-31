# 杯澳 App 0.2.0 驗證紀錄

日期：2026-10-31（香港時間）。版本 0.2.0、build 3。

## 已通過的版面及操作檢查

- `npm test`：五項通過，包括 HTTPS／導覽範圍、危險 URL 拒絕、16 個模組覆蓋、實際 SceneDelegate／storyboard 接線、原生權限及本機備援內容。
- `npm run test:browser`：七組尺寸通過，包括 390×844、402×874、874×402、1024×768、768×1024、375×667 及 600×900。使用 Windows 上的 Chromium／WebKit 桌面引擎模擬 viewport，不等同實體 WKWebView。
- 七組均檢查學生／教師登入、16 個模組 HTML 入口、權限、登出、重試頁、斷線提示、安全區 shorthand 及延遲載入的樣式。另在 WebKit 手機直向、手機橫向及 iPad 橫向實際開啟全部 16 個初始頁面，共 48 組版面，無根元素水平溢出。
- 手機底部分頁、寵物五個導覽位置、四個「更多」入口及固定導覽捲動後位置已檢查。
- `npm run test:app-ui`：Chromium 手機及 WebKit iPad 的孵化、圖鑑、商店、戶外樂園、練習對戰、返回房間，以及科學島預測、器材、任務、設定及離開均通過。
- 戶外樂園另檢查橫直向切換、浮動按鈕避開安全區及返回房間；已目視檢查兩種方向截圖。背景延伸至畫面邊緣，沒有用整頁縮放或裁切掩蓋版面問題。

測試使用獨立 JSON fixture 及合成帳戶，不使用正式學生資料。JSON fixture 無法取代完整 PostgreSQL 教師資料；入口版面通過不代表所有教師業務流程均已驗收。

## 原生 iOS／iPadOS 驗證

原生檢查使用 GitHub macOS runner、Xcode 26 及真正的 Simulator WKWebView。`ci/native-viewport.mjs` 只連到匿名 loopback 測試頁，不連到正式學習帳戶。

- 已確認及修正 SceneDelegate 原本建立預設控制器，導致 App 專用控制器沒有執行的根因。
- 已修正 Capacitor 替換 userContentController 的接線，以及 WebKit 安全區 env 與原生 UIKit 數值不同的情況。
- 前一輪 iPhone 原生測試已確認完整視窗、安全區、科學島／實戰橫向及返回原方向；Blob 亦已完成原生檔案下載。UIKit 分享面板的完成展示另納入最終驗證。
- iPad 可縮放視窗曾忽略橫向要求；用戶明確選擇「自動橫向優先、全螢幕、不保留分割視窗」。本版依此測試全螢幕相容模式。
- [原生建置流程](https://github.com/cwko-1221/BuiO/actions/workflows/buio-ios-pilot.yml)正在驗證最終來源：iPhone／iPad 各六個階段、實際轉向及恢復、Blob 與登入 Cookie 附件下載、檔案名稱／長度，以及兩個 UIKit 分享面板依序展示。第一個測試面板只作取消，不向任何收件人傳送檔案。

最終狀態、IPA 雜湊及證據在完成後更新於此。

## 實機狀態與尚未驗收項目

0.1.0 已由 Sideloadly 完成個人簽署及安裝，用戶確認能在 iPhone 開啟。0.2.0 尚需以相同 Apple ID／Bundle ID 設定覆蓋更新；重新載入舊 App 不會取得內嵌原生程式及版面輔助程式的修正。

- 0.2.0 在用戶實體裝置的開啟、版面、軟鍵盤／硬件鍵盤及觸控。
- 中文／英文錄音、科學錄影、拒絕權限後重試及相簿上傳。
- 正式私人 Excel／PDF、檔案匯入、白板、搶答器、雙機對戰、鎖屏／背景後重連及長時間記憶體。
- Android 專案保留；尚未接入與 iOS 等價的原生安全區／方向輔助，未編譯或安裝 APK。

本版仍以第一方 HTTPS 載入網站與遊戲素材，未完成素材離線化，也沒有對戰延遲改善的量測或成果。未修改正式網站／後端部署、遊戲判定、預測或其他工作目錄改動。

## 0.1.0 安裝記錄

- [原始實機 IPA 建置](https://github.com/cwko-1221/BuiO/actions/runs/40915067680)成功；ARM64、iPhoneOS、Release、未簽署。
- `buio-pilot-0.1.0-unsigned.ipa`：444,946 bytes；SHA-256 `3fb12a713fe9e81f59fcb47f89decb3e0760fbb899fddb3cc75ecf3cbf05b885`。
- Windows 核對 ZIP CRC、Mach-O ARM64 及 iOS device 平台；iTunes／Apple Mobile Device Service 及 Sideloadly 已準備。Apple 登入、驗證、信任及開發者模式由用戶自行處理，憑證沒有寫入專案。
