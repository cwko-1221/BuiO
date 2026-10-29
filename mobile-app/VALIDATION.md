# 0.1.0 驗證紀錄（2026-10-29，香港時間）

## 2026-10-30 雲端原生編譯補充

- [GitHub Actions 執行結果](https://github.com/cwko-1221/BuiO/actions/runs/40913058740)：completed／success。
- 分支 `codex/capacitor-ios-pilot`，驗證 commit `ccef4aa77fa1e468d1f385611e87ab4297d4ec90`。
- GitHub 標準 macOS runner，Xcode 26.3（17C529），實際執行 iOS Simulator target 建置，日誌確認 `BUILD SUCCEEDED`。
- 此編譯不需 Apple 憑證，未簽署、未輸出可供實體裝置安裝的 IPA、未上傳 App Store Connect／TestFlight。雲端編譯通過不等於實機功能驗收。
- Workflow 不上傳 artifacts、不建立套件 cache；只保留 CI 日誌及摘要。沒有變更正式網站分支或部署後端。
- 沒有 Mac 的後續安裝路線已記在 [CLOUD-INSTALL.md](CLOUD-INSTALL.md)，仍待確認 Apple Developer Program 帳戶及簽署方式。

## 已執行

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

- Windows 本機沒有 Xcode；iOS 模擬器原生編譯已於上列雲端執行成功。仍未簽署、未產生可安裝的 IPA、未安裝至 iPhone／iPad、未上傳 TestFlight。
- 沒有 JDK／Android SDK，未編譯、簽署或安裝 APK。
- 桌面 WebKit 的 viewport 檢查不能代表 WKWebView 的系統權限、背景生命週期、實機 GPU 或觸控表現。
- 模組路由覆蓋不是所有模組完整功能驗收。錄音／錄影、檔案匯出、白板、雙機對戰及背景恢復仍待實機測試。
- 沒有對戰延遲改善或素材離線化的量測／成果；這是保留現有平台的在線相容性試用版。

## 下一個實機步驟

在 Mac 執行 `npm ci && npm run sync`，用 Xcode 開啟 `ios/App/App.xcodeproj`，選擇可用的開發團隊及實體裝置後 Run。可先用 `npm run ios:simulator` 做不需簽署的模擬器建置，但模擬器 build 不能安裝到實體 iPhone。

雲端原生編譯已完成；上述簽署及實機安裝步驟尚未完成。不使用 Mac 的安裝方式見 CLOUD-INSTALL.md。
