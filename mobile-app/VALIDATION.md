# 0.1.0 驗證紀錄（2026-10-29，香港時間）

## 2026-10-30 雲端原生編譯補充

- [GitHub Actions 執行結果](https://github.com/cwko-1221/BuiO/actions/runs/40913058740)：completed／success。
- 分支 `codex/capacitor-ios-pilot`，驗證 commit `ccef4aa77fa1e468d1f385611e87ab4297d4ec90`。
- GitHub 標準 macOS runner，Xcode 26.3（17C529），實際執行 iOS Simulator target 建置，日誌確認 `BUILD SUCCEEDED`。
- 此編譯不需 Apple 憑證，未簽署、未輸出可供實體裝置安裝的 IPA、未上傳 App Store Connect／TestFlight。雲端編譯通過不等於實機功能驗收。
- 首次模擬器編譯流程當時不上傳 artifacts、不建立套件 cache；只保留 CI 日誌及摘要。後續實機 IPA 流程短期保存 artifacts 1 日。沒有變更正式網站分支或部署後端。
- 沒有 Mac 的後續安裝路線已記在 [CLOUD-INSTALL.md](CLOUD-INSTALL.md)，仍待確認 Apple Developer Program 帳戶及簽署方式。

## 2026-10-30 Windows 個人側載準備

- 用戶確認沒有付費開發者會員，選擇普通 Apple ID＋Windows 側載，並表示稍後才可 USB 接駁裝置。
- [第二次雲端建置](https://github.com/cwko-1221/BuiO/actions/runs/40915067680) completed／success；commit `9eb34f9df1e631b5b47b3d90cb74a330892e26c2`。
- 除模擬器檢查外，實際以 `iphoneos` SDK、Release、ARM64 編譯並打包 `buio-pilot-0.1.0-unsigned.ipa`；沒有 Apple 憑證或簽署。
- 已下載到 `mobile-app/releases/buio-pilot-0.1.0-unsigned.ipa`，444,946 bytes。SHA-256：`3fb12a713fe9e81f59fcb47f89decb3e0760fbb899fddb3cc75ecf3cbf05b885`。
- 在 Windows 再以 `node scripts/verify-ipa.mjs` 驗證 ZIP CRC、Mach-O ARM64 CPU type、LC_BUILD_VERSION 的平台為真實 iOS（2），確認不是模擬器 build。沒有 embedded.mobileprovision，安裝前仍需個人簽署。
- 從 Sideloadly 官方下載了 Windows 安裝程式到 `releases/installers/SideloadlySetup64.exe`；未執行或安裝，未輸入任何 Apple ID。下載檔為 PE installer，Authenticode 顯示 NotSigned，未宣稱已通過發行者數位簽章驗證。
- 尚未接駁裝置、簽署、安裝或完成實機功能測試。步驟已整理到 [WINDOWS-INSTALL.md](WINDOWS-INSTALL.md)。

## 已執行

### 2026-10-30 首次 iPhone 側載

- Windows 已識別 USB 接駁的 iPhone；安裝 iTunes 後，Apple Mobile Device Service 已啟動，Sideloadly 已偵測到裝置。
- iTunes／iCloud 安裝檔由 Apple 官方網址下載，兩者 Authenticode 驗證有效，簽署者為 Apple Inc.；本次確認完成安裝的是 iTunes。
- Sideloadly 0.71.2 已安裝，載入上述已驗證的實機 IPA。Apple ID 登入及驗證由用戶自行處理，憑證未寫入專案。
- Sideloadly 狀態顯示 `Done.`／`100%`，用戶亦確認安裝成功。首次開啟提示未受信任／需要開發者模式；已提供手機設定步驟，由用戶自行確認，尚未確認平台登入畫面。

### 自動化與建置檢查

- Capacitor 8.6.0 建立 iOS Swift Package Manager 及 Android 專案，`npm run sync` 成功。
- `npm test`：5 項通過，包括 HTTPS／導覽範圍、危險 URL 拒絕、模組覆蓋、iOS 權限與實際 storyboard 接線、打包內容界線。
- `npm run test:browser`：Chromium 的 390×844 手機 viewport、桌面 WebKit 的 1024×768 平板 viewport 通過。
- 各引擎驗證：從本機重試頁進入平台、實際學生登入、寵物頁導航、學生可用模組 HTML 路由、老師的全部 16 個模組 HTML 路由、學生拒絕存取教師報告、登出失效、離線／恢復提示。
- 功課 fixture 明確委任測試學生為科長，沿用原有權限；沒有為測試放寬後端權限。
- XML parser 驗證 iOS Info.plist、Main.storyboard、AndroidManifest.xml 可解析。
- `npm audit --omit=dev --audit-level=moderate`：當次快照 0 vulnerabilities。
- 已目視檢查手機重試頁及平板學生首頁截圖，無水平溢出。
- 對設定中的正式網址僅作兩次匿名唯讀探測：`/health/live` 和 `/` 當次均回覆 HTTP 200。沒有用它作延遲／容量測試。

測試只使用 `mobile-app/test-results/fixture.json` 的合成帳戶；沒有登入正式服務、修改正式學習紀錄、改動對戰邏輯或部署後端。原工作目錄其他改動未被本試用版覆寫。

## 尚未執行

- Windows 本機沒有 Xcode；iOS 模擬器及實機 ARM64 原生編譯已於雲端執行成功。Sideloadly 已回報 iPhone 個人簽署及安裝完成，尚未完成實機功能驗收，未上傳 TestFlight。
- 沒有 JDK／Android SDK，未編譯、簽署或安裝 APK。
- 桌面 WebKit 的 viewport 檢查不能代表 WKWebView 的系統權限、背景生命週期、實機 GPU 或觸控表現。
- 模組路由覆蓋不是所有模組完整功能驗收。錄音／錄影、檔案匯出、白板、雙機對戰及背景恢復仍待實機測試。
- 沒有對戰延遲改善或素材離線化的量測／成果；這是保留現有平台的在線相容性試用版。

## 下一個實機步驟

在 iPhone 開啟「杯澳學習平台」，如有提示，由用戶完成開發者信任及開發者模式，再確認可看到登入畫面。隨後才進行平台登入、模組及雙機對戰測試。見 WINDOWS-INSTALL.md。

雲端原生編譯、實機 IPA 及工具回報的個人簽署／安裝已完成；實機開啟及功能驗收待確認。TestFlight 分發仍是日後學校開發者帳戶的選項。
