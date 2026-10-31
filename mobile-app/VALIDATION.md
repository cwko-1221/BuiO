# 杯澳 App 0.2.0 驗證紀錄

日期：2026-10-31（香港時間）。版本 0.2.0；build 5 已透過 Sideloadly 覆蓋安裝，工具顯示 Done／100%。Build 6 依實機回饋收窄房間上方資訊與操作列、導覽移回底部，並交換戶外地點互動與六個工具的位置；目前進行驗證及重新編譯，下方原生與 IPA 證據仍屬 build 5。

## 已通過的版面及操作檢查

- `npm test`：五項通過，包括 HTTPS／導覽範圍、危險 URL 拒絕、17 個模組覆蓋、實際 SceneDelegate／storyboard 接線、原生權限及本機備援內容。
- `npm run test:browser`：九組尺寸通過，包括 390×844、402×874、874×402、956×440、1024×768、1376×1032、768×1024、375×667 及 600×900。使用 Windows 上的 Chromium／WebKit 桌面引擎模擬 viewport，不等同實體 WKWebView。
- 九組均檢查學生／教師登入、17 個模組 HTML 入口、權限、登出、重試頁、斷線提示、安全區 shorthand 及延遲載入的樣式。另在五組 WebKit 手機／iPad 尺寸實際開啟全部 17 個初始頁面，共 85 組版面，無根元素水平溢出；可見的兩至四字中文按鈕另檢查沒有拆行。包含工作目錄新增的「寶可夢物語」入口，並不代表已驗收其完整遊戲流程。
- 中文／英文教師頁的 groups、assignments、bank/categories 三個唯讀 API 使用隔離的合成資料，等待真實儀表板及表單出現再截圖，並聚焦輸入欄確認字體至少 16px；已目視檢查手機直向版面。登入及角色驗證沒有模擬。之前只看到載入畫面的截圖不當作教師版面通過。
- 手機底部分頁、寵物五個導覽位置、四個「更多」入口及固定導覽捲動後位置已檢查。
- `npm run test:app-ui`：Chromium 手機、WebKit 手機及 WebKit iPad 的孵化、圖鑑、商店、戶外樂園、練習對戰、返回房間，以及科學島預測、器材、任務、設定及離開均通過。房間另核對完整寵物名稱及 Stage 文字在橫直向均未被狀態欄裁切。
- 戶外樂園另檢查橫直向切換、浮動按鈕避開安全區及返回房間；已目視檢查兩種方向截圖。背景延伸至畫面邊緣，沒有用整頁縮放或裁切掩蓋版面問題。

測試使用獨立 JSON fixture 及合成帳戶，不使用正式學生資料。JSON fixture 無法取代完整 PostgreSQL 教師資料；入口版面通過不代表所有教師業務流程均已驗收。

## 原生 iOS／iPadOS 驗證

原生檢查使用 GitHub macOS runner、Xcode 26 及真正的 Simulator WKWebView。`ci/native-viewport.mjs` 只連到匿名 loopback 測試頁，不連到正式學習帳戶。

- 已確認及修正 SceneDelegate 原本建立預設控制器，導致 App 專用控制器沒有執行的根因。
- 已修正 Capacitor 替換 userContentController 的接線，以及 WebKit 安全區 env 與原生 UIKit 數值不同的情況。
- [Build 5 最終原生驗證](https://github.com/cwko-1221/BuiO/actions/runs/41188889479)：來源 `15c8cc5b836bc6970fe7a619f818aceda47994d6`。iPhone 17 Pro 及 iPad Pro 13 吋（M5）各九個階段，共 18 個全部通過。
- 階段包括首頁、科學島、寵物入口／房間／實戰、多人闖關、塔防、返回首頁及匯出。整個寵物模組維持橫向，離開模組返回原方向；首頁狀態列有背景遮罩，輸入欄轉向後仍至少 16px。
- 已確認 Blob 下載、沿用 Cookie 的 HTTP 附件下載，以及兩個 UIKit 分享面板依序展示。檔案名稱及長度分別為 `buio-export-check.txt`／24 bytes、`buio-http-export.txt`／38 bytes；第一個面板只作取消，沒有向收件人傳送檔案。兩個裝置的分享次數均為二。
- 18 張原生截圖另在 Windows 核對實體畫面四邊及短長邊比例，全部通過；文件頁頂部依狀態列遮罩顏色核對，其餘邊緣核對測試邊框。Simulator framebuffer 保持裝置座標，橫向 UIKit 內容會在 PNG 中呈 90 度方向，並非 CSS 旋轉。原生 fixture 不等同完整正式業務頁面驗收。
- 用戶已選擇「自動橫向優先、全螢幕、不保留分割視窗」。iPadOS 26 的使用條件是「設定 → 多工處理與手勢 → 全螢幕 App」。最終原生驗證包含選取此模式的獨立 XCUITest 紀錄；它只修改可丟棄的 CI 模擬器，沒有修改使用者裝置設定或以私人 API 強制轉向。
- 此前 iPad「視窗化 App」模式的驗證失敗，不列為通過。`UIRequiresFullScreen` 本身不能替代用戶的多工模式設定；[Apple 文件](https://developer.apple.com/documentation/BundleResources/Information-Property-List/UIRequiresFullScreen)有描述相容縮放行為。

最終 IPA `releases/buio-pilot-0.2.0-unsigned.ipa`：487,558 bytes；SHA-256 `af60d46131cb7ced86a5aca920356a833619842d08445666d6bbe8a481595fcf`。Windows 已核對 ZIP CRC、ARM64／iPhoneOS、0.2.0／build 5、最低 iOS 15、全螢幕設定、正式 HTTPS 後端、完整 17 模組清單，以及內嵌 runtime／CSS 與來源一致。Release 沒有 loopback 測試、分享計數或測試取消控制介面。

Build 5 包括整個寵物模組自動橫屏、Stage 狀態欄重排、課堂卡片及短按鈕排版，以及捲動時的狀態列背景；上述最終原生驗證使用本次來源。App 的實際入口由線上首頁提供，不由內嵌清單限制。

## 實機狀態與尚未驗收項目

Build 5 已在 2026-10-31（香港時間）由 Sideloadly 覆蓋更新到用戶 iPhone。重新接駁並由用戶按信任後，工具成功列出裝置；安裝流程由 Installing／89% 進入 Done／100%，已直接觀察完成畫面。沿用原有 Apple ID 及 App 身份，沒有先刪除原 App。此前 build 3 的 Done 不作為本次完成證據。Apple 密碼及驗證一向由用戶在工具內自行處理，沒有加入專案。本次尚未取得用戶對 build 5 啟動及實機版面的確認。

- Build 5 在用戶實體裝置的開啟、版面、軟鍵盤／硬件鍵盤及觸控。
- 中文／英文錄音、科學錄影、拒絕權限後重試及相簿上傳。
- 正式私人 Excel／PDF、檔案匯入、白板、搶答器、雙機對戰、鎖屏／背景後重連及長時間記憶體。
- Android 專案保留；尚未接入與 iOS 等價的原生安全區／方向輔助，未編譯或安裝 APK。

本版仍以第一方 HTTPS 載入網站與遊戲素材，未完成素材離線化，也沒有對戰延遲改善的量測或成果。未修改正式網站／後端部署、遊戲判定、預測或其他工作目錄改動。

## 0.1.0 安裝記錄

- [原始實機 IPA 建置](https://github.com/cwko-1221/BuiO/actions/runs/40915067680)成功；ARM64、iPhoneOS、Release、未簽署。
- `buio-pilot-0.1.0-unsigned.ipa`：444,946 bytes；SHA-256 `3fb12a713fe9e81f59fcb47f89decb3e0760fbb899fddb3cc75ecf3cbf05b885`。
- Windows 核對 ZIP CRC、Mach-O ARM64 及 iOS device 平台；iTunes／Apple Mobile Device Service 及 Sideloadly 已準備。Apple 登入、驗證、信任及開發者模式由用戶自行處理，憑證沒有寫入專案。
