# 杯澳 Capacitor App 試用版

版本 0.2.0（build 4）。iPhone／iPad 的 App 介面適配修訂版，同時保留 Android 專案。

## 0.2.0 介面適配

- 真正的 SceneDelegate 啟動入口使用自訂原生控制器；介面及遊戲背景填滿視窗，操作元件依 UIKit 安全區避開瀏海、狀態列及 Home 橫條。
- 原生安全區會同步至現有 CSS，包括延遲載入樣式及 shorthand 宣告；鍵盤出現時調整 WebView，浮動 iPad 鍵盤不壓縮整個場景。
- 隱藏原生及網頁捲軸，保留捲動；閱讀頁可縮放及使用返回手勢，沉浸遊戲保留自己的觸控操作。
- 手機首頁使用底部分頁，寬 iPad 使用側欄；寵物手機導覽為四個常用入口加「更多」，商店、推銀仔、同班參觀及設定仍全部保留。
- 科學島、多人闖關、學生塔防及寵物實戰以原生 API 切換橫屏，退出後恢復先前方向。自動方向要求 iOS／iPadOS 16+；15.x 仍可手動轉向。
- 科學島離開按鈕、白板視窗、數學教師導覽／學生選單、對戰 HUD、故事視窗及小手機登入佈局均有 App 專用調整。
- 匯出交由 WebKit 原生下載及 iOS 分享面板處理，沿用 WebView 的登入 Cookie；沒有把私人附件改成公開網址或複製登入權杖。

iPad 按用戶選擇以全螢幕及自動遊戲轉向優先。**iPadOS 26 必須在「設定 → 多工處理與手勢 → 全螢幕 App」使用**；App 的 `UIRequiresFullScreen` 不能代替這項系統設定。在「視窗化 App」或 Stage Manager 模式，系統可能把橫向場景縮放到直向視窗，亦不保證依 App 要求恢復方向。[Apple 的設定鍵說明](https://developer.apple.com/documentation/BundleResources/Information-Property-List/UIRequiresFullScreen)明確描述了這個限制；該相容模式已棄用，亦不是長期多視窗架構。最終原生測試狀態見 `VALIDATION.md`。

這仍是 Capacitor 混合 App，現有學習模組不是全部改寫成 SwiftUI。Android 原生編譯及相同裝置級適配尚未驗收；目前交付檔針對 iOS／iPadOS。

## 此版本的界線

這是 **online compatibility pilot**。App 以第一方 HTTPS 載入 `https://buiosch.onrender.com`，保留原有 cookie、相對網址、權限、私人媒體及 Socket.IO 流程。17 個模組入口列在 `modules.json`，包括工作目錄新增的「寶可夢物語」；沒有刪減教師功能或寵物內的玩法，也沒有改動既有網站／後端。模組頁仍跟隨線上平台提供的入口，清單本身不代替網站導覽。

**現有模組和遊戲素材仍從網站下載，沿用網站快取。只有錯誤／重試畫面及少量原生輔助程式已打包在 App。這一版不是素材離線版，不宣稱已降低對戰延遲。** 對戰維持伺服器判定，未加入預測、回滾或提前命中。

Capacitor 的 `server.url` 設定是試用／開發用途，[官方設定文件](https://capacitorjs.com/docs/config)不建議用作正式生產架構。本版用它先驗證完整平台能否在原生容器運作，不直接作為 App Store 發布版本。素材本機化需要獨立處理登入、私人媒體、WebSocket、程式與伺服器版本相容後，再切換至本機 `webDir`。

## 在 Mac 安裝到 iPhone／iPad

**沒有 Mac：**可改用雲端 Mac 編譯，再透過 TestFlight 安裝，詳見 [雲端建置及安裝流程](CLOUD-INSTALL.md)。已備妥雲端原生編譯檢查；實機安裝仍需 Apple 開發者帳戶及簽署。

**沒有付費開發者會員、先在自己裝置試用：**可使用普通 Apple ID，在 Windows 以第三方工具 Sideloadly 為實機 IPA 簽署及安裝，詳見 [Windows 個人試用指引](WINDOWS-INSTALL.md)。

需要 Node.js 22+、Xcode 26+、iOS／iPadOS 15+ 裝置及可用的 Apple 開發團隊。此 Windows 工作環境沒有 Xcode；IPA 由 GitHub 的 macOS runner 編譯，再在 Windows 驗證及個人簽署。

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

在完整 BuiO repository 可執行 `npm run test:browser`。它用獨立 JSON fixture、測試帳戶及 Chromium／WebKit 桌面引擎，檢查七組手機／平板／分割視窗尺寸、登入、17 個模組入口、教師權限、登出、重試頁和斷線提示；另檢查安全區 shorthand、固定分頁及寵物「更多」選單。中文／英文教師版面的三個資料讀取 API 使用隔離的合成資料，並等待真正的儀表板渲染；登入及角色驗證沒有模擬。這項版面檢查不能代替正式 PostgreSQL 作業流程驗收。

`npm run test:app-ui` 再操作孵化、圖鑑、商店、練習對戰、返回房間，以及科學島預測、器材、任務、設定和離開。兩項測試均不使用正式學生帳戶或寫入正式服務。JSON fixture 無法取代完整 PostgreSQL 教師資料、錄音上傳及雙機課堂流程的驗收。

`ci/native-viewport.mjs` 在真正的 iPhone／iPad Simulator WKWebView 驗證 Scene 啟動、原生安全區、背景填滿、頁面縮放、橫屏及方向恢復；證據為匿名本機測試頁，並非正式學習帳戶畫面。

**桌面 WebKit 不等於 iPhone WKWebView。尚需實機驗收：**

- 每個模組的完整學生／教師流程，並非只看路由可開啟。
- 中文／英文錄音、拒絕權限後重試、科學錄影及相簿影片上傳。
- 白板觸控、搶答器、兩部裝置對戰、鎖屏／背景後重連。
- Excel 匯入與匯出、私人媒體下載、外部連結。
- iPhone 瀏海／安全區域、iPad 橫直向、遊戲音效及長時間記憶體。

以上未驗收項目不會在 README 中宣稱已通過。
