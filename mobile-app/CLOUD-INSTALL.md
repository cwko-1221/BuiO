# 沒有 Mac 時，如何安裝到 iPhone／iPad

建議路線：**GitHub 的雲端 Mac 建置 → Apple 簽署及 App Store Connect → TestFlight → iPhone／iPad**。你可以繼續使用 Windows；編譯工作由雲端 Mac 處理。

## 已準備的雲端檢查

`ci/buio-ios-pilot.yml` 與倉庫根目錄 `.github/workflows/buio-ios-pilot.yml` 是同一份流程。它只在 `codex/capacitor-ios-pilot` 分支的 App 檔案更新時，或手動執行時啟動：

1. 使用 GitHub 標準 `macos-15` runner，挑選已安裝的 Xcode 26+。
2. 只安裝 `mobile-app` 的套件，執行設定與模組覆蓋測試。
3. 實際編譯 iOS simulator target，確認 Swift／Xcode 專案是否可建置。

**此階段不需要 Apple 簽署資料，但輸出不是可安裝的 IPA。** 不會上傳至 Apple 或發出 TestFlight 邀請。此工作流程不儲存 build artifacts 或 Actions cache，只保留執行日誌／摘要。

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

確認開發者帳戶及簽署方式後，才能把「雲端編譯通過」推進到「手機可安裝」。目前沒有簽署後的 IPA，也沒有 TestFlight 安裝連結。這版仍是在線相容性試用版，尚未完成素材離線化或對戰延遲改善。
