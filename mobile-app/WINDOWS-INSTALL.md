# Windows 個人裝置試用（無 Mac、無付費開發者會員）

路線：**雲端編譯實機 ARM64 App → 未簽署 IPA → Windows 的 Sideloadly 用普通 Apple ID 簽署 → USB 安裝到自己的 iPhone／iPad**。

這是個人開發測試，與學校透過 TestFlight／App Store 分發不同。專案的 iOS 最低版本是 iOS／iPadOS 15。

## 更新已安裝的 App

0.2.0 build 3 已在 2026-10-31 透過 Sideloadly 覆蓋安裝到用戶 iPhone，工具顯示 Done／100%。build 4 另修正 iPad 轉向後的輸入欄字體，驗證中；最終來源檔為 `releases/buio-pilot-0.2.0-unsigned.ipa`，狀態及雜湊記在 [VALIDATION.md](VALIDATION.md)。其他裝置仍須自行簽署及安裝。

- 使用本次提供的 `buio-pilot-0.2.0-unsigned.ipa`。它必須先經簽署，不能在 iPhone 的 Files 裡點開便安裝。
- 沿用上次的 Apple ID 及 Sideloadly Bundle ID 設定，直接覆蓋更新；毋須先刪除現有 App。安全區、轉向及 App 導覽程式已內嵌在新版，單純重新載入舊 App 不會取得這些修正。
- 從 [Sideloadly 官方網站](https://sideloadly.io/) 下載 Windows 版。這是第三方簽署工具，並非 Apple 官方程式。
- 按 Sideloadly 官方的 Windows 要求準備相容的 iTunes／iCloud 元件。網站目前要求非 Microsoft Store 版本；如電腦已有其他版本，先核對安裝狀態，避免直接覆蓋或移除既有軟件。

## 接駁裝置後

1. 解鎖 iPhone／iPad，用 USB 接駁 Windows，在裝置提示上按「信任此電腦」。
2. 開啟 Sideloadly，確認已選取正確裝置，再拖入上述 IPA。
3. 在工具內由你自行輸入普通 Apple ID，按 Start，按提示完成密碼及雙重認證。這些憑證不需要提供給聊天或放進專案。
4. 安裝完成後，按裝置提示在「設定 → 一般 → VPN 與裝置管理」信任自己的開發者身份。iOS 16+ 若要求 Developer Mode，依裝置提示在「私隱與保安 → 開發者模式」啟用並完成重新啟動。
5. 開啟「杯澳學習平台」，使用原有平台帳戶登入。

## 免費試用的限制

Sideloadly 官方說明普通 Apple ID 的簽署有效期為 7 日，可透過它的更新功能重新簽署。自動更新需要電腦、工具及裝置連線條件配合；不能假設電腦關機時也會更新。免費個人開發亦有裝置／App 數量限制，遇到限制時應先查看工具回報，不自行刪除其他 App。

參考：[Sideloadly 官方 FAQ](https://sideloadly.io/#faq)、[Apple 個人開發測試限制](https://developer.apple.com/help/account/basics/about-your-developer-account#enable-a-personal-team-in-xcode)。

## 此 App 的範圍

保留現有平台全部模組入口；首版仍在線載入網站及遊戲素材，未完成素材離線化或對戰延遲改善。即使 IPA 雲端建置通過，亦不代表已在你的裝置安裝、登入、錄音或完成雙機對戰驗收。
