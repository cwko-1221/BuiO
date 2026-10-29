# 杯澳 Capacitor App 試用版

版本 0.1.0。先以 iPhone／iPad 驗證登入、現有模組及裝置相容性，同時提供 Android 專案。

## 此版本的界線

這是 **online compatibility pilot**。App 以第一方 HTTPS 載入 `https://buiosch.onrender.com`，保留原有 cookie、相對網址、權限、私人媒體及 Socket.IO 流程。所有 16 個模組入口列在 `modules.json`，沒有刪減教師功能或寵物內的玩法，也沒有改動既有網站／後端。

**現有模組和遊戲素材仍從網站下載，沿用網站快取。只有錯誤／重試畫面及少量原生輔助程式已打包在 App。這一版不是素材離線版，不宣稱已降低對戰延遲。** 對戰維持伺服器判定，未加入預測、回滾或提前命中。

Capacitor 的 `server.url` 設定是試用／開發用途，[官方設定文件](https://capacitorjs.com/docs/config)不建議用作正式生產架構。本版用它先驗證完整平台能否在原生容器運作，不直接作為 App Store 發布版本。素材本機化需要獨立處理登入、私人媒體、WebSocket、程式與伺服器版本相容後，再切換至本機 `webDir`。

## 在 Mac 安裝到 iPhone／iPad

**沒有 Mac：**可改用雲端 Mac 編譯，再透過 TestFlight 安裝，詳見 [雲端建置及安裝流程](CLOUD-INSTALL.md)。已備妥雲端原生編譯檢查；實機安裝仍需 Apple 開發者帳戶及簽署。

需要 Node.js 22+、Xcode 26+、iOS／iPadOS 15+ 裝置及可用的 Apple 開發團隊。此 Windows 工作環境沒有 Xcode，沒有產生或驗證 `.ipa`。

1. 將此資料夾（或提供的 source ZIP 解壓內容）放到 Mac。
2. 在此資料夾執行：

   ```sh
   npm ci
   npm run sync
   npm run open:ios
   ```

3. Xcode 開啟的是 `ios/App/App.xcodeproj`（Swift Package Manager 專案，毋須 CocoaPods）。首次開啟讓它解析 Capacitor 和 App plugin 套件。
4. 在 App target → Signing & Capabilities 選擇自己的 Team。Bundle Identifier 預設 `com.buiosch.learning.pilot`；如需修改，應同步改 `mobile.config.json` 及 Xcode／Android 原生設定。
5. 接駁並信任裝置，按 Xcode 提示啟用 Developer Mode，選擇實體裝置後按 Run。
6. 使用現有平台帳戶在 App 登入。Safari 與此 App 的 cookie 儲存不同，不會自動沿用 Safari 登入。

如先測試 iOS 模擬器，可在 Mac 執行 `npm run ios:simulator`；輸出的模擬器 App 不能安裝到實體 iPhone。已執行與尚未執行的驗證分別記在 `VALIDATION.md`。

若要用 TestFlight 分發，仍需有權使用的 Apple Developer／App Store Connect 帳戶、簽署及上傳。專案內沒有憑證、私鑰、學生資料或資料庫密鑰。

## Android

需要 JDK 21、Android Studio 及對應 SDK：

```sh
npm ci
npm run sync
npm run open:android
```

用 Android Studio Run 安裝到裝置；設定 JAVA_HOME／SDK 後亦可執行 `npm run android:debug`，輸出至 `releases/buio-pilot-debug.apk`。Windows 工作環境目前沒有 JDK／Android SDK，因此未產生 APK。

## 連線設定

預設伺服器設定在 `mobile.config.json`。只接受 HTTPS origin，禁止帳密、路徑、query 及 fragment；沒有萬用導覽白名單、ATS 全域放行或混合內容。

如需在本機 fixture 測試，可明確建立 loopback 開發設定：

```powershell
$env:BUIO_APP_URL = 'http://127.0.0.1:3000'
npm run prepare:app -- --dev
npx cap sync
```

這個地址只指向執行 App 那部裝置的 loopback，不能用來連到另一部電腦。實體裝置的測試後端應使用可存取的 HTTPS 服務。回復正式試用設定時移除 `BUIO_APP_URL`，重新 `npm run sync`。

## 本機驗證

```sh
npm run prepare:app
npm test
```

在完整 BuiO repository 可再執行 `npm run test:browser`。它用獨立 JSON fixture、測試帳戶及 Chromium／WebKit 桌面引擎的手機／平板 viewport，驗證登入、16 個模組 HTML 路由、教師權限、登出、重試頁和斷線提示；不使用正式學生帳戶、不對正式服務寫入。

**桌面 WebKit 不等於 iPhone WKWebView。尚需實機驗收：**

- 每個模組的完整學生／教師流程，並非只看路由可開啟。
- 中文／英文錄音、拒絕權限後重試、科學錄影及相簿影片上傳。
- 白板觸控、搶答器、兩部裝置對戰、鎖屏／背景後重連。
- Excel 匯入與匯出、私人媒體下載、外部連結。
- iPhone 瀏海／安全區域、iPad 橫直向、遊戲音效及長時間記憶體。

以上未驗收項目不會在 README 中宣稱已通過。
