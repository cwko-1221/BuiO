# 沒有 Mac 時，如何安裝到 iPhone／iPad

個人試用已選擇 **雲端 Mac 建置 → Windows 以普通 Apple ID 側載 → 自己的 iPhone／iPad**，詳見 [Windows 個人試用指引](WINDOWS-INSTALL.md)。這條路不需要付費開發者會員，仍須先為 IPA 簽署。

日後學校分發可走 **GitHub 的雲端 Mac 建置 → Apple 簽署及 App Store Connect → TestFlight → iPhone／iPad**。你可以繼續使用 Windows；編譯工作由雲端 Mac 處理。

## 已準備的雲端檢查

`ci/buio-ios-pilot.yml` 與倉庫根目錄 `.github/workflows/buio-ios-pilot.yml` 是同一份流程。它只在 `codex/capacitor-ios-pilot` 分支的 App 檔案更新時，或手動執行時啟動：

1. 使用 GitHub 標準 `macos-15` runner，挑選已安裝的 Xcode 26+。
2. 只安裝 `mobile-app` 的套件，執行設定與模組覆蓋測試。
3. 實際編譯 iOS simulator target，確認 Swift／Xcode 專案是否可建置。
4. 另編譯實機 ARM64 target，核對 Mach-O 的平台為 iOS（不是模擬器），打包未簽署 IPA、SHA-256 及建置資料。這些 artifacts 在 GitHub 保留 1 日，取回本機後可繼續使用。

**此階段不需要 Apple 簽署資料，但 IPA 仍要經個人簽署才能安裝。** 不會上傳至 Apple 或發出 TestFlight 邀請。新版流程會短期儲存上述 IPA artifacts，不建立 Actions cache。

2026-10-30 已完成首次雲端編譯：[執行紀錄](https://github.com/cwko-1221/BuiO/actions/runs/40913058740)，Xcode 26.3，結果 `BUILD SUCCEEDED`。這次由獨立分支的 push 啟動；手動 workflow_dispatch 需該流程可被 GitHub 從預設分支識別。

目前杯澳倉庫是公開倉庫；GitHub 的[標準 runner 在公開倉庫的運算免費](https://docs.github.com/en/billing/concepts/product-billing/github-actions)。這不代表所有雲端方案、較大型 runner 或儲存用量均免費。

## TestFlight 安裝需要的條件

- 你或學校有啟用中的 Apple Developer Program 帳戶，並可使用 App Store Connect。普通 Apple ID 並不等同開發者會員。
- 帳戶持有人確認使用的開發團隊、Bundle ID 及 App Store Connect App 記錄。
- 完成簽署憑證／provisioning profile 或受支援的自動簽署設定，再把簽署後的 build 上傳 App Store Connect。
- 加入測試群組後，在 iPhone／iPad 的 TestFlight 接受邀請並安裝。外部測試的首個 build 需要 Beta App Review；不能預先保證審核結果。每個 build 最長可測試 90 日。

Apple 的[TestFlight 官方流程](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)說明了上傳、邀請及安裝。

目前專案沒有任何 Apple 帳戶、簽署憑證或 App Store Connect API key。簽署所需的憑證應設定於 CI 的加密 secrets／開發者平台，不應貼在聊天或加入 Git。

## 學校可先查詢年費豁免

Apple Developer Program 的標準費用為每會員年度 99 USD，所在地價格以 Apple 顯示為準。[Apple 會員說明](https://developer.apple.com/programs/enroll/)

符合要求的認可教育機構可申請年費豁免；須以合資格法律實體申請，並符合未提供付費 App／App 內購買等要求，是否獲批由 Apple 決定。[豁免條件及申請方式](https://developer.apple.com/help/account/membership/fee-waivers/)

若學校還沒有帳戶，可先確認由誰以學校名義申請。學校的 Apple School Manager 管理帳戶與 Apple Developer Program 是不同用途，不應假設已有其中一個便已完成開發者註冊。

## 目前仍待完成

目前先以普通 Apple ID 在 Windows 完成個人簽署及 USB 安裝；日後 TestFlight 分發才需確認付費／獲豁免的開發者會員及相關簽署方式。目前沒有簽署後的 IPA，也沒有 TestFlight 安裝連結。這版仍是在線相容性試用版，尚未完成素材離線化或對戰延遲改善。
